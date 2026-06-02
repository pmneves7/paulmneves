(function () {
  "use strict";

  const ELEMENT_COLORS = {
    H: "#ffffff", He: "#d9ffff", Li: "#cc80ff", Be: "#c2ff00", B: "#ffb5b5",
    C: "#909090", N: "#3050f8", O: "#ff0d0d", F: "#90e050", Ne: "#b3e3f5",
    Na: "#ab5cf2", Mg: "#8aff00", Al: "#bfa6a6", Si: "#f0c8a0", P: "#ff8000",
    S: "#ffff30", Cl: "#1ff01f", Ar: "#80d1e3", K: "#8f40d4", Ca: "#3dff00",
    Sc: "#e6e6e6", Ti: "#bfc2c7", V: "#a6a6ab", Cr: "#8a99c7", Mn: "#9c7ac7",
    Fe: "#e06633", Co: "#f090a0", Ni: "#50d050", Cu: "#c88033", Zn: "#7d80b0",
    Ga: "#c28f8f", Ge: "#668f8f", As: "#bd80e3", Se: "#ffa100", Br: "#a62929",
    Kr: "#5cb8d1", Rb: "#702eb0", Sr: "#00ff00", Y: "#94ffff", Zr: "#94e0e0",
    Nb: "#73c2c9", Mo: "#54b5b5", Tc: "#3b9e9e", Ru: "#248f8f", Rh: "#0a7d8c",
    Pd: "#006985", Ag: "#c0c0c0", Cd: "#ffd98f", In: "#a67573", Sn: "#668080",
    Sb: "#9e63b5", Te: "#d47a00", I: "#940094", Xe: "#429eb0", Cs: "#57178f",
    Ba: "#00c900", La: "#70d4ff", Ce: "#ffffc7", Pr: "#d9ffc7", Nd: "#c7ffc7",
    Pm: "#a3ffc7", Sm: "#8fffc7", Eu: "#61ffc7", Gd: "#45ffc7", Tb: "#30ffc7",
    Dy: "#1fffc7", Ho: "#00ff9c", Er: "#00e675", Tm: "#00d452", Yb: "#00bf38",
    Lu: "#00ab24", Hf: "#4dc2ff", Ta: "#4da6ff", W: "#2194d6", Re: "#267dab",
    Os: "#266696", Ir: "#175487", Pt: "#d0d0e0", Au: "#ffd123", Hg: "#b8b8d0",
    Tl: "#a6544d", Pb: "#575961", Bi: "#9e4fb5", Po: "#ab5c00", At: "#754f45",
    Rn: "#428296", Fr: "#420066", Ra: "#007d00", Ac: "#70abfa", Th: "#00baff",
    Pa: "#00a1ff", U: "#008fff", Np: "#0080ff", Pu: "#006bff", Am: "#545cf2",
    Cm: "#785ce3", Bk: "#8a4fe3", Cf: "#a136d4", Es: "#b31fd4", Fm: "#b31fba",
    Md: "#b30da6", No: "#bd0d87", Lr: "#c70066"
  };

  const CPK_COLORS = {
    H: "#ffffff", C: "#2f2f2f", N: "#244cff", O: "#ff1f1f", F: "#7fd13b", Cl: "#1fb01f",
    Br: "#a62929", I: "#940094", He: "#d9ffff", Ne: "#b3e3f5", Ar: "#80d1e3", Xe: "#429eb0",
    Kr: "#5cb8d1", P: "#ff8000", S: "#ffe000", B: "#ffb5b5", Li: "#cc80ff", Na: "#ab5cf2",
    K: "#8f40d4", Rb: "#702eb0", Cs: "#57178f", Be: "#c2ff00", Mg: "#8aff00", Ca: "#3dff00",
    Sr: "#00ff00", Ba: "#00c900", Ti: "#bfc2c7", Fe: "#e06633"
  };

  const MOCAS_GV_COLORS = {
    H: "#f7f7f7", Li: "#8f63d2", C: "#4a4a4a", N: "#2f64c8", O: "#d73027", F: "#4daf4a",
    Na: "#6a3d9a", Mg: "#66c2a5", Al: "#b8a38d", Si: "#d9a66a", P: "#e6ab02", S: "#f0d64d",
    Cl: "#33a02c", K: "#7b3294", Ca: "#5aae61", Ti: "#8da0cb", V: "#7f7f7f", Cr: "#91bfdb",
    Mn: "#984ea3", Fe: "#b15928", Co: "#fb9a99", Ni: "#1b9e77", Cu: "#a6761d", Zn: "#7570b3",
    Br: "#8c510a", Ag: "#bdbdbd", I: "#762a83", Ba: "#1b7837", Pb: "#525252", U: "#1f78b4"
  };

  const COLOR_SCHEMES = {
    jmol: ELEMENT_COLORS,
    cpk: { ...ELEMENT_COLORS, ...CPK_COLORS },
    "mocas-gv": { ...ELEMENT_COLORS, ...MOCAS_GV_COLORS }
  };

  const STORAGE_KEY = "crystalViewerState.v1";

  const RADIUS_DATA = {
    atomic: {
      H: 0.31, He: 0.28, Li: 1.28, Be: 0.96, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Ne: 0.58,
      Na: 1.66, Mg: 1.41, Al: 1.21, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Ar: 1.06, K: 2.03, Ca: 1.76,
      Sc: 1.70, Ti: 1.60, V: 1.53, Cr: 1.39, Mn: 1.39, Fe: 1.32, Co: 1.26, Ni: 1.24, Cu: 1.32, Zn: 1.22,
      Ga: 1.22, Ge: 1.20, As: 1.19, Se: 1.20, Br: 1.20, Kr: 1.16, Rb: 2.20, Sr: 1.95, Y: 1.90, Zr: 1.75,
      Nb: 1.64, Mo: 1.54, Ru: 1.46, Rh: 1.42, Pd: 1.39, Ag: 1.45, Cd: 1.44, In: 1.42, Sn: 1.39, Sb: 1.39,
      Te: 1.38, I: 1.39, Xe: 1.40, Cs: 2.44, Ba: 2.15, La: 2.07, Ce: 2.04, Pr: 2.03, Nd: 2.01, Sm: 1.98,
      Eu: 1.98, Gd: 1.96, Tb: 1.94, Dy: 1.92, Ho: 1.92, Er: 1.89, Tm: 1.90, Yb: 1.87, Lu: 1.87, Hf: 1.75,
      Ta: 1.70, W: 1.62, Re: 1.51, Os: 1.44, Ir: 1.41, Pt: 1.36, Au: 1.36, Hg: 1.32, Tl: 1.45, Pb: 1.46,
      Bi: 1.48, U: 1.96
    },
    ionic: {
      H: 0.25, Li: 0.76, Be: 0.45, B: 0.27, C: 0.16, N: 1.46, O: 1.40, F: 1.33, Na: 1.02, Mg: 0.72,
      Al: 0.54, Si: 0.40, P: 0.38, S: 1.84, Cl: 1.81, K: 1.38, Ca: 1.00, Sc: 0.75, Ti: 0.61, V: 0.58,
      Cr: 0.62, Mn: 0.65, Fe: 0.65, Co: 0.65, Ni: 0.69, Cu: 0.73, Zn: 0.74, Ga: 0.62, Ge: 0.53, As: 0.46,
      Se: 1.98, Br: 1.96, Rb: 1.52, Sr: 1.18, Y: 0.90, Zr: 0.72, Nb: 0.64, Mo: 0.65, Ru: 0.62, Rh: 0.67,
      Pd: 0.86, Ag: 1.15, Cd: 0.95, In: 0.80, Sn: 0.69, Sb: 0.76, Te: 2.21, I: 2.20, Cs: 1.67, Ba: 1.35,
      La: 1.03, Ce: 1.01, Pr: 0.99, Nd: 0.98, Sm: 0.96, Eu: 0.95, Gd: 0.94, Tb: 0.92, Dy: 0.91, Ho: 0.90,
      Er: 0.89, Tm: 0.88, Yb: 0.87, Lu: 0.86, Hf: 0.71, Ta: 0.64, W: 0.60, Re: 0.63, Os: 0.63, Ir: 0.63,
      Pt: 0.63, Au: 0.85, Hg: 1.02, Tl: 0.89, Pb: 1.19, Bi: 1.03, U: 0.89
    },
    vdw: {
      H: 1.20, He: 1.40, Li: 1.82, Be: 1.53, B: 1.92, C: 1.70, N: 1.55, O: 1.52, F: 1.47, Ne: 1.54,
      Na: 2.27, Mg: 1.73, Al: 1.84, Si: 2.10, P: 1.80, S: 1.80, Cl: 1.75, Ar: 1.88, K: 2.75, Ca: 2.31,
      Sc: 2.30, Ti: 2.15, V: 2.05, Cr: 2.05, Mn: 2.05, Fe: 2.05, Co: 2.00, Ni: 2.00, Cu: 2.00, Zn: 2.10,
      Ga: 1.87, Ge: 2.11, As: 1.85, Se: 1.90, Br: 1.85, Kr: 2.02, Rb: 3.03, Sr: 2.49, Y: 2.40, Zr: 2.30,
      Nb: 2.15, Mo: 2.10, Ru: 2.05, Rh: 2.00, Pd: 2.05, Ag: 2.10, Cd: 2.20, In: 2.20, Sn: 2.25, Sb: 2.20,
      Te: 2.06, I: 1.98, Xe: 2.16, Cs: 3.43, Ba: 2.68, La: 2.50, Ce: 2.48, Pr: 2.47, Nd: 2.45, Sm: 2.40,
      Eu: 2.40, Gd: 2.38, Tb: 2.37, Dy: 2.35, Ho: 2.33, Er: 2.32, Tm: 2.30, Yb: 2.28, Lu: 2.27, Hf: 2.25,
      Ta: 2.20, W: 2.10, Re: 2.05, Os: 2.00, Ir: 2.00, Pt: 2.05, Au: 2.10, Hg: 2.05, Tl: 1.96, Pb: 2.02,
      Bi: 2.07, Po: 1.97, At: 2.02, Rn: 2.20, U: 1.86
    }
  };

  const DEFAULT_ATOMS = [
    { label: "Si1", element: "Si", fractX: 0, fractY: 0, fractZ: 0, occupancy: 1 },
    { label: "Si2", element: "Si", fractX: 0.25, fractY: 0.25, fractZ: 0.25, occupancy: 1 }
  ];

  const state = {
    atoms: DEFAULT_ATOMS.map((atom) => ({ ...atom })),
    radiusMode: "atomic",
    colorScheme: "jmol",
    elementStyles: {},
    atomOverrides: {},
    bondRules: [],
    symmetryOperations: [],
    lastImportName: "",
    persistenceReady: false,
    view: {
      rotation: null,
      zoom: 1,
      panX: 0,
      panY: 0,
      tool: "rotate"
    },
    consoleLines: ["Ready. Load a CIF file or edit the default diamond-like Si cell."]
  };

  const threeState = {
    renderer: null,
    scene: null,
    root: null,
    camera: null,
    activeProjection: "",
    canvas: null
  };

  function $(id) {
    return document.getElementById(id);
  }

  function num(id, fallback) {
    const el = $(id);
    const value = el ? Number(el.value) : NaN;
    return Number.isFinite(value) ? value : fallback;
  }

  function text(id, fallback) {
    const el = $(id);
    return el ? el.value : fallback;
  }

  function checked(id) {
    const el = $(id);
    return !!(el && el.checked);
  }

  function degToRad(deg) {
    return deg * Math.PI / 180;
  }

  function identityMatrix() {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }

  function multiplyMatrices(a, b) {
    return [
      a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
      a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
      a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
      a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
      a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
      a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
      a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
      a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
      a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
    ];
  }

  function applyMatrix(m, p) {
    return {
      x: m[0] * p.x + m[1] * p.y + m[2] * p.z,
      y: m[3] * p.x + m[4] * p.y + m[5] * p.z,
      z: m[6] * p.x + m[7] * p.y + m[8] * p.z
    };
  }

  function rotationMatrix(axis, degrees) {
    const angle = degToRad(degrees);
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    if (axis === "x") return [1, 0, 0, 0, c, -s, 0, s, c];
    if (axis === "y") return [c, 0, s, 0, 1, 0, -s, 0, c];
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  }

  function initialRotationMatrix() {
    return matrixFromLookDirection({
      x: 1,
      y: 1,
      z: Math.SQRT2 * Math.tan(degToRad(25))
    });
  }

  function ensureRotationMatrix() {
    if (!Array.isArray(state.view.rotation)) state.view.rotation = initialRotationMatrix();
    return state.view.rotation;
  }

  function rotateView(axis, degrees, baseMatrix) {
    state.view.rotation = multiplyMatrices(rotationMatrix(axis, degrees), baseMatrix || ensureRotationMatrix());
  }

  function matrixFromLookDirection(direction) {
    const forward = normalize(direction);
    const reference = Math.abs(dot(forward, { x: 0, y: 0, z: 1 })) > 0.96 ?
      { x: 0, y: 1, z: 0 } :
      { x: 0, y: 0, z: 1 };
    const right = normalize(cross(reference, forward));
    const up = normalize(cross(forward, right));
    return [
      right.x, right.y, right.z,
      up.x, up.y, up.z,
      forward.x, forward.y, forward.z
    ];
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function mul(a, scale) {
    return { x: a.x * scale, y: a.y * scale, z: a.z * scale };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  function length(v) {
    return Math.sqrt(dot(v, v));
  }

  function normalize(v) {
    const len = length(v) || 1;
    return mul(v, 1 / len);
  }

  function distance(a, b) {
    return length(sub(a, b));
  }

  function cellParams() {
    return {
      a: num("crystal-a", 5.431),
      b: num("crystal-b", 5.431),
      c: num("crystal-c", 5.431),
      alpha: num("crystal-alpha", 90),
      beta: num("crystal-beta", 90),
      gamma: num("crystal-gamma", 90),
      spaceGroup: text("crystal-spacegroup", "")
    };
  }

  function latticeVectors(params) {
    const alpha = degToRad(params.alpha);
    const beta = degToRad(params.beta);
    const gamma = degToRad(params.gamma);
    const cosA = Math.cos(alpha);
    const cosB = Math.cos(beta);
    const cosG = Math.cos(gamma);
    const sinG = Math.sin(gamma) || 1e-9;
    const ax = { x: params.a, y: 0, z: 0 };
    const bx = { x: params.b * cosG, y: params.b * sinG, z: 0 };
    const cx = {
      x: params.c * cosB,
      y: params.c * (cosA - cosB * cosG) / sinG,
      z: 0
    };
    const cz2 = params.c * params.c - cx.x * cx.x - cx.y * cx.y;
    cx.z = Math.sqrt(Math.max(0, cz2));
    return { a: ax, b: bx, c: cx };
  }

  function cellVolume(vectors) {
    return Math.abs(dot(vectors.a, cross(vectors.b, vectors.c)));
  }

  function fractionalToCartesian(atom, vectors, shift) {
    return add(
      add(mul(vectors.a, atom.fractX + shift.i), mul(vectors.b, atom.fractY + shift.j)),
      mul(vectors.c, atom.fractZ + shift.k)
    );
  }

  function colorForElement(element) {
    const symbol = sanitizeElement(element);
    const scheme = COLOR_SCHEMES[state.colorScheme] || COLOR_SCHEMES.jmol;
    return scheme[symbol] || ELEMENT_COLORS[symbol] || "#3b82f6";
  }

  function ensureStyles() {
    const activeElements = new Set();
    const activeLabels = new Set();
    generatedAtomSites().forEach((atom) => {
      const element = sanitizeElement(atom.element);
      atom.element = element;
      activeElements.add(element);
      activeLabels.add(atom.label);
      if (!state.elementStyles[element]) {
        state.elementStyles[element] = {
          color: colorForElement(element),
          radius: defaultRadius(element),
          visible: true
        };
      }
    });
    Object.keys(state.elementStyles).forEach((element) => {
      if (!activeElements.has(element)) delete state.elementStyles[element];
    });
    Object.keys(state.atomOverrides).forEach((label) => {
      if (!activeLabels.has(label)) delete state.atomOverrides[label];
    });
  }

  function getAtomStyle(atom) {
    ensureStyles();
    const elementStyle = state.elementStyles[sanitizeElement(atom.element)] || {
      color: colorForElement(atom.element),
      radius: defaultRadius(atom.element),
      visible: true
    };
    return { ...elementStyle, ...(state.atomOverrides[atom.label] || {}) };
  }

  function resetStyles() {
    state.elementStyles = {};
    state.atomOverrides = {};
    ensureStyles();
  }

  function defaultRadius(element) {
    const symbol = sanitizeElement(element);
    const mode = RADIUS_DATA[state.radiusMode] ? state.radiusMode : "atomic";
    return RADIUS_DATA[mode][symbol] || RADIUS_DATA.atomic[symbol] || 1;
  }

  function applyRadiusMode(mode) {
    state.radiusMode = RADIUS_DATA[mode] ? mode : "atomic";
    Object.keys(state.elementStyles).forEach((element) => {
      state.elementStyles[element].radius = defaultRadius(element);
    });
    Object.keys(state.atomOverrides).forEach((label) => {
      const atom = generatedAtomSites().find((candidate) => candidate.label === label);
      if (atom && Object.prototype.hasOwnProperty.call(state.atomOverrides[label], "radius")) {
        state.atomOverrides[label].radius = defaultRadius(atom.element);
      }
    });
    renderAtomStyles();
    render();
  }

  function applyColorScheme(scheme) {
    state.colorScheme = COLOR_SCHEMES[scheme] ? scheme : "jmol";
    Object.keys(state.elementStyles).forEach((element) => {
      state.elementStyles[element].color = colorForElement(element);
    });
    renderAtomStyles();
    render();
  }

  function displayRadiusScale() {
    return Math.max(0, num("radius-scale", 1));
  }

  function sanitizeElement(value) {
    const match = String(value || "X").trim().match(/[A-Za-z]{1,2}/);
    if (!match) return "X";
    const raw = match[0];
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }

  function wrapFraction(value) {
    const wrapped = value - Math.floor(value);
    return Math.abs(wrapped - 1) < 1e-9 || Math.abs(wrapped) < 1e-9 ? 0 : wrapped;
  }

  function parseFractionTerm(term) {
    const fraction = term.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
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
      if (term === "x" || term === "y" || term === "z") {
        value += sign * coords[term];
      } else {
        value += sign * parseFractionTerm(term);
      }
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

  function symmetryKey(atom) {
    const scale = 100000;
    return [
      sanitizeElement(atom.element),
      Math.round(wrapFraction(atom.fractX) * scale),
      Math.round(wrapFraction(atom.fractY) * scale),
      Math.round(wrapFraction(atom.fractZ) * scale)
    ].join("|");
  }

  function expandAtomsBySymmetry(atoms, operations) {
    if (!Array.isArray(atoms) || !atoms.length || !Array.isArray(operations) || !operations.length) {
      return { atoms: atoms || [], expanded: false, operationCount: 0 };
    }

    const seen = new Set();
    const expanded = [];
    atoms.forEach((atom) => {
      operations.forEach((operation) => {
        const coords = applySymmetryOperation(operation, atom);
        if (!coords) return;
        const expandedAtom = {
          ...atom,
          element: sanitizeElement(atom.element || atom.typeSymbol || atom.label),
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

    return {
      atoms: expanded.length > atoms.length ? expanded : atoms,
      expanded: expanded.length > atoms.length,
      operationCount: operations.length
    };
  }

  function normalizeAtom(atom, index) {
    return {
      label: atom.label || `Atom${index + 1}`,
      element: sanitizeElement(atom.element || atom.typeSymbol || atom.label),
      fractX: wrapFraction(Number(atom.fractX) || 0),
      fractY: wrapFraction(Number(atom.fractY) || 0),
      fractZ: wrapFraction(Number(atom.fractZ) || 0),
      occupancy: atom.occupancy == null ? 1 : Number(atom.occupancy) || 1
    };
  }

  function isP1SpaceGroup(value) {
    return /^p\s*1$/i.test(String(value || "").trim()) || String(value || "").trim() === "1";
  }

  function shouldApplyStoredSymmetry() {
    return !isP1SpaceGroup(text("crystal-spacegroup", "")) && Array.isArray(state.symmetryOperations) && state.symmetryOperations.length;
  }

  function generatedAtomSites() {
    if (!shouldApplyStoredSymmetry()) return state.atoms.map((atom, index) => normalizeAtom(atom, index));
    return expandAtomsBySymmetry(state.atoms, state.symmetryOperations).atoms.map((atom, index) => normalizeAtom(atom, index));
  }

  function atomRowsForTable() {
    return checked("show-generated-atoms") ? generatedAtomSites() : state.atoms;
  }

  function promoteGeneratedAtomsToEditable() {
    if (!shouldApplyStoredSymmetry()) return;
    state.atoms = generatedAtomSites();
    state.symmetryOperations = [];
    resetStyles();
    refreshControls();
    logLine("Promoted generated symmetry positions to editable P 1 atom sites.");
  }

  function countAtomsByElement(atoms) {
    return atoms.reduce((counts, atom) => {
      const element = sanitizeElement(atom.element);
      counts[element] = (counts[element] || 0) + 1;
      return counts;
    }, {});
  }

  function formatElementCounts(atoms) {
    const counts = countAtomsByElement(atoms);
    return Object.keys(counts)
      .sort()
      .map((element) => `${element}: ${counts[element]}`)
      .join(", ");
  }

  function formatAtomList(atoms) {
    if (!atoms.length) return ["Atomic positions: none"];
    return [
      "Atomic positions:",
      ...atoms.map((atom) => {
        const occ = atom.occupancy == null ? 1 : atom.occupancy;
        return `  ${atom.label.padEnd(12)} ${sanitizeElement(atom.element).padEnd(3)} x=${Number(atom.fractX).toFixed(5)} y=${Number(atom.fractY).toFixed(5)} z=${Number(atom.fractZ).toFixed(5)} occ=${Number(occ).toFixed(3)}`;
      })
    ];
  }

  function uniqueElements() {
    return [...new Set(generatedAtomSites().map((atom) => sanitizeElement(atom.element)))].sort();
  }

  function atomOptionLabel(atom) {
    return `${atom.label} (${atom.element})`;
  }

  function selectorLabel(selector) {
    const [kind, value] = String(selector || "").split(":");
    if (kind === "element") return `${value} element`;
    if (kind === "site") return value;
    return selector || "";
  }

  function selectorMatches(item, selector) {
    const [kind, value] = String(selector || "").split(":");
    if (kind === "element") return sanitizeElement(item.atom.element) === value;
    if (kind === "site") return item.atom.label === value;
    return item.atom.label === selector;
  }

  function logLine(line) {
    state.consoleLines.push(line);
    if (state.consoleLines.length > 80) state.consoleLines.shift();
    renderConsole();
  }

  function renderConsole() {
    const out = $("crystal-console-output");
    if (out) out.textContent = state.consoleLines.join("\n");
  }

  function updateAtomFromTable(index, field, value) {
    const atom = state.atoms[index];
    if (!atom) return;
    if (["fractX", "fractY", "fractZ", "occupancy"].includes(field)) {
      const parsed = Number(value);
      atom[field] = Number.isFinite(parsed) ? parsed : atom[field];
    } else if (field === "element") {
      atom[field] = sanitizeElement(value);
    } else {
      const oldLabel = atom.label;
      atom[field] = value.trim() || `Atom${index + 1}`;
      if (oldLabel !== atom.label && state.atomOverrides[oldLabel]) {
        state.atomOverrides[atom.label] = state.atomOverrides[oldLabel];
        delete state.atomOverrides[oldLabel];
      }
    }
    refreshControls();
    render();
  }

  function renderAtomTable() {
    const body = $("crystal-atom-table");
    if (!body) return;
    const showGenerated = checked("show-generated-atoms");
    const rows = atomRowsForTable();
    body.innerHTML = "";
    rows.forEach((atom, index) => {
      const row = document.createElement("tr");
      [
        ["label", atom.label, "text"],
        ["element", atom.element, "text"],
        ["fractX", atom.fractX, "number"],
        ["fractY", atom.fractY, "number"],
        ["fractZ", atom.fractZ, "number"],
        ["occupancy", atom.occupancy, "number"]
      ].forEach(([field, value, type]) => {
        const cell = document.createElement("td");
        const input = document.createElement("input");
        input.type = type;
        input.value = value;
        if (type === "number") input.step = "any";
        if (showGenerated) {
          input.disabled = true;
        } else {
          input.addEventListener("change", () => updateAtomFromTable(index, field, input.value));
        }
        cell.appendChild(input);
        row.appendChild(cell);
      });
      const action = document.createElement("td");
      if (!showGenerated) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "laue-mode-btn";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => {
          state.atoms.splice(index, 1);
          refreshControls();
          logLine(`Removed ${atom.label}.`);
          render();
        });
        action.appendChild(remove);
      }
      row.appendChild(action);
      body.appendChild(row);
    });
  }

  function renderAtomStyles() {
    const list = $("crystal-atom-style-list");
    if (!list) return;
    ensureStyles();
    list.innerHTML = "";

    const grouped = new Map();
    generatedAtomSites().forEach((atom) => {
      const element = sanitizeElement(atom.element);
      if (!grouped.has(element)) grouped.set(element, []);
      grouped.get(element).push(atom);
    });

    [...grouped.entries()].forEach(([element, atoms]) => {
      const style = state.elementStyles[element];
      const block = document.createElement("details");
      block.className = "crystal-element-style";
      block.open = atoms.length <= 8;

      const summary = document.createElement("summary");
      summary.className = "crystal-element-summary";
      summary.textContent = `${element} (${atoms.length})`;
      block.appendChild(summary);

      const controls = document.createElement("div");
      controls.className = "crystal-style-row crystal-element-style-row";
      controls.innerHTML = `
        <div class="crystal-style-name">${element} defaults</div>
        <label><span>Color</span><input type="color" value="${style.color}" data-element="${element}" data-field="color"></label>
        <label><span>Radius</span><input type="number" step="any" min="0.05" value="${style.radius}" data-element="${element}" data-field="radius"></label>
        <label class="crystal-inline-check"><input type="checkbox" ${style.visible ? "checked" : ""} data-element="${element}" data-field="visible"> Visible</label>
      `;
      block.appendChild(controls);

      const overrideDetails = document.createElement("details");
      overrideDetails.className = "crystal-atom-overrides";
      const overrideSummary = document.createElement("summary");
      overrideSummary.textContent = "Individual atom overrides";
      overrideDetails.appendChild(overrideSummary);

      const overrideList = document.createElement("div");
      overrideList.className = "crystal-atom-override-list";
      atoms.forEach((atom) => {
        const override = state.atomOverrides[atom.label];
        const effective = getAtomStyle(atom);
        const row = document.createElement("div");
        row.className = "crystal-style-row crystal-atom-override-row";
        row.innerHTML = `
          <div class="crystal-style-name">${atom.label}</div>
          <label class="crystal-inline-check"><input type="checkbox" ${override ? "checked" : ""} data-override="${atom.label}"> Override</label>
          <label><span>Color</span><input type="color" value="${effective.color}" ${override ? "" : "disabled"} data-atom="${atom.label}" data-field="color"></label>
          <label><span>Radius</span><input type="number" step="any" min="0.05" value="${effective.radius}" ${override ? "" : "disabled"} data-atom="${atom.label}" data-field="radius"></label>
          <label class="crystal-inline-check"><input type="checkbox" ${effective.visible ? "checked" : ""} ${override ? "" : "disabled"} data-atom="${atom.label}" data-field="visible"> Visible</label>
        `;
        overrideList.appendChild(row);
      });
      overrideDetails.appendChild(overrideList);
      block.appendChild(overrideDetails);
      list.appendChild(block);
    });

    list.querySelectorAll("input[data-element]").forEach((input) => {
      input.addEventListener("input", () => {
        const style = state.elementStyles[input.dataset.element];
        if (!style) return;
        if (input.dataset.field === "visible") style.visible = input.checked;
        else if (input.dataset.field === "radius") style.radius = Math.max(0.05, Number(input.value) || style.radius);
        else style.color = input.value;
        render();
      });
    });
    list.querySelectorAll("input[data-override]").forEach((input) => {
      input.addEventListener("change", () => {
        const atom = generatedAtomSites().find((candidate) => candidate.label === input.dataset.override);
        if (!atom) return;
        if (input.checked) {
          state.atomOverrides[atom.label] = { ...getAtomStyle(atom) };
        } else {
          delete state.atomOverrides[atom.label];
        }
        renderAtomStyles();
        render();
      });
    });
    list.querySelectorAll("input[data-atom]").forEach((input) => {
      input.addEventListener("input", () => {
        const override = state.atomOverrides[input.dataset.atom];
        if (!override) return;
        if (input.dataset.field === "visible") override.visible = input.checked;
        else if (input.dataset.field === "radius") override.radius = Math.max(0.05, Number(input.value) || override.radius);
        else override.color = input.value;
        render();
      });
    });
  }

  function renderAtomDropdowns() {
    ["bond-atom-a", "bond-atom-b"].forEach((id) => {
      const select = $(id);
      if (!select) return;
      const previous = select.value;
      select.innerHTML = "";
      const elementGroup = document.createElement("optgroup");
      elementGroup.label = "Elements";
      uniqueElements().forEach((element) => {
        const option = document.createElement("option");
        option.value = `element:${element}`;
        option.textContent = `${element} (all sites)`;
        elementGroup.appendChild(option);
      });
      select.appendChild(elementGroup);

      const siteGroup = document.createElement("optgroup");
      siteGroup.label = "Individual atom sites";
      generatedAtomSites().forEach((atom) => {
        const option = document.createElement("option");
        option.value = `site:${atom.label}`;
        option.textContent = atomOptionLabel(atom);
        siteGroup.appendChild(option);
      });
      select.appendChild(siteGroup);
      if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    });
  }

  function updateBondRule(index, field, value) {
    const rule = state.bondRules[index];
    if (!rule) return;
    if (field === "cutoff") rule.cutoff = Math.max(0, Number(value) || 0);
    else if (field === "thickness") rule.thickness = Math.max(0.01, Number(value) || rule.thickness);
    else rule[field] = value;
    render();
  }

  function renderBondRules() {
    const list = $("bond-rule-list");
    if (!list) return;
    list.innerHTML = "";
    state.bondRules.forEach((rule, index) => {
      const row = document.createElement("div");
      row.className = "crystal-rule-row";
      row.innerHTML = `
        <div class="tool-field">
          <label>Atom or element 1</label>
          <select data-rule="${index}" data-field="selectorA"></select>
        </div>
        <div class="tool-field">
          <label>Atom or element 2</label>
          <select data-rule="${index}" data-field="selectorB"></select>
        </div>
        <div class="tool-field">
          <label>Cutoff (Å)</label>
          <input type="number" step="any" min="0" value="${rule.cutoff}" data-rule="${index}" data-field="cutoff">
        </div>
        <div class="tool-field">
          <label>Thickness (Å)</label>
          <input type="number" step="any" min="0.01" value="${rule.thickness}" data-rule="${index}" data-field="thickness">
        </div>
        <div class="tool-field">
          <label>Style</label>
          <select data-rule="${index}" data-field="style">
            <option value="split" ${rule.style === "split" ? "selected" : ""}>Split atom colors</option>
            <option value="single" ${rule.style === "single" ? "selected" : ""}>Single color</option>
          </select>
        </div>
        <div class="tool-field">
          <label>Color</label>
          <input type="color" value="${rule.color}" data-rule="${index}" data-field="color">
        </div>
        <button type="button" class="laue-mode-btn crystal-rule-remove">Remove</button>
      `;
      row.querySelectorAll("select[data-field='selectorA'], select[data-field='selectorB']").forEach((select) => {
        renderBondSelectorOptions(select, rule[select.dataset.field]);
        select.addEventListener("change", () => updateBondRule(index, select.dataset.field, select.value));
      });
      row.querySelectorAll("input, select").forEach((input) => {
        if (input.dataset.field === "selectorA" || input.dataset.field === "selectorB") return;
        input.addEventListener("input", () => updateBondRule(index, input.dataset.field, input.value));
        input.addEventListener("change", () => updateBondRule(index, input.dataset.field, input.value));
      });
      row.querySelector(".crystal-rule-remove").addEventListener("click", () => {
        state.bondRules.splice(index, 1);
        renderBondRules();
        render();
      });
      list.appendChild(row);
    });
  }

  function renderBondSelectorOptions(select, value) {
    select.innerHTML = "";
    const elementGroup = document.createElement("optgroup");
    elementGroup.label = "Elements";
    uniqueElements().forEach((element) => {
      const option = document.createElement("option");
      option.value = `element:${element}`;
      option.textContent = `${element} (all sites)`;
      elementGroup.appendChild(option);
    });
    select.appendChild(elementGroup);

    const siteGroup = document.createElement("optgroup");
    siteGroup.label = "Individual atom sites";
    generatedAtomSites().forEach((atom) => {
      const option = document.createElement("option");
      option.value = `site:${atom.label}`;
      option.textContent = atomOptionLabel(atom);
      siteGroup.appendChild(option);
    });
    select.appendChild(siteGroup);
    if ([...select.options].some((option) => option.value === value)) select.value = value;
  }

  function refreshControls() {
    ensureStyles();
    renderAtomTable();
    renderAtomStyles();
    renderAtomDropdowns();
    renderBondRules();
  }

  function cellRanges() {
    return {
      aMin: Math.min(num("range-a-min", 0), num("range-a-max", 1)),
      aMax: Math.max(num("range-a-min", 0), num("range-a-max", 1)),
      bMin: Math.min(num("range-b-min", 0), num("range-b-max", 1)),
      bMax: Math.max(num("range-b-min", 0), num("range-b-max", 1)),
      cMin: Math.min(num("range-c-min", 0), num("range-c-max", 1)),
      cMax: Math.max(num("range-c-min", 0), num("range-c-max", 1))
    };
  }

  function insideCellBoundaries(frac, ranges) {
    const eps = 1e-9;
    return frac.x >= ranges.aMin - eps && frac.x <= ranges.aMax + eps &&
      frac.y >= ranges.bMin - eps && frac.y <= ranges.bMax + eps &&
      frac.z >= ranges.cMin - eps && frac.z <= ranges.cMax + eps;
  }

  function expandedAtoms(vectors) {
    const ranges = cellRanges();
    const expanded = [];
    generatedAtomSites().forEach((atom) => {
      const iMin = Math.floor(ranges.aMin - atom.fractX);
      const iMax = Math.ceil(ranges.aMax - atom.fractX);
      const jMin = Math.floor(ranges.bMin - atom.fractY);
      const jMax = Math.ceil(ranges.bMax - atom.fractY);
      const kMin = Math.floor(ranges.cMin - atom.fractZ);
      const kMax = Math.ceil(ranges.cMax - atom.fractZ);
      for (let i = iMin; i <= iMax; i += 1) {
        for (let j = jMin; j <= jMax; j += 1) {
          for (let k = kMin; k <= kMax; k += 1) {
            const frac = { x: atom.fractX + i, y: atom.fractY + j, z: atom.fractZ + k };
            if (!insideCellBoundaries(frac, ranges)) continue;
            const style = getAtomStyle(atom);
            if (!style || !style.visible) return;
            expanded.push({
              atom,
              style,
              shift: { i, j, k },
              frac,
              pos: fractionalToCartesian(atom, vectors, { i, j, k })
            });
          }
        }
      }
    });
    return expanded;
  }

  function computeBonds(atoms) {
    const bonds = [];
    state.bondRules.forEach((rule) => {
      for (let i = 0; i < atoms.length; i += 1) {
        for (let j = i + 1; j < atoms.length; j += 1) {
          const a = atoms[i];
          const b = atoms[j];
          const matches =
            (selectorMatches(a, rule.selectorA) && selectorMatches(b, rule.selectorB)) ||
            (selectorMatches(a, rule.selectorB) && selectorMatches(b, rule.selectorA));
          if (!matches) continue;
          if (distance(a.pos, b.pos) <= rule.cutoff) {
            bonds.push({ a, b, rule });
          }
        }
      }
    });
    return bonds;
  }

  function rotationBasis() {
    const matrix = ensureRotationMatrix();
    return function rotate(p) {
      return applyMatrix(matrix, p);
    };
  }

  function project(point, bounds, canvas) {
    const mode = text("projection-mode", "orthographic");
    let scale = bounds.scale * state.view.zoom;
    if (mode === "perspective") {
      const depth = bounds.depth || 1;
      const cameraDistance = depth * 3.2;
      scale *= cameraDistance / Math.max(0.2, cameraDistance - point.z);
    }
    return {
      x: canvas.width / 2 + state.view.panX + point.x * scale,
      y: canvas.height / 2 + state.view.panY - point.y * scale,
      z: point.z,
      scale
    };
  }

  function canvasSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width * dpr));
    const height = Math.max(320, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return dpr;
  }

  function scenePoints(vectors, atoms) {
    const ranges = cellRanges();
    const points = atoms.map((item) => item.pos);
    points.push(...cellCorners(vectors, ranges));
    return points;
  }

  function projectedBounds(points, rotate, canvas) {
    const rotated = points.map(rotate);
    const zs = rotated.map((p) => p.z);
    const unrotatedCenter = {
      x: (Math.max(...points.map((p) => p.x)) + Math.min(...points.map((p) => p.x))) / 2,
      y: (Math.max(...points.map((p) => p.y)) + Math.min(...points.map((p) => p.y))) / 2,
      z: (Math.max(...points.map((p) => p.z)) + Math.min(...points.map((p) => p.z))) / 2
    };
    const radius = Math.max(
      1,
      ...points.map((p) => length(sub(p, unrotatedCenter)))
    );
    return {
      center: rotate(unrotatedCenter),
      scale: Math.min(canvas.width, canvas.height) * 0.36 / radius,
      depth: Math.max(2, radius * 2, Math.max(...zs) - Math.min(...zs) || 1)
    };
  }

  function cellCorners(vectors, cell) {
    const corners = [];
    [cell.aMin, cell.aMax].forEach((i) => {
      [cell.bMin, cell.bMax].forEach((j) => {
        [cell.cMin, cell.cMax].forEach((k) => {
          corners.push(add(add(mul(vectors.a, i), mul(vectors.b, j)), mul(vectors.c, k)));
        });
      });
    });
    return corners;
  }

  function unitCellsWithinBoundaries(ranges) {
    const cells = [];
    for (let i = Math.floor(ranges.aMin); i < Math.ceil(ranges.aMax); i += 1) {
      for (let j = Math.floor(ranges.bMin); j < Math.ceil(ranges.bMax); j += 1) {
        for (let k = Math.floor(ranges.cMin); k < Math.ceil(ranges.cMax); k += 1) {
          cells.push({
            aMin: i,
            aMax: i + 1,
            bMin: j,
            bMax: j + 1,
            cMin: k,
            cMax: k + 1
          });
        }
      }
    }
    return cells;
  }

  function drawLine(ctx, a, b, options) {
    ctx.save();
    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawCylinder(ctx, a, b, options) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    const radius = Math.max(0.25, options.width / 2);
    const nx = -dy / len;
    const ny = dx / len;
    const shade = shadeColor(options.color, 0.72);
    const highlight = shadeColor(options.color, 1.28);
    const sideGradient = ctx.createLinearGradient(
      (a.x + b.x) / 2 - nx * radius,
      (a.y + b.y) / 2 - ny * radius,
      (a.x + b.x) / 2 + nx * radius,
      (a.y + b.y) / 2 + ny * radius
    );
    sideGradient.addColorStop(0, shade);
    sideGradient.addColorStop(0.45, options.color);
    sideGradient.addColorStop(0.62, highlight);
    sideGradient.addColorStop(1, shade);

    ctx.save();
    ctx.fillStyle = sideGradient;
    ctx.strokeStyle = "rgba(15, 23, 42, 0.22)";
    ctx.lineWidth = Math.max(0.75, options.width * 0.08);
    ctx.beginPath();
    ctx.moveTo(a.x + nx * radius, a.y + ny * radius);
    ctx.lineTo(b.x + nx * radius, b.y + ny * radius);
    ctx.lineTo(b.x - nx * radius, b.y - ny * radius);
    ctx.lineTo(a.x - nx * radius, a.y - ny * radius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    [
      { point: a, enabled: options.capStart !== false },
      { point: b, enabled: options.capEnd !== false }
    ].forEach(({ point: p, enabled }) => {
      if (!enabled) return;
      const capGradient = ctx.createRadialGradient(
        p.x - nx * radius * 0.3,
        p.y - ny * radius * 0.3,
        radius * 0.1,
        p.x,
        p.y,
        radius
      );
      capGradient.addColorStop(0, highlight);
      capGradient.addColorStop(0.75, options.color);
      capGradient.addColorStop(1, shade);
      ctx.fillStyle = capGradient;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, radius, Math.max(1, radius * 0.62), Math.atan2(dy, dx), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawCell(ctx, vectors, cell, rotate, bounds, canvas) {
    const color = text("cell-line-color", "#111827");
    const thickness = Math.max(0.005, num("cell-line-thickness", 0.035));
    const corners = cellCorners(vectors, cell).map((p) => {
      const centered = sub(rotate(p), bounds.center);
      return project(centered, bounds, canvas);
    });
    const width = thickness * corners.reduce((sum, point) => sum + point.scale, 0) / corners.length;
    const idx = (i, j, k) => i * 4 + j * 2 + k;
    [[0, 0, 0], [1, 0, 0]].forEach((iBase) => {
      const i = iBase[0];
      [[0, 0], [0, 1], [1, 0], [1, 1]].forEach(([j, k]) => drawLine(ctx, corners[idx(i, j, k)], corners[idx(i ? 0 : 1, j, k)], { color, width }));
    });
    for (let i = 0; i <= 1; i += 1) {
      for (let k = 0; k <= 1; k += 1) drawLine(ctx, corners[idx(i, 0, k)], corners[idx(i, 1, k)], { color, width });
      for (let j = 0; j <= 1; j += 1) drawLine(ctx, corners[idx(i, j, 0)], corners[idx(i, j, 1)], { color, width });
    }
  }

  function cellEdgeItems(vectors, cell, rotate, bounds, canvas) {
    const color = text("cell-line-color", "#111827");
    const thickness = Math.max(0.005, num("cell-line-thickness", 0.035));
    const corners = cellCorners(vectors, cell).map((p) => {
      const centered = sub(rotate(p), bounds.center);
      return project(centered, bounds, canvas);
    });
    const width = thickness * corners.reduce((sum, point) => sum + point.scale, 0) / corners.length;
    const idx = (i, j, k) => i * 4 + j * 2 + k;
    const edges = [];
    for (let i = 0; i <= 1; i += 1) {
      for (let k = 0; k <= 1; k += 1) edges.push([corners[idx(i, 0, k)], corners[idx(i, 1, k)]]);
      for (let j = 0; j <= 1; j += 1) edges.push([corners[idx(i, j, 0)], corners[idx(i, j, 1)]]);
    }
    for (let j = 0; j <= 1; j += 1) {
      for (let k = 0; k <= 1; k += 1) edges.push([corners[idx(0, j, k)], corners[idx(1, j, k)]]);
    }
    return edges.map(([a, b]) => ({
      depth: (a.z + b.z) / 2,
      draw: () => drawLine(ctx, a, b, { color, width })
    }));
  }

  function cellEdgeSegments(vectors, cell) {
    const corners = cellCorners(vectors, cell);
    const idx = (i, j, k) => i * 4 + j * 2 + k;
    const edges = [];
    for (let i = 0; i <= 1; i += 1) {
      for (let k = 0; k <= 1; k += 1) edges.push([corners[idx(i, 0, k)], corners[idx(i, 1, k)]]);
      for (let j = 0; j <= 1; j += 1) edges.push([corners[idx(i, j, 0)], corners[idx(i, j, 1)]]);
    }
    for (let j = 0; j <= 1; j += 1) {
      for (let k = 0; k <= 1; k += 1) edges.push([corners[idx(0, j, k)], corners[idx(1, j, k)]]);
    }
    return edges;
  }

  function hexToRgb(hex) {
    const clean = String(hex || "#ffffff").replace("#", "");
    const value = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255
    };
  }

  function shadeColor(hex, amount) {
    const rgb = hexToRgb(hex);
    const light = hexToRgb(text("light-color", "#ffffff"));
    const mix = Math.max(0, Math.min(1.6, amount));
    const r = Math.min(255, rgb.r * mix + light.r * Math.max(0, mix - 1) * 0.25);
    const g = Math.min(255, rgb.g * mix + light.g * Math.max(0, mix - 1) * 0.25);
    const b = Math.min(255, rgb.b * mix + light.b * Math.max(0, mix - 1) * 0.25);
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }

  function lightVector() {
    const az = degToRad(num("light-azimuth", -35));
    const el = degToRad(num("light-elevation", 45));
    return normalize({
      x: Math.cos(el) * Math.cos(az),
      y: Math.cos(el) * Math.sin(az),
      z: Math.sin(el)
    });
  }

  function drawAtom(ctx, item, point, dpr) {
    const roughness = num("material-roughness", 0.9);
    const specular = num("material-specular", 0.15);
    const intensity = num("light-intensity", 1.6);
    const light = lightVector();
    const realistic = text("atom-lighting-mode", "realistic") === "realistic";
    const normal = normalize({ x: -0.35, y: 0.45, z: 0.82 });
    const facing = realistic ?
      Math.max(0.06, 0.22 + 0.78 * Math.max(0, dot(normal, light)) * intensity) :
      Math.max(0.18, 0.58 + 0.42 * dot(normal, light));
    const radius = Math.max(4, item.style.radius * displayRadiusScale() * point.scale * 0.2);
    const color = item.style.color;
    const gradient = ctx.createRadialGradient(
      point.x - radius * (realistic ? 0.42 : 0.35),
      point.y - radius * (realistic ? 0.5 : 0.45),
      radius * (realistic ? 0.02 : 0.12),
      point.x,
      point.y,
      radius
    );
    if (realistic) {
      gradient.addColorStop(0, shadeColor(color, 1 + specular * intensity * 0.9));
      gradient.addColorStop(Math.max(0.12, 0.26 + roughness * 0.22), shadeColor(color, facing));
      gradient.addColorStop(0.78, shadeColor(color, Math.max(0.1, facing * 0.58)));
      gradient.addColorStop(1, shadeColor(color, Math.max(0.04, facing * 0.28)));
    } else {
      gradient.addColorStop(0, shadeColor(color, facing + intensity * specular * 0.9));
      gradient.addColorStop(Math.max(0.45, 0.8 - roughness * 0.25), shadeColor(color, facing * intensity));
      gradient.addColorStop(1, shadeColor(color, Math.max(0.18, facing * 0.52)));
    }
    ctx.save();
    if (realistic) {
      ctx.shadowColor = "rgba(15, 23, 42, 0.24)";
      ctx.shadowBlur = radius * 0.15;
      ctx.shadowOffsetX = radius * 0.04;
      ctx.shadowOffsetY = radius * 0.06;
    }
    ctx.fillStyle = gradient;
    ctx.strokeStyle = realistic ? "rgba(15, 23, 42, 0.16)" : "rgba(15, 23, 42, 0.28)";
    ctx.lineWidth = (realistic ? 0.65 : 1) * dpr;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function bondScreenWidth(rule, pointA, pointB) {
    const thickness = Math.max(0.01, Number(rule.thickness) || 0.15);
    return thickness * (pointA.scale + pointB.scale) / 2;
  }

  function projectedAtomKey(item) {
    return `${item.atom.label}|${item.shift.i}|${item.shift.j}|${item.shift.k}`;
  }

  function threeAvailable() {
    return typeof window.THREE !== "undefined" && typeof window.THREE.WebGLRenderer === "function";
  }

  function vectorToThree(v, fit) {
    const THREE = window.THREE;
    return new THREE.Vector3(
      (v.x - fit.center.x) * fit.scale,
      (v.y - fit.center.y) * fit.scale,
      (v.z - fit.center.z) * fit.scale
    );
  }

  function sceneFit(points) {
    if (!points.length) return { center: { x: 0, y: 0, z: 0 }, scale: 1, radius: 1 };
    const min = {
      x: Math.min(...points.map((p) => p.x)),
      y: Math.min(...points.map((p) => p.y)),
      z: Math.min(...points.map((p) => p.z))
    };
    const max = {
      x: Math.max(...points.map((p) => p.x)),
      y: Math.max(...points.map((p) => p.y)),
      z: Math.max(...points.map((p) => p.z))
    };
    const center = mul(add(min, max), 0.5);
    const radius = Math.max(1, ...points.map((p) => length(sub(p, center))));
    return { center, radius, scale: 2 / radius };
  }

  function threeColor(hex) {
    return new window.THREE.Color(hex || "#999999");
  }

  function threeMaterial(color, kind) {
    const THREE = window.THREE;
    const roughness = Math.max(0, Math.min(1, num("material-roughness", 0.9)));
    const specular = Math.max(0, Math.min(1, num("material-specular", 0.15)));
    const options = {
      color: threeColor(color),
      depthTest: true,
      depthWrite: true
    };
    if (kind === "line") {
      return new THREE.MeshBasicMaterial(options);
    }
    if (text("atom-lighting-mode", "realistic") === "cartoon" && typeof THREE.MeshToonMaterial === "function") {
      return new THREE.MeshToonMaterial(options);
    }
    return new THREE.MeshStandardMaterial({
      ...options,
      roughness,
      metalness: 0,
      envMapIntensity: 0.3 + specular
    });
  }

  function disposeThreeObject(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
        else child.material.dispose();
      }
    });
  }

  function resetThreeRoot() {
    if (!threeState.root) return;
    while (threeState.root.children.length) {
      const child = threeState.root.children.pop();
      disposeThreeObject(child);
    }
  }

  function ensureThreeRenderer(canvas) {
    if (!threeAvailable()) return false;
    const THREE = window.THREE;
    if (!threeState.renderer || threeState.canvas !== canvas) {
      try {
        threeState.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      } catch (error) {
        threeState.renderer = null;
        return false;
      }
      threeState.renderer.outputColorSpace = THREE.SRGBColorSpace || "srgb";
      threeState.renderer.setPixelRatio(window.devicePixelRatio || 1);
      threeState.scene = new THREE.Scene();
      threeState.root = new THREE.Group();
      threeState.scene.add(threeState.root);
      threeState.canvas = canvas;
    }
    const rect = canvas.getBoundingClientRect();
    threeState.renderer.setPixelRatio(window.devicePixelRatio || 1);
    threeState.renderer.setSize(Math.max(320, rect.width), Math.max(320, rect.height), false);
    threeState.renderer.setClearColor(threeColor(text("background-color", "#ffffff")), 1);
    return true;
  }

  function updateThreeCamera(canvas) {
    const THREE = window.THREE;
    const rect = canvas.getBoundingClientRect();
    const aspect = Math.max(0.1, rect.width / Math.max(1, rect.height));
    const projection = text("projection-mode", "orthographic");
    if (!threeState.camera || threeState.activeProjection !== projection) {
      threeState.camera = projection === "perspective" ?
        new THREE.PerspectiveCamera(38, aspect, 0.01, 100) :
        new THREE.OrthographicCamera(-aspect * 2, aspect * 2, 2, -2, 0.01, 100);
      threeState.activeProjection = projection;
    }
    const camera = threeState.camera;
    if (projection === "perspective") {
      camera.aspect = aspect;
      camera.fov = 38;
    } else {
      const halfHeight = 2 / Math.max(0.15, state.view.zoom);
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
    }

    const matrix = ensureRotationMatrix();
    const right = new THREE.Vector3(matrix[0], matrix[1], matrix[2]).normalize();
    const up = new THREE.Vector3(matrix[3], matrix[4], matrix[5]).normalize();
    const forward = new THREE.Vector3(matrix[6], matrix[7], matrix[8]).normalize();
    const viewHeight = projection === "perspective" ? 4 / Math.max(0.15, state.view.zoom) : 4 / Math.max(0.15, state.view.zoom);
    const panScale = viewHeight / Math.max(320, rect.height);
    const target = new THREE.Vector3()
      .addScaledVector(right, -state.view.panX * panScale)
      .addScaledVector(up, state.view.panY * panScale);
    const distance = projection === "perspective" ? 6 / Math.max(0.15, state.view.zoom) : 6;
    camera.position.copy(target).addScaledVector(forward, distance);
    camera.up.copy(up);
    camera.lookAt(target);
    camera.near = 0.01;
    camera.far = 100;
    camera.updateProjectionMatrix();
  }

  function addThreeCylinder(root, a, b, radius, color, kind) {
    const THREE = window.THREE;
    const start = a.clone();
    const end = b.clone();
    const axis = end.clone().sub(start);
    const lengthValue = axis.length();
    if (lengthValue < 1e-5) return;
    const geometry = new THREE.CylinderGeometry(radius, radius, lengthValue, kind === "line" ? 8 : 24, 1, false);
    const material = threeMaterial(color, kind);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
    root.add(mesh);
  }

  function addThreeLights() {
    const THREE = window.THREE;
    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    threeState.root.add(ambient);
    const light = lightVector();
    const directional = new THREE.DirectionalLight(threeColor(text("light-color", "#ffffff")), num("light-intensity", 1.6));
    directional.position.set(light.x * 5, light.y * 5, light.z * 5);
    threeState.root.add(directional);
  }

  function addThreeCompass(vectors, fit) {
    if (!checked("show-lattice-vectors")) return;
    const THREE = window.THREE;
    const origin = vectorToThree({ x: 0, y: 0, z: 0 }, fit);
    [
      ["a", vectors.a, "#dc2626"],
      ["b", vectors.b, "#16a34a"],
      ["c", vectors.c, "#2563eb"]
    ].forEach(([, vector, color]) => {
      const end = vectorToThree(vector, fit);
      const dir = end.clone().sub(origin);
      const len = Math.min(0.8, Math.max(0.25, dir.length() * 0.35));
      const arrow = new THREE.ArrowHelper(dir.normalize(), origin, len, threeColor(color), len * 0.2, len * 0.09);
      threeState.root.add(arrow);
    });
  }

  function renderThreeScene(canvas, vectors, atoms, bonds, ranges) {
    if (!ensureThreeRenderer(canvas)) return false;
    resetThreeRoot();
    updateThreeCamera(canvas);
    addThreeLights();

    const outlineCells = checked("show-cell-outline") ?
      (checked("show-all-outlines") ? unitCellsWithinBoundaries(ranges) : [{ aMin: 0, aMax: 1, bMin: 0, bMax: 1, cMin: 0, cMax: 1 }]) :
      [];
    const fitPoints = scenePoints(vectors, atoms);
    outlineCells.forEach((cell) => fitPoints.push(...cellCorners(vectors, cell)));
    const fit = sceneFit(fitPoints);
    const THREE = window.THREE;

    atoms.forEach((item) => {
      const radius = Math.max(0.015, item.style.radius * displayRadiusScale() * 0.2 * fit.scale);
      const geometry = new THREE.SphereGeometry(radius, 32, 18);
      const mesh = new THREE.Mesh(geometry, threeMaterial(item.style.color, "atom"));
      mesh.position.copy(vectorToThree(item.pos, fit));
      threeState.root.add(mesh);
    });

    bonds.forEach((bond) => {
      const start = vectorToThree(bond.a.pos, fit);
      const end = vectorToThree(bond.b.pos, fit);
      const radius = Math.max(0.006, Math.max(0.01, Number(bond.rule.thickness) || 0.15) * 0.5 * fit.scale);
      if (bond.rule.style === "split") {
        const mid = start.clone().add(end).multiplyScalar(0.5);
        addThreeCylinder(threeState.root, start, mid, radius, bond.a.style.color, "bond");
        addThreeCylinder(threeState.root, mid, end, radius, bond.b.style.color, "bond");
      } else {
        addThreeCylinder(threeState.root, start, end, radius, bond.rule.color, "bond");
      }
    });

    outlineCells.forEach((cell) => {
      const corners = cellCorners(vectors, cell);
      const idx = (i, j, k) => i * 4 + j * 2 + k;
      const edges = [];
      for (let i = 0; i <= 1; i += 1) {
        for (let k = 0; k <= 1; k += 1) edges.push([corners[idx(i, 0, k)], corners[idx(i, 1, k)]]);
        for (let j = 0; j <= 1; j += 1) edges.push([corners[idx(i, j, 0)], corners[idx(i, j, 1)]]);
      }
      for (let j = 0; j <= 1; j += 1) {
        for (let k = 0; k <= 1; k += 1) edges.push([corners[idx(0, j, k)], corners[idx(1, j, k)]]);
      }
      edges.forEach(([a, b]) => {
        addThreeCylinder(
          threeState.root,
          vectorToThree(a, fit),
          vectorToThree(b, fit),
          Math.max(0.002, num("cell-line-thickness", 0.035) * 0.5 * fit.scale),
          text("cell-line-color", "#111827"),
          "line"
        );
      });
    });

    addThreeCompass(vectors, fit);
    threeState.renderer.render(threeState.scene, threeState.camera);
    return true;
  }

  function currentPortableScene() {
    ensureStyles();
    const vectors = latticeVectors(cellParams());
    const atoms = expandedAtoms(vectors);
    const bonds = computeBonds(atoms);
    const ranges = cellRanges();
    const outlineCells = checked("show-cell-outline") ?
      (checked("show-all-outlines") ? unitCellsWithinBoundaries(ranges) : [{ aMin: 0, aMax: 1, bMin: 0, bMax: 1, cMin: 0, cMax: 1 }]) :
      [];
    const scene = {
      name: (state.lastImportName || "crystal").replace(/\.cif$/i, ""),
      background: text("background-color", "#ffffff"),
      atoms: atoms.map((item) => ({
        label: item.atom.label,
        element: item.atom.element,
        pos: item.pos,
        color: item.style.color,
        radius: Math.max(0.015, item.style.radius * displayRadiusScale() * 0.2)
      })),
      bonds: [],
      edges: []
    };
    bonds.forEach((bond) => {
      const radius = Math.max(0.005, Math.max(0.01, Number(bond.rule.thickness) || 0.15) * 0.5);
      if (bond.rule.style === "split") {
        const mid = mul(add(bond.a.pos, bond.b.pos), 0.5);
        scene.bonds.push({ a: bond.a.pos, b: mid, colorA: bond.a.style.color, colorB: bond.a.style.color, radius });
        scene.bonds.push({ a: mid, b: bond.b.pos, colorA: bond.b.style.color, colorB: bond.b.style.color, radius });
      } else {
        scene.bonds.push({ a: bond.a.pos, b: bond.b.pos, color: bond.rule.color, radius });
      }
    });
    outlineCells.forEach((cell) => {
      cellEdgeSegments(vectors, cell).forEach(([a, b]) => {
        scene.edges.push({
          a,
          b,
          color: text("cell-line-color", "#111827"),
          radius: Math.max(0.002, num("cell-line-thickness", 0.035) * 0.5)
        });
      });
    });
    return scene;
  }

  function glbFilename() {
    return `${(state.lastImportName || "crystal").replace(/\.cif$/i, "").replace(/[^A-Za-z0-9_-]+/g, "-") || "crystal"}.glb`;
  }

  function serializableViewerState() {
    return {
      controls: readControlState(),
      atoms: state.atoms,
      radiusMode: state.radiusMode,
      colorScheme: state.colorScheme,
      elementStyles: state.elementStyles,
      atomOverrides: state.atomOverrides,
      bondRules: state.bondRules,
      symmetryOperations: state.symmetryOperations,
      lastImportName: state.lastImportName,
      view: state.view,
      consoleLines: state.consoleLines.slice(-40)
    };
  }

  function downloadGlbModel() {
    if (!window.CrystalModel || typeof window.CrystalModel.downloadGlb !== "function") {
      logLine("GLB export is unavailable because the model exporter did not load.");
      return;
    }
    window.CrystalModel.downloadGlb(currentPortableScene(), glbFilename());
    logLine(`Downloaded ${glbFilename()}.`);
  }

  function shareViewerUrl() {
    if (!window.CrystalModel || typeof window.CrystalModel.sceneToShareToken !== "function") return "";
    const token = window.CrystalModel.sceneToShareToken(currentPortableScene());
    return new URL(`crystal-viewer-share.html#data=${token}`, window.location.href).href;
  }

  async function copyShareLink() {
    const url = shareViewerUrl();
    if (!url) {
      logLine("Share links are unavailable because the model exporter did not load.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      logLine("Copied sharable crystal viewer link to clipboard.");
    } catch (error) {
      logLine(`Shareable viewer link: ${url}`);
    }
  }

  async function startXrSession(mode) {
    if (!navigator.xr) {
      logLine(`${mode.toUpperCase()} is not available in this browser. Use the shared viewer on a WebXR-capable HTTPS device.`);
      return;
    }
    const supported = await navigator.xr.isSessionSupported(mode === "ar" ? "immersive-ar" : "immersive-vr");
    if (!supported) {
      logLine(`${mode.toUpperCase()} is not supported on this device/browser.`);
      return;
    }
    const url = shareViewerUrl();
    if (url) window.open(url, "_blank", "noopener");
    logLine(`${mode.toUpperCase()} support detected. Opening a sharable viewer link for this crystal.`);
  }

  function drawCompass(ctx, vectors, rotate, canvas, dpr) {
    if (!checked("show-lattice-vectors")) return;
    const origin = { x: 55 * dpr, y: canvas.height - 58 * dpr };
    const labels = [
      ["a", vectors.a, "#dc2626"],
      ["b", vectors.b, "#16a34a"],
      ["c", vectors.c, "#2563eb"]
    ];
    const maxLen = Math.max(...labels.map(([, v]) => length(v))) || 1;
    labels.forEach(([label, vector, color]) => {
      const r = rotate(mul(vector, 42 * dpr / maxLen));
      const end = { x: origin.x + r.x, y: origin.y - r.y };
      drawLine(ctx, origin, end, { color, width: 2.5 * dpr });
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 3.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
      if (checked("show-vector-labels")) {
        ctx.font = `${12 * dpr}px system-ui, sans-serif`;
        ctx.fillText(label, end.x + 5 * dpr, end.y - 5 * dpr);
      }
    });
  }

  function renderCanvasScene(canvas, vectors, atoms, bonds, ranges) {
    const dpr = canvasSize(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = text("background-color", "#ffffff");
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const rotate = rotationBasis();
    const bounds = projectedBounds(scenePoints(vectors, atoms), rotate, canvas);
    const drawItems = [];

    const projectedAtoms = atoms.map((item) => {
      const centered = sub(rotate(item.pos), bounds.center);
      return { ...item, point: project(centered, bounds, canvas) };
    });
    const projectedByKey = new Map(projectedAtoms.map((item) => [projectedAtomKey(item), item]));

    if (checked("show-cell-outline")) {
      const cells = checked("show-all-outlines") ?
        unitCellsWithinBoundaries(ranges) :
        [{ aMin: 0, aMax: 1, bMin: 0, bMax: 1, cMin: 0, cMax: 1 }];
      cells.forEach((cell) => {
        drawItems.push(...cellEdgeItems(vectors, cell, rotate, bounds, canvas).map((item) => ({ ...item, priority: 0 })));
      });
    }

    bonds.forEach((bond) => {
      const pa = projectedByKey.get(projectedAtomKey(bond.a));
      const pb = projectedByKey.get(projectedAtomKey(bond.b));
      if (!pa || !pb) return;
      const width = bondScreenWidth(bond.rule, pa.point, pb.point);
      if (bond.rule.style === "split") {
        const mid = {
          x: (pa.point.x + pb.point.x) / 2,
          y: (pa.point.y + pb.point.y) / 2,
          z: (pa.point.z + pb.point.z) / 2,
          scale: (pa.point.scale + pb.point.scale) / 2
        };
        drawItems.push({
          depth: (pa.point.z + mid.z) / 2,
          priority: 1,
          draw: () => drawCylinder(ctx, pa.point, mid, { color: pa.style.color, width, capEnd: false })
        });
        drawItems.push({
          depth: (mid.z + pb.point.z) / 2,
          priority: 1,
          draw: () => drawCylinder(ctx, mid, pb.point, { color: pb.style.color, width, capStart: false })
        });
      } else {
        drawItems.push({
          depth: (pa.point.z + pb.point.z) / 2,
          priority: 1,
          draw: () => drawCylinder(ctx, pa.point, pb.point, { color: bond.rule.color, width })
        });
      }
    });

    projectedAtoms.forEach((item) => {
      drawItems.push({
        depth: item.point.z,
        priority: 2,
        draw: () => drawAtom(ctx, item, item.point, dpr)
      });
    });

    drawItems
      .sort((a, b) => a.depth - b.depth || a.priority - b.priority)
      .forEach((item) => item.draw());

    drawCompass(ctx, vectors, rotate, canvas, dpr);
  }

  function render() {
    const canvas = $("crystal-canvas");
    if (!canvas) return;

    ensureStyles();
    const params = cellParams();
    const vectors = latticeVectors(params);
    const atoms = expandedAtoms(vectors);
    const ranges = cellRanges();
    const bonds = computeBonds(atoms);
    let renderedWithThree = false;
    try {
      renderedWithThree = renderThreeScene(canvas, vectors, atoms, bonds, ranges);
    } catch (error) {
      renderedWithThree = false;
      if (window.console && typeof window.console.warn === "function") {
        window.console.warn("Falling back to 2D crystal renderer.", error);
      }
    }
    if (!renderedWithThree) {
      renderCanvasScene(canvas, vectors, atoms, bonds, ranges);
    }
    saveViewerState();
  }

  function addBondRule() {
    const selectorA = text("bond-atom-a", "");
    const selectorB = text("bond-atom-b", "");
    if (!selectorA || !selectorB) return;
    const rule = {
      selectorA,
      selectorB,
      cutoff: num("bond-cutoff", 2.6),
      thickness: num("bond-thickness", 0.15),
      style: text("bond-style", "split"),
      color: text("bond-color", "#6b7280")
    };
    state.bondRules.push(rule);
    renderBondRules();
    const bonds = computeBonds(expandedAtoms(latticeVectors(cellParams())));
    logLine(`Calculated bonds: ${bonds.length} shown across ${state.bondRules.length} rule${state.bondRules.length === 1 ? "" : "s"}.`);
    render();
  }

  function applyCif(data, name) {
    const presetSelect = $("crystal-preset");
    if (presetSelect) presetSelect.value = "";
    if (data.a != null) $("crystal-a").value = data.a;
    if (data.b != null) $("crystal-b").value = data.b;
    if (data.c != null) $("crystal-c").value = data.c;
    if (data.alpha != null) $("crystal-alpha").value = data.alpha;
    if (data.beta != null) $("crystal-beta").value = data.beta;
    if (data.gamma != null) $("crystal-gamma").value = data.gamma;
    if (data.spaceGroupName) $("crystal-spacegroup").value = data.spaceGroupName;
    else if (data.spaceGroupNumber != null) $("crystal-spacegroup").value = String(data.spaceGroupNumber);
    const asymmetricAtoms = Array.isArray(data.atoms) ? data.atoms : [];
    state.symmetryOperations = Array.isArray(data.symmetryOperations) ? data.symmetryOperations.slice() : [];
    let symmetryExpansion = { atoms: asymmetricAtoms, expanded: false, operationCount: state.symmetryOperations.length };
    if (asymmetricAtoms.length) {
      state.atoms = asymmetricAtoms.map(normalizeAtom);
      symmetryExpansion = expandAtomsBySymmetry(state.atoms, state.symmetryOperations);
      state.lastImportName = name;
      resetStyles();
    }
    const vectors = latticeVectors(cellParams());
    const volume = data.volume || cellVolume(vectors);
    const renderedAtoms = generatedAtomSites();
    const status = $("cif-status");
    if (status) {
      status.textContent = `Loaded ${name}.`;
      status.classList.remove("tool-cif-status-error");
    }
    state.consoleLines = [
      `Imported ${name}.`,
      `Space group: ${text("crystal-spacegroup", "not specified") || "not specified"}`,
      `Lattice: a=${num("crystal-a", 0)} Å, b=${num("crystal-b", 0)} Å, c=${num("crystal-c", 0)} Å; α=${num("crystal-alpha", 0)}°, β=${num("crystal-beta", 0)}°, γ=${num("crystal-gamma", 0)}°`,
      `Unit cell volume: ${volume.toFixed(4)} Å^3`,
      `Asymmetric atom sites: ${asymmetricAtoms.length}`,
      symmetryExpansion.operationCount ? `Symmetry operations: ${symmetryExpansion.operationCount}` : "Symmetry operations: none found",
      `Generated unit-cell sites: ${renderedAtoms.length}${renderedAtoms.length ? ` (${formatElementCounts(renderedAtoms)})` : ""}`,
      ...formatAtomList(state.atoms)
    ];
    renderConsole();
    refreshControls();
    render();
  }

  function atomsForPreset(preset) {
    if (!preset) return null;
    if (preset.structureModel === "diamond") {
      const element = preset.id && preset.id.startsWith("ge-") ? "Ge" : "Si";
      return [
        { label: `${element}1`, element, fractX: 0, fractY: 0, fractZ: 0, occupancy: 1 },
        { label: `${element}2`, element, fractX: 0.25, fractY: 0.25, fractZ: 0.25, occupancy: 1 }
      ];
    }
    const elementMatch = String(preset.name || "").match(/[A-Z][a-z]?/);
    if (elementMatch && ["al-", "cu-"].some((prefix) => preset.id && preset.id.startsWith(prefix))) {
      const element = sanitizeElement(elementMatch[0]);
      return [{ label: `${element}1`, element, fractX: 0, fractY: 0, fractZ: 0, occupancy: 1 }];
    }
    return null;
  }

  function applyPreset(preset) {
    if (!preset || typeof window.applyCrystalPresetToFields !== "function") return;
    window.applyCrystalPresetToFields(preset, {
      a: $("crystal-a"),
      b: $("crystal-b"),
      c: $("crystal-c"),
      alpha: $("crystal-alpha"),
      beta: $("crystal-beta"),
      gamma: $("crystal-gamma"),
      spaceGroup: $("crystal-spacegroup")
    });
    const presetAtoms = atomsForPreset(preset);
    if (presetAtoms) {
      state.atoms = presetAtoms;
      state.symmetryOperations = [];
      state.lastImportName = preset.name || "";
      resetStyles();
      logLine(`Loaded preset ${preset.name} with ${presetAtoms.length} atom site${presetAtoms.length === 1 ? "" : "s"}.`);
    } else {
      logLine(`Loaded preset ${preset.name}. Add atom positions manually or load a CIF for atom sites.`);
    }
    refreshControls();
    render();
  }

  function setCifError(message) {
    const status = $("cif-status");
    if (status) {
      status.textContent = message;
      status.classList.add("tool-cif-status-error");
    }
    logLine(message);
  }

  function cifNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Number(number.toFixed(8)).toString() : "0";
  }

  function exportCurrentCif() {
    const params = cellParams();
    const atoms = state.atoms.map(normalizeAtom);
    const name = (state.lastImportName || "crystal-viewer-export.cif").replace(/\.cif$/i, "");
    const lines = [
      `data_${name.replace(/[^A-Za-z0-9_]+/g, "_") || "crystal"}`,
      "_audit_creation_method 'paulmneves.com crystal viewer'",
      `_cell_length_a ${cifNumber(params.a)}`,
      `_cell_length_b ${cifNumber(params.b)}`,
      `_cell_length_c ${cifNumber(params.c)}`,
      `_cell_angle_alpha ${cifNumber(params.alpha)}`,
      `_cell_angle_beta ${cifNumber(params.beta)}`,
      `_cell_angle_gamma ${cifNumber(params.gamma)}`,
      `_symmetry_space_group_name_H-M '${params.spaceGroup || "P 1"}'`
    ];
    if (state.symmetryOperations.length && !isP1SpaceGroup(params.spaceGroup)) {
      lines.push("loop_", "_space_group_symop_operation_xyz");
      state.symmetryOperations.forEach((operation) => lines.push(`'${operation}'`));
    }
    lines.push(
      "loop_",
      "_atom_site_label",
      "_atom_site_type_symbol",
      "_atom_site_fract_x",
      "_atom_site_fract_y",
      "_atom_site_fract_z",
      "_atom_site_occupancy"
    );
    atoms.forEach((atom) => {
      lines.push(`${atom.label} ${sanitizeElement(atom.element)} ${cifNumber(atom.fractX)} ${cifNumber(atom.fractY)} ${cifNumber(atom.fractZ)} ${cifNumber(atom.occupancy)}`);
    });
    const blob = new Blob([`${lines.join("\n")}\n`], { type: "chemical/x-cif" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name || "crystal-viewer-export"}.cif`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    logLine(`Exported ${atoms.length} editable atom site${atoms.length === 1 ? "" : "s"} to CIF.`);
  }

  function persistedControlIds() {
    return [
      "crystal-a", "crystal-b", "crystal-c", "crystal-alpha", "crystal-beta", "crystal-gamma",
      "crystal-spacegroup", "show-generated-atoms", "color-scheme", "radius-mode", "radius-scale",
      "atom-lighting-mode", "light-intensity", "light-color", "light-azimuth", "light-elevation",
      "material-roughness", "material-specular", "range-a-min", "range-b-min", "range-c-min",
      "range-a-max", "range-b-max", "range-c-max", "show-cell-outline", "show-all-outlines",
      "show-lattice-vectors", "show-vector-labels", "cell-line-thickness", "cell-line-color",
      "projection-mode", "background-color", "bond-cutoff", "bond-thickness", "bond-style", "bond-color"
    ];
  }

  function readControlState() {
    return persistedControlIds().reduce((controls, id) => {
      const el = $(id);
      if (!el) return controls;
      controls[id] = el.type === "checkbox" ? el.checked : el.value;
      return controls;
    }, {});
  }

  function applyControlState(controls) {
    if (!controls || typeof controls !== "object") return;
    Object.entries(controls).forEach(([id, value]) => {
      const el = $(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!value;
      else el.value = value;
    });
  }

  function saveViewerState() {
    if (!state.persistenceReady) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableViewerState()));
    } catch (error) {
      // Local storage can be unavailable in private or restricted browser contexts.
    }
  }

  function applySerializedViewerState(saved) {
    if (!saved || !Array.isArray(saved.atoms)) return false;
    applyControlState(saved.controls);
    state.atoms = saved.atoms.map(normalizeAtom);
    state.radiusMode = RADIUS_DATA[saved.radiusMode] ? saved.radiusMode : text("radius-mode", "atomic");
    state.colorScheme = COLOR_SCHEMES[saved.colorScheme] ? saved.colorScheme : text("color-scheme", "jmol");
    state.elementStyles = saved.elementStyles && typeof saved.elementStyles === "object" ? saved.elementStyles : {};
    state.atomOverrides = saved.atomOverrides && typeof saved.atomOverrides === "object" ? saved.atomOverrides : {};
    state.bondRules = Array.isArray(saved.bondRules) ? saved.bondRules : [];
    state.symmetryOperations = Array.isArray(saved.symmetryOperations) ? saved.symmetryOperations : [];
    state.lastImportName = saved.lastImportName || "";
    state.view = saved.view && typeof saved.view === "object" ? { ...state.view, ...saved.view } : state.view;
    state.consoleLines = Array.isArray(saved.consoleLines) && saved.consoleLines.length ? saved.consoleLines : state.consoleLines;
    return true;
  }

  function restoreViewerStateFromHash() {
    const match = window.location.hash.match(/^#state=(.+)$/);
    if (!match || !window.CrystalModel || typeof window.CrystalModel.sceneFromShareToken !== "function") return false;
    try {
      const restored = applySerializedViewerState(window.CrystalModel.sceneFromShareToken(match[1]));
      if (restored) logLine("Loaded crystal state from sharable link.");
      return restored;
    } catch (error) {
      logLine("Could not load crystal state from this sharable link.");
      return false;
    }
  }

  function restoreViewerState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      applySerializedViewerState(saved);
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function setLookDirection(kind) {
    const params = cellParams();
    const vectors = latticeVectors(params);
    const reciprocal = {
      astar: cross(vectors.b, vectors.c),
      bstar: cross(vectors.c, vectors.a),
      cstar: cross(vectors.a, vectors.b)
    };
    const target = kind === "a" ? vectors.a :
      kind === "b" ? vectors.b :
      kind === "c" ? vectors.c :
      reciprocal[kind];
    if (!target) return;
    state.view.rotation = matrixFromLookDirection(target);
    render();
  }

  function bindEvents() {
    const loadButton = $("cif-load-button");
    const fileInput = $("cif-file");
    const exportButton = $("cif-export-button");
    const presetSelect = $("crystal-preset");
    const radiusModeSelect = $("radius-mode");
    const colorSchemeSelect = $("color-scheme");
    if (radiusModeSelect) {
      radiusModeSelect.value = state.radiusMode;
      radiusModeSelect.addEventListener("change", () => applyRadiusMode(radiusModeSelect.value));
    }
    if (colorSchemeSelect) {
      colorSchemeSelect.value = state.colorScheme;
      colorSchemeSelect.addEventListener("change", () => applyColorScheme(colorSchemeSelect.value));
    }
    if (presetSelect && typeof window.populateCrystalPresetSelect === "function") {
      window.populateCrystalPresetSelect(presetSelect);
      presetSelect.addEventListener("change", () => {
        if (typeof window.getCrystalPreset !== "function") return;
        const preset = window.getCrystalPreset(presetSelect.value);
        if (preset) applyPreset(preset);
      });
    }
    if (loadButton && fileInput) {
      loadButton.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (!file) return;
        try {
          if (typeof window.parseCif !== "function") throw new Error("CIF parser failed to load.");
          applyCif(window.parseCif(await file.text()), file.name);
        } catch (error) {
          setCifError(error.message || "Could not load this CIF file.");
        }
      });
    }
    if (exportButton) exportButton.addEventListener("click", exportCurrentCif);
    const downloadGlbButton = $("download-glb");
    const copyShareButton = $("copy-share-link");
    const enterVrButton = $("enter-vr");
    const enterArButton = $("enter-ar");
    if (downloadGlbButton) downloadGlbButton.addEventListener("click", downloadGlbModel);
    if (copyShareButton) copyShareButton.addEventListener("click", copyShareLink);
    if (enterVrButton) enterVrButton.addEventListener("click", () => startXrSession("vr").catch((error) => logLine(error.message || "VR failed to start.")));
    if (enterArButton) enterArButton.addEventListener("click", () => startXrSession("ar").catch((error) => logLine(error.message || "AR failed to start.")));

    const generatedToggle = $("show-generated-atoms");
    if (generatedToggle) {
      generatedToggle.addEventListener("change", () => {
        refreshControls();
        render();
      });
    }

    const spaceGroupInput = $("crystal-spacegroup");
    if (spaceGroupInput) {
      spaceGroupInput.addEventListener("change", () => {
        if (isP1SpaceGroup(spaceGroupInput.value)) promoteGeneratedAtomsToEditable();
        render();
      });
    }

    $("crystal-add-atom").addEventListener("click", () => {
      state.atoms.push({ label: `Atom${state.atoms.length + 1}`, element: "X", fractX: 0, fractY: 0, fractZ: 0, occupancy: 1 });
      refreshControls();
      render();
    });
    $("bond-add").addEventListener("click", addBondRule);
    $("bond-clear").addEventListener("click", () => {
      state.bondRules = [];
      renderBondRules();
      logLine("Cleared all bond rules.");
      render();
    });
    $("view-reset").addEventListener("click", () => {
      state.view = { rotation: initialRotationMatrix(), zoom: 1, panX: 0, panY: 0, tool: state.view.tool };
      render();
    });

    document.querySelectorAll("[data-look]").forEach((button) => {
      button.addEventListener("click", () => setLookDirection(button.dataset.look));
    });
    document.querySelectorAll("[data-rotate-axis]").forEach((button) => {
      button.addEventListener("click", () => {
        const step = num("view-step-degrees", 10) * Number(button.dataset.rotateSign || 1);
        const axis = button.dataset.rotateAxis;
        rotateView(axis, step);
        render();
      });
    });
    document.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        state.view.tool = button.dataset.tool;
        document.querySelectorAll("[data-tool]").forEach((btn) => btn.classList.toggle("active", btn === button));
      });
    });

    document.querySelectorAll("input, select").forEach((el) => {
      if (el.closest("#crystal-atom-table") || el.closest("#crystal-atom-style-list") || el.id === "cif-file") return;
      if (["show-generated-atoms", "crystal-spacegroup"].includes(el.id)) return;
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });

    const canvas = $("crystal-canvas");
    let drag = null;
    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      drag = {
        x: event.clientX,
        y: event.clientY,
        rotation: ensureRotationMatrix().slice(),
        panX: state.view.panX,
        panY: state.view.panY,
        zoom: state.view.zoom
      };
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (state.view.tool === "rotate") {
        const yaw = rotationMatrix("y", dx * 0.45);
        const pitch = rotationMatrix("x", dy * 0.45);
        state.view.rotation = multiplyMatrices(pitch, multiplyMatrices(yaw, drag.rotation));
      } else if (state.view.tool === "pan") {
        const dpr = window.devicePixelRatio || 1;
        state.view.panX = drag.panX + dx * dpr;
        state.view.panY = drag.panY + dy * dpr;
      } else {
        state.view.zoom = Math.max(0.15, drag.zoom * Math.exp(-dy / 180));
      }
      render();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
      canvas.addEventListener(type, () => {
        drag = null;
      });
    });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      state.view.zoom = Math.max(0.15, state.view.zoom * Math.exp(-event.deltaY / 600));
      render();
    }, { passive: false });

    window.addEventListener("resize", render);
  }

  function initResizablePanels() {
    const layout = document.querySelector(".crystal-layout");
    const settingsPanel = $("crystal-settings-panel");
    const viewerPanel = document.querySelector(".crystal-viewer-panel");
    const panelSplitter = $("crystal-panel-splitter");
    const settingsCollapse = $("settings-collapse");
    const settingsRestore = $("settings-restore");
    const consoleEl = document.querySelector(".crystal-console");
    const consoleSplitter = $("crystal-console-splitter");
    const consoleCollapse = $("console-collapse");
    const consoleRestore = $("console-restore");
    if (!layout || !settingsPanel || !viewerPanel) return;

    function setSettingsCollapsed(collapsed) {
      layout.classList.toggle("crystal-settings-collapsed", collapsed);
      if (settingsCollapse) {
        settingsCollapse.setAttribute("aria-expanded", String(!collapsed));
        settingsCollapse.textContent = collapsed ? "Expand" : "Collapse";
      }
      if (settingsRestore) settingsRestore.hidden = !collapsed;
      if (panelSplitter) panelSplitter.hidden = collapsed;
      requestAnimationFrame(render);
    }

    function setConsoleCollapsed(collapsed) {
      viewerPanel.classList.toggle("crystal-console-collapsed", collapsed);
      if (consoleCollapse) {
        consoleCollapse.setAttribute("aria-expanded", String(!collapsed));
        consoleCollapse.textContent = collapsed ? "Expand" : "Collapse";
      }
      if (consoleRestore) consoleRestore.hidden = !collapsed;
      requestAnimationFrame(render);
    }

    if (settingsCollapse) settingsCollapse.addEventListener("click", () => setSettingsCollapsed(true));
    if (settingsRestore) settingsRestore.addEventListener("click", () => setSettingsCollapsed(false));
    if (consoleCollapse) consoleCollapse.addEventListener("click", () => setConsoleCollapsed(true));
    if (consoleRestore) consoleRestore.addEventListener("click", () => setConsoleCollapsed(false));

    if (panelSplitter) {
      let panelDrag = null;
      function setPanelSplitFromClientX(clientX, rect) {
        const x = clientX - rect.left;
        const pct = Math.max(24, Math.min(66, (x / rect.width) * 100));
        layout.style.setProperty("--crystal-settings-width", `${pct.toFixed(2)}%`);
        render();
      }
      panelSplitter.addEventListener("pointerdown", (event) => {
        const stacked = window.matchMedia("(max-width: 1100px)").matches;
        if (stacked || layout.classList.contains("crystal-settings-collapsed")) return;
        panelSplitter.setPointerCapture(event.pointerId);
        panelDrag = {
          rect: layout.getBoundingClientRect()
        };
        layout.classList.add("crystal-resizing-panels");
        event.preventDefault();
      });
      panelSplitter.addEventListener("pointermove", (event) => {
        if (!panelDrag) return;
        setPanelSplitFromClientX(event.clientX, panelDrag.rect);
      });
      panelSplitter.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        const current = parseFloat(layout.style.getPropertyValue("--crystal-settings-width")) || 41;
        const delta = event.key === "ArrowLeft" ? -2 : 2;
        const next = Math.max(24, Math.min(66, current + delta));
        layout.style.setProperty("--crystal-settings-width", `${next.toFixed(2)}%`);
        render();
        event.preventDefault();
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => {
        panelSplitter.addEventListener(type, () => {
          panelDrag = null;
          layout.classList.remove("crystal-resizing-panels");
        });
      });
    }

    if (consoleSplitter && consoleEl) {
      let consoleDrag = null;
      function setConsoleHeight(height, panelHeight) {
        const clamped = Math.max(72, Math.min(panelHeight * 0.55, height));
        viewerPanel.style.setProperty("--crystal-console-height", `${clamped.toFixed(0)}px`);
        render();
      }
      consoleSplitter.addEventListener("pointerdown", (event) => {
        if (viewerPanel.classList.contains("crystal-console-collapsed")) return;
        consoleSplitter.setPointerCapture(event.pointerId);
        consoleDrag = {
          startY: event.clientY,
          startHeight: consoleEl.getBoundingClientRect().height,
          panelHeight: viewerPanel.getBoundingClientRect().height
        };
        viewerPanel.classList.add("crystal-resizing-console");
        event.preventDefault();
      });
      consoleSplitter.addEventListener("pointermove", (event) => {
        if (!consoleDrag) return;
        const nextHeight = consoleDrag.startHeight - (event.clientY - consoleDrag.startY);
        setConsoleHeight(nextHeight, consoleDrag.panelHeight);
      });
      consoleSplitter.addEventListener("keydown", (event) => {
        if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
        const current = parseFloat(viewerPanel.style.getPropertyValue("--crystal-console-height")) ||
          consoleEl.getBoundingClientRect().height;
        const delta = event.key === "ArrowUp" ? 16 : -16;
        setConsoleHeight(current + delta, viewerPanel.getBoundingClientRect().height);
        event.preventDefault();
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => {
        consoleSplitter.addEventListener(type, () => {
          consoleDrag = null;
          viewerPanel.classList.remove("crystal-resizing-console");
        });
      });
    }
  }

  function initCrystalViewerSnap() {
    const stackedMq = window.matchMedia("(max-width: 1100px)");
    const reducedMotionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const workspace = document.querySelector(".crystal-layout");
    const toolsPanel = document.querySelector(".laue-tools-scroll");
    const viewer = document.querySelector(".crystal-viewer-panel");
    const backLink = document.querySelector(".crystal-layout + .back-link-panel");
    if (!workspace || !viewer) return;

    let snapLock = false;
    let scrollTimer = null;
    const centerBandRatio = 0.075;
    const maxCenterBand = 88;
    const edgeGuard = 120;

    function pageScrollY() {
      return window.scrollY || document.documentElement.scrollTop || 0;
    }

    function maxPageScrollY() {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }

    function scrollingNearPageEnd(targetY) {
      if (!backLink) return false;
      return targetY > maxPageScrollY() - edgeGuard ||
        backLink.getBoundingClientRect().top < window.innerHeight * 0.68;
    }

    function getSnapRect() {
      if (stackedMq.matches) return viewer.getBoundingClientRect();
      const rects = [toolsPanel, viewer].filter(Boolean).map((el) => el.getBoundingClientRect());
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      return { top, height: bottom - top };
    }

    function snapViewerIfNear() {
      if (snapLock || reducedMotionMq.matches) return;
      const vh = window.innerHeight;
      const mid = vh * 0.5;
      const band = Math.min(maxCenterBand, vh * centerBandRatio);
      const r = getSnapRect();
      const center = r.top + r.height / 2;
      if (Math.abs(center - mid) > band) return;
      const currentY = pageScrollY();
      const targetY = Math.max(0, Math.min(maxPageScrollY(), currentY + center - mid));
      if (Math.abs(targetY - currentY) < 2) return;
      if (currentY < edgeGuard || targetY < edgeGuard || scrollingNearPageEnd(targetY)) return;
      snapLock = true;
      window.scrollTo({ top: targetY, behavior: "smooth" });
      window.setTimeout(() => {
        snapLock = false;
      }, 400);
    }

    function scheduleSnapCheck() {
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(snapViewerIfNear, 120);
    }

    window.addEventListener("scroll", scheduleSnapCheck, { passive: true });
    if ("onscrollend" in window) window.addEventListener("scrollend", snapViewerIfNear, { passive: true });
  }

  function initCrystalNavAutoHide() {
    const toolsScroll = document.querySelector(".laue-tools-scroll");
    let hidden = false;
    function updateNavHidden() {
      const winY = window.scrollY || document.documentElement.scrollTop || 0;
      const toolsY = toolsScroll ? toolsScroll.scrollTop : 0;
      const shouldHide = winY > 40 || toolsY > 40;
      if (shouldHide === hidden) return;
      hidden = shouldHide;
      document.body.classList.toggle("laue-nav-hidden", hidden);
      requestAnimationFrame(render);
    }
    window.addEventListener("scroll", updateNavHidden, { passive: true });
    if (toolsScroll) toolsScroll.addEventListener("scroll", updateNavHidden, { passive: true });
    updateNavHidden();
  }

  function bootstrap() {
    if (!restoreViewerStateFromHash()) restoreViewerState();
    refreshControls();
    renderConsole();
    bindEvents();
    initResizablePanels();
    initCrystalViewerSnap();
    initCrystalNavAutoHide();
    state.persistenceReady = true;
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
