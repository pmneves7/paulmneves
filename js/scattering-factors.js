(function (global) {
  "use strict";

  const ELEMENT_SYMBOLS = [
    "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne",
    "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
    "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
    "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
    "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn",
    "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
    "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb",
    "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
    "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th",
    "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm",
    "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds",
    "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og"
  ];

  const ATOMIC_NUMBERS = ELEMENT_SYMBOLS.reduce((numbers, symbol, index) => {
    numbers[symbol] = index + 1;
    return numbers;
  }, {});

  const XRAY_K_ALPHA_LINES = {
    cr: { label: "Chromium K-alpha", wavelength: 2.28970 },
    cu: { label: "Copper K-alpha", wavelength: 1.54056 },
    mo: { label: "Molybdenum K-alpha", wavelength: 0.71073 },
    ag: { label: "Silver K-alpha", wavelength: 0.56087 }
  };

  const NEUTRON_MAGNETIC_SCATTERING_LENGTH_FM_PER_MUB = 2.695;
  const AVOGADRO = 6.02214076e23;
  const FM2_TO_CM2 = 1e-26;
  const CLASSICAL_ELECTRON_RADIUS_CM = 2.8179403262e-13;

  const NEUTRON_COHERENT_LENGTHS_FM = {
    H: [-3.7390, 0], He: [3.26, 0], Li: [-1.90, 0], Be: [7.79, 0], B: [5.30, -0.213],
    C: [6.6460, 0], N: [9.36, 0], O: [5.803, 0], F: [5.654, 0], Ne: [4.566, 0],
    Na: [3.63, 0], Mg: [5.375, 0], Al: [3.449, 0], Si: [4.1491, 0], P: [5.13, 0],
    S: [2.847, 0], Cl: [9.5770, 0], Ar: [1.909, 0], K: [3.67, 0], Ca: [4.70, 0],
    Sc: [12.29, 0], Ti: [-3.438, 0], V: [-0.3824, 0], Cr: [3.635, 0], Mn: [-3.73, 0],
    Fe: [9.45, 0], Co: [2.49, 0], Ni: [10.3, 0], Cu: [7.718, 0], Zn: [5.680, 0],
    Ga: [7.288, 0], Ge: [8.185, 0], As: [6.58, 0], Se: [7.970, 0], Br: [6.795, 0],
    Kr: [7.81, 0], Rb: [7.09, 0], Sr: [7.02, 0], Y: [7.75, 0], Zr: [7.16, 0],
    Nb: [7.054, 0], Mo: [6.715, 0], Tc: [6.8, 0], Ru: [7.03, 0], Rh: [5.88, 0],
    Pd: [5.91, 0], Ag: [5.922, 0], Cd: [4.87, -0.70], In: [4.065, -0.0539],
    Sn: [6.225, 0], Sb: [5.57, 0], Te: [5.80, 0], I: [5.28, 0], Xe: [4.92, 0],
    Cs: [5.42, 0], Ba: [5.07, 0], La: [8.24, 0], Ce: [4.84, 0], Pr: [4.58, 0],
    Nd: [7.7, 0], Pm: [12.6, 0], Sm: [0.80, -1.65], Eu: [7.22, -1.26],
    Gd: [6.5, -13.82], Tb: [7.38, 0], Dy: [16.9, -0.276], Ho: [8.01, 0],
    Er: [7.79, 0], Tm: [7.07, 0], Yb: [12.43, 0], Lu: [7.21, 0], Hf: [7.7, 0],
    Ta: [6.91, 0], W: [4.86, 0], Re: [9.2, 0], Os: [10.7, 0], Ir: [10.6, 0],
    Pt: [9.60, 0], Au: [7.63, 0], Hg: [12.692, 0], Tl: [8.776, 0], Pb: [9.405, 0],
    Bi: [8.532, 0], Ra: [10.0, 0], Th: [10.31, 0], Pa: [9.1, 0], U: [8.417, 0],
    Np: [10.55, 0], Am: [8.3, 0]
  };

  const ATOMIC_WEIGHTS = {
    H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999,
    F: 18.998, Ne: 20.180, Na: 22.990, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974,
    S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078, Sc: 44.956, Ti: 47.867,
    V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546,
    Zn: 65.38, Ga: 69.723, Ge: 72.630, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798,
    Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224, Nb: 92.906, Mo: 95.95, Tc: 98,
    Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41, In: 114.82, Sn: 118.71,
    Sb: 121.76, Te: 127.60, I: 126.90, Xe: 131.29, Cs: 132.91, Ba: 137.33, La: 138.91,
    Ce: 140.12, Pr: 140.91, Nd: 144.24, Pm: 145, Sm: 150.36, Eu: 151.96, Gd: 157.25,
    Tb: 158.93, Dy: 162.50, Ho: 164.93, Er: 167.26, Tm: 168.93, Yb: 173.05, Lu: 174.97,
    Hf: 178.49, Ta: 180.95, W: 183.84, Re: 186.21, Os: 190.23, Ir: 192.22, Pt: 195.08,
    Au: 196.97, Hg: 200.59, Tl: 204.38, Pb: 207.2, Bi: 208.98, Th: 232.04, Pa: 231.04,
    U: 238.03, Np: 237, Pu: 244, Am: 243
  };

  function sanitizeElement(value) {
    const match = String(value || "X").trim().match(/[A-Za-z]{1,2}/);
    if (!match) return "X";
    const raw = match[0];
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }

  function wrapFraction(value) {
    const number = Number(value) || 0;
    const wrapped = number - Math.floor(number);
    return Math.abs(wrapped - 1) < 1e-9 || Math.abs(wrapped) < 1e-9 ? 0 : wrapped;
  }

  function normalizeAtom(atom, index) {
    return {
      label: atom.label || `Atom${index + 1}`,
      element: sanitizeElement(atom.element || atom.typeSymbol || atom.label),
      fractX: wrapFraction(atom.fractX),
      fractY: wrapFraction(atom.fractY),
      fractZ: wrapFraction(atom.fractZ),
      occupancy: atom.occupancy == null ? 1 : Number(atom.occupancy) || 1,
      wyckoff: atom.wyckoff || atom.wyckoffSymbol || "",
      wyckoffPositions: Array.isArray(atom.wyckoffPositions) ?
        atom.wyckoffPositions.map((position) => ({
          fractX: wrapFraction(position.fractX),
          fractY: wrapFraction(position.fractY),
          fractZ: wrapFraction(position.fractZ)
        })) :
        undefined
    };
  }

  function parseFractionTerm(term) {
    const fraction = String(term).match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (fraction) {
      const denom = Number(fraction[2]);
      return denom ? Number(fraction[1]) / denom : 0;
    }
    const parsed = Number(term);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function evaluateSymmetryExpression(expression, coords) {
    const source = String(expression || "0").replace(/\s+/g, "");
    const normalized = /^[+-]/.test(source) ? source : `+${source}`;
    let value = 0;
    const parts = normalized.match(/[+-][^+-]+/g) || [];
    parts.forEach((part) => {
      const sign = part.charAt(0) === "-" ? -1 : 1;
      const term = part.slice(1);
      if (term === "x" || term === "y" || term === "z") value += sign * coords[term];
      else value += sign * parseFractionTerm(term);
    });
    return wrapFraction(value);
  }

  function applySymmetryOperation(operation, atom) {
    const parts = String(operation || "").split(",").map((part) => part.trim());
    if (parts.length !== 3) return null;
    const coords = { x: atom.fractX, y: atom.fractY, z: atom.fractZ };
    return {
      fractX: evaluateSymmetryExpression(parts[0], coords),
      fractY: evaluateSymmetryExpression(parts[1], coords),
      fractZ: evaluateSymmetryExpression(parts[2], coords)
    };
  }

  function isP1SpaceGroup(value) {
    return /^p\s*1$/i.test(String(value || "").trim()) || String(value || "").trim() === "1";
  }

  function resolvedSymmetryOperations(spaceGroup, settingHallSymbol, explicitOperations) {
    if (isP1SpaceGroup(spaceGroup)) return [];
    if (Array.isArray(explicitOperations) && explicitOperations.length) return explicitOperations;
    if (global.SpaceGroupEngine && typeof global.SpaceGroupEngine.operationsForSpaceGroup === "function") {
      return global.SpaceGroupEngine.operationsForSpaceGroup(spaceGroup, settingHallSymbol || "");
    }
    return [];
  }

  function symmetryKey(atom) {
    const scale = 100000;
    return [
      sanitizeElement(atom.element),
      Math.round(wrapFraction(atom.fractX) * scale),
      Math.round(wrapFraction(atom.fractY) * scale),
      Math.round(wrapFraction(atom.fractZ) * scale)
    ].join("|");
  }

  function expandAtomSites(crystal) {
    const atoms = (crystal.atoms || []).map(normalizeAtom);
    if (!isP1SpaceGroup(crystal.spaceGroup) && atoms.some((atom) => Array.isArray(atom.wyckoffPositions) && atom.wyckoffPositions.length)) {
      return atoms.flatMap((atom) => {
        if (!Array.isArray(atom.wyckoffPositions) || !atom.wyckoffPositions.length) return [atom];
        return atom.wyckoffPositions.map((position, index) => ({
          ...atom,
          label: `${atom.label}_${index + 1}`,
          fractX: position.fractX,
          fractY: position.fractY,
          fractZ: position.fractZ,
          sourceLabel: atom.label
        }));
      });
    }

    const operations = resolvedSymmetryOperations(
      crystal.spaceGroup,
      crystal.spaceGroupSetting || "",
      crystal.symmetryOperations
    );

    if (operations.length) {
      const seen = new Set();
      const expanded = [];
      atoms.forEach((atom) => {
        operations.forEach((operation) => {
          const coords = applySymmetryOperation(operation, atom);
          if (!coords) return;
          const expandedAtom = {
            ...atom,
            fractX: coords.fractX,
            fractY: coords.fractY,
            fractZ: coords.fractZ,
            sourceLabel: atom.label
          };
          const key = symmetryKey(expandedAtom);
          if (seen.has(key)) return;
          seen.add(key);
          expandedAtom.label = `${atom.label}_${expanded.length + 1}`;
          expanded.push(expandedAtom);
        });
      });
      return expanded.length > atoms.length ? expanded : atoms;
    }

    return atoms;
  }

  function neutronAtomicFactor(element) {
    const symbol = sanitizeElement(element);
    const value = NEUTRON_COHERENT_LENGTHS_FM[symbol];
    if (!value) return { re: 0, im: 0, missing: true, unit: "fm" };
    return { re: value[0], im: value[1] || 0, missing: false, unit: "fm" };
  }

  function xrayNeutralAtomApproximation(symbol, s) {
    const z = ATOMIC_NUMBERS[symbol];
    if (!z) return null;
    const compactness = Math.max(1, Math.pow(z, 1 / 3));
    const s2 = Math.max(0, Number(s) || 0) ** 2;
    const broad = 0.22 * Math.exp(-1.2 * s2 / compactness);
    const mid = 0.42 * Math.exp(-8.0 * s2 / compactness);
    const tight = 0.36 * Math.exp(-35.0 * s2 / compactness);
    return z * (broad + mid + tight);
  }

  function xrayAtomicFactor(element, s) {
    const symbol = sanitizeElement(element);
    const f0 = xrayNeutralAtomApproximation(symbol, s);
    if (f0 == null) return { re: 0, im: 0, missing: true, unit: "electrons" };
    return { re: f0, im: 0, missing: false, unit: "electrons" };
  }

  function atomicScatteringFactor(element, options) {
    if (options.sourceType === "neutron") return neutronAtomicFactor(element);
    return xrayAtomicFactor(element, options.s);
  }

  function structureFactor(h, k, l, atoms, options) {
    const missing = new Set();
    let real = 0;
    let imag = 0;

    atoms.forEach((atom) => {
      const factor = atomicScatteringFactor(atom.element, options);
      if (factor.missing) missing.add(sanitizeElement(atom.element));
      const occupancy = atom.occupancy == null ? 1 : Number(atom.occupancy) || 1;
      const phase = 2 * Math.PI * (
        h * Number(atom.fractX || 0) +
        k * Number(atom.fractY || 0) +
        l * Number(atom.fractZ || 0)
      );
      const cosPhase = Math.cos(phase);
      const sinPhase = Math.sin(phase);
      real += occupancy * (factor.re * cosPhase - factor.im * sinPhase);
      imag += occupancy * (factor.re * sinPhase + factor.im * cosPhase);
    });

    const magnitude = Math.hypot(real, imag);
    return {
      real,
      imag,
      magnitude,
      intensity: magnitude * magnitude,
      missingElements: [...missing].sort()
    };
  }

  function powderCorrection(twoTheta, sourceType) {
    const theta = (Number(twoTheta) || 0) * Math.PI / 360;
    const sinTheta = Math.max(1e-6, Math.sin(theta));
    const cosTheta = Math.max(1e-6, Math.cos(theta));
    const lorentz = 1 / (sinTheta * sinTheta * cosTheta);
    if (sourceType !== "xray") return lorentz;
    const cosTwoTheta = Math.cos((Number(twoTheta) || 0) * Math.PI / 180);
    return lorentz * (1 + cosTwoTheta * cosTwoTheta) / 2;
  }

  function intensityFromStructureFactor(factor, peak, options) {
    if (!factor) return null;
    if (options.intensityMode === "powder") {
      return factor.intensity * Math.max(1, Number(peak.multiplicity) || 1) * powderCorrection(peak.twoTheta, options.sourceType);
    }
    return factor.intensity;
  }

  function unitCellMassG(atoms) {
    if (!Array.isArray(atoms) || !atoms.length) return { massG: null, missingElements: [] };
    const missing = new Set();
    const molarMass = atoms.reduce((sum, atom) => {
      const symbol = sanitizeElement(atom.element);
      const weight = ATOMIC_WEIGHTS[symbol];
      if (!weight) {
        missing.add(symbol);
        return sum;
      }
      const occupancy = atom.occupancy == null ? 1 : Number(atom.occupancy) || 1;
      return sum + weight * occupancy;
    }, 0);
    return {
      massG: molarMass > 0 ? molarMass / AVOGADRO : null,
      missingElements: [...missing].sort()
    };
  }

  function countRateFromIntensity(intensity, options) {
    const flux = Number(options.flux);
    const sampleMassMg = Number(options.sampleMassMg);
    const unitCellMass = unitCellMassG(options.atoms || []);
    if (!Number.isFinite(intensity) || intensity <= 0 || !Number.isFinite(flux) || flux <= 0 ||
      !Number.isFinite(sampleMassMg) || sampleMassMg <= 0 || !unitCellMass.massG) {
      return { rate: null, missingElements: unitCellMass.missingElements };
    }
    const sampleMassG = sampleMassMg / 1000;
    const unitCells = sampleMassG / unitCellMass.massG;
    const crossSectionCm2 = options.sourceType === "xray"
      ? intensity * CLASSICAL_ELECTRON_RADIUS_CM * CLASSICAL_ELECTRON_RADIUS_CM
      : intensity * FM2_TO_CM2;
    return {
      rate: flux * unitCells * crossSectionCm2,
      missingElements: unitCellMass.missingElements
    };
  }

  function magneticFormFactorApproximation(element, s) {
    const symbol = sanitizeElement(element);
    const z = ATOMIC_NUMBERS[symbol] || 26;
    const compactness = Math.max(1, Math.pow(z, 1 / 3));
    return Math.exp(-10 * Math.max(0, Number(s) || 0) ** 2 / compactness);
  }

  function magneticStructureFactor(h, k, l, atoms, options) {
    const moment = Math.max(0, Number(options.moment) || 0);
    const orientationFactor = options.orientationFactor == null ? 2 / 3 : Number(options.orientationFactor);
    let real = 0;
    let imag = 0;

    atoms.forEach((atom) => {
      const occupancy = atom.occupancy == null ? 1 : Number(atom.occupancy) || 1;
      const formFactor = options.useFormFactor === false ? 1 : magneticFormFactorApproximation(atom.element, options.s);
      const amplitude = occupancy * moment * NEUTRON_MAGNETIC_SCATTERING_LENGTH_FM_PER_MUB * formFactor;
      const phase = 2 * Math.PI * (
        h * Number(atom.fractX || 0) +
        k * Number(atom.fractY || 0) +
        l * Number(atom.fractZ || 0)
      );
      real += amplitude * Math.cos(phase);
      imag += amplitude * Math.sin(phase);
    });

    const magnitude = Math.hypot(real, imag);
    return {
      real,
      imag,
      magnitude,
      intensity: magnitude * magnitude * Math.max(0, Number.isFinite(orientationFactor) ? orientationFactor : 2 / 3)
    };
  }

  global.ScatteringFactors = {
    ATOMIC_NUMBERS,
    NEUTRON_MAGNETIC_SCATTERING_LENGTH_FM_PER_MUB,
    NEUTRON_COHERENT_LENGTHS_FM,
    XRAY_K_ALPHA_LINES,
    ATOMIC_WEIGHTS,
    atomicScatteringFactor,
    countRateFromIntensity,
    expandAtomSites,
    intensityFromStructureFactor,
    magneticFormFactorApproximation,
    magneticStructureFactor,
    powderCorrection,
    sanitizeElement,
    structureFactor
  };
})(typeof window !== "undefined" ? window : globalThis);
