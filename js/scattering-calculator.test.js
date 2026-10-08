const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Exercise production numerical functions with DOM input fixtures.
// UI event wiring is checked separately in the browser.
function calculator() {
  const s = { console, TextEncoder, TextDecoder, btoa, atob };
  s.window = s;
  vm.createContext(s);
  for (const file of ["crystal-presets.js", "space-groups-data.js", "spacegroup-settings-data.js", "spacegroup-engine.js",
    "crystal-model.js", "scattering-extinctions.js", "cromer-mann-data.js", "scattering-factors.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), s, { filename: file });
  }
  const html = fs.readFileSync(path.join(__dirname, "../tools/scattering-calculator.html"), "utf8");
  function extract(name) {
    const start = html.indexOf("    function " + name + "(");
    assert.ok(start >= 0, name);
    let depth = 0;
    for (let i = html.indexOf(") {", start) + 2; i < html.length; i++) {
      if (html[i] === "{") depth++;
      if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
    }
    throw new Error("Unclosed function " + name);
  }
  const values = { a: "10", b: "10", c: "10", alpha: "90", beta: "90", gamma: "90", wavelength: "1",
    "max-index": "3", spacegroup: "P 1", "plane-hkl-1": "", "plane-hkl-2": "", "in-plane-min": "", "in-plane-max": "" };
  s.fields = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value }]));
  s.document = { getElementById: id => s.fields[id] };
  Object.assign(s, {
    sourceTypeEl: { value: "neutron" }, xrayLineEl: { value: "custom" }, spaceGroupSettingEl: { value: "" },
    sampleMassEl: { value: "10" }, incidentFluxEl: { value: "1000000" },
    incidentFluxModeEl: { value: "density" }, beamAreaEl: { value: "0.1" },
    detectorCollectionEl: { value: "0.25" }, detectorEfficiencyEl: { value: "0.8" },
    sampleTransmissionEl: { value: "0.9" }, rockingWidthEl: { value: "1" },
    crystalMeta: { atoms: [], symmetryOperations: [] }, intensityMode: "single", AVOGADRO: 6.02214076e23,
    magneticEnabledEl: { checked: false }, magneticSiteEl: { value: "element:Fe" }, magneticMomentEl: { value: "1" },
    magneticKhEl: { value: "0.5" }, magneticKkEl: { value: "0" }, magneticKlEl: { value: "0" },
    magneticFormFactorEl: { checked: false }, magneticPeakTable: {}, magneticSummary: {},
    updateCellMetrics() {}, updateScatteringModelStatus() {}, renderExtinctionRules() {}, renderMagneticPeaks() {},
    afterAtomicBasisEdit() {}
  });
  for (const name of ["degToRad", "radToDeg", "clamp", "wrapAngle", "dot", "cross", "scale", "add", "subtract", "norm", "normalize",
    "format", "parseNumber", "parseHKL", "makeReciprocalBasis", "reciprocalVector", "makePlane", "angleData", "rotationData",
    "inPlanePasses", "collectInputs", "multiplicityKey", "peakOrbit", "assignPeakMultiplicities", "preparePowderPeaks",
    "updatePeakIntensities", "estimateCountRate", "incidentFluxDensity", "currentScatteringOptions", "expandedAtomSites", "readCrystalForExtinctions",
    "rhombohedralSettingForExtinctions", "currentSpaceGroupSetting", "getExtinctionContext", "isAllowedBySpaceGroup",
    "calculatePeaks", "cellVolumeAngstrom3", "unitCellDensity", "numericAtomValue", "sanitizeAtomElement", "updateAtomFromEditor",
    "invalidateSymmetryBasis", "vectorNearlyInteger", "selectMagneticAtoms", "collectMagneticInputs", "strongestNuclearNeutronIntensity",
    "nuclearOverlapMap", "magneticPeakKey", "calculateMagneticPeaks"]) {
    vm.runInContext(extract(name), s, { filename: "scattering-calculator.html:" + name });
  }
  return s;
}
const atom = (element = "Fe", x = 0, y = 0, z = 0, occupancy = 1, label = element + "1") =>
  ({ label, element, fractX: x, fractY: y, fractZ: z, occupancy });
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), actual + " != " + expected);

test("zero occupancy removes nuclear, magnetic and density contributions", () => {
  const s = calculator();
  s.crystalMeta.atoms = [atom("Fe", 0, 0, 0, 0)];
  assert.equal(s.expandedAtomSites()[0].occupancy, 0);
  assert.equal(s.ScatteringFactors.structureFactor(1, 0, 0, s.expandedAtomSites(), { sourceType: "neutron" }).intensity, 0);
  assert.equal(s.ScatteringFactors.magneticStructureFactor(1, 0, 0, s.expandedAtomSites(), { moment: 1 }).intensity, 0);
  assert.equal(s.unitCellDensity(1000), 0);
  assert.equal(s.calculatePeaks()[0].countRate, 0);
});

test("editing preset coordinates replaces its cached orbit", () => {
  const s = calculator();
  s.fields.spacegroup.value = "R-3c";
  s.crystalMeta.atoms = s.atomsForCrystalPreset(s.getCrystalPreset("sapphire"));
  const before = s.ScatteringFactors.structureFactor(1, 1, 0, s.expandedAtomSites(), { sourceType: "neutron" }).intensity;
  s.updateAtomFromEditor(1, "fractX", "0.4");
  assert.equal(s.crystalMeta.atoms[1].wyckoffPositions, undefined);
  const expanded = s.expandedAtomSites();
  assert.equal(expanded.filter(a => a.element === "O").length, 18);
  assert.ok(expanded.some(a => a.element === "O" && Math.abs(a.fractX - 0.4) < 1e-9));
  const after = s.ScatteringFactors.structureFactor(1, 1, 0, expanded, { sourceType: "neutron" }).intensity;
  assert.ok(Math.abs(before - after) > 1);
});

test("manual sites expand alongside cached sites and preserve independent occupancies", () => {
  const s = calculator();
  const preset = s.getCrystalPreset("si-diamond");
  const expanded = s.ScatteringFactors.expandAtomSites({ spaceGroup: preset.spaceGroup, spaceGroupSetting: preset.spaceGroupSetting,
    atoms: [...s.atomsForCrystalPreset(preset), atom("Fe", 0.123, 0.234, 0.345)] });
  assert.equal(expanded.filter(a => a.element === "Si").length, 8);
  assert.equal(expanded.filter(a => a.element === "Fe").length, 192);
  const split = s.ScatteringFactors.expandAtomSites({ spaceGroup: "P -1",
    atoms: [atom("Fe", 0.1, 0.2, 0.3, 0.5, "FeA"), atom("Fe", 0.1, 0.2, 0.3, 0.5, "FeB")] });
  assert.equal(split.length, 4);
});

test("changing symmetry invalidates preset and CIF operations", () => {
  const s = calculator();
  s.crystalMeta.atoms = s.atomsForCrystalPreset(s.getCrystalPreset("si-diamond"));
  s.crystalMeta.symmetryOperations = ["x,y,z", "-x,-y,-z"];
  s.invalidateSymmetryBasis();
  assert.equal(s.crystalMeta.atoms[0].wyckoffPositions, undefined);
  assert.equal(s.crystalMeta.symmetryOperations.length, 0);
});

test("Cromer–Mann values match tabulated silicon and iron references", () => {
  const f = calculator().ScatteringFactors;
  close(f.atomicScatteringFactor("Si", { sourceType: "xray", s: 0.5 }).re, 6.240088511990151);
  close(f.atomicScatteringFactor("Fe", { sourceType: "xray", s: 0 }).re, 25.9904);
  assert.equal(f.atomicScatteringFactor("Og", { sourceType: "xray", s: 0.1 }).missing, true);
  assert.equal(f.atomicScatteringFactor("Si", { sourceType: "xray", s: 2.01 }).missing, true);
});

test("graphite has AB stacking and a nonzero 101 reflection", () => {
  const s = calculator();
  const atoms = s.ScatteringFactors.expandAtomSites({ spaceGroup: "P63/mmc", atoms: s.atomsForCrystalPreset(s.getCrystalPreset("graphite")) });
  assert.equal(atoms.length, 4);
  assert.equal(atoms.filter(a => a.fractX === 0 && a.fractY === 0).length, 2);
  close(s.ScatteringFactors.structureFactor(1, 0, 1, atoms, { sourceType: "neutron" }).intensity, 3 * 6.646 ** 2);
});

test("powder coincident P1 reflections sum distinct intensities before display filtering", () => {
  const s = calculator();
  s.intensityMode = "powder";
  s.crystalMeta.atoms = [atom(), atom("Fe", 0.1, 0.2, 0.3)];
  const shell = s.calculatePeaks().find(p => Math.abs(p.gLength - 0.1) < 1e-9);
  const f = s.ScatteringFactors;
  const directions = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const sum = directions.reduce((sum, hkl) => sum + f.structureFactor(...hkl, s.crystalMeta.atoms, { sourceType: "neutron" }).intensity, 0);
  assert.equal(shell.multiplicity, 6);
  assert.equal(shell.powderFamilies.length, 3);
  close(shell.intensity, sum * f.powderCorrection(shell.twoTheta, "neutron"));
  s.fields["plane-hkl-1"].value = "1 0 0";
  s.fields["plane-hkl-2"].value = "0 1 0";
  s.fields["in-plane-min"].value = "-5";
  s.fields["in-plane-max"].value = "5";
  const filtered = s.calculatePeaks().find(p => Math.abs(p.gLength - 0.1) < 1e-9);
  close(filtered.intensity, shell.intensity);
  close(filtered.countRate, shell.countRate);
  assert.equal(filtered.multiplicity, 6);
  assert.equal(filtered.powderFamilies.length, 3);
});

test("hexagonal powder multiplicity includes orbit members outside the index cube", () => {
  const s = calculator();
  s.fields.a.value = "4"; s.fields.b.value = "4"; s.fields.c.value = "7"; s.fields.gamma.value = "120";
  s.fields.spacegroup.value = "P6/mmm"; s.fields["max-index"].value = "1";
  s.intensityMode = "powder"; s.crystalMeta.atoms = [atom()];
  const shell = s.calculatePeaks().find(p => Math.abs(p.gLength - 0.5) < 1e-9);
  assert.ok(shell);
  assert.equal(shell.multiplicity, 6);
  s.fields["max-index"].value = "2";
  const larger = s.calculatePeaks().find(p => Math.abs(p.gLength - 0.5) < 1e-9);
  close(larger.intensity, shell.intensity);
});

test("powder sums Friedel intensities individually for complex neutron lengths", () => {
  const s = calculator();
  s.intensityMode = "powder"; s.crystalMeta.atoms = [atom("B"), atom("C", 0.25)];
  const shell = s.calculatePeaks().find(p => Math.abs(p.gLength - 0.1) < 1e-9);
  const plus = s.ScatteringFactors.structureFactor(1, 0, 0, s.crystalMeta.atoms, { sourceType: "neutron" }).intensity;
  const minus = s.ScatteringFactors.structureFactor(-1, 0, 0, s.crystalMeta.atoms, { sourceType: "neutron" }).intensity;
  assert.ok(Math.abs(plus - minus) > 1);
  assert.ok(shell.powderIntensitySum > plus + minus);
});

test("rate normalization is invariant under an equivalent doubled unit cell", () => {
  const f = calculator().ScatteringFactors;
  const options = { sourceType: "neutron", flux: 1e6, sampleMassMg: 10, wavelength: 1,
    twoTheta: 20, collectionFraction: 0.2, detectorEfficiency: 0.8, transmission: 0.9, rockingWidthDeg: 1 };
  for (const intensityMode of ["single", "powder"]) {
    const primitive = f.countRateFromIntensity(9.45 ** 2, { ...options, intensityMode, atoms: [atom()], cellVolumeAngstrom3: 1000 });
    const supercell = f.countRateFromIntensity((2 * 9.45) ** 2, { ...options, intensityMode, atoms: [atom(), atom("Fe", 0.5)], cellVolumeAngstrom3: 2000 });
    assert.ok(primitive.rate > 0);
    close(primitive.rate, supercell.rate);
    close(f.countRateFromIntensity(9.45 ** 2, { ...options, intensityMode, atoms: [atom()], cellVolumeAngstrom3: 1000, detectorEfficiency: 0.4 }).rate, primitive.rate / 2);
  }
  assert.equal(f.countRateFromIntensity(100, { ...options, atoms: [atom()] }).rate, null);
  close(f.countRateFromIntensity(100, { ...options, atoms: [atom()], cellVolumeAngstrom3: 1000, detectorEfficiency: "" }).rate,
    f.countRateFromIntensity(100, { ...options, atoms: [atom()], cellVolumeAngstrom3: 1000, detectorEfficiency: 1 }).rate);
});

test("primitive rhombohedral axes allow 100 while hexagonal R centering forbids it", () => {
  const s = calculator();
  s.spaceGroupSettingEl.value = "P 3*";
  const primitive = s.getExtinctionContext("R3");
  assert.equal(s.isReflectionAllowed(1, 0, 0, primitive), true);
  assert.equal(s.twinExtinctionAlternatives(primitive).length, 0);
  s.spaceGroupSettingEl.value = "R 3";
  assert.equal(s.isReflectionAllowed(1, 0, 0, s.getExtinctionContext("R3")), false);
  assert.equal(s.isReflectionAllowed(1, 0, 0, s.resolveExtinctionContext("R3:R")), true);
});

test("deuterium uses isotope scattering and atomic mass data", () => {
  const f = calculator().ScatteringFactors;
  assert.equal(f.atomicScatteringFactor("D", { sourceType: "neutron" }).re, 6.671);
  assert.equal(f.atomicScatteringFactor("2H", { sourceType: "neutron" }).re, 6.671);
  assert.equal(f.atomicScatteringFactor("D", { sourceType: "xray", s: 0.1 }).missing, false);
});

test("magnetic powder shells sum unequal satellites without multiplying a representative", () => {
  const s = calculator();
  s.crystalMeta.atoms = [atom(), atom("Fe", 0.1, 0.2, 0.3)];
  s.magneticEnabledEl.checked = true;
  const inputs = s.collectInputs();
  const basis = s.makeReciprocalBasis(inputs);
  const single = s.calculateMagneticPeaks(s.calculatePeaks(), inputs, basis);
  s.intensityMode = "powder";
  const powder = s.calculateMagneticPeaks(s.calculatePeaks(), inputs, basis);
  const first = powder.find(p => Math.abs(p.gLength - 0.05) < 1e-9);
  const sum = single.filter(p => Math.abs(p.gLength - 0.05) < 1e-9).reduce((sum, p) => sum + p.baseIntensity, 0);
  close(first.intensity, sum * s.ScatteringFactors.powderCorrection(first.twoTheta, "neutron"));
});

test("real X-ray atomic factors can have imaginary crystallographic structure factors", () => {
  const s = calculator();
  const factor = s.ScatteringFactors.structureFactor(1, 0, 0, [atom("Si", 0.25)], { sourceType: "xray", s: 0.1 });
  assert.ok(Math.abs(factor.imag) > 1);
});

test("viewer share tokens retain zero occupancy when loaded into the calculator", () => {
  const s = calculator();
  const recipe = { controls: { "crystal-spacegroup": "P 1" }, atoms: [atom("Fe", 0, 0, 0, 0)] };
  const restored = s.CrystalModel.recipeFromShareToken(s.CrystalModel.recipeToShareToken(recipe));
  assert.equal(restored.atoms[0].occupancy, 0);
});

test("ideal integrated yield needs no mosaic, divergence, rocking width or detector inputs", () => {
  const s = calculator();
  s.crystalMeta.atoms = [atom()];
  s.detectorCollectionEl.value = "";
  s.detectorEfficiencyEl.value = "";
  s.rockingWidthEl.value = "";
  const single = s.calculatePeaks()[0];
  assert.ok(single.integratedYield > 0);
  assert.equal(single.countRate, null);
  s.rockingWidthEl.value = "1";
  const withWidth = s.calculatePeaks()[0];
  close(withWidth.integratedYield, single.integratedYield);
  close(withWidth.countRate, single.integratedYield / (Math.PI / 180) * 0.9);
  s.detectorCollectionEl.value = "0.1";
  const withCollection = s.calculatePeaks()[0];
  close(withCollection.integratedYield, single.integratedYield);
  close(withCollection.countRate, withWidth.countRate / 10);
  s.intensityMode = "powder";
  s.rockingWidthEl.value = "";
  const powder = s.calculatePeaks()[0];
  assert.ok(powder.integratedYield > 0);
  close(powder.countRate, powder.integratedYield * 0.1 * 0.9);
});

test("total beam rate plus beam area matches the same incident flux density", () => {
  const s = calculator();
  s.crystalMeta.atoms = [atom()];
  const density = s.calculatePeaks()[0].integratedYield;
  s.incidentFluxModeEl.value = "total";
  s.incidentFluxEl.value = "100000";
  s.beamAreaEl.value = "0.1";
  close(s.calculatePeaks()[0].integratedYield, density);
  s.beamAreaEl.value = "";
  assert.equal(s.calculatePeaks()[0].integratedYield, null);
});
