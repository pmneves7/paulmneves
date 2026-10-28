const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {}; context.window = context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'laue-math.js'),'utf8'),context);
const M = context.LaueMath;
const cell={a:5.431,b:5.431,c:5.431,alpha:90,beta:90,gamma:90};
const size={width:1024,height:1024};
const base={sampleOmega:13,sampleChi:27,samplePhi:42,sampleSigns:{omega:1,chi:1,phi:1},
  detDistance:150,detWidth:300,detHeight:300,detOffsetX:0,detOffsetY:0,detOmega:0,detChi:0,
  laueMode:'backscatter',qMin:0,qMax:12,maxHklSq:120};
const sample={sampleOmega:true,sampleChi:true,samplePhi:true};
function observations(cfg,n=30,params=cell) {
  const used=[];
  return M.computePredictedPeaks(params,{...cfg},size).filter(p=>p.onImage && used.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>8) && used.push(p))
    .slice(0,n).map((p,i)=>({id:i,x:p.x,y:p.y,matchedH:p.h,matchedK:p.k,matchedL:p.l}));
}
function close(a,b,tol=1e-7) { assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`); }
function multiply(A,B) { return A.map(row=>B[0].map((_,j)=>row.reduce((s,x,k)=>s+x*B[k][j],0))); }
function vector(A,v) { return A.map(row=>row.reduce((sum,x,i)=>sum+x*v[i],0)); }
function rotation(axis,degrees) {
  const length=Math.hypot(...axis),[x,y,z]=axis.map(v=>v/length),a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),d=1-c;
  return [[c+x*x*d,x*y*d-z*s,x*z*d+y*s],[y*x*d+z*s,c+y*y*d,y*z*d-x*s],[z*x*d-y*s,z*y*d+x*s,c+z*z*d]];
}
function orientationError(a,b) {
  const A=M.uMatrix(a.sampleOmega,a.sampleChi,a.samplePhi,a.sampleSigns),B=M.uMatrix(b.sampleOmega,b.sampleChi,b.samplePhi,b.sampleSigns);
  let trace=0;for(let i=0;i<3;i++)for(let j=0;j<3;j++)trace+=A[i][j]*B[i][j];
  return Math.acos(Math.max(-1,Math.min(1,(trace-1)/2)))*180/Math.PI;
}

test('refinement recovers a known orientation and leaves input and unselected parameters intact',async()=>{
  const start={...base,sampleOmega:14,sampleChi:28,samplePhi:43},before=JSON.stringify(start);
  const result=await M.refineOrientation(cell,start,size,observations(base),sample,null,40);
  assert.equal(result.status,'converged');assert.equal(result.improved,true);assert.ok(result.rms<1e-6);
  assert.ok(orientationError(result.config,base)<1e-5);assert.equal(JSON.stringify(start),before);
  for(const key of ['detDistance','detOmega','detChi','detOffsetX','detOffsetY'])assert.equal(result.config[key],start[key]);
});
test('a single incorrect spot is downweighted instead of pulling the orientation',async()=>{
  const obs=observations(base);obs[0].x+=30;obs[0].y-=30;
  const start={...base,sampleOmega:14,sampleChi:28,samplePhi:43};
  const robust=await M.refineOrientation(cell,start,size,obs,sample,null,60);
  const ordinary=await M.refineOrientation(cell,start,size,obs,sample,null,60,{robust:false});
  assert.equal(robust.improved,true);assert.equal(robust.outliers,1);
  assert.ok(orientationError(robust.config,base)<.03);
  assert.ok(orientationError(robust.config,base)<orientationError(ordinary.config,base)/5);
  assert.ok(robust.inlierRms<.2);
});
test('exact and near-gimbal orientations refine using independent rotation directions',async()=>{
  for(const chi of [90,-90,89.999]) {
    const start={...base,sampleChi:chi};
    const matrix=multiply(rotation([Math.sin(42*Math.PI/180),0,Math.cos(42*Math.PI/180)],.7),M.uMatrix(13,chi,42));
    const angles=M.sampleEulerFromUMatrix(matrix);
    const truth={...base,sampleOmega:angles.omega,sampleChi:angles.chi,samplePhi:angles.phi};
    const r=await M.refineOrientation(cell,start,size,observations(truth),sample,null,60);
    assert.equal(r.status,'converged');assert.ok(r.rms<1e-5);assert.ok(orientationError(r.config,truth)<1e-5);
  }
});
test('detector refinement escapes zero-tilt azimuth singularity within ten iterations',async()=>{
  const truth={...base,detChi:4,detOmega:90};
  const r=await M.refineOrientation(cell,base,size,observations(truth),{detChi:true,detOmega:true},null,30);
  assert.equal(r.improved,true);assert.ok(r.iterations<=10);assert.ok(r.rms<1e-6);
  const actual=M.detectorNormal(r.config.detOmega,r.config.detChi,'backscatter'),expected=M.detectorNormal(90,4,'backscatter');
  actual.forEach((v,i)=>close(v,expected[i]));
});
test('joint sample, distance, offset and detector-tilt refinement converges',async()=>{
  const truth={...base,detChi:3,detOmega:60,detOffsetX:3,detOffsetY:-4};
  const start={...base,sampleOmega:14,sampleChi:28,samplePhi:43,detDistance:147};
  const r=await M.refineOrientation(cell,start,size,observations(truth,40),{...sample,detDistance:true,detOffsetX:true,detOffsetY:true,detOmega:true,detChi:true},null,60);
  assert.equal(r.status,'converged');assert.ok(r.rms<1e-5);close(r.config.detDistance,150,1e-3);
});
test('periodic display angles are preserved and an already exact fit is convergence, not instability',async()=>{
  const truth={...base,sampleOmega:400,samplePhi:-725};
  const exact=await M.refineOrientation(cell,truth,size,observations(truth),sample,null,20);
  assert.equal(exact.status,'converged');assert.equal(exact.improved,false);assert.equal(exact.config.sampleOmega,400);assert.equal(exact.config.samplePhi,-725);
  const start={...truth,sampleOmega:401};
  const r=await M.refineOrientation(cell,start,size,observations(truth),{sampleOmega:true},null,30);
  close(r.config.sampleOmega,400,1e-6);assert.equal(r.config.sampleChi,truth.sampleChi);assert.equal(r.config.samplePhi,truth.samplePhi);
});
test('negative angle conventions and transmission geometry refine correctly',async()=>{
  for(const mode of ['backscatter','transmission']) {
    const truth={...base,laueMode:mode,sampleSigns:{omega:-1,chi:1,phi:-1}};
    const start={...truth,sampleOmega:14,sampleChi:28,samplePhi:43};
    const r=await M.refineOrientation(cell,start,size,observations(truth),sample,null,50);
    assert.equal(r.improved,true);assert.ok(r.rms<1e-5);assert.ok(orientationError(r.config,truth)<1e-5);
  }
});
test('unobservable parameters and repeated harmonic spots cannot produce a successful fit',async()=>{
  const azimuth=await M.refineOrientation(cell,base,size,observations(base),{detOmega:true},null,20);
  assert.equal(azimuth.status,'underconstrained');assert.equal(azimuth.improved,false);
  const peak=observations(base,1)[0];const duplicates=Array.from({length:8},(_,i)=>({...peak,matchedH:peak.matchedH*(i+1),matchedK:peak.matchedK*(i+1),matchedL:peak.matchedL*(i+1)}));
  const r=await M.refineOrientation(cell,base,size,duplicates,{detOffsetX:true,detOffsetY:true},null,20);
  assert.equal(r.status,'insufficient_matches');assert.equal(r.used,1);assert.equal(r.excluded,7);
});
test('invalid, forbidden and null index assignments are excluded explicitly',async()=>{
  const obs=observations(base,8);const invalid=[{...obs[0],matchedH:null},{...obs[0],x:NaN},{x:0,y:0,matchedH:0,matchedK:0,matchedL:0}];
  const allowed=(h,k,l)=>h!==obs[0].matchedH||k!==obs[0].matchedK||l!==obs[0].matchedL;
  const r=await M.refineOrientation(cell,base,size,[...obs,...invalid],sample,allowed,10);
  assert.equal(r.status,'converged');assert.equal(r.used,7);assert.equal(r.excluded,4);
});
test('nonphysical inputs fail without clamping controls and pixel RMS is a 2D spot distance',async()=>{
  const bad=await M.refineOrientation(cell,{...base,detDistance:0},size,observations(base),sample,null,10);
  assert.equal(bad.status,'invalid_input');assert.equal(bad.config.detDistance,0);
  const obs=observations(base).map(p=>({...p,x:p.x+3,y:p.y+4}));
  const r=await M.refineOrientation(cell,base,size,obs,{detOffsetX:true},null,10,{robust:false});
  close(r.initialRms,5);close(r.rms,4,1e-5);
});
test('cancellation after an asynchronous yield keeps the starting parameters',async()=>{
  let cancelled=false,updates=0;
  const start={...base,sampleOmega:14};
  const r=await M.refineOrientation(cell,start,size,observations(base),sample,null,40,{
    shouldCancel:()=>cancelled,yieldToBrowser:async()=>{cancelled=true},onProgress:()=>updates++
  });
  assert.equal(r.status,'cancelled');assert.equal(r.improved,false);assert.equal(r.config.sampleOmega,14);assert.equal(updates,1);
});

test('matching reassigns an earlier observation to maximize valid one-to-one matches',()=>{
  const pred=[{h:1,k:0,l:0,x:0,y:0},{h:0,k:1,l:0,x:9,y:0}],obs=[{id:1,x:4,y:0},{id:2,x:0,y:0}];
  const a=M.matchObservedToPredicted(obs,pred,6),b=M.matchObservedToPredicted(obs.slice().reverse(),pred.slice().reverse(),6).reverse();
  assert.equal(a.filter(p=>p.matchedH!=null).length,2);assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(a[0].matchedK,1);
});
test('coincident harmonics share one matching slot and points on the radius boundary are included',()=>{
  const pred=[{h:1,k:0,l:0,x:0,y:0},{h:2,k:0,l:0,x:1e-12,y:0}],obs=[{x:0,y:0},{x:1,y:0}];
  assert.equal(M.matchObservedToPredicted(obs,pred,5).filter(p=>p.matchedH!=null).length,1);
  assert.equal(M.matchObservedToPredicted([{x:3,y:4}],pred.slice(0,1),5)[0].matchDist,5);
});
test('sparse matching agrees with exhaustive minimum-cost maximum matching',()=>{
  let seed=4;const rand=()=>((seed=(seed*16807)%2147483647)/2147483647);
  function optimum(obs,pred,radius,index=0,used=new Set()) {
    if(index===obs.length)return {count:0,cost:0};
    let best=optimum(obs,pred,radius,index+1,used);
    pred.forEach((p,i)=>{const d=(obs[index].x-p.x)**2+(obs[index].y-p.y)**2;if(used.has(i)||d>radius**2)return;
      used.add(i);const next=optimum(obs,pred,radius,index+1,used);used.delete(i);
      const candidate={count:next.count+1,cost:next.cost+d};
      if(candidate.count>best.count||(candidate.count===best.count&&candidate.cost<best.cost))best=candidate;
    });return best;
  }
  for(let n=0;n<30;n++) {
    const obs=Array.from({length:5},()=>({x:rand()*10,y:rand()*10}));
    const pred=Array.from({length:5},(_,i)=>({x:rand()*10,y:rand()*10,h:i+1,k:0,l:1}));
    const out=M.matchObservedToPredicted(obs,pred,5).filter(p=>p.matchedH!=null),expected=optimum(obs,pred,5);
    assert.equal(out.length,expected.count);close(out.reduce((sum,p)=>sum+p.matchDist**2,0),expected.cost);
  }
});

function assertRotation(R) {
  const Rt=R[0].map((_,j)=>R.map(row=>row[j])),I=multiply(R,Rt);
  I.forEach((row,i)=>row.forEach((v,j)=>close(v,i===j?1:0,1e-10)));
  close(M.dot(R[0],M.cross(R[1],R[2])),1,1e-10);
}
test('ideal corrections are proper rotations and place the second HKL in the horizontal scattering plane',()=>{
  for(const angles of [{omega:12,chi:17,phi:23},{omega:180,chi:0,phi:0},{omega:0,chi:90,phi:0},{omega:-75,chi:44,phi:123}]) {
    for (const second of [[0,1,0],[-2,1,0]]) {
      const dev=M.idealOrientationDeviation(cell,angles,[1,0,0],second);assertRotation(dev.correctionMatrix);
      const U=M.uMatrix(angles.omega,angles.chi,angles.phi),R=dev.correctionMatrix;
      vector(R,vector(U,[1,0,0])).forEach((v,i)=>close(v,i===0?1:0));
      const h=M.normalize(second),after=vector(R,vector(U,h));
      close(after[2],0);close(after[0],h[0]);
      const sequence=multiply(rotation([1,0,0],dev.beamNormalRotationDeg),multiply(rotation([0,1,0],dev.horizontalAxisRotationDeg),rotation([0,0,1],dev.verticalAxisRotationDeg)));
      sequence.forEach((row,i)=>row.forEach((v,j)=>close(v,R[i][j],1e-8)));
    }
  }
});
test('either horizontal side is ideal without an unnecessary 180 degree correction',()=>{
  for(const second of [[0,1,0],[0,-1,0],[-2,1,0],[-2,-1,0]]) {
    const dev=M.idealOrientationDeviation(cell,{omega:0,chi:0,phi:0},[1,0,0],second);
    close(dev.totalCorrectionDeg,0);close(dev.horizontalMisalignmentDeg,0);
  }
  close(M.idealOrientationDeviation(cell,{omega:0,chi:180,phi:0},[1,0,0],[0,1,0]).totalCorrectionDeg,0);
});
test('the smaller of the two valid horizontal-plane corrections is selected',()=>{
  const angles={omega:20,chi:37,phi:18};
  const dev=M.idealOrientationDeviation(cell,angles,[1,0,0],[-2,1,0]);
  const other=dev.correctionMatrix.map((row,i)=>row.map(v=>i===0?v:-v));
  const trace=R=>R[0][0]+R[1][1]+R[2][2];
  assert.ok(trace(dev.correctionMatrix)>=trace(other)-1e-12);assertRotation(dev.correctionMatrix);
});
test('horizontal-plane deviation measures the vertical component, not the beam-parallel component',()=>{
  const horizontal=M.idealOrientationDeviation(cell,{omega:25,chi:0,phi:0},[1,0,0],[-2,1,0]);
  close(horizontal.horizontalMisalignmentDeg,0);close(horizontal.beamMisalignmentDeg,25);
  const tilted=M.idealOrientationDeviation(cell,{omega:0,chi:10,phi:0},[1,0,0],[-2,1,0]);
  close(tilted.horizontalMisalignmentDeg,Math.asin(Math.sin(10*Math.PI/180)/Math.sqrt(5))*180/Math.PI);
  close(tilted.beamNormalRotationDeg,-10);
});
test('ideal calculator rejects zero and parallel HKLs while accepting nonperpendicular directions',()=>{
  const angles={omega:0,chi:0,phi:0};
  assert.throws(()=>M.idealOrientationDeviation(cell,angles,[0,0,0],[1,0,0]),/cannot be 0 0 0/);
  assert.throws(()=>M.idealOrientationDeviation(cell,angles,[1,0,0],[2,0,0]),/parallel/);
  close(M.idealOrientationDeviation(cell,angles,[1,0,0],[-2,1,0]).totalCorrectionDeg,0);
  assert.throws(()=>M.idealOrientationDeviation({...cell,a:0},angles,[1,0,0],[0,1,0]),/Cell lengths/);
});
test('horizontal-plane corrections respect noncubic reciprocal metrics and angle signs',()=>{
  const params={a:4,b:6,c:7,alpha:82,beta:110,gamma:70},angles={omega:18,chi:35,phi:45},signs={omega:-1,chi:1,phi:-1};
  const dev=M.idealOrientationDeviation(params,angles,[1,0,0],[-2,1,0],signs);assertRotation(dev.correctionMatrix);
  const UB=M.ubMatrix(params,18,35,45,signs);
  const beam=M.normalize(M.reciprocalVector([1,0,0],UB)),horizontal=M.normalize(M.reciprocalVector([-2,1,0],UB));
  const b=vector(dev.correctionMatrix,beam),h=vector(dev.correctionMatrix,horizontal);
  b.forEach((v,i)=>close(v,i===0?1:0));close(h[2],0);close(h[0],M.dot(beam,horizontal));
});

function uiFixture(refiner) {
  const text=fs.readFileSync(path.join(__dirname,'laue-analysis.js'),'utf8');
  const source=text.slice(text.indexOf('  function readRefinementSettings()'),text.indexOf('  function undoRefinement()'));
  const elements=new Map(),el=id=>{
    if(!elements.has(id))elements.set(id,{value:'',checked:false,disabled:false,hidden:true,textContent:''});
    return elements.get(id);
  };
  for(const id of ['omega','chi','phi','robust'])el('laue-refine-'+id).checked=true;
  el('laue-refine-outlier-scale').value='2';
  const s={document:{getElementById:el},REFINE_PARAM_KEYS:['sampleOmega','sampleChi','samplePhi','detDistance','detOffsetX','detOffsetY','detOmega','detChi'],
    state:{displayData:{width:1024,height:1024},rawData:null,transform:{rotate90:0},observedPeaks:observations(base,3)},
    inst:{...base},refineResult:el('laue-refine-result'),writes:[],updates:[],saves:0,
    readCrystal:()=>cell,matchPeaks(){},matchPeaksStatusMessage:()=> 'Matched 3 / 3.',
    countMatchedPeaks:peaks=>peaks.filter(p=>p.matchedH!=null).length,
    countRefinementParameters:flags=>Object.values(flags).filter(Boolean).length,
    minMatchedPeaksForRefinement:()=>2,buildConfig:cfg=>cfg,allowedPredicateForCrystal:()=>null,
    nextPaint:async()=>{},setRefinementUndoAvailable:enabled=>{el('laue-refine-undo-btn').disabled=!enabled;}
  };
  s.readInstrument=()=>({...s.inst});s.snapshotRefinementInstrument=()=>({...s.inst});
  s.writeInstrumentToForm=cfg=>{s.writes.push(cfg);s.inst={...cfg};};
  s.updatePredictions=options=>s.updates.push(options);s.persistConfig=()=>{s.saves++;};
  s.LaueMath={refineOrientation:(...args)=>refiner(s,...args)};
  vm.createContext(s);vm.runInContext(source,s);return {s,el};
}
const successfulFit=()=>({config:{...base,sampleOmega:14},improved:true,rms:.1,initialRms:2,used:3,inliers:3,outliers:0,inlierRms:.1,message:'Fit converged.'});
test('refinement UI applies a successful fit once, records undo and keeps fitted index assignments',async()=>{
  const {s,el}=uiFixture(async()=>successfulFit());await s.runRefinement();
  assert.equal(s.writes.length,1);assert.equal(s.saves,1);assert.equal(s.state.refinementUndo.sampleOmega,13);
  assert.equal(s.updates[0].rematch,false);assert.equal(el('laue-refine-undo-btn').disabled,false);
  assert.equal(el('laue-refine-btn').disabled,false);assert.equal(el('laue-refine-cancel-btn').hidden,true);
  assert.match(s.refineResult.textContent,/All 3 fitted spots/);
});
test('refinement UI discards a late fit when controls changed during the run',async()=>{
  const {s}=uiFixture(async ctx=>{ctx.inst.sampleOmega=99;return successfulFit();});await s.runRefinement();
  assert.equal(s.writes.length,0);assert.equal(s.inst.sampleOmega,99);assert.match(s.refineResult.textContent,/Current edits were kept/);
});
test('refinement UI cancellation preserves parameters and solver errors re-enable controls',async()=>{
  const cancelled=uiFixture(async ctx=>{ctx.state.refinementRun.cancelled=true;return successfulFit();});
  await cancelled.s.runRefinement();assert.equal(cancelled.s.writes.length,0);assert.match(cancelled.s.refineResult.textContent,/cancelled/);
  const failed=uiFixture(async()=>{throw new Error('numerical failure');});await failed.s.runRefinement();
  assert.equal(failed.s.writes.length,0);assert.equal(failed.el('laue-refine-btn').disabled,false);
  assert.equal(failed.el('laue-refine-cancel-btn').hidden,true);assert.equal(failed.s.state.refinementRun,null);
  assert.match(failed.s.refineResult.textContent,/numerical failure/);
});
test('an already-converged UI run keeps the prior undo snapshot and reports convergence',async()=>{
  const {s}=uiFixture(async()=>({improved:false,status:'converged',message:'Already converged; parameters were not changed.'}));
  const previous={sampleOmega:12};s.state.refinementUndo=previous;await s.runRefinement();
  assert.equal(s.writes.length,0);assert.equal(s.state.refinementUndo,previous);assert.match(s.refineResult.textContent,/Already converged/);
});
