const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = { window: {} };
vm.createContext(sandbox);

["crystal-presets.js", "scattering-factors.js"].forEach((file) => {
  const filePath = path.join(__dirname, file);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), sandbox, { filename: filePath });
});

const preset = sandbox.getCrystalPreset("si-diamond");
const atoms = sandbox.atomsForCrystalPreset(preset);
const factors = sandbox.window.ScatteringFactors;
const expanded = factors.expandAtomSites({ atoms, spaceGroup: preset.spaceGroup });

assert.equal(expanded.length, 8);

const f111 = factors.structureFactor(1, 1, 1, expanded, { sourceType: "xray", s: 0.15 });
const f200 = factors.structureFactor(2, 0, 0, expanded, { sourceType: "xray", s: 0.15 });
assert.ok(f111.magnitude > 0);
assert.ok(f200.magnitude < 1e-9);

const hydrogen = factors.atomicScatteringFactor("H", { sourceType: "neutron" });
assert.equal(hydrogen.re, -3.739);

const peak = { twoTheta: 28, multiplicity: 8 };
const single = factors.intensityFromStructureFactor(f111, peak, { sourceType: "neutron", intensityMode: "single" });
const powder = factors.intensityFromStructureFactor(f111, peak, { sourceType: "neutron", intensityMode: "powder" });
assert.ok(powder > single);

const magneticOne = factors.magneticStructureFactor(1.5, 1, 1, expanded, {
  moment: 1,
  s: 0.05,
  useFormFactor: true
});
const magneticTwo = factors.magneticStructureFactor(1.5, 1, 1, expanded, {
  moment: 2,
  s: 0.05,
  useFormFactor: true
});
assert.ok(magneticOne.magnitude > 0);
assert.ok(Math.abs(magneticTwo.magnitude / magneticOne.magnitude - 2) < 1e-9);

const lowQ = factors.magneticFormFactorApproximation("Fe", 0.05);
const highQ = factors.magneticFormFactorApproximation("Fe", 0.5);
assert.ok(lowQ > highQ);

const rate = factors.countRateFromIntensity(f111.intensity, {
  sourceType: "neutron",
  atoms: expanded,
  sampleMassMg: 10,
  flux: 1e6
});
assert.ok(rate.rate > 0);
assert.equal(rate.missingElements.length, 0);

const xrayRate = factors.countRateFromIntensity(f111.intensity, {
  sourceType: "xray",
  atoms: expanded,
  sampleMassMg: 10,
  flux: 1e6
});
assert.ok(xrayRate.rate > rate.rate);
