const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function source(file) { return fs.readFileSync(path.join(__dirname, '..', file), 'utf8'); }
function fixture(file, stop, expose) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false, textContent: '', innerHTML: '', style: {}, dataset: {},
      classList: { toggle() {} }, addEventListener() {}, setAttribute() {}, removeAttribute() {}, appendChild() {} });
    return elements.get(id);
  };
  const s = { document: { getElementById: el, querySelectorAll: () => [], createElement: () => el(Symbol()),
    readyState: 'loading', addEventListener() {} }, console, TextEncoder, TextDecoder, Blob, btoa, atob,
    setTimeout, clearTimeout, requestAnimationFrame: fn => fn(), getComputedStyle: () => ({ minHeight: '0' }), addEventListener() {} };
  s.window = s;
  let text = source(file);
  if (file.endsWith('.html')) text = [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  if (stop) text = text.slice(0, text.indexOf(stop));
  if (expose) text = text.replace(expose.at, expose.code + expose.at);
  vm.createContext(s); vm.runInContext(text, s, { filename: file });
  return { s, el, run: code => vm.runInContext(code, s) };
}
function evaluate(ast, values) {
  if (ast.type === 'number') return ast.value;
  if (ast.type === 'identifier') return values[ast.name];
  if (ast.type === 'unary') return -evaluate(ast.argument, values);
  if (ast.type === 'function') return Math[ast.name === 'ln' ? 'log' : ast.name](evaluate(ast.argument, values));
  const a = evaluate(ast.left, values), b = evaluate(ast.right, values);
  return { '+': () => a+b, '-': () => a-b, '*': () => a*b, '/': () => a/b, '^': () => a**b }[ast.op]();
}
function close(a, b, tolerance = 1e-10) { assert.ok(Math.abs(a-b) <= tolerance, `${a} != ${b}`); }

test('symbolic derivatives preserve signs, fractional powers, small coefficients and printed grouping', () => {
  const f = fixture('js/error-propagation.js', 'form.addEventListener');
  for (const [formula, values, expected] of [
    ['y=-x^2+x', {x:2}, -3], ['y=x^-2', {x:2}, -.25],
    ['y=(x^2)^0.5+x', {x:-2}, 0], ['y=(x^2)^0.5+x', {x:2}, 2],
    ['y=(x+1.00000001)/(x+1.00000002)', {x:2}, (1.00000002-1.00000001)/(3.00000002**2)],
    ['y=(x^A)^B', {x:2,A:2,B:3}, 192], ['y=(-x)^2', {x:2}, 4]
  ]) {
    const ast = f.run(`simplify(derivative(parseFormula(${JSON.stringify(formula)}).rhs,'x'))`);
    close(evaluate(ast, values), expected, 1e-13);
    f.s.partial = ast;
    const printed = f.run('formatExpression(partial)');
    const reparsed = f.run(`parseFormula(${JSON.stringify('y='+printed)}).rhs`);
    close(evaluate(reparsed, values), expected, 1e-13);
  }
});

test('scan budgets report actual elapsed time and end time after flooring the scan count', () => {
  const f = fixture('js/scan-timing.js', '[\n  planSolveForInput,');
  f.run("renderPlanResults(computePlan('num',{total:100,count:30,dead:0}),'num',36000)");
  assert.match(f.el('plan-results').innerHTML, /10:01:30/);
  assert.match(f.el('plan-results').innerHTML, /Unused time budget/);
  assert.doesNotMatch(f.el('plan-results').innerHTML, /10:01:40/);
  assert.equal(f.run('formatHMS(119.9996)'), '2:00');
  assert.match(f.run('renderResultCard("target", "<b>C</b>")'), /&lt;b&gt;C&lt;\/b&gt;/);
});

test('zero background gives a finite Poisson uncertainty and allocates all time to signal', () => {
  const f = fixture('js/poisson-background-subtraction.js', '[\n  poissonSignalRateInput,');
  for (const [key, value] of Object.entries({ 'signal-rate':'10', 'background-rate':'0', 'signal-model':'gross',
    'solve-mode':'time', 'precision-mode':'full', 'total-time':'100' })) f.el('poisson-'+key).value = value;
  const p = f.run('poissonPlan()');
  assert.equal(p.signalTime, 100); assert.equal(p.backgroundTime, 0);
  assert.equal(p.backgroundRateSigma, 0); close(p.netRateSigma, Math.sqrt(.1));
  f.el('poisson-solve-mode').value = 'relative'; f.el('poisson-target').value = '10';
  close(f.run('poissonPlan().totalTime'), 10);
  f.el('poisson-background-rate').value = '';
  assert.throws(() => f.run('poissonRates()'), /zero or greater/);
});

test('energy converter clears invalid dependencies and accepts exact backscattering', () => {
  const f = fixture('tools/neutron-energy-wavelength.html');
  for (const value of ['', '-1', 'invalid']) {
    f.el('neutron-energy').value = '81.81'; f.run("updateNeutronFrom('energy')");
    f.el('neutron-energy').value = value; f.run("updateNeutronFrom('energy')");
    for (const id of ['wavelength','wavevector','velocity']) assert.equal(f.el('neutron-'+id).value, '');
  }
  f.el('neutron-wavelength').value = '1'; f.el('momentum-two-theta').value = '180'; f.run("updateMomentumFrom('twoTheta')");
  close(Number(f.el('momentum-q').value), 4*Math.PI, 5e-5);
  f.el('momentum-two-theta').value = '181'; f.run("updateMomentumFrom('twoTheta')");
  assert.equal(f.el('momentum-q').value, ''); assert.equal(f.el('momentum-distance').value, '');
  f.el('energy').value = '1 eV'; f.run("updateFrom('energy')");
  f.el('energy').value = '-1'; f.run("updateFrom('energy')");
  for (const id of ['temperature','wavenumber','wavelength','frequency']) assert.equal(f.el(id).value, '');
});

function words() {
  return fixture('js/word-counter.js', null, { at: '  updateCounter();\n  updateDiff();',
    code: '  globalThis.W={mostCommonWords,countSentences,diffTokens,tokenize};\n' }).s.W;
}
test('text statistics retain Unicode words and count sentences ending inside quotes', () => {
  const W = words();
  assert.equal(W.countSentences('He said "Hello!" Then left.'), 2);
  assert.equal(JSON.stringify(W.mostCommonWords('école école café naïve 北京',10)), JSON.stringify([['école',2],['café',1],['naïve',1],['北京',1]]));
});
test('bounded text diff reconstructs both texts, including long rewrites and near-identical documents', () => {
  const W = words();
  const cases = [['a b c','a x c'], ['','new'], ['old',''], ['one\ntwo','one two'],
    [('word ').repeat(20000), ('word ').repeat(20000)],
    [('old ').repeat(5000), ('new ').repeat(5000)],
    [('word ').repeat(5000)+'old', ('word ').repeat(5000)+'new']];
  let seed = 17;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i=0;i<100;i++) cases.push([Array.from({length:20},()=>String(Math.floor(rand()*5))).join(' '), Array.from({length:20},()=>String(Math.floor(rand()*5))).join(' ')]);
  for (const [a,b] of cases) {
    const parts=W.diffTokens(W.tokenize(a),W.tokenize(b));
    assert.equal(parts.filter(p=>p.type!=='insert').map(p=>p.value).join(''),a);
    assert.equal(parts.filter(p=>p.type!=='delete').map(p=>p.value).join(''),b);
  }
});

test('viewer density and generated sites preserve zero occupancy', () => {
  const f=fixture('js/crystal-viewer.js',null,{at:'  if (document.readyState === "loading") {',code:'  globalThis.V={normalizeAtom,unitCellDensity,state};\n'});
  f.s.ScatteringFactors={ATOMIC_WEIGHTS:{Si:28.0855}};
  f.el('crystal-spacegroup').value='P 1';
  const a={label:'Si1',element:'Si',fractX:0,fractY:0,fractZ:0,occupancy:0};
  f.s.V.state.atoms=[a,{...a,label:'Si2',fractX:.25,occupancy:1}];
  assert.equal(f.s.V.normalizeAtom(a,0).occupancy,0);
  close(f.s.V.unitCellDensity(100),28.0855/6.02214076e23/1e-22);
  f.s.V.state.atoms=[a]; assert.equal(f.s.V.unitCellDensity(100),0);
});

test('lens inverse restores points across the full slider range', () => {
  const f=fixture('js/plot-digitizer-edit.js',null,{at:'  window.DigitizerImageEdit = {',code:'  globalThis.E={applyLensToPoint,invertLensPoint};\n'});
  for(const k of [-.5,-.25,.25,.5]) for(let x=0;x<=400;x+=40) for(let y=0;y<=300;y+=30){
    const p={x,y},c={x:199.5,y:149.5};
    const warped=f.s.E.applyLensToPoint(p,c,k,400,300);
    const restored=f.s.E.invertLensPoint(warped,c,k,400,300);
    close(restored.x,x,1e-7);close(restored.y,y,1e-7);
  }
});

test('Laue peak coordinates follow every pixel rotation and mirror on a nonsquare image', () => {
  const F=fixture('js/laue-formats.js').s.LaueFormats;
  const data={width:3,height:2,intensities:new Float32Array([0,1,2,3,4,5])};
  for(let rotate90=0;rotate90<4;rotate90++)for(const flipH of [false,true])for(const flipV of [false,true]){
    const t={rotate90,flipH,flipV},out=F.applyDisplayTransform(data,t);
    for(let y=0;y<2;y++)for(let x=0;x<3;x++){
      const p=F.transformDisplayPoint({x,y},3,2,t);
      assert.equal(out.intensities[p.y*out.width+p.x], data.intensities[y*3+x]);
      const inv=F.transformDisplayPoint(p,3,2,t,true);assert.equal(inv.x,x);assert.equal(inv.y,y);
    }
  }
  const text=source('js/laue-analysis.js');
  const central=text.slice(text.indexOf('  function updateTransformedDataFromRaw()'),text.indexOf('  function reprocessImage('));
  const state={rawData:data,transform:{rotate90:0,flipH:false,flipV:false},instrument:{beamX:1,beamY:1},
    observedPeaks:[{id:5,x:2,y:0}],displayData:data};
  const s={state,LaueFormats:F,readInstrument:()=>({}),beamCenterPosition:()=>({x:2,y:0}),setBeamCenterPosition:(x,y)=>{s.beam={x,y}}};
  vm.createContext(s);vm.runInContext(central,s);s.updateTransformedDataFromRaw();state.transform.rotate90=1;s.updateTransformedDataFromRaw();
  assert.equal(state.observedPeaks[0].x,1);assert.equal(state.observedPeaks[0].y,2);assert.equal(state.observedPeaks[0].id,5);
  assert.deepEqual(s.beam,{x:1,y:2});s.updateTransformedDataFromRaw();assert.equal(state.observedPeaks[0].x,1);
});

test('colormap rejects degenerate calibration, exports only current results and draws logarithmic ticks', () => {
  const f=fixture('js/plot-digitizer-colormap.js',null,{at:'  window.DigitizerColormap = {',code:'  globalThis.C={els,ready,dataXY,csv,renderPreview,setHooks:h=>hooks=h};\n'});
  const C=f.s.C,cm={cal:{x1:{x:0,y:0},x2:{x:100,y:0},y1:{x:0,y:0},y2:{x:0,y:100}},colorCal:{},
    plot:{x:0,y:0,w:100,h:100},bar:{x:110,y:0,w:10,h:100},nanColors:[],result:{nx:1,ny:1,out:[5],lut:[{rgb:[0,0,0]}],anchor:{v1:0,v2:10,t1:0,t2:1},log:false}};
  C.setHooks({getState:()=>({colormap:cm}),flashStatus(){}});
  for(const [id,value] of Object.entries({x1:'1',x2:'100',y1:'1',y2:'100',i1:'0',i2:'10'}))C.els[id]={value};
  for(const id of ['transformed','logx','logy','log'])C.els[id]={checked:id==='logx'||id==='logy'};
  assert.equal(C.ready(cm),true);close(C.dataXY({x:50,y:50},cm).x,10);
  const labels=[];
  const ctx=new Proxy({canvas:{},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),fillText:(text,x,y)=>labels.push(text)}, {get:(o,k)=>k in o?o[k]:()=>{}});
  C.els.previewWrap={};C.els.preview={getContext:()=>ctx};f.s.document.createElement=()=>({getContext:()=>ctx});
  C.renderPreview();assert.equal(labels[2],'10');assert.equal(labels[7],'10');
  assert.match(C.csv(true),/^x,y,I\n10/);
  cm.dirty=true;assert.equal(C.csv(true),'');cm.dirty=false;
  cm.cal.x2={x:0,y:100};assert.equal(C.ready(cm),false);assert.equal(C.csv(true),'');
  C.els.transformed.checked=true;cm.cal.x2={x:100,y:100};cm.cal.y2={x:200,y:200};assert.equal(C.ready(cm),false);
});

test('USDZ payloads are aligned and share tokens preserve partial atom overrides', async () => {
  const f=fixture('js/crystal-model.js',null,{at:'  function createUsdz(scene, options) {',code:'  globalThis.Z=createStoredZip;\n'});
  for(let len=1;len<70;len++){
    const files=[{name:'a'.repeat(len)+'.usda',bytes:new Uint8Array([1,2,3])},{name:'next.usda',bytes:new Uint8Array([4,5])}];
    const bytes=f.s.Z(files),v=new DataView(bytes.buffer);let offset=0;
    for(const file of files){assert.equal(v.getUint32(offset,true),0x04034b50);const dataOffset=offset+30+v.getUint16(offset+26,true)+v.getUint16(offset+28,true);assert.equal(dataOffset%64,0);assert.deepEqual(Array.from(bytes.slice(dataOffset,dataOffset+file.bytes.length)),Array.from(file.bytes));offset=dataOffset+file.bytes.length;}
    assert.equal(v.getUint32(offset,true),0x02014b50);
  }
  const M=f.s.CrystalModel;
  const recipe={controls:{"crystal-a":5,"crystal-b":5,"crystal-c":5},atoms:[],atomOverrides:{Si1:{radius:.4},Si2:{visible:false}}};
  const out=M.recipeFromShareToken(M.recipeToShareToken(recipe));
  assert.equal(out.atomOverrides.Si1.radius,.4);assert.equal(out.atomOverrides.Si2.visible,false);
});

test('viewer and model use the diamond origin and retain independent sites and edited orbits', () => {
  const s={TextEncoder,TextDecoder,Blob,btoa,atob};s.window=s;vm.createContext(s);
  for(const file of ['crystal-presets.js','space-groups-data.js','spacegroup-settings-data.js','spacegroup-engine.js','crystal-model.js'])vm.runInContext(source('js/'+file),s);
  const controls={'crystal-spacegroup':'Fd-3m','crystal-spacegroup-setting':'F 4d 2 3 -1d'};
  const preset=s.getCrystalPreset('si-diamond'),atoms=s.atomsForCrystalPreset(preset);
  assert.equal(s.CrystalModel.generatedAtomSites({atoms,controls}).length,8);
  const plain=atoms.map(a=>({...a,wyckoffPositions:undefined}));assert.equal(s.CrystalModel.generatedAtomSites({atoms:plain,controls}).length,8);
  const coincident=s.CrystalModel.generatedAtomSites({atoms:[{...plain[0],occupancy:.2},{...plain[0],label:'Si2',occupancy:.8}],controls});
  assert.equal(coincident.length,16);close(coincident.reduce((sum,a)=>sum+a.occupancy,0),8);
  const moved=s.CrystalModel.generatedAtomSites({atoms:[{...atoms[0],fractX:.17}],controls});
  assert.ok(moved.some(a=>Math.abs(a.fractX-.17)<1e-10));assert.ok(moved.length>8);
  const f=fixture('js/crystal-viewer.js',null,{at:'  if (document.readyState === "loading") {',code:'  globalThis.V={generatedAtomSites,state,applyPreset,updateSpaceGroupSettingOptions};\n'});
  Object.assign(f.s,{CrystalModel:s.CrystalModel,SpaceGroupEngine:s.SpaceGroupEngine,atomsForCrystalPreset:s.atomsForCrystalPreset});
  f.el('crystal-spacegroup').value='Fd-3m';f.el('crystal-spacegroup-setting').value='F 4d 2 3 -1d';
  assert.equal(f.s.V.generatedAtomSites().length,8);
  assert.match(source('tools/crystal-viewer.html'), /value="F 4d 2 3 -1d" selected/);
  // Production applyPreset must explicitly select the preset's Hall setting,
  // even after the settings menu initially selects the conventional origin.
  const src=source('js/crystal-viewer.js');const presetFn=src.slice(src.indexOf('  function applyPreset(preset) {'),src.indexOf('  function setCifError('));
  const p={window:{applyCrystalPresetToFields(){}},$:id=>f.el(id),state:{},updateSpaceGroupSettingOptions:()=>{f.el('crystal-spacegroup-setting').value='-F 4vw 2vw 3'},
    atomsForPreset:()=>atoms,resetStyles(){},logLine(){},generatedAtomSites:()=>[],refreshControls(){},render(){}};
  vm.createContext(p);vm.runInContext(presetFn,p);p.applyPreset(preset);assert.equal(f.el('crystal-spacegroup-setting').value,preset.spaceGroupSetting);
  f.s.V.state.atoms=[{label:'Si1',element:'Si',fractX:.17,fractY:.23,fractZ:.37,occupancy:1}];
  f.s.V.state.symmetryOperations=['x,y,z'];assert.equal(f.s.V.generatedAtomSites().length,1);
});
