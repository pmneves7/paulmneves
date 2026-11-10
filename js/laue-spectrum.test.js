const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {}; context.window = context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'laue-spectrum.js'),'utf8'),context);
const S=context.LaueSpectrum;
function close(a,b,tolerance=1e-9) {assert.ok(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b)),`${a} differs from ${b}`);}
const xray=(kind='cu-continuum',voltage=40,width=3)=>S.create({sourceType:'xray',xraySpectrum:kind,tubeVoltageKv:voltage,cuLineWidthEv:width});
const neutron=(kind='thermal',temperature=300)=>S.create({sourceType:'neutron',neutronSpectrum:kind,neutronTemperatureK:temperature});

test('flat models preserve per-Angstrom photon and neutron flux',()=>{
  for(const sourceType of ['xray','neutron']) {
    const s=S.create({sourceType});close(s.density(.1),1);close(s.density(20),1);
  }
});

test('Cu photon spectrum has correct voltage cutoff, wavelength Jacobian and continuum maximum',()=>{
  const s=xray(), cutoff=S.HC_KEV_ANGSTROM/40;
  close(s.density(cutoff*.9),0);close(s.density(cutoff),0);assert.ok(s.density(cutoff*1.1)>0);
  const l1=.6,l2=1.2;
  close(s.density(l1)/s.density(l2),((l1/cutoff-1)/l1**2)/((l2/cutoff-1)/l2**2));
  const maximum=s.density(2*cutoff);
  assert.ok(maximum>s.density(1.8*cutoff));assert.ok(maximum>s.density(2.2*cutoff));
  assert.equal(xray('cu-continuum',10).density(1),0);assert.ok(xray('cu-continuum',20).density(1)>0);
});

test('Cu characteristic lines follow K-shell threshold, radiative rates and effective width',()=>{
  const hc=S.HC_KEV_ANGSTROM, e1=8.0478,e2=8.0279;
  const noLines=xray('cu-lines',8), continuum=xray('cu-continuum',8);
  close(noLines.density(2),continuum.density(2));
  const s=xray('cu-lines'), c=xray();
  assert.ok(s.density(hc/e1)>c.density(hc/e1)*10);
  assert.ok(s.density(hc/e1)>s.density(hc/e2));
  assert.ok(s.density(hc/e1)>xray('cu-lines',40,30).density(hc/e1));
  assert.equal(s.density(hc/41),0);
  // Integrate the line contribution in ENERGY, undoing the dE/dλ Jacobian.
  // Widening a Lorentzian changes its height but preserves integrated yield.
  const integrate=width=>{
    const line=xray('cu-lines',40,width);let sum=0;const lo=7,hi=10,n=30000,step=(hi-lo)/n;
    for(let i=0;i<n;i++){const e=lo+(i+.5)*step,l=hc/e;sum+=(line.density(l)-c.density(l))*l*l/hc*step;}
    return sum;
  };
  close(integrate(3),integrate(6),1e-5);
});

test('W continuum has the tungsten Z factor, voltage cutoff and photon-wavelength shape',()=>{
  const w=xray('w-continuum'),cu=xray(),cutoff=S.HC_KEV_ANGSTROM/40;
  close(w.density(cutoff*.9),0);close(w.density(cutoff),0);
  for(const l of [.4,.7,1,2,4]) close(w.density(l)/cu.density(l),74/29);
  close(w.density(.6)/w.density(1.2),cu.density(.6)/cu.density(1.2));
  assert.ok(w.density(2*cutoff)>w.density(1.9*cutoff));
  assert.match(w.description,/W tube, 40 kV/);assert.match(w.description,/Characteristic lines are omitted/);
});

test('W K emission requires the K edge, not just enough voltage to emit a K-alpha-energy photon',()=>{
  const hc=S.HC_KEV_ANGSTROM;
  // 60 kV can emit 59.318 keV bremsstrahlung photons but cannot ionize W K.
  for(const voltage of [40,60,69.525]) {
    const line=xray('w-lines',voltage),continuum=xray('w-continuum',voltage);
    for(const energy of [8.3976,11.3,20,57.981,59.3182,67.244])close(line.density(hc/energy),continuum.density(hc/energy));
    assert.match(line.description,/K emission is absent/);assert.match(line.description,/W L emission is omitted/);
  }
  const line=xray('w-lines',80),continuum=xray('w-continuum',80);
  assert.ok(line.density(hc/59.3182)>continuum.density(hc/59.3182)*10);
  assert.equal(line.density(hc/81),0);
  assert.match(line.description,/natural widths/);assert.match(line.description,/W L emission is omitted/);
});

test('W uses its own intrinsic K-line widths and does not inherit Cu width settings',()=>{
  const hc=S.HC_KEV_ANGSTROM,s=xray('w-lines',80,0),other=xray('w-lines',80,300),continuum=xray('w-continuum',80);
  const excess=e=>{const l=hc/e;return (s.density(l)-continuum.density(l))*l*l/hc;};
  const center=59.3182,halfWidth=.04491/2;
  close(excess(center+halfWidth)/excess(center),.5,1e-4);
  close(excess(center-halfWidth)/excess(center),.5,1e-4);
  close(s.density(hc/center),other.density(hc/center));
  // xraylib rates: W Kα2/Kα1 = 0.289170/0.502430.
  // Integrated yields, unlike peak heights, do not depend on line width.
  const expectedYield=4*Math.PI*1.2e-5*69.525**1.67*Math.exp(-.077*74)*(80/69.525-1);
  const lines=[[59.3182,.502430,.04491],[57.9810,.289170,.04492],[67.2440,.108080,.0465],[66.9501,.0558800,.0482]];
  const lo=50,hi=75,n=25000,step=(hi-lo)/n;
  let integral=0;for(let i=0;i<n;i++)integral+=excess(lo+(i+.5)*step)*step;
  const expected=lines.reduce((sum,[e,rate,width])=>sum+expectedYield*rate/.502430*(Math.atan(2*(hi-e)/width)-Math.atan(2*(lo-e)/width))/Math.PI,0);
  close(integral,expected,1e-10);
});

test('Maxwellian flux follows lambda^-5 with unit integrated flux and correct peak temperature shift',()=>{
  const T=300,a=S.NEUTRON_AA2_K/T,p=Math.sqrt(2*a/5),s=neutron();
  const expected=l=>2*a*a/l**5*Math.exp(-a/l**2);
  close(s.density(1.3),expected(1.3));
  close(s.density(2)/s.density(1),Math.exp(3*a/4)/32);
  assert.ok(s.density(p)>s.density(p*.99));assert.ok(s.density(p)>s.density(p*1.01));
  close(neutron('maxwell',25).density(p*Math.sqrt(12)),neutron('cold').density(p*Math.sqrt(12)));
  let integral=0;const n=20000,step=40/n;for(let i=0;i<n;i++)integral+=s.density((i+.5)*step)*step;
  close(integral,1,3e-6);
  assert.equal(neutron('cold').density(.001),0);
});

test('multi-temperature moderator fits use integrated flux weights, not equal peak heights',()=>{
  const l=2.5,components=[[216.8,1.24],[33.9,1.02],[16.7,.30423]],total=components.reduce((s,c)=>s+c[1],0);
  close(neutron('ill-cold').density(l),components.reduce((sum,[t,w])=>sum+w/total*S.maxwellian(l,t),0));
  assert.notEqual(neutron('ill-cold').density(1),neutron('cold').density(1));
  for(const kind of ['cold','thermal','hot','ill-cold','ill-thermal','ill-hot'])assert.ok(neutron(kind).density(2)>0);
});

test('polyethylene moderator spectrum reproduces the published thermal and epithermal terms',()=>{
  const s=neutron('polyethylene'),l=.5;
  const expected=6324*1.58**4/l**5*Math.exp(-((1.58/l)**2))+786/(1+Math.exp((l-.67143)/.06075))/l**1.198;
  close(s.density(l),expected);assert.ok(s.density(.1)>neutron().density(.1));
});

test('invalid source models and physical inputs fail explicitly',()=>{
  assert.throws(()=>xray('cu-continuum',0),/voltage/);assert.throws(()=>xray('cu-lines',40,0),/FWHM/);
  assert.throws(()=>neutron('maxwell',-1),/temperature/);assert.throws(()=>neutron('unknown'),/moderator/);
  assert.throws(()=>xray('unknown'),/X-ray spectrum/);
  assert.throws(()=>S.create({sourceType:'electron'}),/Choose X-ray or neutron/);
  for(const l of [0,-1,NaN,Infinity])assert.throws(()=>neutron().density(l),/Wavelength/);
  // Hidden, inactive parameters do not invalidate a flat spectrum.
  close(xray('flat',0,0).density(1),1);close(neutron('flat',0).density(1),1);
});
