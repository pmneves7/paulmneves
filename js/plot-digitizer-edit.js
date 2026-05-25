(function () {
  "use strict";

  /**
   * Image edit / correction module for the plot digitizer.
   * Loaded before plot-digitizer.js; initialized from there via DigitizerImageEdit.init().
   */

  let hooks = null;
  let previewCanvas = null;
  let previewDirty = true;
  let previewMeta = null;
  let previewTimer = null;

  const EDIT_MODES = new Set([
    "edit-crop",
    "edit-persp",
    "edit-lens-center",
    "edit-bg-pick"
  ]);

  const CORNER_KEYS = ["tl", "tr", "br", "bl"];
  const EDGE_KEYS = ["tm", "rm", "bm", "lm"];
  const PERSP_HANDLE_KEYS = [...CORNER_KEYS, ...EDGE_KEYS];
  const PERSP_HANDLE_LABELS = {
    tl: "corner top-left",
    tr: "corner top-right",
    br: "corner bottom-right",
    bl: "corner bottom-left",
    tm: "edge top",
    rm: "edge right",
    bm: "edge bottom",
    lm: "edge left"
  };

  const PARAM_SPECS = [
    { key: "rotationDeg", range: "dig-edit-rotation-range", num: "dig-edit-rotation", min: -45, max: 45, default: 0 },
    { key: "skewXDeg", range: "dig-edit-skew-x-range", num: "dig-edit-skew-x", min: -30, max: 30, default: 0 },
    { key: "skewYDeg", range: "dig-edit-skew-y-range", num: "dig-edit-skew-y", min: -30, max: 30, default: 0 },
    { key: "stretchXPercent", range: "dig-edit-stretch-x-range", num: "dig-edit-stretch-x", min: 50, max: 150, default: 100 },
    { key: "stretchYPercent", range: "dig-edit-stretch-y-range", num: "dig-edit-stretch-y", min: 50, max: 150, default: 100 },
    { key: "lensK", range: "dig-edit-lens-range", num: "dig-edit-lens", min: -100, max: 100, default: 0 },
    { key: "moireStrength", range: "dig-edit-moire-range", num: "dig-edit-moire", min: 0, max: 100, default: 0 }
  ];

  const BG_PARAM_SPECS = [
    { key: "transparencyTolerance", range: "dig-edit-bg-tolerance-range", num: "dig-edit-bg-tolerance", min: 0, max: 120, default: 24 },
    { key: "transparencySoftness", range: "dig-edit-bg-softness-range", num: "dig-edit-bg-softness", min: 0, max: 120, default: 32 }
  ];

  const els = {};

  function defaultEditState() {
    return {
      rotationDeg: 0,
      skewXDeg: 0,
      skewYDeg: 0,
      stretchXPercent: 100,
      stretchYPercent: 100,
      lensK: 0,
      moireStrength: 0,
      moireMethod: "bilateral",
      lensCenter: null,
      corners: null,
      crop: null,
      customCorners: false,
      perspAwaitingDraw: false,
      cropAwaitingDraw: false,
      transparencyEnabled: false,
      transparencyKeys: [],
      transparencyTolerance: 24,
      transparencySoftness: 32,
      transparencyPreviewBgEnabled: false,
      transparencyPreviewBgColor: { r: 255, g: 255, b: 255 }
    };
  }

  function cloneCanvas(src) {
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = false;
    cx.drawImage(src, 0, 0);
    return c;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function copyPoint(p) {
    return { x: p.x, y: p.y };
  }

  function dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function degToRad(d) {
    return d * Math.PI / 180;
  }

  function lensKFromSlider(v) {
    return v / 200;
  }

  function defaultLensCenter(w, h) {
    return { x: (w - 1) / 2, y: (h - 1) / 2 };
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function defaultCorners(w, h) {
    const tl = { x: 0, y: 0 };
    const tr = { x: w - 1, y: 0 };
    const br = { x: w - 1, y: h - 1 };
    const bl = { x: 0, y: h - 1 };
    return {
      tl,
      tr,
      br,
      bl,
      tm: midpoint(tl, tr),
      rm: midpoint(tr, br),
      bm: midpoint(bl, br),
      lm: midpoint(tl, bl)
    };
  }

  function getEffectiveCorners(edit, w, h) {
    if (edit.customCorners && edit.corners) {
      const c = edit.corners;
      const tl = copyPoint(c.tl);
      const tr = copyPoint(c.tr);
      const br = copyPoint(c.br);
      const bl = copyPoint(c.bl);
      return {
        tl,
        tr,
        br,
        bl,
        tm: c.tm ? copyPoint(c.tm) : midpoint(tl, tr),
        rm: c.rm ? copyPoint(c.rm) : midpoint(tr, br),
        bm: c.bm ? copyPoint(c.bm) : midpoint(bl, br),
        lm: c.lm ? copyPoint(c.lm) : midpoint(tl, bl)
      };
    }
    return defaultCorners(w, h);
  }

  function clearCrop(state) {
    state.edit.crop = null;
    state.edit.cropAwaitingDraw = true;
  }

  function clearPerspective(state) {
    if (!state.image) return;
    state.edit.corners = null;
    state.edit.customCorners = false;
    state.edit.perspAwaitingDraw = false;
    if (state.selected && state.selected.type === "persp") {
      state.selected = null;
    }
  }

  function hasActiveCrop(edit, src) {
    if (!edit.crop || !src) return false;
    const w = previewMeta && previewMeta.canvas ? previewMeta.canvas.width : src.width;
    const h = previewMeta && previewMeta.canvas ? previewMeta.canvas.height : src.height;
    return cropIsEffective(edit.crop, w, h);
  }

  function hasActivePerspective(edit, srcW, srcH) {
    if (!edit.customCorners || !edit.corners) return false;
    return !isIdentityPerspective(getEffectiveCorners(edit, srcW, srcH), srcW, srcH);
  }

  function applyLensToPoint(p, center, k, w, h) {
    if (!k) return copyPoint(p);
    const nx = (p.x - center.x) / Math.max(w, 1);
    const ny = (p.y - center.y) / Math.max(h, 1);
    const r2 = nx * nx + ny * ny;
    const factor = 1 + k * r2;
    return {
      x: center.x + (p.x - center.x) * factor,
      y: center.y + (p.y - center.y) * factor
    };
  }

  function invertLensPoint(p, center, k, w, h) {
    if (!k) return copyPoint(p);
    let x = p.x;
    let y = p.y;
    for (let i = 0; i < 8; i++) {
      const nx = (x - center.x) / Math.max(w, 1);
      const ny = (y - center.y) / Math.max(h, 1);
      const r2 = nx * nx + ny * ny;
      const factor = 1 + k * r2;
      const fx = center.x + (p.x - center.x) * factor;
      const fy = center.y + (p.y - center.y) * factor;
      x -= (fx - p.x) * 0.85;
      y -= (fy - p.y) * 0.85;
    }
    return { x, y };
  }

  function solveLinear8(a, b) {
    const n = 8;
    const m = a.map((row) => row.slice());
    const v = b.slice();
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
      }
      if (Math.abs(m[pivot][col]) < 1e-12) return null;
      [m[col], m[pivot]] = [m[pivot], m[col]];
      [v[col], v[pivot]] = [v[pivot], v[col]];
      const div = m[col][col];
      for (let j = col; j < n; j++) m[col][j] /= div;
      v[col] /= div;
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = m[row][col];
        if (factor === 0) continue;
        for (let j = col; j < n; j++) m[row][j] -= factor * m[col][j];
        v[row] -= factor * v[col];
      }
    }
    return v;
  }

  function homographyFrom4(src, dst) {
    const a = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const sx = src[i].x;
      const sy = src[i].y;
      const dx = dst[i].x;
      const dy = dst[i].y;
      a.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
      b.push(dx);
      a.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
      b.push(dy);
    }
    const h = solveLinear8(a, b);
    if (!h) return null;
    return [
      h[0], h[1], h[2],
      h[3], h[4], h[5],
      h[6], h[7], 1
    ];
  }

  function applyHomography(H, p) {
    const w = H[6] * p.x + H[7] * p.y + H[8];
    if (Math.abs(w) < 1e-12) return null;
    return {
      x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
      y: (H[3] * p.x + H[4] * p.y + H[5]) / w
    };
  }

  function invertHomography(H) {
    const a = H[0]; const b = H[1]; const c = H[2];
    const d = H[3]; const e = H[4]; const f = H[5];
    const g = H[6]; const h = H[7]; const i = H[8];
    const A = e * i - f * h;
    const B = c * h - b * i;
    const C = b * f - c * e;
    const D = f * g - d * i;
    const E = a * i - c * g;
    const F = c * d - a * f;
    const G = d * h - e * g;
    const Hh = b * g - a * h;
    const I = a * e - b * d;
    const det = a * A + b * D + c * G;
    if (Math.abs(det) < 1e-12) return null;
    return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, Hh / det, I / det];
  }

  function buildAffineMatrix(edit, w, h, opts = {}) {
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const rot = degToRad(edit.rotationDeg);
    const skx = degToRad(edit.skewXDeg);
    const sky = degToRad(edit.skewYDeg);
    const sx = opts.skipStretch ? 1 : (edit.stretchXPercent ?? 100) / 100;
    const sy = opts.skipStretch ? 1 : (edit.stretchYPercent ?? 100) / 100;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const tx = Math.tan(skx);
    const ty = Math.tan(sky);
    const e = (cos + ty * sin) * sx;
    const f = (-sin + ty * cos) * sx;
    const g = (sin + tx * cos) * sy;
    const h2 = (cos + tx * sin) * sy;
    const txOut = cx - e * cx - f * cy;
    const tyOut = cy - g * cx - h2 * cy;
    return [e, f, txOut, g, h2, tyOut];
  }

  function hasNonDefaultStretch(edit) {
    return (edit.stretchXPercent ?? 100) !== 100 || (edit.stretchYPercent ?? 100) !== 100;
  }

  function computeRectifiedAxes(corners, edit) {
    const sx = (edit.stretchXPercent ?? 100) / 100;
    const sy = (edit.stretchYPercent ?? 100) / 100;
    const topW = dist(corners.tl, corners.tr);
    const botW = dist(corners.bl, corners.br);
    const leftH = dist(corners.tl, corners.bl);
    const rightH = dist(corners.tr, corners.br);
    const maxU = Math.max(Math.max(topW, botW), 1) * sx;
    const maxV = Math.max(Math.max(leftH, rightH), 1) * sy;
    return { maxU, maxV };
  }

  function applyAffine(M, p) {
    return {
      x: M[0] * p.x + M[1] * p.y + M[2],
      y: M[3] * p.x + M[4] * p.y + M[5]
    };
  }

  function invertAffine(M) {
    const a = M[0]; const b = M[1]; const c = M[2];
    const d = M[3]; const e = M[4]; const f = M[5];
    const det = a * e - b * d;
    if (Math.abs(det) < 1e-12) return null;
    const ia = e / det;
    const ib = -b / det;
    const id = -d / det;
    const ie = a / det;
    return [ia, ib, -(ia * c + ib * f), id, ie, -(id * c + ie * f)];
  }

  function bboxOfPoints(pts) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    pts.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  function sampleBilinear(data, w, h, x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const tx = x - x0;
    const ty = y - y0;
    const idx = (xi, yi) => {
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) return null;
      const i = (yi * w + xi) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };
    const c00 = idx(x0, y0);
    const c10 = idx(x1, y0);
    const c01 = idx(x0, y1);
    const c11 = idx(x1, y1);
    const samples = [
      { c: c00, w: (1 - tx) * (1 - ty) },
      { c: c10, w: tx * (1 - ty) },
      { c: c01, w: (1 - tx) * ty },
      { c: c11, w: tx * ty }
    ];
    let pr = 0;
    let pg = 0;
    let pb = 0;
    let pa = 0;
    let weight = 0;
    samples.forEach(({ c, w: ww }) => {
      if (!c) return;
      const a = c[3] / 255;
      weight += ww;
      pa += c[3] * ww;
      pr += c[0] * a * ww;
      pg += c[1] * a * ww;
      pb += c[2] * a * ww;
    });
    if (weight <= 0) return [0, 0, 0, 0];
    pa /= weight;
    if (pa <= 0) return [0, 0, 0, 0];
    const invA = 255 / pa;
    return [
      clamp(pr / weight * invA, 0, 255),
      clamp(pg / weight * invA, 0, 255),
      clamp(pb / weight * invA, 0, 255),
      pa
    ];
  }

  function rgbToHex(r, g, b) {
    const h = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  function parseColorInput(str) {
    if (!str) return null;
    let s = str.trim();
    if (!s) return null;
    if (!s.startsWith("#")) s = `#${s}`;
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    }
    if (!/^#[0-9a-f]{6}$/i.test(s)) return null;
    return {
      r: parseInt(s.slice(1, 3), 16),
      g: parseInt(s.slice(3, 5), 16),
      b: parseInt(s.slice(5, 7), 16)
    };
  }

  function colorDistance(r, g, b, key) {
    const dr = r - key.r;
    const dg = g - key.g;
    const db = b - key.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function keyWeight(r, g, b, key, tolerance, softness) {
    const d = colorDistance(r, g, b, key);
    const inner = tolerance;
    const outer = tolerance + softness;
    if (d <= inner) return 1;
    if (d >= outer) return 0;
    return 1 - (d - inner) / Math.max(outer - inner, 1);
  }

  function isTransparencyActive(edit) {
    return !!(edit.transparencyEnabled && edit.transparencyKeys && edit.transparencyKeys.length);
  }

  function hasGeometricPendingEdits(edit, src) {
    if (!edit || !src) return false;
    if (edit.rotationDeg !== 0 || edit.skewXDeg !== 0 || edit.skewYDeg !== 0) return true;
    if (hasNonDefaultStretch(edit)) return true;
    if (edit.lensK !== 0) return true;
    if ((edit.moireStrength || 0) > 0) return true;
    if (hasActiveCrop(edit, src)) return true;
    if (hasActivePerspective(edit, src.width, src.height)) return true;
    if (edit.lensCenter) {
      const c = defaultLensCenter(src.width, src.height);
      if (dist(edit.lensCenter, c) > 0.5) return true;
    }
    return false;
  }

  function shouldShowTransparencyPreview(state) {
    if (!state || !state.image) return false;
    return isTransparencyActive(state.edit) && !hasGeometricPendingEdits(state.edit, state.image);
  }

  function applyTransparencyKeys(srcCanvas, keys, tolerance, softness) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const srcData = srcCanvas.getContext("2d").getImageData(0, 0, w, h);
    const out = srcCanvas.getContext("2d").createImageData(w, h);
    const s = srcData.data;
    const d = out.data;

    if (!keys || !keys.length) {
      for (let i = 0; i < s.length; i += 4) {
        d[i] = s[i];
        d[i + 1] = s[i + 1];
        d[i + 2] = s[i + 2];
        d[i + 3] = s[i + 3] || 255;
      }
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").putImageData(out, 0, 0);
      return c;
    }

    for (let i = 0; i < s.length; i += 4) {
      let r = s[i];
      let g = s[i + 1];
      let b = s[i + 2];
      let a = s[i + 3];
      if (a === 0) {
        d[i + 3] = 0;
        continue;
      }

      for (const key of keys) {
        const wKey = keyWeight(r, g, b, key, tolerance, softness);
        if (wKey <= 0) continue;
        const retain = 1 - wKey;
        if (retain < 1e-5) {
          r = 0;
          g = 0;
          b = 0;
          a = 0;
          break;
        }
        r = (r - wKey * key.r) / retain;
        g = (g - wKey * key.g) / retain;
        b = (b - wKey * key.b) / retain;
        r = clamp(r, 0, 255);
        g = clamp(g, 0, 255);
        b = clamp(b, 0, 255);
        a = a * retain;
      }

      d[i] = Math.round(r);
      d[i + 1] = Math.round(g);
      d[i + 2] = Math.round(b);
      d[i + 3] = Math.round(a);
    }

    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").putImageData(out, 0, 0);
    return c;
  }

  function canvasHasAlpha(c) {
    if (!c || !c.width) return false;
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  }

  function sampleCanvasPixel(canvas, x, y) {
    const w = canvas.width;
    const h = canvas.height;
    const xi = clamp(Math.round(x), 0, w - 1);
    const yi = clamp(Math.round(y), 0, h - 1);
    const data = canvas.getContext("2d").getImageData(xi, yi, 1, 1).data;
    return { r: data[0], g: data[1], b: data[2], a: data[3] };
  }

  function moireBlendAmount(strength) {
    return clamp(strength, 0, 100) / 100;
  }

  function blendMoireLayers(src, filtered, strength) {
    const t = moireBlendAmount(strength);
    if (t <= 0) return cloneCanvas(src);

    const w = src.width;
    const h = src.height;
    const srcData = src.getContext("2d").getImageData(0, 0, w, h);
    const filtData = filtered.getContext("2d").getImageData(0, 0, w, h);
    const out = src.getContext("2d").createImageData(w, h);
    const s = srcData.data;
    const f = filtData.data;
    const d = out.data;
    const keep = 1 - t;

    for (let i = 0; i < s.length; i += 4) {
      d[i] = Math.round(s[i] * keep + f[i] * t);
      d[i + 1] = Math.round(s[i + 1] * keep + f[i + 1] * t);
      d[i + 2] = Math.round(s[i + 2] * keep + f[i + 2] * t);
      d[i + 3] = s[i + 3];
    }

    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").putImageData(out, 0, 0);
    return c;
  }

  function bilateralFilterCanvas(src) {
    const w = src.width;
    const h = src.height;
    const srcData = src.getContext("2d").getImageData(0, 0, w, h);
    const s = srcData.data;
    const out = src.getContext("2d").createImageData(w, h);
    const d = out.data;

    const sigmaSpace = 2.5;
    const sigmaRange = 28;
    const radius = Math.min(6, Math.ceil(sigmaSpace * 2));
    const spaceDenom = 2 * sigmaSpace * sigmaSpace;
    const rangeDenom = 2 * sigmaRange * sigmaRange;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ci = (y * w + x) * 4;
        const cR = s[ci];
        const cG = s[ci + 1];
        const cB = s[ci + 2];
        let wR = 0;
        let wG = 0;
        let wB = 0;
        let wSum = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          const yy = clamp(y + dy, 0, h - 1);
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = clamp(x + dx, 0, w - 1);
            const ni = (yy * w + xx) * 4;
            const spatial = Math.exp(-(dx * dx + dy * dy) / spaceDenom);
            const dr = s[ni] - cR;
            const dg = s[ni + 1] - cG;
            const db = s[ni + 2] - cB;
            const range = Math.exp(-(dr * dr + dg * dg + db * db) / rangeDenom);
            const ww = spatial * range;
            wR += s[ni] * ww;
            wG += s[ni + 1] * ww;
            wB += s[ni + 2] * ww;
            wSum += ww;
          }
        }

        if (wSum <= 1e-8) {
          d[ci] = cR;
          d[ci + 1] = cG;
          d[ci + 2] = cB;
        } else {
          d[ci] = Math.round(wR / wSum);
          d[ci + 1] = Math.round(wG / wSum);
          d[ci + 2] = Math.round(wB / wSum);
        }
        d[ci + 3] = s[ci + 3];
      }
    }

    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").putImageData(out, 0, 0);
    return c;
  }

  function downscaleCanvas(src, dstW, dstH) {
    const c = document.createElement("canvas");
    c.width = dstW;
    c.height = dstH;
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = true;
    cx.drawImage(src, 0, 0, src.width, src.height, 0, 0, dstW, dstH);
    return c;
  }

  function upscaleCanvas(src, dstW, dstH) {
    const c = document.createElement("canvas");
    c.width = dstW;
    c.height = dstH;
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = true;
    cx.drawImage(src, 0, 0, src.width, src.height, 0, 0, dstW, dstH);
    return c;
  }

  function moireWorkingSize(srcW, srcH, maxDim) {
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    return {
      scale,
      w: Math.max(8, Math.round(srcW * scale)),
      h: Math.max(8, Math.round(srcH * scale))
    };
  }

  function nextPow2(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
  }

  function fft1d(re, im, inverse) {
    const n = re.length;
    for (let i = 0, j = 0; i < n; i++) {
      if (i < j) {
        const tr = re[i]; re[i] = re[j]; re[j] = tr;
        const ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (inverse ? 2 : -2) * Math.PI / len;
      const wlenRe = Math.cos(ang);
      const wlenIm = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let wr = 1;
        let wi = 0;
        for (let j = 0; j < len / 2; j++) {
          const u = i + j;
          const v = i + j + len / 2;
          const tr = wr * re[v] - wi * im[v];
          const ti = wr * im[v] + wi * re[v];
          re[v] = re[u] - tr;
          im[v] = im[u] - ti;
          re[u] += tr;
          im[u] += ti;
          const nwr = wr * wlenRe - wi * wlenIm;
          wi = wr * wlenIm + wi * wlenRe;
          wr = nwr;
        }
      }
    }
    if (inverse) {
      for (let i = 0; i < n; i++) {
        re[i] /= n;
        im[i] /= n;
      }
    }
  }

  function fft2d(re, im, w, h, inverse) {
    const rowRe = new Float64Array(w);
    const rowIm = new Float64Array(w);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        rowRe[x] = re[y * w + x];
        rowIm[x] = im[y * w + x];
      }
      fft1d(rowRe, rowIm, inverse);
      for (let x = 0; x < w; x++) {
        re[y * w + x] = rowRe[x];
        im[y * w + x] = rowIm[x];
      }
    }
    const colRe = new Float64Array(h);
    const colIm = new Float64Array(h);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        colRe[y] = re[y * w + x];
        colIm[y] = im[y * w + x];
      }
      fft1d(colRe, colIm, inverse);
      for (let y = 0; y < h; y++) {
        re[y * w + x] = colRe[y];
        im[y * w + x] = colIm[y];
      }
    }
  }

  function applyFftNotchMask(re, im, w, h, strength) {
    const t = moireBlendAmount(strength);
    const cx = w / 2;
    const cy = h / 2;
    const excludeR = Math.max(4, Math.min(w, h) * 0.045);
    const mag = new Float64Array(w * h);
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = (x + Math.floor(w / 2)) % w;
        const sy = (y + Math.floor(h / 2)) % h;
        const m = Math.hypot(re[y * w + x], im[y * w + x]);
        mag[sy * w + sx] = m;
        if (Math.hypot(sx - cx, sy - cy) > excludeR) {
          sum += m;
          sumSq += m * m;
          count++;
        }
      }
    }

    const mean = sum / Math.max(count, 1);
    const variance = Math.max(sumSq / Math.max(count, 1) - mean * mean, 1e-6);
    const std = Math.sqrt(variance);
    const threshold = mean + std * (1.4 + t * 2.2);
    const peaks = [];
    const rad = 3;

    for (let sy = rad; sy < h - rad; sy++) {
      for (let sx = rad; sx < w - rad; sx++) {
        if (Math.hypot(sx - cx, sy - cy) <= excludeR) continue;
        const idx = sy * w + sx;
        const v = mag[idx];
        if (v < threshold) continue;
        let isMax = true;
        for (let dy = -rad; dy <= rad && isMax; dy++) {
          for (let dx = -rad; dx <= rad; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (mag[(sy + dy) * w + (sx + dx)] > v) {
              isMax = false;
              break;
            }
          }
        }
        if (isMax) peaks.push({ sx, sy, v });
      }
    }

    peaks.sort((a, b) => b.v - a.v);
    const selected = peaks.slice(0, Math.min(14, Math.floor(4 + t * 10)));
    const notchSigma = 2 + t * 5;
    const minFactor = 1 - t * 0.9;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = (x + Math.floor(w / 2)) % w;
        const sy = (y + Math.floor(h / 2)) % h;
        let factor = 1;
        selected.forEach((pk) => {
          const d2 = (sx - pk.sx) ** 2 + (sy - pk.sy) ** 2;
          const g = Math.exp(-d2 / (2 * notchSigma * notchSigma));
          factor *= 1 - g * (1 - minFactor);
        });
        const i = y * w + x;
        re[i] *= factor;
        im[i] *= factor;
      }
    }
  }

  function fftMoireCanvas(src, strength) {
    const t = moireBlendAmount(strength);
    if (t <= 0) return cloneCanvas(src);

    const srcW = src.width;
    const srcH = src.height;
    const { w: sw, h: sh } = moireWorkingSize(srcW, srcH, 512);
    const pw = nextPow2(sw);
    const ph = nextPow2(sh);

    const small = document.createElement("canvas");
    small.width = pw;
    small.height = ph;
    const sctx = small.getContext("2d");
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(src, 0, 0, srcW, srcH, 0, 0, pw, ph);
    const gray = sctx.getImageData(0, 0, pw, ph).data;

    const n = pw * ph;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      re[i] = gray[j] * 0.299 + gray[j + 1] * 0.587 + gray[j + 2] * 0.114;
    }

    fft2d(re, im, pw, ph, false);
    applyFftNotchMask(re, im, pw, ph, strength);
    fft2d(re, im, pw, ph, true);

    const filteredSmall = document.createElement("canvas");
    filteredSmall.width = pw;
    filteredSmall.height = ph;
    const fData = filteredSmall.getContext("2d").createImageData(pw, ph);
    for (let i = 0; i < n; i++) {
      let yVal = re[i];
      if (!Number.isFinite(yVal)) yVal = 0;
      yVal = clamp(Math.round(yVal), 0, 255);
      const j = i * 4;
      fData.data[j] = yVal;
      fData.data[j + 1] = yVal;
      fData.data[j + 2] = yVal;
      fData.data[j + 3] = 255;
    }
    filteredSmall.getContext("2d").putImageData(fData, 0, 0);

    const filteredFull = upscaleCanvas(filteredSmall, srcW, srcH);
    const srcData = src.getContext("2d").getImageData(0, 0, srcW, srcH);
    const filtData = filteredFull.getContext("2d").getImageData(0, 0, srcW, srcH);
    const ratioFiltered = document.createElement("canvas");
    ratioFiltered.width = srcW;
    ratioFiltered.height = srcH;
    const out = ratioFiltered.getContext("2d").createImageData(srcW, srcH);
    const s = srcData.data;
    const f = filtData.data;
    const d = out.data;

    for (let i = 0; i < s.length; i += 4) {
      const fy = f[i] * 0.299 + f[i + 1] * 0.587 + f[i + 2] * 0.114;
      const sy = s[i] * 0.299 + s[i + 1] * 0.587 + s[i + 2] * 0.114;
      let ratio = 1;
      if (sy > 4 && fy > 1) ratio = fy / sy;
      ratio = clamp(ratio, 0.35, 2.5);
      d[i] = clamp(Math.round(s[i] * ratio), 0, 255);
      d[i + 1] = clamp(Math.round(s[i + 1] * ratio), 0, 255);
      d[i + 2] = clamp(Math.round(s[i + 2] * ratio), 0, 255);
      d[i + 3] = s[i + 3];
    }
    ratioFiltered.getContext("2d").putImageData(out, 0, 0);
    return blendMoireLayers(src, ratioFiltered, strength);
  }

  function bilateralMoireCanvas(src, strength) {
    const t = moireBlendAmount(strength);
    if (t <= 0) return cloneCanvas(src);

    const srcW = src.width;
    const srcH = src.height;
    const { w: sw, h: sh, scale } = moireWorkingSize(srcW, srcH, 640);
    let filtered;
    if (scale < 1) {
      const small = downscaleCanvas(src, sw, sh);
      filtered = upscaleCanvas(bilateralFilterCanvas(small), srcW, srcH);
    } else {
      filtered = bilateralFilterCanvas(src);
    }
    return blendMoireLayers(src, filtered, strength);
  }

  function applyMoireReduction(src, edit) {
    const strength = edit.moireStrength || 0;
    if (strength <= 0) return src;
    if (edit.moireMethod === "fft") return fftMoireCanvas(src, strength);
    return bilateralMoireCanvas(src, strength);
  }

  function warpLensCanvas(src, edit) {
    const w = src.width;
    const h = src.height;
    const k = lensKFromSlider(edit.lensK);
    const center = edit.lensCenter || defaultLensCenter(w, h);
    if (!k) return cloneCanvas(src);

    const srcCtx = src.getContext("2d");
    const srcData = srcCtx.getImageData(0, 0, w, h);
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const outData = out.getContext("2d").createImageData(w, h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcPt = invertLensPoint({ x, y }, center, k, w, h);
        const rgba = sampleBilinear(srcData.data, w, h, srcPt.x, srcPt.y);
        const i = (y * w + x) * 4;
        outData.data[i] = rgba[0];
        outData.data[i + 1] = rgba[1];
        outData.data[i + 2] = rgba[2];
        outData.data[i + 3] = rgba[3] !== undefined ? Math.round(rgba[3]) : 255;
      }
    }
    out.getContext("2d").putImageData(outData, 0, 0);
    return out;
  }

  function quadBezier(p0, p1, p2, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
    };
  }

  function coonsPatch(corners, u, v) {
    const { tl, tr, br, bl, tm, rm, bm, lm } = corners;
    const top = quadBezier(tl, tm, tr, u);
    const bot = quadBezier(bl, bm, br, u);
    const left = quadBezier(tl, lm, bl, v);
    const right = quadBezier(tr, rm, br, v);
    return {
      x: (1 - v) * top.x + v * bot.x + (1 - u) * left.x + u * right.x
        - ((1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + u * v * br.x + (1 - u) * v * bl.x),
      y: (1 - v) * top.y + v * bot.y + (1 - u) * left.y + u * right.y
        - ((1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + u * v * br.y + (1 - u) * v * bl.y)
    };
  }

  function invertCoonsPatch(corners, target, iterations = 24, clampUV = true) {
    const box = bboxOfPoints([corners.tl, corners.tr, corners.br, corners.bl]);
    let u = box.w > 0 ? clamp((target.x - box.minX) / box.w, 0, 1) : 0.5;
    let v = box.h > 0 ? clamp((target.y - box.minY) / box.h, 0, 1) : 0.5;
    for (let i = 0; i < iterations; i++) {
      const p = coonsPatch(corners, u, v);
      const du = 0.001;
      const dv = 0.001;
      const pu = coonsPatch(corners, clampUV ? clamp(u + du, 0, 1) : u + du, v);
      const pv = coonsPatch(corners, u, clampUV ? clamp(v + dv, 0, 1) : v + dv);
      const dxdu = (pu.x - p.x) / du;
      const dxdv = (pv.x - p.x) / dv;
      const dydu = (pu.y - p.y) / du;
      const dydv = (pv.y - p.y) / dv;
      const det = dxdu * dydv - dxdv * dydu;
      if (Math.abs(det) < 1e-14) break;
      const rx = target.x - p.x;
      const ry = target.y - p.y;
      const duStep = (dydv * rx - dxdv * ry) / det;
      const dvStep = (-dydu * rx + dxdu * ry) / det;
      u = clampUV ? clamp(u + duStep, 0, 1) : u + duStep;
      v = clampUV ? clamp(v + dvStep, 0, 1) : v + dvStep;
    }
    return {
      u: clampUV ? clamp(u, 0, 1) : u,
      v: clampUV ? clamp(v, 0, 1) : v
    };
  }

  function sourceToRectified(corners, srcPt, maxU, maxV) {
    const uv = invertCoonsPatch(corners, srcPt, 24, false);
    return { x: uv.u * maxU, y: uv.v * maxV };
  }

  function computePerspectiveOutputLayout(corners, srcW, srcH, edit) {
    const { maxU, maxV } = computeRectifiedAxes(corners, edit);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    function addSourcePoint(srcPt) {
      const rect = sourceToRectified(corners, srcPt, maxU, maxV);
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x);
      maxY = Math.max(maxY, rect.y);
    }

    const step = Math.max(1, Math.round(Math.max(srcW, srcH) / 256));
    for (let x = 0; x < srcW; x += step) {
      addSourcePoint({ x, y: 0 });
      addSourcePoint({ x, y: srcH - 1 });
    }
    for (let y = 0; y < srcH; y += step) {
      addSourcePoint({ x: 0, y });
      addSourcePoint({ x: srcW - 1, y });
    }
    addSourcePoint({ x: 0, y: 0 });
    addSourcePoint({ x: srcW - 1, y: 0 });
    addSourcePoint({ x: srcW - 1, y: srcH - 1 });
    addSourcePoint({ x: 0, y: srcH - 1 });

    const padLeft = Math.max(0, Math.ceil(-minX));
    const padTop = Math.max(0, Math.ceil(-minY));
    const outW = Math.max(srcW, Math.ceil(maxX + padLeft) + 1);
    const outH = Math.max(srcH, Math.ceil(maxY + padTop) + 1);

    return { padLeft, padTop, outW, outH, maxU, maxV };
  }

  function warpPerspectiveFullImage(src, corners, edit) {
    const srcW = src.width;
    const srcH = src.height;
    const layout = computePerspectiveOutputLayout(corners, srcW, srcH, edit);
    const { padLeft, padTop, outW, outH, maxU, maxV } = layout;
    const srcCtx = src.getContext("2d");
    const srcData = srcCtx.getImageData(0, 0, srcW, srcH);
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const outData = out.getContext("2d").createImageData(outW, outH);

    for (let oy = 0; oy < outH; oy++) {
      const ry = oy - padTop;
      const v = ry / maxV;
      for (let ox = 0; ox < outW; ox++) {
        const rx = ox - padLeft;
        const u = rx / maxU;
        const srcPt = coonsPatch(corners, u, v);
        const rgba = sampleBilinear(srcData.data, srcW, srcH, srcPt.x, srcPt.y);
        const i = (oy * outW + ox) * 4;
        outData.data[i] = rgba[0];
        outData.data[i + 1] = rgba[1];
        outData.data[i + 2] = rgba[2];
        outData.data[i + 3] = rgba[3] !== undefined ? Math.round(rgba[3]) : 255;
      }
    }
    out.getContext("2d").putImageData(outData, 0, 0);
    return { canvas: out, outW, outH, padLeft, padTop, maxU, maxV };
  }

  function warpPerspectiveCanvas(src, corners) {
    const srcW = src.width;
    const srcH = src.height;
    const topW = dist(corners.tl, corners.tr);
    const botW = dist(corners.bl, corners.br);
    const leftH = dist(corners.tl, corners.bl);
    const rightH = dist(corners.tr, corners.br);
    const outW = Math.max(1, Math.round(Math.max(topW, botW)));
    const outH = Math.max(1, Math.round(Math.max(leftH, rightH)));

    const srcPts = [corners.tl, corners.tr, corners.br, corners.bl];
    const dstPts = [
      { x: 0, y: 0 },
      { x: outW - 1, y: 0 },
      { x: outW - 1, y: outH - 1 },
      { x: 0, y: outH - 1 }
    ];
    const H = homographyFrom4(srcPts, dstPts);
    if (!H) return { canvas: cloneCanvas(src), H: null, invH: null, outW: srcW, outH: srcH };
    const invH = invertHomography(H);

    const srcCtx = src.getContext("2d");
    const srcData = srcCtx.getImageData(0, 0, srcW, srcH);
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const outData = out.getContext("2d").createImageData(outW, outH);

    for (let v = 0; v < outH; v++) {
      for (let u = 0; u < outW; u++) {
        const srcPt = applyHomography(invH, { x: u, y: v });
        const rgba = srcPt
          ? sampleBilinear(srcData.data, srcW, srcH, srcPt.x, srcPt.y)
          : [0, 0, 0, 0];
        const i = (v * outW + u) * 4;
        outData.data[i] = rgba[0];
        outData.data[i + 1] = rgba[1];
        outData.data[i + 2] = rgba[2];
        outData.data[i + 3] = rgba[3] !== undefined ? Math.round(rgba[3]) : 255;
      }
    }
    out.getContext("2d").putImageData(outData, 0, 0);
    return { canvas: out, H, invH, outW, outH };
  }

  function warpAffineCanvas(src, M) {
    const w = src.width;
    const h = src.height;
    const corners = [
      { x: 0, y: 0 },
      { x: w - 1, y: 0 },
      { x: w - 1, y: h - 1 },
      { x: 0, y: h - 1 }
    ].map((p) => applyAffine(M, p));
    const box = bboxOfPoints(corners);
    const outW = Math.max(1, Math.ceil(box.w) + 1);
    const outH = Math.max(1, Math.ceil(box.h) + 1);
    const shiftM = [M[0], M[1], M[2] - box.minX, M[3], M[4], M[5] - box.minY];
    const invM = invertAffine(shiftM);

    const srcCtx = src.getContext("2d");
    const srcData = srcCtx.getImageData(0, 0, w, h);
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const outData = out.getContext("2d").createImageData(outW, outH);

    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const srcPt = applyAffine(invM, { x, y });
        const rgba = sampleBilinear(srcData.data, w, h, srcPt.x, srcPt.y);
        const i = (y * outW + x) * 4;
        outData.data[i] = rgba[0];
        outData.data[i + 1] = rgba[1];
        outData.data[i + 2] = rgba[2];
        outData.data[i + 3] = rgba[3] !== undefined ? Math.round(rgba[3]) : 255;
      }
    }
    out.getContext("2d").putImageData(outData, 0, 0);
    return { canvas: out, shiftM, invShiftM: invM, offset: { x: box.minX, y: box.minY } };
  }

  function applyCropCanvas(src, crop) {
    if (!crop) return { canvas: cloneCanvas(src), crop: null };
    const x = clamp(Math.round(crop.x), 0, src.width - 1);
    const y = clamp(Math.round(crop.y), 0, src.height - 1);
    const w = clamp(Math.round(crop.w), 1, src.width - x);
    const h = clamp(Math.round(crop.h), 1, src.height - y);
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d").drawImage(src, x, y, w, h, 0, 0, w, h);
    return { canvas: out, crop: { x, y, w, h } };
  }

  function isIdentityPerspective(corners, w, h) {
    const d = defaultCorners(w, h);
    return PERSP_HANDLE_KEYS.every((k) => dist(corners[k], d[k]) < 0.5);
  }

  function lensWarpCorners(corners, center, k, srcW, srcH) {
    const out = {};
    PERSP_HANDLE_KEYS.forEach((key) => {
      out[key] = applyLensToPoint(corners[key], center, k, srcW, srcH);
    });
    return out;
  }

  function buildPreviewPipeline(src, edit, opts = {}) {
    const srcW = src.width;
    const srcH = src.height;
    const center = edit.lensCenter || defaultLensCenter(srcW, srcH);
    const k = lensKFromSlider(edit.lensK);

    const lensCanvas = warpLensCanvas(src, edit);
    const corners = getEffectiveCorners(edit, srcW, srcH);
    const lensCorners = lensWarpCorners(corners, center, k, srcW, srcH);

    let perspCanvas = lensCanvas;
    let perspW = srcW;
    let perspH = srcH;
    let perspPad = { x: 0, y: 0 };
    let perspMax = { u: Math.max(srcW - 1, 1), v: Math.max(srcH - 1, 1) };
    const activePersp = hasActivePerspective(edit, srcW, srcH);
    const activeCrop = hasActiveCrop(edit, src);
    const usePersp = opts.applyPerspective === true && activePersp && !activeCrop;
    if (usePersp) {
      const warped = warpPerspectiveFullImage(lensCanvas, lensCorners, edit);
      perspCanvas = warped.canvas;
      perspW = warped.outW;
      perspH = warped.outH;
      perspPad = { x: warped.padLeft, y: warped.padTop };
      perspMax = { u: warped.maxU, v: warped.maxV };
    }

    const M = buildAffineMatrix(edit, perspW, perspH, { skipStretch: usePersp });
    const hasAffine = edit.rotationDeg !== 0 || edit.skewXDeg !== 0 || edit.skewYDeg !== 0
      || (!usePersp && hasNonDefaultStretch(edit));
    let affineCanvas = perspCanvas;
    let affineMeta = null;
    if (hasAffine) {
      affineMeta = warpAffineCanvas(perspCanvas, M);
      affineCanvas = affineMeta.canvas;
    }

    const moireCanvas = applyMoireReduction(affineCanvas, edit);

    const cropRect = activeCrop && !activePersp ? edit.crop : null;
    const tolerance = Number(edit.transparencyTolerance);
    const softness = Number(edit.transparencySoftness);
    const keyedCanvas = isTransparencyActive(edit)
      ? applyTransparencyKeys(
        moireCanvas,
        edit.transparencyKeys,
        Number.isFinite(tolerance) ? tolerance : 24,
        Number.isFinite(softness) ? softness : 32
      )
      : moireCanvas;
    const cropped = applyCropCanvas(keyedCanvas, cropRect);

    function mapSourceToDisplay(p) {
      let pt = copyPoint(p);
      pt = applyLensToPoint(pt, center, k, srcW, srcH);
      if (usePersp) {
        const rect = sourceToRectified(lensCorners, pt, perspMax.u, perspMax.v);
        pt = { x: rect.x + perspPad.x, y: rect.y + perspPad.y };
      }
      if (hasAffine && affineMeta) {
        pt = applyAffine(affineMeta.shiftM, pt);
      }
      return pt;
    }

    function mapSourceToFinal(p) {
      const pt = mapSourceToDisplay(p);
      if (!pt) return null;
      if (cropped.crop) {
        pt.x -= cropped.crop.x;
        pt.y -= cropped.crop.y;
        if (pt.x < 0 || pt.y < 0 || pt.x >= cropped.canvas.width || pt.y >= cropped.canvas.height) return null;
      }
      return pt;
    }

    function mapDisplayToSource(p) {
      let pt = copyPoint(p);
      if (hasAffine && affineMeta) {
        pt = applyAffine(affineMeta.invShiftM, pt);
      }
      if (usePersp) {
        const rx = pt.x - perspPad.x;
        const ry = pt.y - perspPad.y;
        const u = perspMax.u > 0 ? rx / perspMax.u : 0;
        const v = perspMax.v > 0 ? ry / perspMax.v : 0;
        pt = coonsPatch(lensCorners, u, v);
      }
      pt = invertLensPoint(pt, center, k, srcW, srcH);
      return pt;
    }

    return {
      canvas: keyedCanvas,
      preChromaCanvas: moireCanvas,
      finalCanvas: cropped.canvas,
      crop: cropped.crop,
      mapSourceToDisplay,
      mapSourceToFinal,
      mapDisplayToSource,
      srcW,
      srcH
    };
  }

  function cropCanvasSize(state) {
    if (previewCanvas) {
      return { w: previewCanvas.width, h: previewCanvas.height };
    }
    if (state.image) {
      return { w: state.image.width, h: state.image.height };
    }
    return { w: 0, h: 0 };
  }

  function cropIsEffective(crop, w, h) {
    if (!crop || w <= 0 || h <= 0) return false;
    return crop.x > 0.5 || crop.y > 0.5 || crop.w < w - 0.5 || crop.h < h - 0.5;
  }

  function hasPendingEdits(edit, src) {
    if (!edit || !src) return false;
    if (edit.rotationDeg !== 0 || edit.skewXDeg !== 0 || edit.skewYDeg !== 0) return true;
    if (hasNonDefaultStretch(edit)) return true;
    if (edit.lensK !== 0) return true;
    if ((edit.moireStrength || 0) > 0) return true;
    if (hasActiveCrop(edit, src)) return true;
    if (hasActivePerspective(edit, src.width, src.height)) return true;
    if (edit.lensCenter) {
      const c = defaultLensCenter(src.width, src.height);
      if (dist(edit.lensCenter, c) > 0.5) return true;
    }
    if (edit.transparencyEnabled && edit.transparencyKeys && edit.transparencyKeys.length) return true;
    return false;
  }

  function identityPreviewMeta(src) {
    return {
      canvas: src,
      preChromaCanvas: src,
      finalCanvas: src,
      crop: null,
      mapSourceToDisplay: (p) => copyPoint(p),
      mapSourceToFinal: (p) => copyPoint(p),
      mapDisplayToSource: (p) => copyPoint(p),
      srcW: src.width,
      srcH: src.height
    };
  }

  function ensurePreview(force, opts = {}) {
    const state = hooks.getState();
    if (!state.image) {
      previewCanvas = null;
      previewMeta = null;
      return null;
    }
    const edit = state.edit;
    if (
      !force
      && !previewDirty
      && previewCanvas
      && !opts.applyPerspective
      && !isTransparencyActive(edit)
    ) {
      return previewCanvas;
    }

    const needsPreview = hasPendingEdits(edit, state.image)
      || isTransparencyActive(edit)
      || opts.applyPerspective;
    if (!needsPreview) {
      previewDirty = false;
      previewCanvas = state.image;
      previewMeta = identityPreviewMeta(state.image);
      return previewCanvas;
    }

    previewDirty = false;
    const pipeline = buildPreviewPipeline(state.image, edit, opts);
    previewCanvas = pipeline.canvas;
    previewMeta = pipeline;
    syncCropFieldsFromEdit(state);
    renderTransparencyKeyList(state);
    updateReadout(state);
    updateCanvasWrapAlpha();
    return previewCanvas;
  }

  function markPreviewDirty() {
    previewDirty = true;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = null;
      if (hooks && hooks.getState().activeTab === "edit") hooks.refreshAll();
    }, 40);
  }

  function syncCropFieldsFromEdit(state) {
    if (!previewMeta || !previewMeta.canvas) return;
    const pw = previewMeta.canvas.width;
    const ph = previewMeta.canvas.height;
    const crop = state.edit.crop;
    if (!crop) {
      if (els.cropX) els.cropX.value = 0;
      if (els.cropY) els.cropY.value = 0;
      if (els.cropW) els.cropW.value = pw;
      if (els.cropH) els.cropH.value = ph;
      return;
    }
    if (els.cropX) els.cropX.value = Math.round(crop.x);
    if (els.cropY) els.cropY.value = Math.round(crop.y);
    if (els.cropW) els.cropW.value = Math.round(crop.w);
    if (els.cropH) els.cropH.value = Math.round(crop.h);
  }

  function syncCropFromFields(state) {
    const pw = previewMeta && previewMeta.canvas ? previewMeta.canvas.width : state.image.width;
    const ph = previewMeta && previewMeta.canvas ? previewMeta.canvas.height : state.image.height;
    const x = Number(els.cropX.value);
    const y = Number(els.cropY.value);
    const w = Number(els.cropW.value);
    const h = Number(els.cropH.value);
    if (![x, y, w, h].every(Number.isFinite)) return;
    if (w <= 0 || h <= 0) {
      state.edit.crop = null;
      state.edit.cropAwaitingDraw = true;
      return;
    }
    clearPerspective(state);
    state.edit.crop = {
      x: clamp(x, 0, pw - 1),
      y: clamp(y, 0, ph - 1),
      w: clamp(w, 1, pw - x),
      h: clamp(h, 1, ph - y)
    };
    state.edit.cropAwaitingDraw = false;
  }

  function updateReadout(state) {
    if (!els.readout) return;
    if (!state.image) {
      els.readout.textContent = "No pending edits.";
      return;
    }
    if (!hasPendingEdits(state.edit, state.image)) {
      els.readout.textContent = "No pending edits.";
      return;
    }
    const pw = previewMeta && previewMeta.finalCanvas ? previewMeta.finalCanvas.width : (previewCanvas ? previewCanvas.width : 0);
    const ph = previewMeta && previewMeta.finalCanvas ? previewMeta.finalCanvas.height : (previewCanvas ? previewCanvas.height : 0);
    const keyNote = isTransparencyActive(state.edit)
      ? ` · ${state.edit.transparencyKeys.length} background color${state.edit.transparencyKeys.length === 1 ? "" : "s"}`
      : "";
    els.readout.textContent = `Preview: ${pw} × ${ph} px${keyNote} — click Apply to bake into the working image.`;
  }

  function parseInputNumber(raw) {
    const trimmed = String(raw).trim();
    if (
      trimmed === ""
      || trimmed === "-"
      || trimmed === "+"
      || trimmed.endsWith(".")
      || /[eE][+-]?$/.test(trimmed)
    ) {
      return null;
    }
    const v = Number(trimmed);
    return Number.isFinite(v) ? v : null;
  }

  function syncParamsFromInputs(state, opts = {}) {
    const fromRange = opts.fromRange === true;
    PARAM_SPECS.forEach((spec) => {
      const numEl = els[spec.key];
      if (!numEl) return;
      const v = fromRange && els[spec.key + "Range"]
        ? Number(els[spec.key + "Range"].value)
        : parseInputNumber(numEl.value);
      if (v === null) return;
      const clamped = clamp(v, spec.min, spec.max);
      state.edit[spec.key] = clamped;
      if (els[spec.key + "Range"]) els[spec.key + "Range"].value = String(clamped);
      numEl.value = String(clamped);
    });
    BG_PARAM_SPECS.forEach((spec) => {
      const numEl = els[spec.key];
      if (!numEl) return;
      const v = fromRange && els[spec.key + "Range"]
        ? Number(els[spec.key + "Range"].value)
        : parseInputNumber(numEl.value);
      if (v === null) return;
      const clamped = clamp(v, spec.min, spec.max);
      state.edit[spec.key] = clamped;
      if (els[spec.key + "Range"]) els[spec.key + "Range"].value = String(clamped);
      numEl.value = String(clamped);
    });
    syncMoireMethodFromInputs(state);
  }

  function syncMoireMethodFromInputs(state) {
    const selected = document.querySelector('input[name="dig-edit-moire-method"]:checked');
    if (selected && (selected.value === "bilateral" || selected.value === "fft")) {
      state.edit.moireMethod = selected.value;
    }
  }

  function syncMoireMethodToInputs(state) {
    const method = state.edit.moireMethod || "bilateral";
    document.querySelectorAll('input[name="dig-edit-moire-method"]').forEach((el) => {
      el.checked = el.value === method;
    });
  }

  function syncInputsFromParams(state) {
    PARAM_SPECS.forEach((spec) => {
      const v = state.edit[spec.key];
      if (els[spec.key]) els[spec.key].value = String(v);
      if (els[spec.key + "Range"]) els[spec.key + "Range"].value = String(v);
    });
    BG_PARAM_SPECS.forEach((spec) => {
      const v = state.edit[spec.key];
      if (els[spec.key]) els[spec.key].value = String(v);
      if (els[spec.key + "Range"]) els[spec.key + "Range"].value = String(v);
    });
    syncMoireMethodToInputs(state);
    if (els.transparencyEnabled) {
      els.transparencyEnabled.checked = !!state.edit.transparencyEnabled;
    }
    if (els.transparencyPreviewBgEnabled) {
      els.transparencyPreviewBgEnabled.checked = !!state.edit.transparencyPreviewBgEnabled;
    }
    const previewBg = state.edit.transparencyPreviewBgColor || { r: 255, g: 255, b: 255 };
    const previewBgHex = rgbToHex(previewBg.r, previewBg.g, previewBg.b);
    if (els.transparencyPreviewBgColor) els.transparencyPreviewBgColor.value = previewBgHex;
    if (els.transparencyPreviewBgHex) els.transparencyPreviewBgHex.value = previewBgHex;
  }

  function getAlphaPreviewBackgroundFill(state) {
    if (!state || !state.edit || !state.edit.transparencyPreviewBgEnabled) return null;
    const c = state.edit.transparencyPreviewBgColor || { r: 255, g: 255, b: 255 };
    return rgbToHex(c.r, c.g, c.b);
  }

  function syncPreviewBgFromInputs(state) {
    if (els.transparencyPreviewBgEnabled) {
      state.edit.transparencyPreviewBgEnabled = els.transparencyPreviewBgEnabled.checked;
    }
    const rgb = parseColorInput(els.transparencyPreviewBgHex && els.transparencyPreviewBgHex.value)
      || (els.transparencyPreviewBgColor ? parseColorInput(els.transparencyPreviewBgColor.value) : null);
    if (rgb) {
      state.edit.transparencyPreviewBgColor = { r: rgb.r, g: rgb.g, b: rgb.b };
      if (els.transparencyPreviewBgColor) els.transparencyPreviewBgColor.value = rgbToHex(rgb.r, rgb.g, rgb.b);
      if (els.transparencyPreviewBgHex) els.transparencyPreviewBgHex.value = rgbToHex(rgb.r, rgb.g, rgb.b);
    }
  }

  function setColorPickerInputs(rgb) {
    if (!rgb) return;
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    if (els.bgColor) els.bgColor.value = hex;
    if (els.bgHex) els.bgHex.value = hex;
  }

  function keyAlreadyListed(state, rgb) {
    return state.edit.transparencyKeys.some(
      (k) => colorDistance(rgb.r, rgb.g, rgb.b, k) < 4
    );
  }

  function addTransparencyKey(state, rgb) {
    if (!rgb) return false;
    if (keyAlreadyListed(state, rgb)) {
      hooks.flashStatus("That color is already in the removal list.");
      return false;
    }
    state.edit.transparencyKeys.push({ r: rgb.r, g: rgb.g, b: rgb.b });
    if (!state.edit.transparencyEnabled) {
      state.edit.transparencyEnabled = true;
      if (els.transparencyEnabled) els.transparencyEnabled.checked = true;
    }
    setColorPickerInputs(rgb);
    renderTransparencyKeyList(state);
    markPreviewDirty();
    return true;
  }

  function removeTransparencyKey(state, index) {
    if (index < 0 || index >= state.edit.transparencyKeys.length) return;
    state.edit.transparencyKeys.splice(index, 1);
    renderTransparencyKeyList(state);
    markPreviewDirty();
  }

  function renderTransparencyKeyList(state) {
    if (!els.bgKeyList) return;
    els.bgKeyList.innerHTML = "";
    state.edit.transparencyKeys.forEach((key, idx) => {
      const li = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = "digitizer-edit-key-swatch";
      swatch.style.background = rgbToHex(key.r, key.g, key.b);
      const label = document.createElement("span");
      label.className = "digitizer-edit-key-label";
      label.textContent = rgbToHex(key.r, key.g, key.b);
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "tool-inline-button";
      removeBtn.textContent = "remove";
      removeBtn.addEventListener("click", () => {
        removeTransparencyKey(state, idx);
        hooks.refreshAll();
      });
      li.appendChild(swatch);
      li.appendChild(label);
      li.appendChild(removeBtn);
      els.bgKeyList.appendChild(li);
    });
  }

  function updateCanvasWrapAlpha() {
    const state = hooks.getState();
    const wrap = document.getElementById("dig-canvas-wrap");
    if (!wrap) return;
    let showAlpha = false;
    if (state.image && canvasHasAlpha(state.image)) showAlpha = true;
    if (state.activeTab === "edit" && isTransparencyActive(state.edit)) showAlpha = true;
    else if (shouldShowTransparencyPreview(state)) showAlpha = true;
    wrap.classList.toggle("has-alpha", showAlpha);
  }

  function getExportCanvas() {
    const state = hooks.getState();
    if (!state.image) return null;
    ensurePreview(true);
    if (state.activeTab === "edit" && (hasPendingEdits(state.edit, state.image) || isTransparencyActive(state.edit))) {
      return (previewMeta && previewMeta.finalCanvas) || previewCanvas || state.image;
    }
    if (canvasHasAlpha(state.image)) return state.image;
    return state.image;
  }

  function resetEditState(state, keepCorners) {
    state.edit = defaultEditState();
    if (state.image) {
      state.edit.lensCenter = defaultLensCenter(state.image.width, state.image.height);
      if (keepCorners) {
        state.edit.corners = defaultCorners(state.image.width, state.image.height);
        state.edit.customCorners = false;
      }
    }
    state.editDrag = null;
    syncInputsFromParams(state);
    markPreviewDirty();
  }

  function initCorners(state) {
    if (!state.image) return;
    state.edit.corners = null;
    state.edit.customCorners = false;
    state.edit.lensCenter = defaultLensCenter(state.image.width, state.image.height);
  }

  function mapPerspHandleToDisplay(corners, mapFn) {
    const out = {};
    PERSP_HANDLE_KEYS.forEach((key) => {
      out[key] = mapFn(corners[key]);
    });
    return out;
  }

  function isPerspNewDrag(state) {
    return !!(state.editDrag && state.editDrag.kind === "persp" && state.editDrag.handle === "new");
  }

  function getPerspDisplayOverlay(state) {
    if (!state.image || !previewMeta) return null;
    const srcW = state.image.width;
    const srcH = state.image.height;

    if (isPerspNewDrag(state)) {
      const start = state.editDrag.startPt;
      const cur = state.cursor;
      if (!start || !cur) return null;
      const x1 = Math.min(start.x, cur.x);
      const y1 = Math.min(start.y, cur.y);
      const x2 = Math.max(start.x, cur.x);
      const y2 = Math.max(start.y, cur.y);
      const tl = { x: x1, y: y1 };
      const tr = { x: x2, y: y1 };
      const br = { x: x2, y: y2 };
      const bl = { x: x1, y: y2 };
      return {
        tl,
        tr,
        br,
        bl,
        tm: midpoint(tl, tr),
        rm: midpoint(tr, br),
        bm: midpoint(bl, br),
        lm: midpoint(tl, bl)
      };
    }

    if (!state.edit.customCorners || !state.edit.corners) return null;
    if (!shouldDrawPerspectiveOverlay(state.edit, state, srcW, srcH)) return null;
    const corners = getEffectiveCorners(state.edit, srcW, srcH);
    return mapPerspHandleToDisplay(corners, (p) => previewMeta.mapSourceToDisplay(p));
  }

  function strokePerspQuad(ctx, dp, scale) {
    if (!dp.tl || !dp.tr || !dp.br || !dp.bl) return;
    const s = scale || 1;
    ctx.save();
    ctx.strokeStyle = "rgba(46, 140, 95, 0.85)";
    ctx.lineWidth = 1.5 * s;
    ctx.setLineDash([6 * s, 4 * s]);
    ctx.beginPath();
    ctx.moveTo(dp.tl.x, dp.tl.y);
    if (dp.tm) ctx.quadraticCurveTo(dp.tm.x, dp.tm.y, dp.tr.x, dp.tr.y);
    else ctx.lineTo(dp.tr.x, dp.tr.y);
    if (dp.rm) ctx.quadraticCurveTo(dp.rm.x, dp.rm.y, dp.br.x, dp.br.y);
    else ctx.lineTo(dp.br.x, dp.br.y);
    if (dp.bm) ctx.quadraticCurveTo(dp.bm.x, dp.bm.y, dp.bl.x, dp.bl.y);
    else ctx.lineTo(dp.bl.x, dp.bl.y);
    if (dp.lm) ctx.quadraticCurveTo(dp.lm.x, dp.lm.y, dp.tl.x, dp.tl.y);
    else ctx.lineTo(dp.tl.x, dp.tl.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function shouldDrawPerspectiveOverlay(edit, state, srcW, srcH) {
    if (hasActiveCrop(edit, { width: srcW, height: srcH })) return false;
    if (isPerspNewDrag(state)) return state.mode === "edit-persp";
    if (!edit.customCorners || !edit.corners) return false;
    if (state.mode === "edit-persp") return true;
    return hasActivePerspective(edit, srcW, srcH);
  }

  function shouldDrawLensCenter(edit, state, srcW, srcH) {
    if (edit.lensK !== 0) return true;
    if (state.mode === "edit-lens-center") return true;
    if (!edit.lensCenter) return false;
    const c = defaultLensCenter(srcW, srcH);
    return dist(edit.lensCenter, c) > 0.5;
  }

  function drawOverlays(ctx, scale) {
    const state = hooks.getState();
    if (!state.image || state.activeTab !== "edit" || !previewMeta) return;

    const s = scale;
    const edit = state.edit;
    const srcW = state.image.width;
    const srcH = state.image.height;

    const dp = getPerspDisplayOverlay(state);
    if (dp) {
      strokePerspQuad(ctx, dp, s);

      const activeHandle = (state.editDrag && state.editDrag.kind === "persp" && state.editDrag.handle !== "new")
        ? state.editDrag.handle
        : (state.selected && state.selected.type === "persp" ? state.selected.key : null);
      ctx.save();
      PERSP_HANDLE_KEYS.forEach((key) => {
        const p = dp[key];
        if (!p) return;
        const isCorner = CORNER_KEYS.includes(key);
        if (activeHandle === key) {
          ctx.strokeStyle = "#f1c054";
          ctx.lineWidth = 2.5 * s;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9 * s, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = isCorner ? "#2a8c5f" : "#3a7ca5";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isCorner ? 5 * s : 4.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }

    if (shouldDrawLensCenter(edit, state, srcW, srcH) && edit.lensCenter) {
      const p = previewMeta.mapSourceToDisplay(edit.lensCenter);
      if (p) drawHandle(ctx, p, "#a25d12", "C", s, state.mode === "edit-lens-center");
    }

    if (edit.crop && previewCanvas && !hasActivePerspective(edit, srcW, srcH)) {
      const crop = edit.crop;
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(0, 0, previewCanvas.width, crop.y);
      ctx.fillRect(0, crop.y, crop.x, crop.h);
      ctx.fillRect(crop.x + crop.w, crop.y, previewCanvas.width - crop.x - crop.w, crop.h);
      ctx.fillRect(0, crop.y + crop.h, previewCanvas.width, previewCanvas.height - crop.y - crop.h);
      ctx.strokeStyle = "#f1c054";
      ctx.lineWidth = 2 * s;
      ctx.setLineDash([]);
      ctx.strokeRect(crop.x + 0.5, crop.y + 0.5, crop.w - 1, crop.h - 1);

      if (state.mode === "edit-crop") {
        const handles = [
          { id: "nw", x: crop.x, y: crop.y },
          { id: "ne", x: crop.x + crop.w, y: crop.y },
          { id: "se", x: crop.x + crop.w, y: crop.y + crop.h },
          { id: "sw", x: crop.x, y: crop.y + crop.h },
          { id: "n", x: crop.x + crop.w / 2, y: crop.y },
          { id: "s", x: crop.x + crop.w / 2, y: crop.y + crop.h },
          { id: "e", x: crop.x + crop.w, y: crop.y + crop.h / 2 },
          { id: "w", x: crop.x, y: crop.y + crop.h / 2 }
        ];
        handles.forEach((h) => {
          ctx.fillStyle = "#f1c054";
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5 * s;
          ctx.beginPath();
          ctx.arc(h.x, h.y, 5 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
      ctx.restore();
    }
  }

  function drawHandle(ctx, p, color, label, s, active) {
    const r = 7 * s;
    if (active) {
      ctx.save();
      ctx.strokeStyle = "#f1c054";
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (label) {
      ctx.font = `bold ${11 * s}px system-ui, sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, p.x, p.y);
    }
    ctx.restore();
  }

  function findCropHandle(p, crop) {
    if (!crop) return null;
    const tol = 10;
    const handles = [
      { id: "nw", x: crop.x, y: crop.y },
      { id: "ne", x: crop.x + crop.w, y: crop.y },
      { id: "se", x: crop.x + crop.w, y: crop.y + crop.h },
      { id: "sw", x: crop.x, y: crop.y + crop.h },
      { id: "n", x: crop.x + crop.w / 2, y: crop.y },
      { id: "s", x: crop.x + crop.w / 2, y: crop.y + crop.h },
      { id: "e", x: crop.x + crop.w, y: crop.y + crop.h / 2 },
      { id: "w", x: crop.x, y: crop.y + crop.h / 2 }
    ];
    for (const h of handles) {
      if (Math.hypot(p.x - h.x, p.y - h.y) <= tol) return h.id;
    }
    if (p.x >= crop.x && p.x <= crop.x + crop.w && p.y >= crop.y && p.y <= crop.y + crop.h) {
      return "move";
    }
    return null;
  }

  function applyCropDrag(state, handle, startCrop, startPt, curPt) {
    const maxW = previewCanvas ? previewCanvas.width : (state.image ? state.image.width : 1);
    const maxH = previewCanvas ? previewCanvas.height : (state.image ? state.image.height : 1);

    if (handle === "new") {
      let x = Math.min(startPt.x, curPt.x);
      let y = Math.min(startPt.y, curPt.y);
      let w = Math.abs(curPt.x - startPt.x);
      let h = Math.abs(curPt.y - startPt.y);
      w = Math.max(w, 8);
      h = Math.max(h, 8);
      x = clamp(x, 0, maxW - w);
      y = clamp(y, 0, maxH - h);
      w = clamp(w, 8, maxW - x);
      h = clamp(h, 8, maxH - y);
      clearPerspective(state);
      state.edit.crop = { x, y, w, h };
      state.edit.cropAwaitingDraw = false;
      return;
    }

    const dx = curPt.x - startPt.x;
    const dy = curPt.y - startPt.y;
    let { x, y, w, h } = { ...startCrop };
    if (handle === "move") {
      x = clamp(x + dx, 0, maxW - w);
      y = clamp(y + dy, 0, maxH - h);
    } else {
      if (handle.includes("w")) { x += dx; w -= dx; }
      if (handle.includes("e")) { w += dx; }
      if (handle.includes("n")) { y += dy; h -= dy; }
      if (handle.includes("s")) { h += dy; }
      if (w < 8) w = 8;
      if (h < 8) h = 8;
      x = clamp(x, 0, maxW - w);
      y = clamp(y, 0, maxH - h);
      w = clamp(w, 8, maxW - x);
      h = clamp(h, 8, maxH - y);
    }
    clearPerspective(state);
    state.edit.crop = { x, y, w, h };
  }

  function findPerspHandle(p, state) {
    if (!state.edit.customCorners || !state.edit.corners || !previewMeta || !state.image) return null;
    const srcW = state.image.width;
    const srcH = state.image.height;
    const corners = getEffectiveCorners(state.edit, srcW, srcH);
    const tol = 12;
    for (const key of PERSP_HANDLE_KEYS) {
      const dp = previewMeta.mapSourceToDisplay(corners[key]);
      if (dp && Math.hypot(p.x - dp.x, p.y - dp.y) <= tol) return key;
    }
    return null;
  }

  function findPerspHandleHit(p) {
    const state = hooks.getState();
    if (!state.image || state.activeTab !== "edit") return null;
    if (!shouldDrawPerspectiveOverlay(state.edit, state, state.image.width, state.image.height)) {
      return null;
    }
    ensurePreview(true);
    return findPerspHandle(p, state);
  }

  function getPerspHandleDisplayPoint(key) {
    const state = hooks.getState();
    if (!state.image || !state.edit.corners || !PERSP_HANDLE_KEYS.includes(key)) return null;
    ensurePreview(false);
    if (!previewMeta) return null;
    const corners = getEffectiveCorners(state.edit, state.image.width, state.image.height);
    return previewMeta.mapSourceToDisplay(corners[key]);
  }

  function movePerspHandleBy(key, dx, dy) {
    const state = hooks.getState();
    if (!state.image || !state.edit.corners || !PERSP_HANDLE_KEYS.includes(key)) return false;
    ensurePreview(true);
    if (!previewMeta) return false;
    const corners = getEffectiveCorners(state.edit, state.image.width, state.image.height);
    const dp = previewMeta.mapSourceToDisplay(corners[key]);
    if (!dp) return false;
    const srcPt = previewMeta.mapDisplayToSource({ x: dp.x + dx, y: dp.y + dy });
    if (!srcPt) return false;
    clearCrop(state);
    state.edit.corners[key] = srcPt;
    state.edit.customCorners = true;
    markPreviewDirty();
    return true;
  }

  function drawZoomPerspOverlay(zoomCtx, sx, sy, k, marker) {
    const state = hooks.getState();
    if (!state.image || !previewMeta) return;
    ensurePreview(false);
    const dp = getPerspDisplayOverlay(state);
    if (!dp) return;

    const toZoom = (p) => ({ x: (p.x - sx) * k, y: (p.y - sy) * k });
    const zdp = {};
    PERSP_HANDLE_KEYS.forEach((key) => {
      if (dp[key]) zdp[key] = toZoom(dp[key]);
    });

    zoomCtx.save();
    zoomCtx.strokeStyle = "rgba(46, 140, 95, 0.85)";
    zoomCtx.lineWidth = 1.5;
    zoomCtx.setLineDash([6, 4]);
    zoomCtx.beginPath();
    if (zdp.tl) zoomCtx.moveTo(zdp.tl.x, zdp.tl.y);
    if (zdp.tm) zoomCtx.quadraticCurveTo(zdp.tm.x, zdp.tm.y, zdp.tr.x, zdp.tr.y);
    else if (zdp.tr) zoomCtx.lineTo(zdp.tr.x, zdp.tr.y);
    if (zdp.rm) zoomCtx.quadraticCurveTo(zdp.rm.x, zdp.rm.y, zdp.br.x, zdp.br.y);
    else if (zdp.br) zoomCtx.lineTo(zdp.br.x, zdp.br.y);
    if (zdp.bm) zoomCtx.quadraticCurveTo(zdp.bm.x, zdp.bm.y, zdp.bl.x, zdp.bl.y);
    else if (zdp.bl) zoomCtx.lineTo(zdp.bl.x, zdp.bl.y);
    if (zdp.lm) zoomCtx.quadraticCurveTo(zdp.lm.x, zdp.lm.y, zdp.tl.x, zdp.tl.y);
    else if (zdp.tl) zoomCtx.lineTo(zdp.tl.x, zdp.tl.y);
    zoomCtx.closePath();
    zoomCtx.stroke();
    zoomCtx.restore();

    PERSP_HANDLE_KEYS.forEach((key) => {
      const p = dp[key];
      if (!p) return;
      const isCorner = CORNER_KEYS.includes(key);
      const color = isCorner ? "#2a8c5f" : "#3a7ca5";
      const selected = state.selected
        && state.selected.type === "persp"
        && state.selected.key === key;
      marker(p, color, color, selected);
    });
  }

  function mapDisplayPointToSource(p) {
    if (!previewMeta) return null;
    return previewMeta.mapDisplayToSource(p);
  }

  function applyPerspHandleDrag(state, handle, p) {
    const srcPt = mapDisplayPointToSource(p);
    if (!srcPt || !state.edit.corners) return;
    clearCrop(state);
    state.edit.corners[handle] = srcPt;
    state.edit.customCorners = true;
  }

  function applyPerspNewDrag(state, startPt, curPt) {
    if (!previewMeta || !state.image) return;
    const x1 = Math.min(startPt.x, curPt.x);
    const y1 = Math.min(startPt.y, curPt.y);
    const x2 = Math.max(startPt.x, curPt.x);
    const y2 = Math.max(startPt.y, curPt.y);
    if (Math.abs(x2 - x1) < 8 || Math.abs(y2 - y1) < 8) return;
    const tl = mapDisplayPointToSource({ x: x1, y: y1 });
    const tr = mapDisplayPointToSource({ x: x2, y: y1 });
    const br = mapDisplayPointToSource({ x: x2, y: y2 });
    const bl = mapDisplayPointToSource({ x: x1, y: y2 });
    if (!tl || !tr || !br || !bl) return;
    clearCrop(state);
    state.edit.corners = {
      tl,
      tr,
      br,
      bl,
      tm: midpoint(tl, tr),
      rm: midpoint(tr, br),
      bm: midpoint(bl, br),
      lm: midpoint(tl, bl)
    };
    state.edit.customCorners = true;
    state.edit.perspAwaitingDraw = false;
  }

  let editDragMove = null;
  let editDragEnd = null;

  function stopEditDragListeners() {
    if (editDragMove) {
      window.removeEventListener("mousemove", editDragMove);
      editDragMove = null;
    }
    if (editDragEnd) {
      window.removeEventListener("mouseup", editDragEnd);
      editDragEnd = null;
    }
  }

  function startEditDragListeners() {
    stopEditDragListeners();
    editDragMove = (e) => {
      const state = hooks.getState();
      if (!state.editDrag || !hooks.clientToImage) return;
      handleMouseMove(hooks.clientToImage(e));
    };
    editDragEnd = () => {
      stopEditDragListeners();
      handleMouseUp();
    };
    window.addEventListener("mousemove", editDragMove);
    window.addEventListener("mouseup", editDragEnd);
  }

  function handleCanvasClick(p) {
    const state = hooks.getState();
    if (!state.image || state.activeTab !== "edit") return false;
    ensurePreview(true);

    const mode = state.mode;
    if (mode === "edit-crop" || mode === "edit-persp") {
      return true;
    }

    if (mode === "edit-bg-pick") {
      const sampleSource = previewMeta.preChromaCanvas || previewCanvas;
      if (!sampleSource) return true;
      const sample = sampleCanvasPixel(sampleSource, p.x, p.y);
      if (!addTransparencyKey(state, sample)) return true;
      hooks.flashStatus(`Added ${rgbToHex(sample.r, sample.g, sample.b)} to background removal.`);
      hooks.refreshAll();
      return true;
    }

    const srcPt = previewMeta.mapDisplayToSource(p);
    if (!srcPt) return true;

    if (mode === "edit-lens-center") {
      state.edit.lensCenter = srcPt;
      markPreviewDirty();
      hooks.refreshAll();
      return true;
    }

    return false;
  }

  function handleMouseDown(p) {
    const state = hooks.getState();
    if (!state.image || state.activeTab !== "edit") return false;
    ensurePreview(true);

    if (state.mode === "edit-crop") {
      clearPerspective(state);
      const handle = state.edit.crop ? findCropHandle(p, state.edit.crop) : null;
      if (handle) {
        state.editDrag = { kind: "crop", handle, startPt: p, startCrop: { ...state.edit.crop }, moved: false };
      } else if (state.edit.cropAwaitingDraw || !state.edit.crop) {
        state.editDrag = { kind: "crop", handle: "new", startPt: p, startCrop: null, moved: false };
      } else {
        return true;
      }
      state.cursor = { x: p.x, y: p.y };
      state.pointerInside = true;
      startEditDragListeners();
      return true;
    }

    if (state.mode === "edit-persp") {
      const handle = findPerspHandle(p, state);
      if (handle) {
        state.selected = { type: "persp", key: handle };
        state.editDrag = { kind: "persp", handle, startPt: p, moved: false };
        state.cursor = { x: p.x, y: p.y };
        state.pointerInside = true;
        startEditDragListeners();
        return true;
      }
      if (state.edit.perspAwaitingDraw) {
        state.selected = null;
        state.editDrag = { kind: "persp", handle: "new", startPt: p, moved: false };
        state.cursor = { x: p.x, y: p.y };
        state.pointerInside = true;
        startEditDragListeners();
        return true;
      }
      return true;
    }

    return false;
  }

  function handleMouseMove(p) {
    const state = hooks.getState();
    if (!state.editDrag) return false;
    if (state.editDrag.kind === "crop") {
      applyCropDrag(state, state.editDrag.handle, state.editDrag.startCrop, state.editDrag.startPt, p);
    } else if (state.editDrag.kind === "persp") {
      if (state.editDrag.handle === "new") {
        applyPerspNewDrag(state, state.editDrag.startPt, p);
      } else {
        applyPerspHandleDrag(state, state.editDrag.handle, p);
      }
    }
    state.editDrag.moved = true;
    state.cursor = { x: p.x, y: p.y };
    state.pointerInside = true;
    hooks.redrawCanvas();
    return true;
  }

  function handleMouseUp() {
    const state = hooks.getState();
    if (!state.editDrag) return false;
    const { moved, handle, kind } = state.editDrag;
    state.editDrag = null;
    stopEditDragListeners();
    if (kind === "crop") {
      if (!moved && handle === "new") {
        state.edit.crop = null;
      } else {
        syncCropFieldsFromEdit(state);
        if (moved) {
          state.suppressNextClick = true;
          markPreviewDirty();
          hooks.refreshAll();
        }
      }
    } else if (kind === "persp") {
      if (moved) {
        state.suppressNextClick = true;
        hooks.refreshAll();
      }
    }
    return true;
  }

  function cancelEditDrag() {
    stopEditDragListeners();
    const state = hooks.getState();
    state.editDrag = null;
  }

  function cancelPerspectiveRegion() {
    const state = hooks.getState();
    if (!state.image) return;
    stopEditDragListeners();
    state.editDrag = null;
    state.edit.perspAwaitingDraw = true;
    state.edit.corners = null;
    state.edit.customCorners = false;
    if (state.selected && state.selected.type === "persp") {
      state.selected = null;
    }
    markPreviewDirty();
    hooks.flashStatus("Click and drag on the image to draw a new perspective region.");
    hooks.refreshAll();
  }

  function cancelCropRegion() {
    const state = hooks.getState();
    if (!state.image) return;
    stopEditDragListeners();
    state.editDrag = null;
    state.edit.crop = null;
    state.edit.cropAwaitingDraw = true;
    markPreviewDirty();
    hooks.flashStatus("Click and drag on the image to draw a new crop region.");
    hooks.refreshAll();
  }

  function onEditModeChange(mode) {
    const state = hooks.getState();
    if (!state.image) return;
    if (mode === "edit-persp") {
      clearCrop(state);
      if (!state.edit.customCorners || !state.edit.corners) {
        state.edit.perspAwaitingDraw = true;
        state.edit.corners = null;
        state.edit.customCorners = false;
      } else {
        state.edit.perspAwaitingDraw = false;
      }
    } else if (mode === "edit-crop") {
      clearPerspective(state);
      state.edit.perspAwaitingDraw = false;
      if (!state.edit.crop) {
        state.edit.cropAwaitingDraw = true;
      } else {
        state.edit.cropAwaitingDraw = false;
      }
    }
    hooks.refreshAll();
  }

  function remapAllPoints(mapFn) {
    const state = hooks.getState();
    const CALIBRATION_KEYS = hooks.CALIBRATION_KEYS;
    CALIBRATION_KEYS.forEach((k) => {
      if (state.calibration[k]) {
        const np = mapFn(state.calibration[k]);
        state.calibration[k] = np;
      }
    });
    state.points = state.points.map(mapFn).filter(Boolean);
    if (state.scale.a) state.scale.a = mapFn(state.scale.a);
    if (state.scale.b) state.scale.b = mapFn(state.scale.b);
    state.measurements = state.measurements.map((m) => {
      const out = { type: m.type, a: mapFn(m.a), b: mapFn(m.b) };
      if (!out.a || !out.b) return null;
      if (m.c) out.c = mapFn(m.c);
      if (m.type === "angle" && !out.c) return null;
      return out;
    }).filter(Boolean);
    if (state.pendingMeasurement) {
      state.pendingMeasurement.points = state.pendingMeasurement.points.map(mapFn).filter(Boolean);
    }
  }

  function applyEdits() {
    const state = hooks.getState();
    if (!state.image) return;
    const srcW = state.image.width;
    const srcH = state.image.height;
    const shouldBakePerspective = hasActivePerspective(state.edit, srcW, srcH);
    ensurePreview(true, { applyPerspective: shouldBakePerspective });
    if (!previewCanvas || !previewMeta) return;

    const mapFn = (pt) => previewMeta.mapSourceToFinal(pt);

    remapAllPoints(mapFn);
    state.image = cloneCanvas(previewMeta.finalCanvas || previewMeta.preChromaCanvas || previewCanvas);
    state.image._hasAlpha = canvasHasAlpha(state.image);
    resetEditState(state, true);
    previewDirty = true;
    ensurePreview(true);
    hooks.flashStatus("Edits applied to the working image.");
    hooks.refreshAll();
  }

  function revertToOriginal() {
    const state = hooks.getState();
    if (!state.originalImage) {
      hooks.flashStatus("No original image to revert to.");
      return;
    }
    if (!window.confirm(
      "Restore the image to its originally loaded state? This clears all pending edits, "
      + "calibration points, digitized data, and measurements."
    )) {
      return;
    }
    state.image = cloneCanvas(state.originalImage);
    state.selected = null;
    state.editDrag = null;
    state.pendingMeasurement = null;
    canvasResizeFromImage(state);
    hooks.clearAnnotationState();
    resetEditState(state, true);
    previewDirty = true;
    ensurePreview(true);
    hooks.flashStatus("Reverted to the originally loaded image.");
    hooks.refreshAll();
  }

  function canvasResizeFromImage(state) {
    if (!hooks.setCanvasSize || !state.image) return;
    hooks.setCanvasSize(state.image.width, state.image.height);
  }

  function exportImageBlob(done) {
    const state = hooks.getState();
    if (!state.image) return;
    const out = getExportCanvas();
    if (!out) return;
    out.toBlob((blob) => {
      if (!blob) {
        hooks.flashStatus("Could not export the image.");
        return;
      }
      done(blob);
    }, "image/png");
  }

  function saveImage() {
    exportImageBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "edited-plot.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  async function copyImageToClipboard() {
    const state = hooks.getState();
    if (!state.image) return;
    const out = getExportCanvas();
    if (!out) return;
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
      hooks.flashStatus("Clipboard image copy is not supported in this browser.");
      return;
    }
    try {
      const item = new ClipboardItem({
        "image/png": new Promise((resolve, reject) => {
          out.toBlob((blob) => {
            if (!blob) reject(new Error("Could not encode image"));
            else resolve(blob);
          }, "image/png");
        })
      });
      await navigator.clipboard.write([item]);
      hooks.flashStatus("Image copied to clipboard.");
    } catch (err) {
      hooks.flashStatus("Could not copy to the clipboard.");
    }
  }

  function onImageLoaded() {
    const state = hooks.getState();
    state.originalImage = cloneCanvas(state.image);
    resetEditState(state, true);
    initCorners(state);
    previewDirty = true;
  }

  function onImageCleared() {
    previewCanvas = null;
    previewMeta = null;
    previewDirty = true;
  }

  function onTabEnter() {
    previewDirty = true;
    ensurePreview(true);
    hooks.refreshAll();
  }

  function onTabLeave() {
    previewDirty = true;
    previewCanvas = null;
    previewMeta = null;
  }

  function getDisplaySize() {
    ensurePreview(true);
    if (previewCanvas) return { width: previewCanvas.width, height: previewCanvas.height };
    const state = hooks.getState();
    if (!state.image) return { width: 0, height: 0 };
    return { width: state.image.width, height: state.image.height };
  }

  function wireControls() {
    function resetParam(state, spec) {
      const v = spec.default;
      state.edit[spec.key] = v;
      if (els[spec.key]) els[spec.key].value = String(v);
      if (els[spec.key + "Range"]) els[spec.key + "Range"].value = String(v);
      markPreviewDirty();
      hooks.refreshAll();
    }

    function wireParamSpecs(specs) {
      specs.forEach((spec) => {
        els[spec.key] = document.getElementById(spec.num);
        els[spec.key + "Range"] = document.getElementById(spec.range);
        const onChange = () => {
          const state = hooks.getState();
          syncParamsFromInputs(state);
          markPreviewDirty();
          hooks.refreshAll();
        };
        if (els[spec.key]) els[spec.key].addEventListener("change", onChange);
        if (els[spec.key + "Range"]) {
          els[spec.key + "Range"].addEventListener("input", () => {
            if (els[spec.key]) els[spec.key].value = els[spec.key + "Range"].value;
            const state = hooks.getState();
            syncParamsFromInputs(state, { fromRange: true });
            markPreviewDirty();
            hooks.refreshAll();
          });
        }
        const numEl = els[spec.key];
        if (!numEl) return;
        const controls = numEl.closest(".digitizer-edit-param-controls");
        if (!controls || controls.querySelector(".digitizer-edit-param-reset")) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tool-inline-button digitizer-edit-param-reset";
        btn.textContent = "Reset";
        btn.title = `Reset to ${spec.default}`;
        btn.addEventListener("click", () => resetParam(hooks.getState(), spec));
        controls.appendChild(btn);
      });
    }

    wireParamSpecs(PARAM_SPECS);

    document.querySelectorAll('input[name="dig-edit-moire-method"]').forEach((el) => {
      el.addEventListener("change", () => {
        const state = hooks.getState();
        syncMoireMethodFromInputs(state);
        markPreviewDirty();
        hooks.refreshAll();
      });
    });

    els.cropX = document.getElementById("dig-edit-crop-x");
    els.cropY = document.getElementById("dig-edit-crop-y");
    els.cropW = document.getElementById("dig-edit-crop-w");
    els.cropH = document.getElementById("dig-edit-crop-h");
    els.readout = document.getElementById("dig-edit-readout");
    els.bgColor = document.getElementById("dig-edit-bg-color");
    els.bgHex = document.getElementById("dig-edit-bg-hex");
    els.bgKeyList = document.getElementById("dig-edit-bg-key-list");
    els.transparencyEnabled = document.getElementById("dig-edit-bg-enabled");
    els.transparencyPreviewBgEnabled = document.getElementById("dig-edit-bg-preview-enabled");
    els.transparencyPreviewBgColor = document.getElementById("dig-edit-bg-preview-color");
    els.transparencyPreviewBgHex = document.getElementById("dig-edit-bg-preview-hex");

    if (els.transparencyPreviewBgEnabled) {
      els.transparencyPreviewBgEnabled.addEventListener("change", () => {
        syncPreviewBgFromInputs(hooks.getState());
        hooks.refreshAll();
      });
    }

    if (els.transparencyPreviewBgColor && els.transparencyPreviewBgHex) {
      const onPreviewBgColorChange = () => {
        syncPreviewBgFromInputs(hooks.getState());
        hooks.refreshAll();
      };
      els.transparencyPreviewBgColor.addEventListener("input", () => {
        els.transparencyPreviewBgHex.value = els.transparencyPreviewBgColor.value;
        onPreviewBgColorChange();
      });
      els.transparencyPreviewBgHex.addEventListener("change", () => {
        const rgb = parseColorInput(els.transparencyPreviewBgHex.value);
        if (rgb) els.transparencyPreviewBgColor.value = rgbToHex(rgb.r, rgb.g, rgb.b);
        onPreviewBgColorChange();
      });
    }

    if (els.transparencyEnabled) {
      els.transparencyEnabled.addEventListener("change", () => {
        const state = hooks.getState();
        const enabling = els.transparencyEnabled.checked;
        if (enabling) {
          if (state.edit.transparencyKeys.length === 0) {
            const rgb = parseColorInput(els.bgHex && els.bgHex.value)
              || (els.bgColor ? parseColorInput(els.bgColor.value) : null);
            if (!rgb) {
              els.transparencyEnabled.checked = false;
              hooks.flashStatus("Enter a background color first.");
              return;
            }
            addTransparencyKey(state, rgb);
          } else {
            state.edit.transparencyEnabled = true;
            markPreviewDirty();
          }
        } else {
          state.edit.transparencyEnabled = false;
          markPreviewDirty();
        }
        hooks.refreshAll();
      });
    }

    wireParamSpecs(BG_PARAM_SPECS);

    if (els.bgColor && els.bgHex) {
      els.bgColor.addEventListener("input", () => {
        els.bgHex.value = els.bgColor.value;
      });
      els.bgHex.addEventListener("change", () => {
        const rgb = parseColorInput(els.bgHex.value);
        if (rgb) els.bgColor.value = rgbToHex(rgb.r, rgb.g, rgb.b);
      });
    }

    const bgAddBtn = document.getElementById("dig-edit-bg-add");
    if (bgAddBtn) {
      bgAddBtn.addEventListener("click", () => {
        const state = hooks.getState();
        const rgb = parseColorInput(els.bgHex && els.bgHex.value) || (els.bgColor ? parseColorInput(els.bgColor.value) : null);
        if (!rgb) {
          hooks.flashStatus("Enter a valid color code (e.g. #ffffff).");
          return;
        }
        if (addTransparencyKey(state, rgb)) {
          hooks.flashStatus(`Added ${rgbToHex(rgb.r, rgb.g, rgb.b)} to background removal.`);
          hooks.refreshAll();
        }
      });
    }

    const bgClearBtn = document.getElementById("dig-edit-bg-clear");
    if (bgClearBtn) {
      bgClearBtn.addEventListener("click", () => {
        const state = hooks.getState();
        state.edit.transparencyKeys = [];
        renderTransparencyKeyList(state);
        markPreviewDirty();
        hooks.refreshAll();
      });
    }

    [els.cropX, els.cropY, els.cropW, els.cropH].forEach((el) => {
      if (!el) return;
      el.addEventListener("change", () => {
        const state = hooks.getState();
        syncCropFromFields(state);
        markPreviewDirty();
        hooks.refreshAll();
      });
    });

    const resetCornersBtn = document.getElementById("dig-edit-reset-corners");
    if (resetCornersBtn) {
      resetCornersBtn.addEventListener("click", () => {
        const state = hooks.getState();
        if (!state.image) return;
        clearCrop(state);
        state.edit.corners = defaultCorners(state.image.width, state.image.height);
        state.edit.customCorners = true;
        state.edit.perspAwaitingDraw = false;
        syncInputsFromParams(state);
        markPreviewDirty();
        hooks.refreshAll();
      });
    }

    const clearCropBtn = document.getElementById("dig-edit-clear-crop");
    if (clearCropBtn) {
      clearCropBtn.addEventListener("click", () => {
        const state = hooks.getState();
        state.edit.crop = null;
        state.edit.cropAwaitingDraw = true;
        markPreviewDirty();
        hooks.refreshAll();
      });
    }

    document.getElementById("dig-edit-apply").addEventListener("click", applyEdits);
    document.getElementById("dig-edit-reset").addEventListener("click", () => {
      const state = hooks.getState();
      resetEditState(state, true);
      ensurePreview(true);
      hooks.refreshAll();
    });
    document.getElementById("dig-edit-revert").addEventListener("click", revertToOriginal);
    const copyBtn = document.getElementById("dig-edit-copy");
    if (copyBtn) copyBtn.addEventListener("click", copyImageToClipboard);
    document.getElementById("dig-edit-save").addEventListener("click", saveImage);

    const rotateBtn = document.getElementById("dig-rotate-ccw");
    const flipH = document.getElementById("dig-flip-h");
    const flipV = document.getElementById("dig-flip-v");
    if (rotateBtn) rotateBtn.addEventListener("click", () => hooks.transformImage("rotate-ccw"));
    if (flipH) flipH.addEventListener("click", () => hooks.transformImage("mirror-h"));
    if (flipV) flipV.addEventListener("click", () => hooks.transformImage("mirror-v"));
  }

  window.DigitizerImageEdit = {
    EDIT_MODES,
    init(h) {
      hooks = h;
      stateDefaults(h.getState());
      wireControls();
    },
    onImageLoaded,
    onImageCleared,
    onTabEnter,
    onTabLeave,
    ensurePreview,
    getPreviewCanvas() {
      return ensurePreview(false);
    },
    getDisplayCanvas() {
      const state = hooks.getState();
      if (!state.image) return null;
      if (state.activeTab === "edit" || shouldShowTransparencyPreview(state)) {
        return ensurePreview(isTransparencyActive(state.edit));
      }
      return null;
    },
    shouldShowTransparencyPreview(state) {
      return shouldShowTransparencyPreview(state);
    },
    isTransparencyActive(edit) {
      return isTransparencyActive(edit);
    },
    canvasHasAlpha,
    getAlphaPreviewBackgroundFill(state) {
      return getAlphaPreviewBackgroundFill(state);
    },
    needsAlphaCheckerboard(state, displayImage) {
      if (!state || !state.image || !displayImage) return false;
      if (isTransparencyActive(state.edit)) return true;
      if (shouldShowTransparencyPreview(state)) return true;
      if (displayImage._hasAlpha === true) return true;
      if (displayImage === state.image && state.image._hasAlpha === true) return true;
      if (displayImage._hasAlpha === false) return false;
      if (canvasHasAlpha(displayImage)) {
        displayImage._hasAlpha = true;
        return true;
      }
      displayImage._hasAlpha = false;
      return false;
    },
    getDisplaySize,
    drawOverlays,
    handleCanvasClick,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    cancelEditDrag,
    cancelPerspectiveRegion,
    cancelCropRegion,
    onEditModeChange,
    markPreviewDirty,
    hasPendingEdits(state) {
      return hasPendingEdits(state.edit, state.image);
    },
    applyEdits,
    saveImage,
    copyImageToClipboard,
    updateCanvasWrap: updateCanvasWrapAlpha,
    getExportCanvas,
    findPerspHandleHit,
    getPerspHandleDisplayPoint,
    movePerspHandleBy,
    drawZoomPerspOverlay,
    PERSP_HANDLE_LABELS
  };

  function stateDefaults(state) {
    if (!state.edit) state.edit = defaultEditState();
    if (state.editDrag === undefined) state.editDrag = null;
    if (!state.originalImage) state.originalImage = null;
  }
})();
