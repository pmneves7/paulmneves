(function (global) {
  "use strict";

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function aligned(bytes, padByte) {
    const padding = (4 - bytes.byteLength % 4) % 4;
    const out = new Uint8Array(bytes.byteLength + padding);
    out.set(bytes);
    out.fill(padByte || 0, bytes.byteLength);
    return out;
  }

  function base64UrlFromText(text) {
    const bytes = encoder.encode(text);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function textFromBase64Url(value) {
    const padded = String(value || "").replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(value || "").length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return decoder.decode(bytes);
  }

  function compactNumber(value, digits) {
    const number = Number(value) || 0;
    return Number(number.toFixed(digits));
  }

  function compactPoint(point) {
    return [
      compactNumber(point && point.x, 5),
      compactNumber(point && point.y, 5),
      compactNumber(point && point.z, 5)
    ];
  }

  function normalize3(vector) {
    const len = Math.hypot(vector[0], vector[1], vector[2]) || 1;
    return [vector[0] / len, vector[1] / len, vector[2] / len];
  }

  function cross3(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function matrixFromLookDirection(x, y, z) {
    const forward = normalize3([x, y, z]);
    const reference = Math.abs(forward[2]) > 0.96 ? [0, 1, 0] : [0, 0, 1];
    const right = normalize3(cross3(reference, forward));
    const up = normalize3(cross3(forward, right));
    return [...right, ...up, ...forward];
  }

  function defaultViewRotationMatrix() {
    const z = Math.SQRT2 * Math.tan((25 * Math.PI) / 180);
    return matrixFromLookDirection(1, 1, z);
  }

  function lightDirectionFromAngles(azimuth, elevation) {
    const az = (Number(azimuth) || 0) * Math.PI / 180;
    const el = (Number(elevation) || 0) * Math.PI / 180;
    return normalize3([
      Math.cos(el) * Math.cos(az),
      Math.cos(el) * Math.sin(az),
      Math.sin(el)
    ]);
  }

  function cameraRelativeLightDirection(lighting, viewRotation) {
    const matrix = Array.isArray(viewRotation) && viewRotation.length === 9 ?
      viewRotation :
      defaultViewRotationMatrix();
    const settings = lighting || {};
    const light = lightDirectionFromAngles(settings.azimuth, settings.elevation);
    const right = [matrix[0], matrix[1], matrix[2]];
    const up = [matrix[3], matrix[4], matrix[5]];
    const forward = [matrix[6], matrix[7], matrix[8]];
    return normalize3([
      right[0] * light[0] + up[0] * light[2] + forward[0] * light[1],
      right[1] * light[0] + up[1] * light[2] + forward[1] * light[1],
      right[2] * light[0] + up[2] * light[2] + forward[2] * light[1]
    ]);
  }

  function expandPoint(point) {
    return {
      x: point && Number(point[0]) || 0,
      y: point && Number(point[1]) || 0,
      z: point && Number(point[2]) || 0
    };
  }

  function compactColor(color, fallback) {
    return String(color || fallback || "#999999").replace(/^#/, "");
  }

  function expandColor(color, fallback) {
    const clean = String(color || fallback || "999999").replace(/^#/, "");
    return `#${clean}`;
  }

  function compactScene(scene) {
    return {
      v: 2,
      n: scene.name || "crystal",
      bg: compactColor(scene.background, "#ffffff"),
      a: (scene.atoms || []).map((atom) => [
        compactPoint(atom.pos),
        compactColor(atom.color, "#999999"),
        compactNumber(atom.radius || 0.08, 4)
      ]),
      b: (scene.bonds || []).map((bond) => [
        compactPoint(bond.a),
        compactPoint(bond.b),
        compactNumber(bond.radius || 0.03, 4),
        compactColor(bond.colorA || bond.color, "#6b7280"),
        compactColor(bond.colorB || bond.colorA || bond.color, "#6b7280")
      ]),
      e: (scene.edges || []).map((edge) => [
        compactPoint(edge.a),
        compactPoint(edge.b),
        compactNumber(edge.radius || 0.01, 4),
        compactColor(edge.color, "#111827")
      ])
    };
  }

  function expandScene(compact) {
    if (!compact || compact.v !== 2) return compact;
    return {
      name: compact.n || "crystal",
      background: expandColor(compact.bg, "#ffffff"),
      atoms: (compact.a || []).map((atom, index) => ({
        label: `Atom${index + 1}`,
        element: "",
        pos: expandPoint(atom[0]),
        color: expandColor(atom[1], "#999999"),
        radius: Number(atom[2]) || 0.08
      })),
      bonds: (compact.b || []).map((bond) => ({
        a: expandPoint(bond[0]),
        b: expandPoint(bond[1]),
        radius: Number(bond[2]) || 0.03,
        colorA: expandColor(bond[3], "#6b7280"),
        colorB: expandColor(bond[4], "#6b7280")
      })),
      edges: (compact.e || []).map((edge) => ({
        a: expandPoint(edge[0]),
        b: expandPoint(edge[1]),
        radius: Number(edge[2]) || 0.01,
        color: expandColor(edge[3], "#111827")
      }))
    };
  }

  const CONTROL_SPECS = [
    ["a", "crystal-a", 5.431, "number"],
    ["b", "crystal-b", 5.431, "number"],
    ["c", "crystal-c", 5.431, "number"],
    ["al", "crystal-alpha", 90, "number"],
    ["be", "crystal-beta", 90, "number"],
    ["ga", "crystal-gamma", 90, "number"],
    ["sg", "crystal-spacegroup", "Fd-3m", "text"],
    ["rs", "radius-scale", 1, "number"],
    ["lm", "atom-lighting-mode", "realistic", "text"],
    ["li", "light-intensity", 2, "number"],
    ["lc", "light-color", "#ffffff", "color"],
    ["la", "light-azimuth", 140, "number"],
    ["le", "light-elevation", 30, "number"],
    ["mr", "material-roughness", 0.9, "number"],
    ["ms", "material-specular", 0.15, "number"],
    ["amin", "range-a-min", 0, "number"],
    ["bmin", "range-b-min", 0, "number"],
    ["cmin", "range-c-min", 0, "number"],
    ["amax", "range-a-max", 1, "number"],
    ["bmax", "range-b-max", 1, "number"],
    ["cmax", "range-c-max", 1, "number"],
    ["sco", "show-cell-outline", true, "checkbox"],
    ["sao", "show-all-outlines", false, "checkbox"],
    ["slv", "show-lattice-vectors", true, "checkbox"],
    ["svl", "show-vector-labels", false, "checkbox"],
    ["lcp", "lattice-compass-position", "cell", "text"],
    ["lst", "lattice-arrow-stem-thickness", 0.08, "number"],
    ["lhw", "lattice-arrow-head-width", 0.25, "number"],
    ["lhl", "lattice-arrow-head-length", 0.4, "number"],
    ["lfs", "lattice-label-font-size", 32, "number"],
    ["clt", "cell-line-thickness", 0.06, "number"],
    ["clc", "cell-line-color", "#111827", "color"],
    ["pm", "projection-mode", "orthographic", "text"],
    ["bg", "background-color", "#ffffff", "color"],
    ["dfe", "depth-fade-enabled", false, "checkbox"],
    ["dfs", "depth-fade-start", 5, "number"],
    ["dfe2", "depth-fade-end", 8, "number"]
  ];

  const CONTROL_SHORT_TO_ID = CONTROL_SPECS.reduce((map, [short, id]) => {
    map[short] = id;
    return map;
  }, {});

  function compactControlValue(value, type) {
    if (type === "checkbox") return !!value;
    if (type === "number") {
      const number = Number(value);
      if (!Number.isFinite(number)) return 0;
      return Number.isInteger(number) ? number : compactNumber(number, 5);
    }
    if (type === "color") return compactColor(value);
    return String(value == null ? "" : value);
  }

  function controlValuesEqual(a, b, type) {
    if (type === "checkbox") return !!a === !!b;
    if (type === "number") return Number(a) === Number(b);
    if (type === "color") return compactColor(a) === compactColor(b);
    return String(a) === String(b);
  }

  function compactControls(controls) {
    const out = {};
    CONTROL_SPECS.forEach(([short, id, fallback, type]) => {
      if (!controls || !Object.prototype.hasOwnProperty.call(controls, id)) return;
      const value = compactControlValue(controls[id], type);
      if (!controlValuesEqual(value, compactControlValue(fallback, type), type)) {
        out[short] = value;
      }
    });
    return out;
  }

  function expandControls(compactControls) {
    const out = {};
    if (!compactControls || typeof compactControls !== "object") return out;
    Object.entries(compactControls).forEach(([key, value]) => {
      const spec = CONTROL_SPECS.find((entry) => entry[0] === key);
      if (spec) {
        const [, id, , type] = spec;
        if (type === "checkbox") out[id] = !!value;
        else if (type === "number") out[id] = String(value);
        else if (type === "color") out[id] = expandColor(value);
        else out[id] = String(value);
        return;
      }
      if (CONTROL_SHORT_TO_ID[key]) out[CONTROL_SHORT_TO_ID[key]] = value;
      else out[key] = value;
    });
    return out;
  }

  function compactAtom(atom) {
    const row = [
      atom.label || "",
      atom.element || atom.typeSymbol || "",
      compactNumber(atom.fractX, 5),
      compactNumber(atom.fractY, 5),
      compactNumber(atom.fractZ, 5)
    ];
    const occupancy = atom.occupancy == null ? 1 : Number(atom.occupancy);
    if (occupancy !== 1) row.push(compactNumber(occupancy, 4));
    return row;
  }

  function expandAtom(atom, index) {
    if (!Array.isArray(atom)) return atom;
    return {
      label: atom[0] || `Atom${index + 1}`,
      element: atom[1] || atom[0] || "X",
      fractX: Number(atom[2]) || 0,
      fractY: Number(atom[3]) || 0,
      fractZ: Number(atom[4]) || 0,
      occupancy: atom[5] == null ? 1 : Number(atom[5]) || 1
    };
  }

  function compactBondRule(rule) {
    const style = rule.style === "single" ? 1 : 0;
    const row = [
      rule.selectorA || "",
      rule.selectorB || "",
      compactNumber(rule.cutoff, 5),
      compactNumber(rule.thickness, 5),
      style
    ];
    if (style && rule.color) row.push(compactColor(rule.color, "#6b7280"));
    return row;
  }

  function expandBondRule(row) {
    if (!Array.isArray(row)) return row;
    return {
      selectorA: row[0] || "",
      selectorB: row[1] || "",
      cutoff: Number(row[2]) || 0,
      thickness: Number(row[3]) || 0,
      style: row[4] ? "single" : "split",
      color: row[5] ? expandColor(row[5], "#6b7280") : "#6b7280"
    };
  }

  function compactElementStyle(style) {
    const row = [compactColor(style.color, "#999999")];
    if (style.radius != null) row.push(compactNumber(style.radius, 5));
    return row;
  }

  function expandElementStyle(row) {
    return {
      color: expandColor(row[0], "#999999"),
      radius: row[1] == null ? undefined : Number(row[1]) || 0
    };
  }

  function compactElementStyles(styles) {
    return Object.keys(styles || {}).sort().map((element) => [element, compactElementStyle(styles[element])]);
  }

  function expandElementStyles(rows) {
    if (!Array.isArray(rows)) return rows || {};
    return rows.reduce((out, row) => {
      if (!Array.isArray(row) || !row.length) return out;
      out[row[0]] = expandElementStyle(row[1]);
      return out;
    }, {});
  }

  function compactAtomOverride(label, override) {
    const row = [label];
    if (override.color) row.push(compactColor(override.color));
    if (override.radius != null) row.push(compactNumber(override.radius, 5));
    return row.length > 1 ? row : null;
  }

  function expandAtomOverrides(rows) {
    if (!Array.isArray(rows)) return rows || {};
    return rows.reduce((out, row) => {
      if (!Array.isArray(row) || !row.length) return out;
      const label = row[0];
      const override = {};
      if (row[1]) override.color = expandColor(row[1]);
      if (row[2] != null) override.radius = Number(row[2]) || 0;
      if (Object.keys(override).length) out[label] = override;
      return out;
    }, {});
  }

  function compactRecipe(recipe) {
    const body = { v: 4 };
    const name = (recipe.lastImportName || recipe.name || "").replace(/\.cif$/i, "");
    if (name && name !== "crystal") body.n = name;
    const controls = compactControls(recipe.controls);
    if (Object.keys(controls).length) body.c = controls;
    if (recipe.radiusMode && recipe.radiusMode !== "atomic") body.rm = recipe.radiusMode;
    if (recipe.colorScheme && recipe.colorScheme !== "jmol") body.cs = recipe.colorScheme;
    const elementStyles = compactElementStyles(recipe.elementStyles);
    if (elementStyles.length) body.es = elementStyles;
    const atomOverrides = Object.keys(recipe.atomOverrides || {})
      .sort()
      .map((label) => compactAtomOverride(label, recipe.atomOverrides[label]))
      .filter(Boolean);
    if (atomOverrides.length) body.ao = atomOverrides;
    const bondRules = (recipe.bondRules || []).map(compactBondRule);
    if (bondRules.length) body.br = bondRules;
    if (Array.isArray(recipe.symmetryOperations) && recipe.symmetryOperations.length) {
      body.sy = recipe.symmetryOperations;
    }
    const atoms = (recipe.atoms || []).map(compactAtom);
    if (atoms.length) body.at = atoms;
    if (recipe.view && Array.isArray(recipe.view.rotation) && recipe.view.rotation.length === 9) {
      body.vr = recipe.view.rotation.map((value) => compactNumber(value, 5));
    }
    return body;
  }

  function expandRecipe(compact) {
    if (!compact) return compact;
    if (compact.v === 4 || compact.v === 3) {
      return {
        lastImportName: compact.n || "crystal",
        controls: compact.v === 4 ? expandControls(compact.c) : (compact.c || {}),
        radiusMode: compact.rm || "atomic",
        colorScheme: compact.cs || "jmol",
        elementStyles: compact.v === 4 ? expandElementStyles(compact.es) : (compact.es || {}),
        atomOverrides: compact.v === 4 ? expandAtomOverrides(compact.ao) : (compact.ao || {}),
        bondRules: (compact.br || []).map((rule) => compact.v === 4 ? expandBondRule(rule) : rule),
        symmetryOperations: compact.sy || [],
        atoms: (compact.at || []).map(expandAtom),
        view: {
          rotation: Array.isArray(compact.vr) && compact.vr.length === 9 ?
            compact.vr.map(Number) :
            defaultViewRotationMatrix()
        }
      };
    }
    return compact;
  }

  function sceneToShareToken(scene) {
    return `v2.${base64UrlFromText(JSON.stringify(compactScene(scene)))}`;
  }

  function recipeToShareToken(recipe) {
    return `v4.${base64UrlFromText(JSON.stringify(compactRecipe(recipe)))}`;
  }

  function sceneFromShareToken(token) {
    const clean = String(token || "").replace(/^#/, "").replace(/^data=/, "");
    if (clean.startsWith("v4.") || clean.startsWith("v3.")) {
      return recipeToScene(expandRecipe(JSON.parse(textFromBase64Url(clean.slice(3)))));
    }
    if (clean.startsWith("v2.")) {
      return expandScene(JSON.parse(textFromBase64Url(clean.slice(3))));
    }
    return expandScene(JSON.parse(textFromBase64Url(clean)));
  }

  function numberControl(controls, id, fallback) {
    const value = controls && Number(controls[id]);
    return Number.isFinite(value) ? value : fallback;
  }

  function textControl(controls, id, fallback) {
    return controls && controls[id] != null ? String(controls[id]) : fallback;
  }

  function boolControl(controls, id, fallback) {
    return controls && Object.prototype.hasOwnProperty.call(controls, id) ? !!controls[id] : fallback;
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

  function symmetryKey(atom) {
    const scale = 100000;
    return [
      sanitizeElement(atom.element),
      Math.round(wrapFraction(atom.fractX) * scale),
      Math.round(wrapFraction(atom.fractY) * scale),
      Math.round(wrapFraction(atom.fractZ) * scale)
    ].join("|");
  }

  function generatedAtomSites(recipe) {
    const controls = recipe.controls || {};
    const atoms = (recipe.atoms || []).map((atom, index) => ({
      ...atom,
      label: atom.label || `Atom${index + 1}`,
      element: sanitizeElement(atom.element || atom.typeSymbol || atom.label),
      fractX: wrapFraction(Number(atom.fractX) || 0),
      fractY: wrapFraction(Number(atom.fractY) || 0),
      fractZ: wrapFraction(Number(atom.fractZ) || 0),
      occupancy: atom.occupancy == null ? 1 : Number(atom.occupancy) || 1
    }));
    const operations = Array.isArray(recipe.symmetryOperations) ? recipe.symmetryOperations : [];
    if (!operations.length || isP1SpaceGroup(textControl(controls, "crystal-spacegroup", ""))) return atoms;
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

  function latticeVectorsFromControls(controls) {
    const a = numberControl(controls, "crystal-a", 5.431);
    const b = numberControl(controls, "crystal-b", 5.431);
    const c = numberControl(controls, "crystal-c", 5.431);
    const alpha = numberControl(controls, "crystal-alpha", 90) * Math.PI / 180;
    const beta = numberControl(controls, "crystal-beta", 90) * Math.PI / 180;
    const gamma = numberControl(controls, "crystal-gamma", 90) * Math.PI / 180;
    const cosA = Math.cos(alpha);
    const cosB = Math.cos(beta);
    const cosG = Math.cos(gamma);
    const sinG = Math.sin(gamma) || 1e-9;
    const av = [a, 0, 0];
    const bv = [b * cosG, b * sinG, 0];
    const cv = [c * cosB, c * (cosA - cosB * cosG) / sinG, 0];
    cv[2] = Math.sqrt(Math.max(0, c * c - cv[0] * cv[0] - cv[1] * cv[1]));
    return { a: av, b: bv, c: cv };
  }

  function fractionalToCartesian(atom, vectors, shift) {
    return addVec(
      addVec(mulVec(vectors.a, atom.fractX + shift.i), mulVec(vectors.b, atom.fractY + shift.j)),
      mulVec(vectors.c, atom.fractZ + shift.k)
    );
  }

  function cellRangesFromControls(controls) {
    return {
      aMin: Math.min(numberControl(controls, "range-a-min", 0), numberControl(controls, "range-a-max", 1)),
      aMax: Math.max(numberControl(controls, "range-a-min", 0), numberControl(controls, "range-a-max", 1)),
      bMin: Math.min(numberControl(controls, "range-b-min", 0), numberControl(controls, "range-b-max", 1)),
      bMax: Math.max(numberControl(controls, "range-b-min", 0), numberControl(controls, "range-b-max", 1)),
      cMin: Math.min(numberControl(controls, "range-c-min", 0), numberControl(controls, "range-c-max", 1)),
      cMax: Math.max(numberControl(controls, "range-c-min", 0), numberControl(controls, "range-c-max", 1))
    };
  }

  function insideCellBoundaries(frac, ranges) {
    const eps = 1e-9;
    return frac.x >= ranges.aMin - eps && frac.x <= ranges.aMax + eps &&
      frac.y >= ranges.bMin - eps && frac.y <= ranges.bMax + eps &&
      frac.z >= ranges.cMin - eps && frac.z <= ranges.cMax + eps;
  }

  function styleForAtom(recipe, atom) {
    const elementStyle = recipe.elementStyles && recipe.elementStyles[sanitizeElement(atom.element)] || {};
    const override = recipe.atomOverrides && recipe.atomOverrides[atom.label] || {};
    return {
      color: override.color || elementStyle.color || "#999999",
      radius: Number(override.radius || elementStyle.radius || 1),
      visible: override.visible != null ? !!override.visible : elementStyle.visible !== false
    };
  }

  function expandedRecipeAtoms(recipe, vectors, ranges) {
    const expanded = [];
    generatedAtomSites(recipe).forEach((atom) => {
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
            const style = styleForAtom(recipe, atom);
            if (!style.visible) continue;
            expanded.push({ atom, style, frac, pos: fractionalToCartesian(atom, vectors, { i, j, k }) });
          }
        }
      }
    });
    return expanded;
  }

  function selectorMatches(item, selector) {
    const [kind, value] = String(selector || "").split(":");
    if (kind === "element") return sanitizeElement(item.atom.element) === value;
    if (kind === "site") return item.atom.label === value;
    return item.atom.label === selector;
  }

  function recipeBonds(recipe, atoms) {
    const bonds = [];
    (recipe.bondRules || []).forEach((rule) => {
      for (let i = 0; i < atoms.length; i += 1) {
        for (let j = i + 1; j < atoms.length; j += 1) {
          const a = atoms[i];
          const b = atoms[j];
          const matches =
            (selectorMatches(a, rule.selectorA) && selectorMatches(b, rule.selectorB)) ||
            (selectorMatches(a, rule.selectorB) && selectorMatches(b, rule.selectorA));
          if (!matches || lengthVec(subVec(pointArray(a.pos), pointArray(b.pos))) > Number(rule.cutoff || 0)) continue;
          bonds.push({ a, b, rule });
        }
      }
    });
    return bonds;
  }

  function cellCorners(vectors, cell) {
    const corners = [];
    [cell.aMin, cell.aMax].forEach((i) => {
      [cell.bMin, cell.bMax].forEach((j) => {
        [cell.cMin, cell.cMax].forEach((k) => {
          corners.push(addVec(addVec(mulVec(vectors.a, i), mulVec(vectors.b, j)), mulVec(vectors.c, k)));
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
          cells.push({ aMin: i, aMax: i + 1, bMin: j, bMax: j + 1, cMin: k, cMax: k + 1 });
        }
      }
    }
    return cells;
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

  function objectPoint(point) {
    return { x: point[0] || 0, y: point[1] || 0, z: point[2] || 0 };
  }

  function recipeToScene(recipe) {
    const controls = recipe.controls || {};
    const vectors = latticeVectorsFromControls(controls);
    const ranges = cellRangesFromControls(controls);
    const atoms = expandedRecipeAtoms(recipe, vectors, ranges);
    const bonds = recipeBonds(recipe, atoms);
    const radiusScale = Math.max(0, numberControl(controls, "radius-scale", 1));
    const outlineCells = boolControl(controls, "show-cell-outline", true) ?
      (boolControl(controls, "show-all-outlines", false) ? unitCellsWithinBoundaries(ranges) : [{ aMin: 0, aMax: 1, bMin: 0, bMax: 1, cMin: 0, cMax: 1 }]) :
      [];
    const scene = {
      name: (recipe.lastImportName || "crystal").replace(/\.cif$/i, ""),
      background: textControl(controls, "background-color", "#ffffff"),
      material: {
        roughness: numberControl(controls, "material-roughness", 0.9),
        metallic: 0,
        unlit: textControl(controls, "atom-lighting-mode", "realistic") === "cartoon"
      },
      lighting: {
        intensity: numberControl(controls, "light-intensity", 2),
        color: textControl(controls, "light-color", "#ffffff"),
        azimuth: numberControl(controls, "light-azimuth", 140),
        elevation: numberControl(controls, "light-elevation", 30),
        ambient: 0.25
      },
      view: recipe.view && recipe.view.rotation ?
        { rotation: recipe.view.rotation } :
        { rotation: defaultViewRotationMatrix() },
      depthFade: {
        enabled: boolControl(controls, "depth-fade-enabled", false),
        start: numberControl(controls, "depth-fade-start", 5),
        end: numberControl(controls, "depth-fade-end", 8)
      },
      atoms: atoms.map((item) => ({
        label: item.atom.label,
        element: item.atom.element,
        pos: objectPoint(item.pos),
        color: item.style.color,
        radius: Math.max(0.015, item.style.radius * radiusScale * 0.2)
      })),
      bonds: [],
      edges: []
    };
    bonds.forEach((bond) => {
      const start = objectPoint(bond.a.pos);
      const end = objectPoint(bond.b.pos);
      const radius = Math.max(0.005, Math.max(0.01, Number(bond.rule.thickness) || 0.15) * 0.5);
      if (bond.rule.style === "split") {
        const mid = objectPoint(mulVec(addVec(bond.a.pos, bond.b.pos), 0.5));
        scene.bonds.push({ a: start, b: mid, colorA: bond.a.style.color, colorB: bond.a.style.color, radius });
        scene.bonds.push({ a: mid, b: end, colorA: bond.b.style.color, colorB: bond.b.style.color, radius });
      } else {
        scene.bonds.push({ a: start, b: end, color: bond.rule.color || "#6b7280", radius });
      }
    });
    outlineCells.forEach((cell) => {
      cellEdgeSegments(vectors, cell).forEach(([a, b]) => {
        scene.edges.push({
          a: objectPoint(a),
          b: objectPoint(b),
          color: textControl(controls, "cell-line-color", "#111827"),
          radius: Math.max(0.002, numberControl(controls, "cell-line-thickness", 0.06) * 0.5)
        });
      });
    });
    return scene;
  }

  function hexToRgb(hex) {
    const clean = String(hex || "#999999").replace("#", "");
    const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean.padEnd(6, "0");
    const value = parseInt(full, 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1];
  }

  function addVec(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function subVec(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function mulVec(a, scale) {
    return [a[0] * scale, a[1] * scale, a[2] * scale];
  }

  function crossVec(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function lengthVec(a) {
    return Math.hypot(a[0], a[1], a[2]);
  }

  function normalizeVec(a) {
    const len = lengthVec(a) || 1;
    return mulVec(a, 1 / len);
  }

  function pointArray(point) {
    if (Array.isArray(point)) return [point[0] || 0, point[1] || 0, point[2] || 0];
    return [point.x || 0, point.y || 0, point.z || 0];
  }

  function fitScene(scene) {
    const points = [];
    (scene.atoms || []).forEach((atom) => points.push(pointArray(atom.pos)));
    (scene.bonds || []).forEach((bond) => {
      points.push(pointArray(bond.a));
      points.push(pointArray(bond.b));
    });
    (scene.edges || []).forEach((edge) => {
      points.push(pointArray(edge.a));
      points.push(pointArray(edge.b));
    });
    if (!points.length) return { center: [0, 0, 0], scale: 1 };
    const min = [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis])));
    const max = [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])));
    const center = mulVec(addVec(min, max), 0.5);
    const radius = Math.max(1, ...points.map((point) => lengthVec(subVec(point, center))));
    return { center, scale: 2 / radius };
  }

  function transformPoint(point, fit) {
    return mulVec(subVec(pointArray(point), fit.center), fit.scale);
  }

  function colorsMatch(a, b) {
    return Math.abs(a[0] - b[0]) < 1e-6 &&
      Math.abs(a[1] - b[1]) < 1e-6 &&
      Math.abs(a[2] - b[2]) < 1e-6 &&
      Math.abs(a[3] - b[3]) < 1e-6;
  }

  function colorGroupKey(color) {
    return color.map((value) => value.toFixed(4)).join(",");
  }

  function solidGroup(groups, color) {
    const key = colorGroupKey(color);
    if (!groups.has(key)) {
      groups.set(key, { color, positions: [], normals: [], indices: [] });
    }
    return groups.get(key);
  }

  function pushSolidVertex(mesh, position, normal) {
    mesh.positions.push(...position);
    mesh.normals.push(...normal);
    return mesh.positions.length / 3 - 1;
  }

  function addSolidSphere(mesh, center, radius, segments, rings) {
    const base = mesh.positions.length / 3;
    for (let y = 0; y <= rings; y += 1) {
      const theta = y / rings * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      for (let x = 0; x <= segments; x += 1) {
        const phi = x / segments * Math.PI * 2;
        const normal = [Math.cos(phi) * sinTheta, cosTheta, Math.sin(phi) * sinTheta];
        pushSolidVertex(mesh, addVec(center, mulVec(normal, radius)), normal);
      }
    }
    for (let y = 0; y < rings; y += 1) {
      for (let x = 0; x < segments; x += 1) {
        const a = base + y * (segments + 1) + x;
        const b = a + segments + 1;
        mesh.indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  function addSolidCylinder(mesh, start, end, radius, segments) {
    const axis = subVec(end, start);
    if (lengthVec(axis) < 1e-8) return;
    const forward = normalizeVec(axis);
    const helper = Math.abs(forward[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
    const right = normalizeVec(crossVec(forward, helper));
    const up = normalizeVec(crossVec(right, forward));
    const base = mesh.positions.length / 3;
    [start, end].forEach((center) => {
      for (let i = 0; i <= segments; i += 1) {
        const angle = i / segments * Math.PI * 2;
        const normal = normalizeVec(addVec(mulVec(right, Math.cos(angle)), mulVec(up, Math.sin(angle))));
        pushSolidVertex(mesh, addVec(center, mulVec(normal, radius)), normal);
      }
    });
    for (let i = 0; i < segments; i += 1) {
      const a = base + i;
      const b = base + segments + 1 + i;
      mesh.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  function addColoredCylinder(groups, start, end, radius, colorStart, colorEnd, segments) {
    if (colorsMatch(colorStart, colorEnd)) {
      addSolidCylinder(solidGroup(groups, colorStart), start, end, radius, segments);
      return;
    }
    const mid = mulVec(addVec(start, end), 0.5);
    addSolidCylinder(solidGroup(groups, colorStart), start, mid, radius, segments);
    addSolidCylinder(solidGroup(groups, colorEnd), mid, end, radius, segments);
  }

  function exportMaterial(scene) {
    const raw = scene && scene.material;
    return {
      roughness: Math.max(0, Math.min(1, Number(raw && raw.roughness) || 0.9)),
      metallic: Math.max(0, Math.min(1, Number(raw && raw.metallic) || 0)),
      unlit: Boolean(raw && raw.unlit)
    };
  }

  function sceneToSolidGroups(scene) {
    const fit = fitScene(scene);
    const groups = new Map();
    (scene.atoms || []).forEach((atom) => {
      addSolidSphere(
        solidGroup(groups, hexToRgb(atom.color)),
        transformPoint(atom.pos, fit),
        Math.max(0.01, atom.radius || 0.08) * fit.scale,
        24,
        16
      );
    });
    (scene.bonds || []).forEach((bond) => {
      addColoredCylinder(
        groups,
        transformPoint(bond.a, fit),
        transformPoint(bond.b, fit),
        Math.max(0.004, bond.radius || 0.03) * fit.scale,
        hexToRgb(bond.colorA || bond.color || "#6b7280"),
        hexToRgb(bond.colorB || bond.colorA || bond.color || "#6b7280"),
        18
      );
    });
    (scene.edges || []).forEach((edge) => {
      const color = hexToRgb(edge.color || "#111827");
      addSolidCylinder(
        solidGroup(groups, color),
        transformPoint(edge.a, fit),
        transformPoint(edge.b, fit),
        Math.max(0.002, edge.radius || 0.01) * fit.scale,
        8
      );
    });
    return {
      groups: [...groups.values()].filter((group) => group.indices.length),
      material: exportMaterial(scene)
    };
  }

  function maxMeshIndex(indices) {
    let max = 0;
    for (let i = 0; i < indices.length; i += 1) {
      if (indices[i] > max) max = indices[i];
    }
    return max;
  }

  function minMax(values) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < values.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], values[i + axis]);
        max[axis] = Math.max(max[axis], values[i + axis]);
      }
    }
    return { min, max };
  }

  function createGlb(scene) {
    const { groups, material } = sceneToSolidGroups(scene);
    if (!groups.length) {
      throw new Error("Nothing to export.");
    }

    const chunks = [];
    const bufferViews = [];
    const accessors = [];
    const materials = [];
    const primitives = [];

    const pushChunk = (typedArray, target) => {
      const byteOffset = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
      chunks.push(aligned(bytes, 0));
      const bufferView = {
        buffer: 0,
        byteOffset,
        byteLength: bytes.byteLength,
        target
      };
      bufferViews.push(bufferView);
      return bufferViews.length - 1;
    };

    groups.forEach((group) => {
      const positions = new Float32Array(group.positions);
      const normals = new Float32Array(group.normals);
      const maxIndex = maxMeshIndex(group.indices);
      const indexArray = maxIndex > 65535 ? new Uint32Array(group.indices) : new Uint16Array(group.indices);
      const positionView = pushChunk(positions, 34962);
      const normalView = pushChunk(normals, 34962);
      const indexView = pushChunk(indexArray, 34963);
      const bounds = minMax(positions);
      const positionAccessor = accessors.length;
      accessors.push({
        bufferView: positionView,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min: bounds.min,
        max: bounds.max
      });
      const normalAccessor = accessors.length;
      accessors.push({
        bufferView: normalView,
        componentType: 5126,
        count: normals.length / 3,
        type: "VEC3"
      });
      const indexAccessor = accessors.length;
      accessors.push({
        bufferView: indexView,
        componentType: maxIndex > 65535 ? 5125 : 5123,
        count: indexArray.length,
        type: "SCALAR"
      });

      const materialIndex = materials.length;
      const entry = {
        pbrMetallicRoughness: {
          baseColorFactor: group.color,
          metallicFactor: material.metallic,
          roughnessFactor: material.roughness
        },
        doubleSided: true
      };
      if (material.unlit) {
        entry.extensions = { KHR_materials_unlit: {} };
      }
      materials.push(entry);

      primitives.push({
        attributes: { POSITION: positionAccessor, NORMAL: normalAccessor },
        indices: indexAccessor,
        material: materialIndex
      });
    });

    const json = {
      asset: { version: "2.0", generator: "paulmneves.com crystal viewer" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: scene.name || "Crystal" }],
      meshes: [{ primitives }],
      materials,
      buffers: [{ byteLength: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) }],
      bufferViews,
      accessors
    };
    if (material.unlit) {
      json.extensionsUsed = ["KHR_materials_unlit"];
    }
    const jsonChunk = aligned(encoder.encode(JSON.stringify(json)), 0x20);
    const binChunk = new Uint8Array(json.buffers[0].byteLength);
    let cursor = 0;
    chunks.forEach((chunk) => {
      binChunk.set(chunk, cursor);
      cursor += chunk.byteLength;
    });
    const total = 12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength;
    const out = new ArrayBuffer(total);
    const view = new DataView(out);
    let offset = 0;
    view.setUint32(offset, 0x46546c67, true); offset += 4;
    view.setUint32(offset, 2, true); offset += 4;
    view.setUint32(offset, total, true); offset += 4;
    view.setUint32(offset, jsonChunk.byteLength, true); offset += 4;
    view.setUint32(offset, 0x4e4f534a, true); offset += 4;
    new Uint8Array(out, offset, jsonChunk.byteLength).set(jsonChunk); offset += jsonChunk.byteLength;
    view.setUint32(offset, binChunk.byteLength, true); offset += 4;
    view.setUint32(offset, 0x004e4942, true); offset += 4;
    new Uint8Array(out, offset, binChunk.byteLength).set(binChunk);
    return new Blob([out], { type: "model/gltf-binary" });
  }

  function downloadGlb(scene, filename) {
    let url = "";
    try {
      url = URL.createObjectURL(createGlb(scene));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename || "crystal.glb";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  global.CrystalModel = {
    cameraRelativeLightDirection,
    createGlb,
    defaultViewRotationMatrix,
    downloadGlb,
    recipeToScene,
    recipeToShareToken,
    sceneFromShareToken,
    sceneToShareToken
  };
})(typeof window !== "undefined" ? window : globalThis);
