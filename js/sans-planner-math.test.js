const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const mathPath = path.join(__dirname, "sans-planner-math.js");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(mathPath, "utf8"), sandbox, { filename: mathPath });

const M = sandbox.SansPlannerMath;

function assertClose(actual, expected, tolerance = 1e-15) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

const defaultParams = {
  lambdaAngstrom: 5,
  deltaLambdaOverLambda: 0.1,
  pinhole1Mm: 30,
  pinhole2Mm: 30,
  aperture1ToSampleM: 6,
  aperture2ToSampleM: 1,
  sampleDistanceM: 5,
  pixelWidthMm: 1,
  pixelHeightMm: 1
};

const res = M.instrumentResolution(0.025, defaultParams);
assert.ok(res);

// Independently evaluate eq. 16's defining-aperture branch at this angle.
const L=5, l=5, r1=.015, r2=.015;
const c=Math.cos(2*Math.asin(.025/(2*(2*Math.PI/5))));
const radialWidth=2*r2*(1/L+c*c/l)-r1*r1*l/(2*r2*L*c*c*(L+l/(c*c)));
const radialSigma=(2*Math.PI/5)*Math.cos(Math.asin(.025/(2*(2*Math.PI/5))))*radialWidth/M.FWHM_TO_SIGMA;
assertClose(res.sigmaX, Math.hypot(radialSigma,res.components.sigmaXI_dll,res.components.sigmaXI_det));
assertClose(res.sigmaY, 0.006003267058959417);
assertClose(res.sigmaZ, 0.000021662650372905566);
assertClose(res.components.sigmaXI_dll, 0.0010616522503600241);
assertClose(res.components.sigmaXI_coll, radialSigma);
assertClose(res.components.sigmaXI_det, 0.00007251967431488232);
assertClose(res.components.sigmaYI_coll, 0.006002828806096383);
assertClose(res.components.sigmaYI_det, 0.00007253761704605045);
assertClose(res.components.sigmaZI_coll, 0.00002165063509461097);
assertClose(res.components.sigmaZI_det, 7.214022308986605e-7);

const sampleDefinedSecondAperture = M.instrumentResolution(0.025, {
  ...defaultParams,
  aperture2ToSampleM: 0
});
assert.ok(sampleDefinedSecondAperture);
assert.ok(sampleDefinedSecondAperture.sigmaX > sampleDefinedSecondAperture.sigmaY);
assertClose(sampleDefinedSecondAperture.sigmaY, 0.005566689975811707);
assertClose(sampleDefinedSecondAperture.sigmaZ, 0.000019695611577039737);

assert.equal(
  M.instrumentResolution(0.025, {
    ...defaultParams,
    aperture2ToSampleM: defaultParams.aperture1ToSampleM
  }),
  null
);


test("circular apertures have equal zero-angle widths and are invariant under geometric scaling", () => {
  for (const [pinhole1Mm,pinhole2Mm] of [[30,30],[60,10],[10,30]]) {
    const p={...defaultParams,pinhole1Mm,pinhole2Mm};
    const zero=M.instrumentResolution(0,p);
    assertClose(zero.sigmaX,zero.sigmaY);
    const L=p.aperture1ToSampleM-p.aperture2ToSampleM,l=p.sampleDistanceM,r1=pinhole1Mm/2000,r2=pinhole2Mm/2000;
    // Pedersen et al. eq. 14, evaluated independently at Q=0.
    const width=r1/(L+l)>=r2/l ? 2*r1/L-r2*r2*(l+L)**2/(2*r1*l*l*L) : 2*r2*(1/l+1/L)-r1*r1*l/(2*r2*L*(l+L));
    assertClose(zero.components.sigmaXI_coll, (2*Math.PI/5)*width/M.FWHM_TO_SIGMA);
    const scaled={...p};
    for(const key of ['pinhole1Mm','pinhole2Mm','aperture1ToSampleM','aperture2ToSampleM','sampleDistanceM','pixelWidthMm','pixelHeightMm'])scaled[key]*=7;
    for(const q of [.025,.5,1])for(const key of ['sigmaX','sigmaY','sigmaZ'])assertClose(M.instrumentResolution(q,p)[key],M.instrumentResolution(q,scaled)[key]);
  }
});
test("visible range uses the closest detector point and total momentum magnitude", () => {
  const p={...defaultParams,detWidthMm:1000,detHeightMm:1000,beamOffsetXMm:600,beamOffsetYMm:0,beamstopRadiusMm:25};
  let range=M.visibleQRange(p);assertClose(range.rMin,.1);assertClose(range.qMin,2*(2*Math.PI/5)*Math.sin(Math.atan(.1/5)/2));
  const wide={...p,sampleDistanceM:.5,beamOffsetXMm:0};range=M.visibleQRange(wide);
  assertClose(range.qMax,2*(2*Math.PI/5)*Math.sin(Math.atan(Math.SQRT2)/2));
  const geom=M.geometryCurve(wide,2);const last=geom.at(-1);assertClose(last.q,range.qMax);assertClose(Math.hypot(last.qz,last.qPerp),last.q);
  assertClose(M.resolutionCurve(wide,2).at(-1).q0,range.qMax);
  assert.equal(M.radiusFromQ(2,5,5),null);
  const covered=M.visibleQRange({...wide,beamstopRadiusMm:1000});assert.ok(covered.rMax<=covered.rMin);assert.equal(M.geometryCurve({...wide,beamstopRadiusMm:1000}).length,0);
});
