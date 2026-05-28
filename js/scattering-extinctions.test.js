const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extinctionsPath = path.join(__dirname, "scattering-extinctions.js");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(extinctionsPath, "utf8"), sandbox, {
  filename: extinctionsPath
});

const {
  resolveExtinctionContext,
  isReflectionAllowed,
  isReflectionAllowedWithCrystal,
  diamondBasisAllowed
} = sandbox.window;

function context(spaceGroup, options = {}) {
  return resolveExtinctionContext(spaceGroup, options);
}

assert.equal(isReflectionAllowed(0, 0, 0, context("Pm-3m")), false);

const fContext = context("Fm-3m");
assert.equal(isReflectionAllowed(1, 0, 0, fContext), false);
assert.equal(isReflectionAllowed(1, 1, 1, fContext), true);
assert.equal(isReflectionAllowed(2, 0, 0, fContext), true);

const iContext = context("Im-3m");
assert.equal(isReflectionAllowed(1, 0, 0, iContext), false);
assert.equal(isReflectionAllowed(1, 1, 0, iContext), true);

const rContext = context("R-3c");
assert.equal(isReflectionAllowed(1, 0, 0, rContext), false);
assert.equal(isReflectionAllowed(1, 0, 1, rContext), true);

const p21c = context("P21/c", { applyScrewGlideRules: true });
assert.equal(isReflectionAllowed(0, 1, 0, p21c), false);
assert.equal(isReflectionAllowed(0, 2, 0, p21c), true);
assert.equal(isReflectionAllowed(1, 0, 1, p21c), false);
assert.equal(isReflectionAllowed(1, 0, 0, p21c), true);

const p212121 = context("P212121", { applyScrewGlideRules: true });
assert.equal(isReflectionAllowed(1, 0, 0, p212121), false);
assert.equal(isReflectionAllowed(0, 1, 0, p212121), false);
assert.equal(isReflectionAllowed(0, 0, 1, p212121), false);
assert.equal(isReflectionAllowed(0, 1, 1, p212121), true);

const pnma = context("Pnma", { applyScrewGlideRules: true });
assert.equal(isReflectionAllowed(0, 1, 1, pnma), true);
assert.equal(isReflectionAllowed(0, 1, 0, pnma), false);
assert.equal(isReflectionAllowed(1, 0, 0, pnma), false);
assert.equal(isReflectionAllowed(2, 0, 1, pnma), true);

const p63 = context("P63", { applyScrewGlideRules: true });
assert.equal(isReflectionAllowed(0, 0, 1, p63), false);
assert.equal(isReflectionAllowed(0, 0, 2, p63), true);

assert.equal(diamondBasisAllowed(1, 1, 1), true);
assert.equal(diamondBasisAllowed(2, 0, 0), false);
assert.equal(diamondBasisAllowed(2, 2, 0), true);

const silicon = { presetId: "si-diamond", structureModel: "diamond", spaceGroup: "Fd-3m" };
assert.equal(isReflectionAllowedWithCrystal(2, 0, 0, silicon, context("Fd-3m")), false);
assert.equal(isReflectionAllowedWithCrystal(2, 2, 0, silicon, context("Fd-3m")), true);
