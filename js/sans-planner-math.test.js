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

assertClose(res.sigmaX, 0.006411023715562528);
assertClose(res.sigmaY, 0.006003267058959417);
assertClose(res.sigmaZ, 0.000021662650372905566);
assertClose(res.components.sigmaXI_dll, 0.0010616522503600241);
assertClose(res.components.sigmaXI_coll, 0.006322093045633536);
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
assertClose(sampleDefinedSecondAperture.sigmaX, 0.005904562339298009);
assertClose(sampleDefinedSecondAperture.sigmaY, 0.005566689975811707);
assertClose(sampleDefinedSecondAperture.sigmaZ, 0.000019695611577039737);

assert.equal(
  M.instrumentResolution(0.025, {
    ...defaultParams,
    aperture2ToSampleM: defaultParams.aperture1ToSampleM
  }),
  null
);
