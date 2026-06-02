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
        compactNumber(atom.radius || 0.08, 5)
      ]),
      b: (scene.bonds || []).map((bond) => [
        compactPoint(bond.a),
        compactPoint(bond.b),
        compactNumber(bond.radius || 0.03, 5),
        compactColor(bond.colorA || bond.color, "#6b7280"),
        compactColor(bond.colorB || bond.colorA || bond.color, "#6b7280")
      ]),
      e: (scene.edges || []).map((edge) => [
        compactPoint(edge.a),
        compactPoint(edge.b),
        compactNumber(edge.radius || 0.01, 5),
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

  function compactAtom(atom) {
    return [
      atom.label || "",
      atom.element || atom.typeSymbol || "",
      compactNumber(atom.fractX, 6),
      compactNumber(atom.fractY, 6),
      compactNumber(atom.fractZ, 6),
      compactNumber(atom.occupancy == null ? 1 : atom.occupancy, 4)
    ];
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

  function compactControls(controls) {
    const ids = [
      "crystal-a", "crystal-b", "crystal-c", "crystal-alpha", "crystal-beta", "crystal-gamma",
      "crystal-spacegroup", "radius-scale", "atom-lighting-mode", "light-intensity", "light-color",
      "light-azimuth", "light-elevation", "material-roughness", "material-specular",
      "range-a-min", "range-b-min", "range-c-min", "range-a-max", "range-b-max", "range-c-max",
      "show-cell-outline", "show-all-outlines", "show-lattice-vectors", "show-vector-labels",
      "lattice-compass-position", "lattice-arrow-stem-thickness", "lattice-arrow-head-width",
      "lattice-arrow-head-length", "lattice-label-font-size", "cell-line-thickness", "cell-line-color",
      "projection-mode", "background-color", "depth-fade-enabled", "depth-fade-start", "depth-fade-end"
    ];
    return ids.reduce((out, id) => {
      if (controls && Object.prototype.hasOwnProperty.call(controls, id)) out[id] = controls[id];
      return out;
    }, {});
  }

  function compactRecipe(recipe) {
    return {
      v: 3,
      n: recipe.lastImportName || recipe.name || "crystal",
      c: compactControls(recipe.controls),
      rm: recipe.radiusMode || "atomic",
      cs: recipe.colorScheme || "jmol",
      es: recipe.elementStyles || {},
      ao: recipe.atomOverrides || {},
      br: recipe.bondRules || [],
      sy: recipe.symmetryOperations || [],
      at: (recipe.atoms || []).map(compactAtom)
    };
  }

  function expandRecipe(compact) {
    if (!compact || compact.v !== 3) return compact;
    return {
      lastImportName: compact.n || "crystal",
      controls: compact.c || {},
      radiusMode: compact.rm || "atomic",
      colorScheme: compact.cs || "jmol",
      elementStyles: compact.es || {},
      atomOverrides: compact.ao || {},
      bondRules: compact.br || [],
      symmetryOperations: compact.sy || [],
      atoms: (compact.at || []).map(expandAtom)
    };
  }

  function sceneToShareToken(scene) {
    return `v2.${base64UrlFromText(JSON.stringify(compactScene(scene)))}`;
  }

  function recipeToShareToken(recipe) {
    return `v3.${base64UrlFromText(JSON.stringify(compactRecipe(recipe)))}`;
  }

  function sceneFromShareToken(token) {
    const clean = String(token || "").replace(/^#/, "").replace(/^data=/, "");
    if (clean.startsWith("v3.")) {
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

  function pushVertex(mesh, position, normal, color) {
    mesh.positions.push(...position);
    mesh.normals.push(...normal);
    mesh.colors.push(...color);
    return mesh.positions.length / 3 - 1;
  }

  function addSphere(mesh, center, radius, color, segments, rings) {
    const base = mesh.positions.length / 3;
    for (let y = 0; y <= rings; y += 1) {
      const theta = y / rings * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      for (let x = 0; x <= segments; x += 1) {
        const phi = x / segments * Math.PI * 2;
        const normal = [Math.cos(phi) * sinTheta, cosTheta, Math.sin(phi) * sinTheta];
        pushVertex(mesh, addVec(center, mulVec(normal, radius)), normal, color);
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

  function addCylinder(mesh, start, end, radius, colorStart, colorEnd, segments) {
    const axis = subVec(end, start);
    if (lengthVec(axis) < 1e-8) return;
    const forward = normalizeVec(axis);
    const helper = Math.abs(forward[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
    const right = normalizeVec(crossVec(forward, helper));
    const up = normalizeVec(crossVec(right, forward));
    const base = mesh.positions.length / 3;
    [start, end].forEach((center, row) => {
      const color = row ? colorEnd : colorStart;
      for (let i = 0; i <= segments; i += 1) {
        const angle = i / segments * Math.PI * 2;
        const normal = normalizeVec(addVec(mulVec(right, Math.cos(angle)), mulVec(up, Math.sin(angle))));
        pushVertex(mesh, addVec(center, mulVec(normal, radius)), normal, color);
      }
    });
    for (let i = 0; i < segments; i += 1) {
      const a = base + i;
      const b = base + segments + 1 + i;
      mesh.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  function sceneToMesh(scene) {
    const fit = fitScene(scene);
    const mesh = { positions: [], normals: [], colors: [], indices: [] };
    (scene.atoms || []).forEach((atom) => {
      addSphere(mesh, transformPoint(atom.pos, fit), Math.max(0.01, atom.radius || 0.08) * fit.scale, hexToRgb(atom.color), 24, 16);
    });
    (scene.bonds || []).forEach((bond) => {
      addCylinder(
        mesh,
        transformPoint(bond.a, fit),
        transformPoint(bond.b, fit),
        Math.max(0.004, bond.radius || 0.03) * fit.scale,
        hexToRgb(bond.colorA || bond.color || "#6b7280"),
        hexToRgb(bond.colorB || bond.colorA || bond.color || "#6b7280"),
        18
      );
    });
    (scene.edges || []).forEach((edge) => {
      addCylinder(
        mesh,
        transformPoint(edge.a, fit),
        transformPoint(edge.b, fit),
        Math.max(0.002, edge.radius || 0.01) * fit.scale,
        hexToRgb(edge.color || "#111827"),
        hexToRgb(edge.color || "#111827"),
        8
      );
    });
    return mesh;
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
    const mesh = sceneToMesh(scene);
    const positions = new Float32Array(mesh.positions);
    const normals = new Float32Array(mesh.normals);
    const colors = new Float32Array(mesh.colors);
    const maxIndex = mesh.indices.length ? Math.max(...mesh.indices) : 0;
    const indexArray = maxIndex > 65535 ? new Uint32Array(mesh.indices) : new Uint16Array(mesh.indices);
    const chunks = [];
    const pushChunk = (typedArray, target) => {
      const byteOffset = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
      chunks.push(aligned(bytes, 0));
      return { buffer: 0, byteOffset, byteLength: bytes.byteLength, target };
    };
    const bufferViews = [
      pushChunk(positions, 34962),
      pushChunk(normals, 34962),
      pushChunk(colors, 34962),
      pushChunk(indexArray, 34963)
    ];
    const bounds = minMax(positions);
    const json = {
      asset: { version: "2.0", generator: "paulmneves.com crystal viewer" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: scene.name || "Crystal" }],
      meshes: [{
        primitives: [{
          attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
          indices: 3,
          material: 0
        }]
      }],
      materials: [{
        pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 }
      }],
      buffers: [{ byteLength: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) }],
      bufferViews,
      accessors: [
        { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min: bounds.min, max: bounds.max },
        { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
        { bufferView: 2, componentType: 5126, count: colors.length / 4, type: "VEC4" },
        { bufferView: 3, componentType: maxIndex > 65535 ? 5125 : 5123, count: indexArray.length, type: "SCALAR" }
      ]
    };
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
    const url = URL.createObjectURL(createGlb(scene));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "crystal.glb";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  global.CrystalModel = {
    createGlb,
    downloadGlb,
    recipeToScene,
    recipeToShareToken,
    sceneFromShareToken,
    sceneToShareToken
  };
})(typeof window !== "undefined" ? window : globalThis);
