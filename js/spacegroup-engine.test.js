const assert = require("assert");

globalThis["space-groups"] = require("./space-groups-data.js");
require("./spacegroup-settings-data.js");
require("./spacegroup-engine.js");
require("./crystal-model.js");

assert(globalThis.SpaceGroupEngine, "SpaceGroupEngine should load");

const fd3m = globalThis.SpaceGroupEngine.lookupSpaceGroup("F d -3 m");
assert(fd3m, "Fd-3m should resolve");
assert.strictEqual(fd3m.id, 227);
assert.strictEqual(fd3m.operations.length, 192);
assert.strictEqual(globalThis.SpaceGroupEngine.lookupSpaceGroup("227").hallSymbol, "-F 4vw 2vw 3");
assert.strictEqual(globalThis.SpaceGroupEngine.listSpaceGroupSettings("F d -3 m").length, 2);
assert.strictEqual(globalThis.SpaceGroupEngine.lookupSpaceGroup("F d -3 m", "F 4d 2 3 -1d").hallSymbol, "F 4d 2 3 -1d");

const scene = globalThis.CrystalModel.recipeToScene({
  controls: {
    "crystal-a": 8.2,
    "crystal-b": 8.2,
    "crystal-c": 8.2,
    "crystal-alpha": 90,
    "crystal-beta": 90,
    "crystal-gamma": 90,
    "crystal-spacegroup": "F d -3 m",
    "range-a-min": 0,
    "range-b-min": 0,
    "range-c-min": 0,
    "range-a-max": 0.99999,
    "range-b-max": 0.99999,
    "range-c-max": 0.99999
  },
  atoms: [
    { label: "Li1", element: "Li", fractX: 0.125, fractY: 0.125, fractZ: 0.125, wyckoff: "8a" },
    { label: "V1", element: "V", fractX: 0.5, fractY: 0.5, fractZ: 0.5, wyckoff: "16d" },
    { label: "O1", element: "O", fractX: 0.261, fractY: 0.261, fractZ: 0.261, wyckoff: "32e" }
  ],
  elementStyles: {
    Li: { visible: true },
    V: { visible: true },
    O: { visible: true }
  }
});

const counts = scene.atoms.reduce((out, atom) => {
  out[atom.element] = (out[atom.element] || 0) + 1;
  return out;
}, {});

assert.deepStrictEqual(counts, { Li: 8, O: 32, V: 16 });
console.log("spacegroup-engine tests passed");
