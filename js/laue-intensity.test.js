const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {}; context.window = context;
for (const file of ['space-groups-data.js', 'spacegroup-settings-data.js', 'spacegroup-engine.js',
  'cromer-mann-data.js', 'scattering-factors.js', 'cif-parser.js', 'laue-math.js', 'laue-spectrum.js', 'laue-xray-data.js', 'laue-xray-corrections.js', 'laue-intensity.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
}
const I = context.LaueIntensity, F = context.ScatteringFactors;
const cell = {a:5,b:5,c:5,alpha:90,beta:90,gamma:90,spaceGroup:'P1'};
const carbon = {element:'C',fractX:0,fractY:0,fractZ:0,occupancy:1};
const model = (sourceType='neutron', atoms=[carbon], extra={}) => I.createModel({...cell,atoms,...extra},sourceType);
function peak(h=1, lambda=2, sinTheta=0.5, extra={}) {
  return {h,k:0,l:0,hklSq:h*h,lambda,q:4*Math.PI*sinTheta/lambda,x:100,y:100,onImage:true,...extra};
}
function close(a,b,tol=1e-10) { assert.ok(Math.abs(a-b) <= tol*Math.max(1,Math.abs(b)), `${a} differs from ${b}`); }

test('flat-per-wavelength Laue intensity has the analytic nuclear wavelength and angle dependence',()=>{
  const m=model(), b=F.NEUTRON_COHERENT_LENGTHS_FM.C[0];
  close(m.reflectionIntensity(peak()).intensity,b*b*2**4/(2*.5**2));
  close(m.reflectionIntensity(peak(2,1)).intensity/m.reflectionIntensity(peak()).intensity,1/16);
  close(m.reflectionIntensity(peak(1,2,1)).intensity/m.reflectionIntensity(peak()).intensity,1/4);
});

test('X-ray factors use Q/(4π), decay with Q and include unpolarized polarization',()=>{
  const m=model('xray'), p=peak(), f=F.atomicScatteringFactor('C',{sourceType:'xray',s:.25}).re;
  close(m.reflectionIntensity(p).intensity,f*f*2**4/(2*.5**2)*.625);
  const n=model('neutron');
  assert.ok(m.reflectionIntensity(peak(2,1)).intensity/m.reflectionIntensity(p).intensity < 1/16);
  close(n.reflectionIntensity(peak(2,1)).intensity/n.reflectionIntensity(p).intensity,1/16);
});

test('harmonics sum incoherently before on-image normalization and wavelength limits are inclusive',()=>{
  const m=model(), p=peak(), harmonic=peak(2,1), third=peak(3,2/3);
  const input=[harmonic,p,third], before=JSON.stringify(input);
  const result=I.calculateSpots(input,m,2/3,2);
  assert.equal(result.spots.length,1); // all three harmonics share a ray
  close(result.spots[0].intensity,m.reflectionIntensity(p).intensity*(1+1/16+1/81));
  assert.equal(result.spots[0].h,1);assert.equal(result.spots[0].relativeIntensity,1);
  assert.equal(JSON.stringify(input),before);
  const selected=I.calculateSpots([p,harmonic],m,1,1.5);
  assert.equal(selected.spots.length,1);assert.equal(selected.spots[0].h,2);assert.equal(selected.spots[0].reflections.length,1);
  assert.equal(I.calculateSpots([p],m,3,4).spots.length,0);
});

test('a discovered ray includes higher orders beyond the search cutoff within Q and wavelength limits', () => {
  const centered = {...cell, spaceGroup: 'Im-3m', atoms: [carbon]};
  const m = I.createModel(centered, 'neutron');
  const seed = peak(2, 2), next = peak(4, 1);
  const options = { qMin: 0, qMax: next.q, isAllowed: I.allowedPredicate(centered) };
  const transmission = p => p.h === 4 ? .5 : 1;
  const r = I.calculateSpots([seed], m, 1, 4, null, {...options, transmission});
  assert.equal(r.spots[0].reflections.map(p => p.h).join(','), '2,4');
  close(r.spots[0].intensity, m.reflectionIntensity(seed).intensity + .5 * m.reflectionIntensity(next).intensity);
  assert.equal(I.calculateSpots([seed], m, 1, 4, null, {...options, qMax: next.q - .01}).spots[0].reflections.length, 1);
  assert.equal(I.calculateSpots([seed], m, 1.01, 4, null, options).spots[0].reflections.length, 1);
});

test('X-ray dispersion uses photon energy and high-Q Rayleigh data cover orders outside Cromer–Mann', () => {
  const ce = {...carbon, element: 'Ce'};
  const crystal = {...cell, atoms: [ce]};
  const wavelength = context.LaueSpectrum.HC_KEV_ANGSTROM / 6;
  const p = peak(1, wavelength);
  const f0 = F.atomicScatteringFactor('Ce', {sourceType: 'xray', s: p.q / (4*Math.PI)}).re;
  const neutral = I.createModel(crystal, 'xray').reflectionIntensity(p).intensity;
  const corrected = I.createModel(crystal, 'xray', {energyDependent: true}).reflectionIntensity(p).intensity;
  // xraylib 4.3.0 Ce dispersion at 6 keV: f′ ≈ −10.427, f″ ≈ 9.719 electrons.
  close(corrected / neutral, ((f0 - 10.427)**2 + 9.719**2) / f0**2, .002);
  const highQ = I.createModel(crystal, 'xray').reflectionIntensity(peak(10, .20));
  assert.ok(highQ.intensity > 0);
  assert.equal(highQ.missingElements.length, 0);
});

test('air and window transmission includes outgoing path and film incidence angle', () => {
  const xray = context.LaueXrayCorrections;
  const settings = {incidentAirCm: 10, beWindowMm: .5, detectorFilmUm: 25};
  const T = xray.createTransmission(settings, {detDistance: 150});
  const hc = context.LaueSpectrum.HC_KEV_ANGSTROM;
  const normal = {xLab: 0, yLab: 0, lambda: hc / 8};
  assert.ok(T(normal) > T({...normal, lambda: hc / 4}));
  assert.ok(T(normal) > T({...normal, xLab: 150}));
  // Cross sections from xraylib at 8 keV and normal incidence.
  const expected = Math.exp(-(.001205*25*9.918661 + .0924*1.123758 + .003475*6.749471));
  close(T(normal), expected, .004);
  assert.throws(() => xray.createTransmission({...settings, beWindowMm: -1}, {detDistance: 150}), /nonnegative/);
});

test('off-image strengths do not shrink visible dots, distinct rays do not merge, and Friedel signs are retained',()=>{
  const result=I.calculateSpots([peak(),peak(1,3,.5,{k:1,onImage:false}),peak(-1,1)],model(),.5,4);
  assert.equal(result.spots.length,3);close(result.spots[0].relativeIntensity,1);close(result.spots[2].relativeIntensity,1/16);
});

test('occupancies, signed neutron interference and exact basis extinctions are respected',()=>{
  close(model('neutron',[{...carbon,occupancy:.5}]).reflectionIntensity(peak()).intensity,
    model().reflectionIntensity(peak()).intensity/4);
  assert.equal(model('neutron',[{...carbon,occupancy:0}]).reflectionIntensity(peak()).intensity,0);
  const pair=model('neutron',[carbon,{...carbon,fractX:.5}]);
  assert.equal(pair.reflectionIntensity(peak()).intensity,0);
  assert.ok(pair.reflectionIntensity(peak(2,1)).intensity>0);
  const spot=I.calculateSpots([peak(),peak(2,1)],pair,.5,4).spots[0];
  assert.equal(spot.h,2);assert.equal(spot.lambda,1);assert.equal(spot.q,2*Math.PI);
  const hydrogen={...carbon,element:'H'};
  const actual=model('neutron',[carbon,hydrogen]).reflectionIntensity(peak()).intensity;
  close(actual,(6.646-3.739)**2*32);
});

test('explicit symmetry operations are authoritative even for a missing or P1 H-M label',()=>{
  const operations=['x,y,z','x+1/2,y,z'];
  for (const spaceGroup of ['', 'P1']) {
    const m=model('neutron',[carbon],{spaceGroup,symmetryOperations:operations});
    assert.equal(m.reflectionIntensity(peak()).intensity,0);
    close(m.reflectionIntensity(peak(2,1)).intensity,4*model().reflectionIntensity(peak(2,1)).intensity);
  }
  // A genuine centered group expands the asymmetric site exactly once per orbit.
  assert.equal(model('neutron',[carbon],{spaceGroup:'Im-3m'}).reflectionIntensity(peak()).intensity,0);
});

test('missing coefficients never masquerade as a complete structure or harmonic sum',()=>{
  const m=model('neutron',[carbon,{...carbon,element:'Og'}]);
  const result=I.calculateSpots([peak()],m,.5,4);
  assert.equal(result.spots[0].intensity,null);assert.equal(result.unavailableSpots,1);
  assert.equal(result.missingElements.join(','),'Og');assert.equal(result.spots[0].relativeIntensity,0);
  // s > 25 Å^-1 is beyond both X-ray form factor tables.
  const short=peak(2,.01,.5), xray=I.calculateSpots([peak(),short],model('xray'),.005,4);
  assert.equal(xray.spots[0].intensity,null);
  assert.equal(model('neutron',[{...carbon,element:'D'}]).reflectionIntensity(peak()).missingElements.length,0);
});

test('invalid bands, atoms and unknown symmetry are rejected clearly',()=>{
  for(const band of [[0,4],[2,2],[4,2],[NaN,2],[1,Infinity]]) assert.throws(()=>I.calculateSpots([],model(),...band),/Wavelength limits/);
  assert.throws(()=>model('electron'),/Choose X-ray or neutron/);
  assert.throws(()=>model('xray',[]),/fractional atom/);
  assert.throws(()=>model('xray',[{...carbon,fractX:NaN}]),/coordinates/);
  assert.throws(()=>model('xray',[{...carbon,occupancy:-1}]),/occupancies/);
  assert.throws(()=>model('xray',[carbon],{spaceGroup:'unknown'}),/resolve CIF symmetry/);
  assert.throws(()=>model().reflectionIntensity(peak(1,2,1.1)),/Bragg/);
  assert.throws(()=>model('neutron',[carbon],{symmetryOperations:['x+1/0,y,z']}),/translation/);
  assert.throws(()=>model('neutron',[carbon],{symmetryOperations:['x,0,z']}),/rotation/);
  assert.throws(()=>model('neutron',[carbon],{symmetryOperations:['2*x,y,z']}),/Unsupported/);
});

test('systematic absence filters use CIF axis settings for rhombohedral and centered cells',()=>{
  const rhombo={...cell,spaceGroup:'R -3 m',spaceGroupSetting:'-P 3* 2',atoms:[carbon]};
  assert.equal(I.allowedPredicate(rhombo)(1,0,0),true);
  assert.equal(I.allowedPredicate({...rhombo,spaceGroupSetting:'-R 3 2"'})(1,0,0),false);
  assert.equal(I.allowedPredicate({...cell,spaceGroup:'Im-3m'})(1,0,0),false);
  assert.equal(I.allowedPredicate({...cell,spaceGroup:'P21',symmetryOperations:['x,y,z','-x,y+1/2,-z']})(0,1,0),false);
  assert.equal(I.allowedPredicate({...cell,spaceGroup:'P21',symmetryOperations:['x,y,z','-x,y+1/2,-z']})(1,1,0),true);
  for(let id=1;id<=230;id++) assert.equal(I.allowedPredicate({...cell,spaceGroup:String(id)})(0,0,0),false);
});

test('real projected harmonic rays combine identically in transmission and backscatter',()=>{
  const config={sampleOmega:13,sampleChi:27,samplePhi:42,detDistance:150,detWidth:300,detHeight:300,
    detOmega:0,detChi:0,qMin:0,qMax:12,maxHklSq:100};
  for(const laueMode of ['backscatter','transmission']) {
    const peaks=context.LaueMath.computePredictedPeaks(cell,{...config,laueMode},{width:1024,height:1024});
    const r=I.calculateSpots(peaks,model(),.5,4);
    assert.ok(r.spots.some(s=>s.reflections.length>1));
    for(const spot of r.spots) {
      for(const p of spot.reflections) {close(p.x,spot.x);close(p.y,spot.y);}
      close(spot.intensity,spot.reflections.reduce((sum,p)=>sum+p.intensity,0));
    }
    close(Math.max(...r.spots.filter(s=>s.onImage).map(s=>s.relativeIntensity)),1);
  }
});

test('CIF Hall settings and explicit operations survive parsing for expansion',()=>{
  const data=context.parseCif("data_test\n_cell_length_a 5\n_cell_length_b 5\n_cell_length_c 5\n_cell_angle_alpha 90\n_cell_angle_beta 90\n_cell_angle_gamma 90\n_space_group_name_Hall '-P 1'\nloop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_fract_x\n_atom_site_fract_y\n_atom_site_fract_z\nC1 C .1 .2 .3\n");
  assert.equal(data.spaceGroupHallSymbol,'-P 1');
  const m=model('neutron',data.atoms,{spaceGroup:data.spaceGroupHallSymbol,spaceGroupSetting:data.spaceGroupHallSymbol});
  close(m.reflectionIntensity(peak()).intensity,model().reflectionIntensity(peak()).intensity*4*Math.cos(.2*Math.PI)**2);
});

test('incomplete CIF atom rows and unknown occupancies cannot yield plausible partial-basis intensities',()=>{
  const prefix="data_test\n_cell_length_a 5\n_cell_length_b 5\n_cell_length_c 5\n_cell_angle_alpha 90\n_cell_angle_beta 90\n_cell_angle_gamma 90\nloop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_fract_x\n_atom_site_fract_y\n_atom_site_fract_z\n_atom_site_occupancy\nC1 C 0 0 0 1\n";
  for(const row of ['O1 O ? .2 .3 1','O1 O .1 .2 .3 ?','O1 O .1 .2']) {
    const parsed=context.parseCif(prefix+row+'\n');
    assert.ok(parsed.incompleteAtomSites.length>0);
    assert.throws(()=>model('neutron',parsed.atoms,{incompleteAtomSites:parsed.incompleteAtomSites}),/complete atomic basis/);
    const {s}=uiFixture();const before=JSON.stringify(s.readCrystal());
    assert.throws(()=>s.applyCifData(parsed),/complete atomic basis/);assert.equal(JSON.stringify(s.readCrystal()),before);
  }
});

test('truncated or blank CIF symmetry rows cannot silently replace a centered group with identity',()=>{
  const prefix="data_test\n_cell_length_a 5\n_cell_length_b 5\n_cell_length_c 5\n_cell_angle_alpha 90\n_cell_angle_beta 90\n_cell_angle_gamma 90\n_space_group_name_H-M_alt 'I m -3 m'\nloop_\n_space_group_symop_id\n_space_group_symop_operation_xyz\n1 'x,y,z'\n";
  for(const row of ['2',"2 ''"]) {
    const parsed=context.parseCif(prefix+row+'\n');
    assert.equal(parsed.incompleteSymmetryOperations,true);
    assert.throws(()=>model('neutron',[carbon],parsed),/symmetry operations are incomplete/);
    assert.throws(()=>I.allowedPredicate(parsed),/symmetry operations are incomplete/);
    const {s}=uiFixture();const before=JSON.stringify(s.readCrystal());
    assert.throws(()=>s.applyCifData(parsed),/symmetry operations are incomplete/);
    assert.equal(JSON.stringify(s.readCrystal()),before);
  }
});

function uiFixture() {
  const text=fs.readFileSync(path.join(__dirname,'laue-analysis.js'),'utf8');
  function source(name) {
    const start=text.indexOf(`  function ${name}(`);
    const next=text.indexOf('\n  function ',start+5);
    return text.slice(start,next<0?text.lastIndexOf('\n  bootstrap();'):next);
  }
  const elements=new Map(), el=id=>{
    if(!elements.has(id)) elements.set(id,{value:'',checked:false,disabled:false,textContent:'',style:{},classList:{remove(){}}});
    return elements.get(id);
  };
  for(const [id,value] of Object.entries({a:5,b:5,c:5,alpha:90,beta:90,gamma:90,spacegroup:'P1'}))el('laue-'+id).value=String(value);
  el('laue-intensity-source').value='neutron';el('laue-wavelength-min').value='.5';el('laue-wavelength-max').value='4';
  el('laue-minimum-peak-opacity').value='10';el('laue-xray-spectrum').value='flat';el('laue-neutron-spectrum').value='flat';
  el('laue-tube-voltage').value='40';el('laue-neutron-temperature').value='300';
  const s={...context,document:{getElementById:el},spaceGroupFieldsLink:null,intensityModelCache:null,
    state:{crystalStructure:{atoms:[],symmetryOperations:[],spaceGroupSetting:'',assumedP1:false},crystalMeta:{},
      expectedIntensity:{},predictedPeaks:[peak(),peak(-1,1)],intensitySpots:[],instrument:{beamRadius:30,qMin:0,qMax:2*Math.PI,detDistance:150},observedPeaks:[],view:{},mode:'',displayData:{width:500,height:500},display:{},corrections:{}},
    overlayCanvas:{},canvasViewport:{clientWidth:500,clientHeight:500},draws:[],
    viewTotalScale:()=>1,beamCenterPosition:()=>({x:0,y:0}),imageToViewport:(x,y)=>({x,y}),syncOverlayCanvas(){},
    setOverlayStroke(ctx,color,alpha){ctx.strokeStyle=color;ctx.globalAlpha=alpha;},setOverlayFill(ctx,color,alpha){ctx.fillStyle=color;ctx.globalAlpha=alpha;},
    readOverlaySettings:()=>({showPredictedPeaks:true,showPredictedLabels:false,showObservedPeaks:false,predRadius:8,predColor:'#006400',predAlpha:.8}),
    readInstrument:()=>({}),readDisplaySettings:()=>({}),readRefinementSettings:()=>({}),readCorrections:()=>({}),
    persistConfig(){},writeOverlaySettingsToForm(){},drawCurveEditor(){},applyViewTransform(){},isBlankDetector:()=>true,
    writeCorrectionsToForm(){},ensureCurveEndpoints(){},setRefinementUndoAvailable(){},migrateInstrumentConfig:x=>x,normalizeBeamStorage(){},
    writeInstrumentToForm(){},REFINE_PARAM_KEYS:[]};
  s.window=s;
  s.overlayCtx={clearRect(){},beginPath(){},arc(x,y,r){s.draws.push({x,y,r});},fill(){Object.assign(s.draws.at(-1),{filled:true,alpha:this.globalAlpha});},stroke(){s.draws.at(-1).stroked=true;}};
  s.updatePredictions=()=>{s.state.crystal=s.readCrystal();s.updateExpectedIntensities();};
  vm.createContext(s);
  vm.runInContext(text.slice(text.indexOf('  const INTENSITY_DEFAULTS'), text.indexOf('  const canvas')), s);
  for(const name of ['readCrystal','setCrystalMeta','clearCrystalPresetMeta','num','readIntensitySettings','writeIntensitySettings',
    'updateExpectedIntensities','saveConfigToObject','loadConfigFromObject','applyCifData','redrawOverlays','allowedPredicateForCrystal'])vm.runInContext(source(name),s);
  return {s,el};
}

test('UI enables only with CIF atoms, varies opacity at a fixed radius and returns to outlines',()=>{
  const {s,el}=uiFixture();s.updateExpectedIntensities();assert.equal(el('laue-show-expected-intensity').disabled,true);
  s.applyCifData({...cell,atoms:[carbon]});assert.equal(el('laue-show-expected-intensity').disabled,false);
  el('laue-show-expected-intensity').checked=true;s.updateExpectedIntensities();s.redrawOverlays();
  assert.equal(s.draws.length,2);assert.ok(s.draws.every(d=>d.filled&&!d.stroked));
  assert.ok(s.draws.every(d=>d.r===8));
  close(s.draws[0].alpha,.8);close(s.draws[1].alpha,.1+(.8-.1)/17);
  assert.equal(el('laue-pred-alpha-label').textContent,'Max opacity (%)');
  assert.equal(el('laue-intensity-source').disabled,false);
  el('laue-show-expected-intensity').checked=false;s.updateExpectedIntensities();s.draws=[];s.redrawOverlays();
  assert.ok(s.draws.every(d=>d.stroked&&!d.filled&&d.r===8));assert.equal(el('laue-intensity-source').disabled,true);
  assert.equal(el('laue-pred-alpha-label').textContent,'Opacity (%)');
});

test('UI preserves CIF sites, symmetry and intensity settings across config round trips and clears legacy structure',()=>{
  const {s,el}=uiFixture();s.applyCifData({...cell,atoms:[carbon],symmetryOperations:['x,y,z','-x,-y,-z'],spaceGroupHallSymbol:'-P 1'});
  el('laue-show-expected-intensity').checked=true;s.updateExpectedIntensities();
  const saved=JSON.parse(JSON.stringify(s.saveConfigToObject()));
  const restored=uiFixture();restored.s.loadConfigFromObject(saved);
  assert.equal(restored.s.state.crystalStructure.atoms[0].element,'C');
  assert.equal(restored.s.state.crystalStructure.symmetryOperations.length,2);
  assert.equal(restored.s.state.crystalStructure.spaceGroupSetting,'-P 1');
  assert.equal(restored.el('laue-show-expected-intensity').checked,true);assert.equal(restored.el('laue-intensity-source').value,'neutron');
  restored.s.loadConfigFromObject({crystal:cell});
  assert.equal(restored.el('laue-show-expected-intensity').disabled,true);assert.equal(restored.s.state.crystalStructure.atoms.length,0);
});

test('beam circle spots use small dots and resizing the circle rescales the other spots', () => {
  const {s, el} = uiFixture();
  s.state.predictedPeaks[0].x = 18;
  s.state.predictedPeaks[0].y = 24; // On the 30 px boundary.
  s.applyCifData({...cell, atoms: [carbon]});
  el('laue-show-expected-intensity').checked = true;
  s.updateExpectedIntensities();
  s.redrawOverlays();
  assert.deepEqual(s.draws.map(({r}) => r), [6, 8]);
  close(s.draws[1].alpha, .8);

  s.state.instrument.beamRadius = 29;
  s.draws = [];
  s.redrawOverlays();
  assert.deepEqual(s.draws.map(({r}) => r), [8, 8]);
  close(s.draws[1].alpha, .1 + (.8 - .1) / 17);

  s.state.instrument.beamRadius = 150;
  s.draws = [];
  s.redrawOverlays();
  assert.deepEqual(s.draws.map(({r}) => r), [6, 6]);
  assert.ok(s.draws.every(({filled, alpha}) => filled && alpha === .8));
});

test('invalid CIF upload is atomic, missing symmetry does not inherit silicon, and SG edits clear imported operations',()=>{
  const {s,el}=uiFixture();s.applyCifData({...cell,atoms:[carbon],symmetryOperations:['x,y,z']});
  const before=JSON.stringify(s.readCrystal());assert.throws(()=>s.applyCifData({a:10,atoms:[]}),/Cell lengths/);
  assert.equal(JSON.stringify(s.readCrystal()),before);
  el('laue-spacegroup').value='Fd-3m';s.setCrystalMeta({presetId:'si-diamond',structureModel:'diamond'});
  s.applyCifData({...cell,atoms:[carbon],spaceGroup:undefined});
  assert.equal(el('laue-spacegroup').value,'P1');assert.equal(s.state.crystalMeta.presetId,'');assert.equal(s.state.crystalStructure.assumedP1,true);
  s.state.crystalStructure.symmetryOperations=['x,y,z'];s.state.crystalStructure.spaceGroupSetting='P 1';
  s.clearCrystalPresetMeta(false);assert.equal(s.state.crystalStructure.symmetryOperations.length,1);
  s.clearCrystalPresetMeta(true);assert.equal(s.state.crystalStructure.symmetryOperations.length,0);assert.equal(s.state.crystalStructure.atoms.length,1);
});

test('invalid intensity controls clear filled dots and show an actionable error',()=>{
  const {s,el}=uiFixture();s.applyCifData({...cell,atoms:[carbon]});
  el('laue-show-expected-intensity').checked=true;s.updateExpectedIntensities();assert.equal(s.state.intensitySpots.length,2);
  el('laue-wavelength-min').value='5';s.updateExpectedIntensities();s.redrawOverlays();
  assert.equal(s.draws.length,0);assert.match(el('laue-expected-intensity-status').textContent,/0 < minimum < maximum/);
});

test('GUI prediction predicate keeps primitive rhombohedral reflections before calculating intensity',()=>{
  const {s}=uiFixture();
  const crystal={...cell,alpha:80,beta:80,gamma:80,atoms:[carbon],spaceGroup:'R -3 m',spaceGroupSetting:'-P 3* 2'};
  assert.equal(s.allowedPredicateForCrystal(crystal)(1,0,0),true);
  const config={sampleOmega:13,sampleChi:27,samplePhi:42,detDistance:150,detWidth:300,detHeight:300,detOmega:0,detChi:0,qMin:0,qMax:12,maxHklSq:100,laueMode:'backscatter'};
  const unfiltered=context.LaueMath.computePredictedPeaks(crystal,{...config},{width:1024,height:1024});
  const filtered=context.LaueMath.computePredictedPeaks(crystal,{...config},{width:1024,height:1024},s.allowedPredicateForCrystal(crystal));
  assert.equal(filtered.length,unfiltered.length);
});

test('each harmonic receives incident flux before the spot sum and no-flux reflections stay hidden',()=>{
  const m=model(), p=peak(), harmonic=peak(2,1);
  const spectrum={density:lambda=>lambda===1?4:1};
  const spot=I.calculateSpots([p,harmonic],m,.5,4,spectrum).spots[0];
  close(spot.intensity,m.reflectionIntensity(p).intensity+m.reflectionIntensity(harmonic).intensity*4);
  const tungsten=context.LaueSpectrum.create({sourceType:'xray',xraySpectrum:'w-continuum',tubeVoltageKv:10});
  const filtered=I.calculateSpots([p,harmonic],m,.5,4,tungsten);
  assert.equal(filtered.spots.length,1);assert.equal(filtered.spots[0].reflections.length,1);assert.equal(filtered.spots[0].h,1);
  for(const bad of [-1,NaN,Infinity]) assert.throws(()=>I.calculateSpots([p],m,.5,4,{density:()=>bad}),/spectral flux/);
});

test('opacity interpolates linearly within its bounds and never creates extinct peaks',()=>{
  close(I.markerOpacity(0,.1,.8),.1);close(I.markerOpacity(1,.1,.8),.8);
  close(I.markerOpacity(1/16,.1,.8),.14375);
  close(I.markerOpacity(.25,0,1),.25);close(I.markerOpacity(2,0,1),1);
  close(I.markerOpacity(.5,.4,.4),.4);close(I.markerOpacity(.5,0,0),0);
  for(const bounds of [[-1,.8],[.9,.8],[0,1.1],[NaN,.8],[0,Infinity]]) assert.throws(()=>I.markerOpacity(.5,...bounds),/Peak opacities/);
  for(const value of [-1,NaN,Infinity])assert.throws(()=>I.markerOpacity(value,.1,.8),/Peak opacities/);
  const {s,el}=uiFixture();s.applyCifData({...cell,atoms:[carbon]});
  el('laue-show-expected-intensity').checked=true;s.updateExpectedIntensities();s.redrawOverlays();
  close((s.draws[1].alpha-.1)/(s.draws[0].alpha-.1),1/17);assert.ok(s.draws.every(d=>d.r===8));
  s.state.intensitySpots[0].intensity=0;s.draws=[];s.redrawOverlays();assert.equal(s.draws.length,1);
  el('laue-minimum-peak-opacity').value='90';s.updateExpectedIntensities();assert.equal(s.state.intensitySpots.length,0);
  assert.match(el('laue-expected-intensity-status').textContent,/Peak opacities/);
});

test('spectrum and opacity settings persist while legacy radius configs migrate without changing the shared radius',()=>{
  const {s,el}=uiFixture();s.applyCifData({...cell,atoms:[carbon]});
  el('laue-show-expected-intensity').checked=true;el('laue-minimum-peak-opacity').value='15';
  el('laue-neutron-spectrum').value='maxwell';el('laue-neutron-temperature').value='45';
  el('laue-xray-spectrum').value='w-lines';el('laue-tube-voltage').value='35';
  el('laue-xray-attenuation').checked=false;el('laue-xray-dispersion').checked=true;
  el('laue-incident-air').value='12';el('laue-be-window').value='.25';el('laue-detector-film').value='40';
  s.updateExpectedIntensities();const saved=JSON.parse(JSON.stringify(s.saveConfigToObject()));
  const restored=uiFixture();restored.s.loadConfigFromObject(saved);
  assert.equal(restored.el('laue-minimum-peak-opacity').value,15);
  assert.equal(restored.el('laue-neutron-temperature').value,45);assert.equal(restored.el('laue-tube-voltage').value,35);
  assert.equal(restored.el('laue-xray-spectrum').value,'w-lines');
  assert.equal(restored.el('laue-xray-attenuation').checked,false);
  assert.equal(restored.el('laue-xray-dispersion').checked,true);
  assert.equal(restored.el('laue-xray-correction-fields').hidden,true);
  assert.equal(restored.el('laue-incident-air').value,12);
  assert.equal(restored.el('laue-be-window').value,.25);
  assert.equal(restored.el('laue-detector-film').value,40);
  assert.equal(restored.el('laue-xray-spectrum-fields').hidden,true);
  assert.equal(restored.el('laue-neutron-temperature-field').hidden,false);
  restored.s.loadConfigFromObject({crystal:cell});assert.equal(restored.el('laue-minimum-peak-opacity').value,10);
  restored.s.loadConfigFromObject({crystal:cell,expectedIntensity:{enabled:true,minimumPeakRadius:100,xraySpectrum:'cu-lines'},overlay:{predRadius:6,predAlpha:.04}});
  assert.equal(restored.el('laue-minimum-peak-opacity').value,4);
  assert.equal(restored.el('laue-xray-spectrum').value,'w-lines');
  assert.equal(restored.el('laue-xray-attenuation').checked,true);
  assert.equal(restored.el('laue-xray-dispersion').checked,true);
  assert.equal(restored.s.state.overlay.predRadius,6);assert.equal(restored.s.state.overlay.predAlpha,.04);
  assert.equal(restored.s.readIntensitySettings().minimumPeakRadius,undefined);
});

test('zone endpoints and UVW indices survive config save/load while malformed and legacy data clear safely',()=>{
  const {s}=uiFixture();
  const zone={p1:{x:120,y:85},p2:{x:460,y:200},uvw:[1,0,-1]};
  s.state.zones=[zone];
  const saved=JSON.parse(JSON.stringify(s.saveConfigToObject()));
  const restored=uiFixture();restored.s.loadConfigFromObject(saved);
  assert.equal(JSON.stringify(restored.s.state.zones),JSON.stringify([zone]));
  restored.s.loadConfigFromObject({crystal:cell,zones:[zone,{p1:{x:NaN,y:1},p2:{x:2,y:3}}]});
  assert.equal(restored.s.state.zones.length,1);
  restored.s.loadConfigFromObject({crystal:cell});assert.equal(restored.s.state.zones.length,0);
});
