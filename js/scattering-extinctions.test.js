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
  diamondBasisAllowed,
  twinExtinctionAlternatives,
  latticeHolohedry,
  merohedralTwinInfo,
  crystalSystemFromNumber
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

// Alternative twin domains: only rhombohedral R lattices have a distinct obverse/reverse pair.
assert.equal(twinExtinctionAlternatives(context("Pm-3m")).length, 0);
assert.equal(twinExtinctionAlternatives(context("Fm-3m")).length, 0);

const obverseTwin = twinExtinctionAlternatives(context("R-3m"));
assert.equal(obverseTwin.length, 2);
assert.equal(obverseTwin[0].setting, "obverse");
assert.equal(obverseTwin[1].setting, "reverse");
assert.ok(obverseTwin[1].label.includes("h − k + l = 3n"));

const reverseTwin = twinExtinctionAlternatives(context("R-3m", { rhombohedralSetting: "reverse" }));
assert.equal(reverseTwin[0].setting, "reverse");
assert.equal(reverseTwin[1].setting, "obverse");
assert.ok(reverseTwin[1].label.includes("−h + k + l = 3n"));

// Lattice holohedry orders, including the trigonal R (−3m) vs P (6/mmm) split.
assert.equal(latticeHolohedry("cubic").order, 48);
assert.equal(latticeHolohedry("orthorhombic").order, 8);
assert.equal(latticeHolohedry("trigonal", "R").order, 12);
assert.equal(latticeHolohedry("trigonal", "P").order, 24);
assert.ok(latticeHolohedry("trigonal", "R").symbol.includes("3m"));

// Merohedral twinning = point group is a proper subgroup of the lattice holohedry.
const cubicHolohedral = merohedralTwinInfo(context("Pm-3m"), 48);
assert.equal(cubicHolohedral.index, 1);
assert.equal(cubicHolohedral.possible, false);

const monoclinicP21 = merohedralTwinInfo(context("P2_1"), 2);
assert.equal(monoclinicP21.index, 2);
assert.equal(monoclinicP21.possible, true);

const trigonalR3 = merohedralTwinInfo(context("R3"), 3);
assert.equal(trigonalR3.index, 4);
assert.equal(trigonalR3.possible, true);

assert.equal(merohedralTwinInfo(context("Pm-3m"), 0), null);

// Crystal system from IT number (exact; used to pick the lattice holohedry).
assert.equal(crystalSystemFromNumber(4), "monoclinic");
assert.equal(crystalSystemFromNumber(75), "tetragonal");
assert.equal(crystalSystemFromNumber(143), "trigonal");
assert.equal(crystalSystemFromNumber(168), "hexagonal");
assert.equal(crystalSystemFromNumber(221), "cubic");

// Crystal system from a Hermann–Mauguin symbol. With the symmetry engine absent
// (as here) this exercises the heuristic fallback; in the app the engine makes
// it exact. Regression guard for the old bugs: tetragonal misread as hexagonal,
// the 23/432/-43m cubic classes, and Fdd2/Fddd misread as cubic.
assert.equal(context("P4").system, "tetragonal");
assert.equal(context("P41212").system, "tetragonal");
assert.equal(context("P432").system, "cubic");
assert.equal(context("P-43m").system, "cubic");
assert.equal(context("P23").system, "cubic");
assert.equal(context("Pa-3").system, "cubic");
assert.equal(context("Ia-3d").system, "cubic");
assert.equal(context("Fd-3m").system, "cubic");
assert.equal(context("Pm-3m").system, "cubic");
assert.equal(context("Fdd2").system, "orthorhombic");
assert.equal(context("Fddd").system, "orthorhombic");
assert.equal(context("Pnma").system, "orthorhombic");
assert.equal(context("P212121").system, "orthorhombic");
assert.equal(context("P63").system, "hexagonal");
assert.equal(context("P6/mmm").system, "hexagonal");
assert.equal(context("P-3m1").system, "trigonal");
assert.equal(context("R-3c").system, "trigonal");
assert.equal(context("P21/c").system, "monoclinic");
assert.equal(context("C2/c").system, "monoclinic");
assert.equal(context("Pm").system, "monoclinic");
assert.equal(context("P-1").system, "triclinic");
