const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const context = {}; context.window=context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'laue-math.js'),'utf8'),context);
const M=context.LaueMath;
const cell={a:5.431,b:5.431,c:5.431,alpha:90,beta:90,gamma:90};
// Metric from the user's Nb2NiO6 CIF; zone axes must use the direct cell.
const niobate={a:9.177568,b:6.592546,c:6.77605369,alpha:90,beta:92.02286235,gamma:90};
const size={width:1024,height:768};
const base={sampleOmega:13,sampleChi:27,samplePhi:42,sampleSigns:{omega:1,chi:1,phi:1},
  detDistance:150,detWidth:500,detHeight:375,detOffsetX:4,detOffsetY:-8,detOmega:0,detChi:0,
  laueMode:'backscatter',qMin:0,qMax:14,maxHklSq:200};
const sample={sampleOmega:true,sampleChi:true,samplePhi:true};
function close(a,b,tol=1e-7){assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);}
function knownZones(cfg=base,params=cell){
  const peaks=M.computePredictedPeaks(params,{...cfg},size).filter(p=>p.onImage);
  const uvws=[[0,1,0],[0,0,1],[1,0,1],[1,-1,0],[1,1,1],[0,1,1],[1,1,0],[1,0,-1]];
  return uvws.flatMap(uvw=>{
    const members=peaks.filter(p=>p.h*uvw[0]+p.k*uvw[1]+p.l*uvw[2]===0);
    let pair=null,distance=0;
    for(const a of members)for(const b of members){const d=Math.hypot(a.x-b.x,a.y-b.y);if(d>distance){distance=d;pair=[a,b];}}
    return pair&&distance>120?[{p1:{x:pair[0].x,y:pair[0].y},p2:{x:pair[1].x,y:pair[1].y},uvw}]:[];
  });
}
function rotationError(a,b){
  const A=M.uMatrix(a.sampleOmega,a.sampleChi,a.samplePhi,a.sampleSigns),B=M.uMatrix(b.sampleOmega,b.sampleChi,b.samplePhi,b.sampleSigns);
  let trace=0;for(let i=0;i<3;i++)for(let j=0;j<3;j++)trace+=A[i][j]*B[i][j];
  return Math.acos(Math.max(-1,Math.min(1,(trace-1)/2)))*180/Math.PI;
}

test('orientation identification recovers a distant orientation from peaks or zones, including mixed inputs with an outlier', async () => {
  const crystal = { a: 4.1, b: 5.8, c: 7.2, alpha: 78, beta: 102, gamma: 112 };
  const truth = { ...base, sampleOmega: 62, sampleChi: -19, samplePhi: 56,
    sampleSigns: { omega: -1, chi: 1, phi: -1 }, detChi: 8, maxHklSq: 80 };
  const start = { ...truth, sampleOmega: -35, sampleChi: 11, samplePhi: 0 };
  const predicted = M.computePredictedPeaks(crystal, { ...truth }, size)
    .filter(p => p.onImage && p.x > 30 && p.y > 30 && p.x < 995 && p.y < 740)
    .sort((a, b) => a.hklSq - b.hklSq);
  const spots = [];
  for (const p of predicted) {
    if (!spots.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 35)) spots.push(p);
    if (spots.length === 8) break;
  }
  const measured = spots.map((p, i) => ({ x: p.x + (i % 3 - 1) * .4, y: p.y + (i % 2 - .5) * .9 }));
  const zones = knownZones(truth, crystal).slice(0, 4).map(({ p1, p2 }) => ({ p1, p2 }));
  assert.ok(zones.length >= 3);
  for (const [peaks, lines] of [[measured, []], [[], zones], [[measured[0], measured[2], { x: 321, y: 222 }], zones]]) {
    const before = JSON.stringify({ start, peaks, lines });
    const result = await M.identifyOrientations(crystal, start, size, peaks, lines, { toleranceDeg: .55 });
    assert.equal(JSON.stringify({ start, peaks, lines }), before);
    const best = result.candidates[0];
    assert.ok(best, 'No orientation candidates');
    const found = { ...start, sampleOmega: best.omega, sampleChi: best.chi, samplePhi: best.phi };
    assert.ok(rotationError(found, truth) < .15, JSON.stringify(best));
    assert.equal(best.matchedZones, lines.length);
  }
});

test('orientation identification rejects parallel measurements and can cancel without results', async () => {
  const zone = knownZones()[0];
  await assert.rejects(M.identifyOrientations(cell, base, size, [], [zone, { p1: zone.p2, p2: zone.p1 }]), /nonparallel/);
  const result = await M.identifyOrientations(cell, base, size, [], knownZones().slice(0, 3), { shouldCancel: () => true });
  assert.equal(result.cancelled, true);
  assert.equal(result.candidates.length, 0);
});

test('pixel inverse recovers scattering directions for tilted and rectangular detectors in both modes',()=>{
  for(const laueMode of ['backscatter','transmission'])for(const detChi of [0,12]){
    const cfg={...base,laueMode,detChi,detOmega:38};
    const peaks=M.computePredictedPeaks(niobate,{...cfg},size).filter(p=>p.onImage);assert.ok(peaks.length>10);
    for(const peak of peaks.slice(0,30)){
      const direction=M.imagePointToScatteringDirection(peak,cfg,size),expected=M.normalize(peak.g);
      direction.forEach((v,i)=>close(v,expected[i],1e-10));
    }
  }
});

test('zones index in direct-space UVW for silicon and the monoclinic uploaded-cell metric',()=>{
  for(const params of [cell,niobate])for(const laueMode of ['backscatter','transmission']){
    const cfg={...base,laueMode,detChi:7,detOmega:32};
    const zones=knownZones(cfg,params);assert.ok(zones.length>=2);
    for(const zone of zones){
      const match=M.indexZone(params,zone,cfg,size);assert.ok(match);assert.equal(match.uvw.join(','),zone.uvw.join(','));
      assert.ok(match.angleDeg<1e-5);
      const reversed=M.indexZone(params,{...zone,p1:zone.p2,p2:zone.p1},cfg,size);
      assert.equal(reversed.uvw.join(','),match.uvw.join(','));
    }
  }
});

test('projected zone curves pass through both endpoints and their complete reciprocal-space plane',()=>{
  for(const laueMode of ['backscatter','transmission']){
    const cfg={...base,laueMode,detChi:11,detOmega:35,qMin:5};
    const zone=knownZones(cfg)[0], normal=M.measuredZoneAxis(zone,cfg,size),segments=M.zoneCurve(zone,cfg,size);
    assert.ok(segments.length>0);
    const points=segments.flat();
    for(const endpoint of [zone.p1,zone.p2])assert.ok(points.some(p=>Math.hypot(p.x-endpoint.x,p.y-endpoint.y)<1e-7));
    for(const point of points)close(M.dot(M.imagePointToScatteringDirection(point,cfg,size),normal),0,1e-9);
    // The drawing is a conic in detector coordinates, not a straight chord.
    const a=zone.p1,b=zone.p2;
    assert.ok(points.some(p=>Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))/Math.hypot(b.x-a.x,b.y-a.y)>5));
  }
});

test('zone residuals vanish anywhere along the same zone and reject a forward direct beam or degenerate pair',()=>{
  const zone=knownZones()[0],axis=M.measuredZoneAxis(zone,base,size);
  const point=M.zoneCurve(zone,base,size).flat().find(p=>p.x>100&&p.x<900&&p.y>100&&p.y<650);
  const residual=M.zoneEndpointResiduals({...zone,p2:point},axis,base,size);
  residual.forEach(v=>close(v,0,1e-7));
  assert.equal(M.measuredZoneAxis({p1:zone.p1,p2:zone.p1},base,size),null);
  assert.equal(M.imagePointToScatteringDirection({x:size.width/2+base.detOffsetX,y:size.height/2+base.detOffsetY},{...base,laueMode:'transmission'},size),null);
});

test('two independent observed zones refine orientation without any indexed peaks',async()=>{
  const zones=knownZones().slice(0,2);assert.equal(zones.length,2);
  const start={...base,sampleOmega:13.7,sampleChi:26.4,samplePhi:42.6};
  const before=JSON.stringify(zones);
  const result=await M.refineOrientation(cell,start,size,[],sample,null,80,{zones});
  assert.equal(result.improved,true,result.message);assert.equal(result.status,'converged');
  assert.equal(result.used,0);assert.equal(result.usedZones,2);assert.ok(result.zoneRms<1e-5);
  assert.ok(rotationError(result.config,base)<1e-5);assert.equal(JSON.stringify(zones),before);
});

test('one zone and one Bragg peak jointly fix orientation with detector parameters held fixed',async()=>{
  const zone=knownZones()[0],p=zone.p1;
  const peak=M.computePredictedPeaks(cell,{...base},size).find(q=>Math.hypot(q.x-p.x,q.y-p.y)<1e-6);
  const obs=[{x:p.x,y:p.y,matchedH:peak.h,matchedK:peak.k,matchedL:peak.l}];
  const result=await M.refineOrientation(cell,{...base,sampleOmega:13.5,sampleChi:27.4,samplePhi:41.5},size,obs,sample,null,80,{zones:[zone]});
  assert.equal(result.improved,true,result.message);assert.ok(result.spotRms<1e-5);assert.ok(result.zoneRms<1e-5);
  assert.ok(rotationError(result.config,base)<1e-5);assert.equal(result.config.detDistance,base.detDistance);
});

test('monoclinic zones constrain detector distance and beam offsets without changing sample orientation',async()=>{
  const zones=knownZones(base,niobate);
  const start={...base,detDistance:147,detOffsetX:7,detOffsetY:-10};
  const result=await M.refineOrientation(niobate,start,size,[],{detDistance:true,detOffsetX:true,detOffsetY:true},null,100,{zones});
  assert.equal(result.improved,true,result.message);assert.ok(result.zoneRms<1e-5);
  close(result.config.detDistance,base.detDistance,1e-4);close(result.config.detOffsetX,base.detOffsetX,1e-4);close(result.config.detOffsetY,base.detOffsetY,1e-4);
  assert.equal(result.config.sampleOmega,base.sampleOmega);
});

test('one zone or repeated zones cannot falsely claim a fully constrained three-angle fit',async()=>{
  const zone=knownZones()[0];
  const one=await M.refineOrientation(cell,base,size,[],sample,null,10,{zones:[zone]});
  assert.equal(one.status,'insufficient_matches');
  const repeated=await M.refineOrientation(cell,base,size,[],sample,null,10,{zones:[zone,zone,{...zone,p1:zone.p2,p2:zone.p1}]});
  assert.equal(repeated.improved,false);assert.ok(['underconstrained','insufficient_matches'].includes(repeated.status));
  const invalid=await M.refineOrientation(cell,base,size,[],sample,null,10,{zones:[{...zone,uvw:[0,0,0]}]});
  assert.equal(invalid.usedZones,0);assert.equal(invalid.excluded,1);
});

test('zone-only refinement respects cancellation and keeps the starting parameters',async()=>{
  let cancelled=false;
  const start={...base,sampleOmega:14};
  const r=await M.refineOrientation(cell,start,size,[],sample,null,40,{zones:knownZones(),shouldCancel:()=>cancelled,yieldToBrowser:async()=>{cancelled=true;}});
  assert.equal(r.status,'cancelled');assert.equal(r.config.sampleOmega,14);assert.equal(r.improved,false);
});

function interactionFixture() {
  const text=fs.readFileSync(path.join(__dirname,'laue-analysis.js'),'utf8');
  const elements=new Map(),el=id=>{
    if(!elements.has(id))elements.set(id,{value:'0',checked:false});return elements.get(id);
  };
  const classes=new Set(),s={LaueMath:M,document:{getElementById:el},modeButtons:[],canvas:{width:1024,height:768},
    canvasViewport:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,on)=>on?classes.add(c):classes.delete(c)}},
    state:{displayData:size,instrument:{...base,beamRadius:30},zones:[],observedPeaks:[],mode:'add-zone',view:{},drag:null},
    updates:0,saves:0,beamUpdates:0,redraws:0,status:'',
    readCrystal:()=>cell,readInstrument:()=>({...base}),buildConfig:x=>({...x}),
    clientToImage:e=>({x:e.x,y:e.y}),screenPxToCanvas:x=>x,
    beamCenterPosition:()=>({x:size.width/2+base.detOffsetX,y:size.height/2+base.detOffsetY}),
    findNearestPredictedPeak:()=>null,findObservedPeakIndex:()=>-1,
    redraw(){s.redraws++;},redrawOverlays(){s.redraws++;},persistConfig(){s.saves++;},
    rematchObservedPeaksIfAny(){},setStatus:message=>{s.status=message;},
    onBeamCenterChanged(){s.beamUpdates++;},setBeamCenterPosition(){s.beamUpdates++;}};
  vm.createContext(s);
  for(const name of ['matchZones','findZoneHit','addZonePoint','beamHandleHit','clearObservedPeakSelection',
    'onCanvasMouseDown','onCanvasMouseMove','endDrag','setMode']) {
    const start=text.indexOf(`  function ${name}(`),next=text.indexOf('\n  function ',start+5);
    vm.runInContext(text.slice(start,next),s);
  }
  return {s,classes};
}

test('two-click zone creation previews live and commits only a separated, nondegenerate second point',()=>{
  const {s}=interactionFixture(),zone=knownZones()[0];
  s.onCanvasMouseDown({button:0,...zone.p1});assert.ok(s.state.pendingZone);assert.equal(s.state.zones.length,0);
  s.onCanvasMouseMove({...zone.p2});close(s.state.pendingZone.p2.x,zone.p2.x);assert.ok(s.redraws>0);
  s.onCanvasMouseDown({button:0,...zone.p1});assert.equal(s.state.zones.length,0);assert.ok(s.state.pendingZone);
  s.onCanvasMouseDown({button:0,...zone.p2});assert.equal(s.state.pendingZone,null);assert.equal(s.state.zones.length,1);
  assert.equal(s.state.zones[0].uvw.join(','),zone.uvw.join(','));assert.ok(s.saves>0);
});

test('zone endpoints drag independently, curves are removable, and changing tools cancels a draft',()=>{
  const {s,classes}=interactionFixture(),zone=knownZones()[0];s.state.zones=[JSON.parse(JSON.stringify(zone))];
  s.setMode('move-zone');s.onCanvasMouseDown({button:0,...zone.p1});assert.equal(s.state.drag.type,'move-zone');
  s.onCanvasMouseMove({x:zone.p1.x+10,y:zone.p1.y-4});
  close(s.state.zones[0].p1.x,zone.p1.x+10);assert.equal(JSON.stringify(s.state.zones[0].p2),JSON.stringify(zone.p2));
  assert.equal(s.state.zones[0].uvw,null);s.endDrag();assert.equal(s.state.drag,null);assert.equal(classes.has('laue-dragging'),false);
  s.setMode('remove-zone');const mid=M.zoneCurve(s.state.zones[0],base,size).flat().find(p=>p.x>30&&p.x<990&&p.y>30&&p.y<730);
  s.onCanvasMouseDown({button:0,...mid});assert.equal(s.state.zones.length,0);
  s.setMode('add-zone');s.onCanvasMouseDown({button:0,...zone.p1});assert.ok(s.state.pendingZone);
  s.setMode('move-zone');assert.equal(s.state.pendingZone,null);
});

test('beam handles respond only to the dedicated Beam center mode, including when a zone starts at the center',()=>{
  const {s}=interactionFixture(),beam=s.beamCenterPosition();
  s.setMode('view');s.onCanvasMouseDown({button:0,...beam});assert.equal(s.state.drag,null);
  s.setMode('add-zone');s.onCanvasMouseDown({button:0,...beam});assert.ok(s.state.pendingZone);assert.equal(s.state.drag,null);
  s.setMode('pan-orientation');s.onCanvasMouseDown({button:0,...beam});assert.equal(s.state.drag,null);
  s.setMode('beam-center');s.onCanvasMouseDown({button:0,...beam});assert.equal(s.state.drag.type,'beam-center');
  s.onCanvasMouseMove({x:beam.x+8,y:beam.y+4});assert.ok(s.beamUpdates>0);s.endDrag();
  s.onCanvasMouseDown({button:0,x:beam.x+30,y:beam.y});assert.equal(s.state.drag.type,'beam-radius');
  s.onCanvasMouseMove({x:beam.x+40,y:beam.y});assert.equal(s.state.instrument.beamRadius,40);
});
