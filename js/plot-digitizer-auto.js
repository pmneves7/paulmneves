(function () {
  "use strict";

  /**
   * Auto-digitization for the plot digitizer: region masking, color picking,
   * and line / point detection algorithms.
   */

  const AUTO_MASK_MODES = new Set(["auto-mask-rect", "auto-mask-lasso", "auto-mask-poly"]);
  const AUTO_PICK_MODES = new Set(["auto-pick-data", "auto-pick-bg"]);
  const AUTO_TEMPLATE_MODES = new Set(["auto-template-rect"]);
  const AUTO_MODES = new Set([...AUTO_MASK_MODES, ...AUTO_PICK_MODES, ...AUTO_TEMPLATE_MODES]);

  const AUTO_MODE_LABELS = {
    "auto-mask-rect": "rectangle region",
    "auto-mask-lasso": "lasso region",
    "auto-mask-poly": "polygon region",
    "auto-pick-data": "data color",
    "auto-pick-bg": "background color",
    "auto-template-rect": "marker kernel"
  };

  const POLY_CLOSE_RADIUS_PX = 10;

  let hooks = null;

  function defaultAutoState() {
    return {
      mask: null,
      maskW: 0,
      maskH: 0,
      subtract: false,
      dataColor: { r: 0, g: 0, b: 0 },
      bgColor: { r: 255, g: 255, b: 255 },
      detectMode: "line",
      tolerance: 40,
      minDist: 8,
      templateThreshold: 40,
      templatePeakPosition: "maximum",
      traceErrorBars: false,
      templateRect: null,
      templateMarker: null,
      templateDrag: null,
      liveUpdate: false,
      grayscaleOnly: false,
      polyPoints: [],
      lassoPoints: [],
      dragStart: null,
      dragCurrent: null,
      maskDrag: null
    };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
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

  function rgbLuminance(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function colorDistance(r, g, b, key, grayscaleOnly) {
    if (grayscaleOnly) {
      return Math.abs(rgbLuminance(r, g, b) - rgbLuminance(key.r, key.g, key.b));
    }
    const dr = r - key.r;
    const dg = g - key.g;
    const db = b - key.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function getDisplayImageData(state) {
    if (!state.image) return null;
    let canvas = state.image;
    if (window.DigitizerImageEdit) {
      const display = window.DigitizerImageEdit.getDisplayCanvas
        ? window.DigitizerImageEdit.getDisplayCanvas()
        : null;
      if (display) canvas = display;
    }
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return null;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, w, h);
    return { data: imageData.data, w, h, canvas };
  }

  function ensureAutoState(state) {
    if (!state.auto) {
      state.auto = defaultAutoState();
      return;
    }
    const defaults = defaultAutoState();
    Object.keys(defaults).forEach((key) => {
      if (state.auto[key] === undefined) state.auto[key] = defaults[key];
    });
    if (state.auto.detectMode === "errorbar") {
      state.auto.detectMode = "point";
      state.auto.traceErrorBars = true;
    }
  }

  function initMask(state) {
    ensureAutoState(state);
    if (!state.image) {
      state.auto.mask = null;
      state.auto.maskW = 0;
      state.auto.maskH = 0;
      return;
    }
    const info = getDisplayImageData(state);
    if (!info) return;
    const { w, h } = info;
    state.auto.mask = new Uint8Array(w * h);
    state.auto.mask.fill(1);
    state.auto.maskW = w;
    state.auto.maskH = h;
    state.auto.polyPoints = [];
    state.auto.lassoPoints = [];
    state.auto.dragStart = null;
    state.auto.dragCurrent = null;
    state.auto.maskDrag = null;
  }

  function resizeMaskIfNeeded(state) {
    ensureAutoState(state);
    const info = getDisplayImageData(state);
    if (!info) return;
    const { w, h } = info;
    if (state.auto.maskW === w && state.auto.maskH === h && state.auto.mask) return;
    initMask(state);
  }

  function maskIndex(x, y, w) {
    return y * w + x;
  }

  function fillRectOnMask(mask, w, h, x0, y0, x1, y1, value) {
    const left = clamp(Math.floor(Math.min(x0, x1)), 0, w - 1);
    const right = clamp(Math.ceil(Math.max(x0, x1)), 0, w - 1);
    const top = clamp(Math.floor(Math.min(y0, y1)), 0, h - 1);
    const bottom = clamp(Math.ceil(Math.max(y0, y1)), 0, h - 1);
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        mask[maskIndex(x, y, w)] = value;
      }
    }
  }

  function pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x;
      const yi = pts[i].y;
      const xj = pts[j].x;
      const yj = pts[j].y;
      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function fillPolygonOnMask(mask, w, h, pts, value) {
    if (pts.length < 3) return;
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
    const left = clamp(Math.floor(minX), 0, w - 1);
    const right = clamp(Math.ceil(maxX), 0, w - 1);
    const top = clamp(Math.floor(minY), 0, h - 1);
    const bottom = clamp(Math.ceil(maxY), 0, h - 1);
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (pointInPolygon(x + 0.5, y + 0.5, pts)) {
          mask[maskIndex(x, y, w)] = value;
        }
      }
    }
  }

  function maskIsFull(mask) {
    if (!mask || !mask.length) return false;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) return false;
    }
    return true;
  }

  function applyShapeToMask(state, shapeFn) {
    resizeMaskIfNeeded(state);
    const { mask, maskW: w, maskH: h, subtract } = state.auto;
    if (!mask) return;
    const temp = new Uint8Array(w * h);
    shapeFn(temp, w, h);
    const value = subtract ? 0 : 1;
    if (!subtract && maskIsFull(mask)) {
      mask.fill(0);
    }
    for (let i = 0; i < mask.length; i++) {
      if (temp[i]) mask[i] = value;
    }
  }

  function applyRectToMask(state, x0, y0, x1, y1) {
    applyShapeToMask(state, (temp, w, h) => {
      fillRectOnMask(temp, w, h, x0, y0, x1, y1, 1);
    });
  }

  function applyPolygonToMask(state, pts) {
    if (pts.length < 3) return;
    applyShapeToMask(state, (temp, w, h) => {
      fillPolygonOnMask(temp, w, h, pts, 1);
    });
  }

  function resetMask(state) {
    initMask(state);
  }

  function dataPixelWeight(r, g, b, a, auto) {
    if (a < 10) return 0;
    const gs = !!auto.grayscaleOnly;
    const dData = colorDistance(r, g, b, auto.dataColor, gs);
    const dBg = colorDistance(r, g, b, auto.bgColor, gs);
    if (dData > auto.tolerance) return 0;
    if (dBg < dData) return 0;
    return Math.max(0, 1 - dData / Math.max(auto.tolerance, 1));
  }

  function runLineMode(state) {
    const info = getDisplayImageData(state);
    if (!info) return [];
    resizeMaskIfNeeded(state);
    const { data, w, h } = info;
    const auto = state.auto;
    const mask = auto.mask;
    if (!mask) return [];

    const points = [];
    for (let x = 0; x < w; x++) {
      let sumY = 0;
      let sumW = 0;
      for (let y = 0; y < h; y++) {
        const idx = maskIndex(x, y, w);
        if (!mask[idx]) continue;
        const i = idx * 4;
        const wt = dataPixelWeight(data[i], data[i + 1], data[i + 2], data[i + 3], auto);
        if (wt <= 0) continue;
        sumY += y * wt;
        sumW += wt;
      }
      if (sumW > 0) {
        points.push({ x, y: sumY / sumW });
      }
    }
    return points;
  }

  function maskDisk(mask, w, h, cx, cy, radius) {
    const r2 = radius * radius;
    const left = clamp(Math.floor(cx - radius), 0, w - 1);
    const right = clamp(Math.ceil(cx + radius), 0, w - 1);
    const top = clamp(Math.floor(cy - radius), 0, h - 1);
    const bottom = clamp(Math.ceil(cy + radius), 0, h - 1);
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          mask[maskIndex(x, y, w)] = 0;
        }
      }
    }
  }

  function runPointMode(state) {
    const info = getDisplayImageData(state);
    if (!info) return [];
    resizeMaskIfNeeded(state);
    const { data, w, h } = info;
    const auto = state.auto;
    const workMask = auto.mask ? auto.mask.slice() : null;
    if (!workMask) return [];

    const R = Math.max(1, auto.minDist);
    const points = [];

    while (true) {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = maskIndex(x, y, w);
          if (!workMask[idx]) continue;
          const i = idx * 4;
          const wt = dataPixelWeight(data[i], data[i + 1], data[i + 2], data[i + 3], auto);
          if (wt <= 0) continue;
          const dData = colorDistance(data[i], data[i + 1], data[i + 2], auto.dataColor, auto.grayscaleOnly);
          if (dData < bestDist - 1e-9) {
            bestDist = dData;
            bestIdx = idx;
          } else if (Math.abs(dData - bestDist) <= 1e-9 && (bestIdx < 0 || idx < bestIdx)) {
            bestIdx = idx;
          }
        }
      }

      if (bestIdx < 0) break;

      const seedX = bestIdx % w;
      const seedY = Math.floor(bestIdx / w);
      let sumX = 0;
      let sumY = 0;
      let sumW = 0;
      const left = clamp(Math.floor(seedX - R), 0, w - 1);
      const right = clamp(Math.ceil(seedX + R), 0, w - 1);
      const top = clamp(Math.floor(seedY - R), 0, h - 1);
      const bottom = clamp(Math.ceil(seedY + R), 0, h - 1);
      const r2 = R * R;

      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
          const dx = x - seedX;
          const dy = y - seedY;
          if (dx * dx + dy * dy > r2) continue;
          const idx = maskIndex(x, y, w);
          if (!workMask[idx]) continue;
          const i = idx * 4;
          const wt = dataPixelWeight(data[i], data[i + 1], data[i + 2], data[i + 3], auto);
          if (wt <= 0) continue;
          sumX += x * wt;
          sumY += y * wt;
          sumW += wt;
        }
      }

      if (sumW <= 0) {
        workMask[bestIdx] = 0;
        continue;
      }

      const cx = sumX / sumW;
      const cy = sumY / sumW;
      points.push({ x: cx, y: cy });
      maskDisk(workMask, w, h, cx, cy, R);
    }

    return points;
  }

  function normalizedRect(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y)
    };
  }

  function snapHalfPixel(value) {
    return Math.round(value * 2) / 2;
  }

  function integerTemplateBounds(rect, w, h) {
    if (!rect) return null;
    const left = clamp(Math.floor(rect.x), 0, w - 1);
    const top = clamp(Math.floor(rect.y), 0, h - 1);
    const right = clamp(Math.ceil(rect.x + rect.w), left + 1, w);
    const bottom = clamp(Math.ceil(rect.y + rect.h), top + 1, h);
    if (right - left < 3 || bottom - top < 3) return null;
    return { left, top, width: right - left, height: bottom - top };
  }

  function canonicalTemplateRect(bounds) {
    return {
      x: bounds.left,
      y: bounds.top,
      w: bounds.width,
      h: bounds.height
    };
  }

  function defaultTemplateMarker(bounds) {
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2
    };
  }

  function clampTemplateMarker(marker, bounds) {
    if (!marker || !bounds) return null;
    return {
      x: snapHalfPixel(clamp(marker.x, bounds.left + 0.5, bounds.left + bounds.width - 0.5)),
      y: snapHalfPixel(clamp(marker.y, bounds.top + 0.5, bounds.top + bounds.height - 0.5))
    };
  }

  function templateBoundsForState(state) {
    if (!state || !state.image) return null;
    const w = state.auto.maskW || state.image.width;
    const h = state.auto.maskH || state.image.height;
    return w && h ? integerTemplateBounds(state.auto.templateRect, w, h) : null;
  }

  function canonicalizeTemplateGeometry(state) {
    const bounds = templateBoundsForState(state);
    if (!bounds) return;
    const rect = state.auto.templateRect;
    const legacyEdges = rect && (
      !Number.isInteger(rect.x)
      || !Number.isInteger(rect.y)
      || !Number.isInteger(rect.w)
      || !Number.isInteger(rect.h)
    );
    state.auto.templateRect = canonicalTemplateRect(bounds);
    state.auto.templateMarker = legacyEdges || !state.auto.templateMarker
      ? defaultTemplateMarker(bounds)
      : clampTemplateMarker(state.auto.templateMarker, bounds);
  }

  function getTemplateMarker() {
    const state = hooks.getState();
    ensureAutoState(state);
    return state.auto.templateRect ? state.auto.templateMarker : null;
  }

  function templateHandlePoints(rect) {
    if (!rect) return {};
    const left = rect.x;
    const right = rect.x + rect.w;
    const top = rect.y;
    const bottom = rect.y + rect.h;
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    return {
      nw: { x: left, y: top },
      n: { x: centerX, y: top },
      ne: { x: right, y: top },
      e: { x: right, y: centerY },
      se: { x: right, y: bottom },
      s: { x: centerX, y: bottom },
      sw: { x: left, y: bottom },
      w: { x: left, y: centerY }
    };
  }

  function getTemplateHandlePoint(key) {
    const state = hooks.getState();
    ensureAutoState(state);
    return templateHandlePoints(state.auto.templateRect)[key] || null;
  }

  function findTemplateHandleHit(p) {
    const state = hooks.getState();
    ensureAutoState(state);
    if (!state.auto.templateRect || !p) return null;
    const radius = 9 * hooks.displayScale();
    let bestKey = null;
    let bestDistance = Infinity;
    Object.entries(templateHandlePoints(state.auto.templateRect)).forEach(([key, point]) => {
      const distance = Math.hypot(point.x - p.x, point.y - p.y);
      if (distance < radius && distance < bestDistance) {
        bestKey = key;
        bestDistance = distance;
      }
    });
    return bestKey;
  }

  function findTemplateMarkerHit(p) {
    const marker = getTemplateMarker();
    if (!marker || !p) return false;
    return Math.hypot(marker.x - p.x, marker.y - p.y) < 10 * hooks.displayScale();
  }

  function moveTemplateMarkerTo(p) {
    const state = hooks.getState();
    ensureAutoState(state);
    const bounds = templateBoundsForState(state);
    if (!bounds || !p) return false;
    const next = clampTemplateMarker(p, bounds);
    if (!next) return false;
    if (!state.auto.templateMarker) state.auto.templateMarker = next;
    else {
      state.auto.templateMarker.x = next.x;
      state.auto.templateMarker.y = next.y;
    }
    requestLiveAutoDigitize();
    return true;
  }

  function moveTemplateMarkerBy(dx, dy) {
    const marker = getTemplateMarker();
    if (!marker) return false;
    return moveTemplateMarkerTo({ x: marker.x + dx, y: marker.y + dy });
  }

  function moveTemplateHandleTo(key, p) {
    const state = hooks.getState();
    ensureAutoState(state);
    const bounds = templateBoundsForState(state);
    if (!bounds || !p || !key) return false;

    let left = bounds.left;
    let right = bounds.left + bounds.width;
    let top = bounds.top;
    let bottom = bounds.top + bounds.height;
    const imageW = state.auto.maskW || state.image.width;
    const imageH = state.auto.maskH || state.image.height;
    const nextX = clamp(Math.round(p.x), 0, imageW);
    const nextY = clamp(Math.round(p.y), 0, imageH);

    if (key.includes("w")) left = Math.min(nextX, right - 3);
    if (key.includes("e")) right = Math.max(nextX, left + 3);
    if (key.includes("n")) top = Math.min(nextY, bottom - 3);
    if (key.includes("s")) bottom = Math.max(nextY, top + 3);

    left = clamp(left, 0, imageW - 3);
    right = clamp(right, left + 3, imageW);
    top = clamp(top, 0, imageH - 3);
    bottom = clamp(bottom, top + 3, imageH);

    const nextBounds = { left, top, width: right - left, height: bottom - top };
    state.auto.templateRect = canonicalTemplateRect(nextBounds);
    state.auto.templateMarker = clampTemplateMarker(
      state.auto.templateMarker || defaultTemplateMarker(nextBounds),
      nextBounds
    );
    updateTemplateReadout(state);
    requestLiveAutoDigitize();
    return true;
  }

  function moveTemplateHandleBy(key, dx, dy) {
    const point = getTemplateHandlePoint(key);
    if (!point) return false;
    return moveTemplateHandleTo(key, {
      x: point.x + (dx ? Math.sign(dx) : 0),
      y: point.y + (dy ? Math.sign(dy) : 0)
    });
  }

  function evenlySpacedIndices(size, count) {
    const result = [];
    const seen = new Set();
    const n = Math.min(size, count);
    for (let i = 0; i < n; i++) {
      const value = n === 1 ? 0 : Math.round(i * (size - 1) / (n - 1));
      if (!seen.has(value)) {
        seen.add(value);
        result.push(value);
      }
    }
    return result;
  }

  function buildTemplateKernel(data, imageW, bounds) {
    const xs = evenlySpacedIndices(bounds.width, 15);
    const ys = evenlySpacedIndices(bounds.height, 15);
    const samples = [];
    const means = [0, 0, 0];
    ys.forEach((y) => {
      xs.forEach((x) => {
        const i = ((bounds.top + y) * imageW + bounds.left + x) * 4;
        const rgb = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
        samples.push({ x, y, rgb });
        means[0] += rgb[0];
        means[1] += rgb[1];
        means[2] += rgb[2];
      });
    });
    means[0] /= samples.length;
    means[1] /= samples.length;
    means[2] /= samples.length;
    let energy = 0;
    samples.forEach((sample) => {
      sample.v = [
        sample.rgb[0] - means[0],
        sample.rgb[1] - means[1],
        sample.rgb[2] - means[2]
      ];
      energy += sample.v[0] * sample.v[0]
        + sample.v[1] * sample.v[1]
        + sample.v[2] * sample.v[2];
    });
    return energy > 1e-8 ? { samples, energy } : null;
  }

  function templateScoreAt(data, imageW, originX, originY, kernel, mask) {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumSq = 0;
    let dot = 0;
    let colorError = 0;
    const samples = kernel.samples;
    for (let k = 0; k < samples.length; k++) {
      const sample = samples[k];
      const x = originX + sample.x;
      const y = originY + sample.y;
      if (mask && !mask[maskIndex(x, y, imageW)]) return -1;
      const i = (y * imageW + x) * 4;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      sumR += r;
      sumG += g;
      sumB += b;
      sumSq += r * r + g * g + b * b;
      dot += r * sample.v[0] + g * sample.v[1] + b * sample.v[2];
      colorError += (r - sample.rgb[0]) * (r - sample.rgb[0])
        + (g - sample.rgb[1]) * (g - sample.rgb[1])
        + (b - sample.rgb[2]) * (b - sample.rgb[2]);
    }
    const n = samples.length;
    const patchEnergy = sumSq - (sumR * sumR + sumG * sumG + sumB * sumB) / n;
    if (patchEnergy <= 1e-8) return -1;
    const shapeScore = dot / Math.sqrt(kernel.energy * patchEnergy);
    const colorRmse = Math.sqrt(colorError / (n * 3));
    const colorScore = Math.max(0, 1 - colorRmse / 0.5);
    // Preserve normalized shape matching while keeping identically-shaped
    // markers of another color below the same threshold.
    return shapeScore * (0.3 + 0.7 * colorScore);
  }

  function runTemplateMode(state) {
    const info = getDisplayImageData(state);
    if (!info) return [];
    resizeMaskIfNeeded(state);
    const { data, w, h } = info;
    const auto = state.auto;
    const bounds = integerTemplateBounds(auto.templateRect, w, h);
    if (!bounds || !auto.mask) return [];
    const kernel = buildTemplateKernel(data, w, bounds);
    if (!kernel) return [];
    const marker = clampTemplateMarker(auto.templateMarker || defaultTemplateMarker(bounds), bounds);
    const appearance = {
      markerX: marker.x - bounds.left,
      markerY: marker.y - bounds.top
    };
    const maxOriginX = w - bounds.width;
    const maxOriginY = h - bounds.height;
    const threshold = clamp(auto.templateThreshold / 100, 0.05, 0.99);
    const estimatedWork = (maxOriginX + 1) * (maxOriginY + 1) * kernel.samples.length;
    const step = estimatedWork > 260000000 ? 3 : estimatedWork > 90000000 ? 2 : 1;
    const cols = Math.floor(maxOriginX / step) + 1;
    const rows = Math.floor(maxOriginY / step) + 1;
    const response = new Float32Array(cols * rows);
    response.fill(-1);

    for (let gy = 0; gy < rows; gy++) {
      const oy = gy * step;
      for (let gx = 0; gx < cols; gx++) {
        const ox = gx * step;
        const markerX = clamp(Math.floor(ox + appearance.markerX), 0, w - 1);
        const markerY = clamp(Math.floor(oy + appearance.markerY), 0, h - 1);
        if (!auto.mask[maskIndex(markerX, markerY, w)]) continue;
        response[gy * cols + gx] = templateScoreAt(data, w, ox, oy, kernel, auto.mask);
      }
    }

    const candidates = [];
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const index = gy * cols + gx;
        const score = response[index];
        if (score < threshold) continue;
        let isPeak = true;
        for (let dy = -1; dy <= 1 && isPeak; dy++) {
          const ny = gy + dy;
          if (ny < 0 || ny >= rows) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = gx + dx;
            if (nx < 0 || nx >= cols || (dx === 0 && dy === 0)) continue;
            const neighborIndex = ny * cols + nx;
            const neighbor = response[neighborIndex];
            if (neighbor > score || (neighbor === score && neighborIndex < index)) {
              isPeak = false;
              break;
            }
          }
        }
        if (isPeak) candidates.push({ ox: gx * step, oy: gy * step, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 10000) candidates.length = 10000;

    const minDist = Math.max(1, auto.minDist);
    const refineRadius = Math.max(1, Math.min(8, Math.round(minDist * 0.3)));
    const coarseCandidates = [];
    for (let i = 0; i < candidates.length && coarseCandidates.length < 2000; i++) {
      const candidate = candidates[i];
      const x = candidate.ox + appearance.markerX;
      const y = candidate.oy + appearance.markerY;
      if (coarseCandidates.some((other) => Math.hypot(other.x - x, other.y - y) < minDist)) continue;
      coarseCandidates.push({ ...candidate, x, y });
    }
    const points = [];
    coarseCandidates.forEach((candidate) => {
      let sumW = 0;
      let sumX = 0;
      let sumY = 0;
      let bestScore = -Infinity;
      let bestX = candidate.ox + appearance.markerX;
      let bestY = candidate.oy + appearance.markerY;
      for (let oy = Math.max(0, candidate.oy - refineRadius);
        oy <= Math.min(maxOriginY, candidate.oy + refineRadius); oy++) {
        for (let ox = Math.max(0, candidate.ox - refineRadius);
          ox <= Math.min(maxOriginX, candidate.ox + refineRadius); ox++) {
          const score = templateScoreAt(data, w, ox, oy, kernel, auto.mask);
          if (score > bestScore) {
            bestScore = score;
            bestX = ox + appearance.markerX;
            bestY = oy + appearance.markerY;
          }
          const weight = Math.max(0, score - threshold);
          if (weight <= 0) continue;
          sumW += weight;
          sumX += (ox + appearance.markerX) * weight;
          sumY += (oy + appearance.markerY) * weight;
        }
      }
      let point = auto.templatePeakPosition === "centroid" && sumW > 0
        ? { x: sumX / sumW, y: sumY / sumW }
        : { x: bestX, y: bestY };
      const pointX = clamp(Math.floor(point.x), 0, w - 1);
      const pointY = clamp(Math.floor(point.y), 0, h - 1);
      if (!auto.mask[maskIndex(pointX, pointY, w)]) {
        point = { x: bestX, y: bestY };
      }
      if (bestScore < threshold) return;
      if (points.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < minDist)) return;
      points.push(point);
    });
    return points;
  }

  function matchedPixelMap(data, w, h, auto, mask) {
    const weights = new Float32Array(w * h);
    for (let idx = 0; idx < weights.length; idx++) {
      if (!mask[idx]) continue;
      const i = idx * 4;
      weights[idx] = dataPixelWeight(data[i], data[i + 1], data[i + 2], data[i + 3], auto);
    }
    return weights;
  }

  function localMarkerFeatures(weights, w, h, p, radius) {
    const left = clamp(Math.floor(p.x - radius), 0, w - 1);
    const right = clamp(Math.ceil(p.x + radius), 0, w - 1);
    const top = clamp(Math.floor(p.y - radius), 0, h - 1);
    const bottom = clamp(Math.ceil(p.y + radius), 0, h - 1);
    const r2 = radius * radius;
    let mass = 0;
    let horizontalSpread = 0;
    let broadRows = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let meanX = 0;
    let meanY = 0;
    for (let y = top; y <= bottom; y++) {
      let rowMass = 0;
      let rowMin = Infinity;
      let rowMax = -Infinity;
      for (let x = left; x <= right; x++) {
        const dx = x - p.x;
        const dy = y - p.y;
        if (dx * dx + dy * dy > r2) continue;
        const weight = weights[maskIndex(x, y, w)];
        rowMass += weight;
        if (weight > 0) {
          rowMin = Math.min(rowMin, x);
          rowMax = Math.max(rowMax, x);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          meanX += x * weight;
          meanY += y * weight;
        }
      }
      mass += rowMass;
      horizontalSpread = Math.max(horizontalSpread, rowMass);
      if (Number.isFinite(rowMin) && rowMax - rowMin + 1 >= Math.max(3, radius * 0.5)) broadRows++;
    }
    if (mass <= 0 || !Number.isFinite(minX)) return { score: 0, confident: false, center: p };
    meanX /= mass;
    meanY /= mass;
    let varX = 0;
    let varY = 0;
    let quadrantMask = 0;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const weight = weights[maskIndex(x, y, w)];
        if (weight <= 0) continue;
        const dx = x - meanX;
        const dy = y - meanY;
        if (dx * dx + dy * dy > r2) continue;
        varX += dx * dx * weight;
        varY += dy * dy * weight;
        if (Math.abs(dx) > 0.75 && Math.abs(dy) > 0.75) {
          quadrantMask |= 1 << ((dx >= 0 ? 1 : 0) + (dy >= 0 ? 2 : 0));
        }
      }
    }
    const aspect = Math.min(varX, varY) / Math.max(1, Math.max(varX, varY));
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const quadrants = [1, 2, 4, 8].reduce((n, bit) => n + ((quadrantMask & bit) ? 1 : 0), 0);
    // Filled and hollow markers occupy several adjacent rows, extend in both
    // dimensions, and have balanced local variance. A plotted curve, a stem,
    // or a cap generally fails at least two of those tests.
    const confident = broadRows >= Math.max(2, Math.round(radius * 0.3))
      && width >= Math.max(3, radius * 0.5)
      && height >= Math.max(3, radius * 0.5)
      && aspect >= 0.12
      && quadrants >= 3;
    return {
      score: mass * Math.max(1, horizontalSpread) * (0.25 + aspect) * (1 + broadRows),
      confident,
      center: { x: meanX, y: meanY }
    };
  }

  function collapseVerticalCandidates(points, weights, w, h, radius) {
    const used = new Uint8Array(points.length);
    const result = [];
    // Hollow rings and horizontal caps can seed candidates on either side of
    // the true x coordinate. The user-provided minimum distance is the marker
    // scale, so use most of it when merging a single vertical observation.
    const xTolerance = Math.max(4, radius * 1.25);

    for (let i = 0; i < points.length; i++) {
      if (used[i]) continue;
      const group = [i];
      used[i] = 1;
      // Error-bar artifacts line up at nearly the same x. Grow transitively so
      // every seed along a long stem is compared with the marker body.
      for (let cursor = 0; cursor < group.length; cursor++) {
        const a = points[group[cursor]];
        for (let j = i + 1; j < points.length; j++) {
          if (used[j]) continue;
          const b = points[j];
          if (Math.abs(a.x - b.x) <= xTolerance && Math.abs(a.y - b.y) <= radius * 1.6) {
            used[j] = 1;
            group.push(j);
          }
        }
      }
      let best = group[0];
      let bestScore = -Infinity;
      let bestFeatures = null;
      group.forEach((idx) => {
        const features = localMarkerFeatures(weights, w, h, points[idx], radius);
        if (features.score > bestScore) {
          bestScore = features.score;
          best = idx;
          bestFeatures = features;
        }
      });
      if (bestFeatures && bestFeatures.confident) {
        // Keep the greedy candidate's locality but use the marker mass centroid
        // to reduce the common half-marker offset from rings and attached stems.
        const source = points[best];
        const center = bestFeatures.center;
        result.push({
          x: Math.abs(center.x - source.x) <= radius * 0.65 ? center.x : source.x,
          y: Math.abs(center.y - source.y) <= radius * 0.65 ? center.y : source.y
        });
      }
    }
    return result;
  }

  function verticalTraceColumns(x, w) {
    // Image-coordinate pixel centers are n + 0.5. Interpolate between the
    // neighboring center columns so an exact center samples one column and an
    // exact pixel edge samples the two adjacent columns equally.
    const centerIndex = x - 0.5;
    const left = Math.floor(centerIndex);
    const fraction = centerIndex - left;
    const samples = [];
    const add = (column, weight) => {
      if (column >= 0 && column < w && weight > 1e-8) samples.push({ column, weight });
    };
    add(left, 1 - fraction);
    add(left + 1, fraction);
    if (!samples.length) {
      return [{ column: clamp(Math.floor(x), 0, w - 1), weight: 1 }];
    }
    const total = samples.reduce((sum, sample) => sum + sample.weight, 0);
    samples.forEach((sample) => { sample.weight /= total; });
    return samples;
  }

  function traceVerticalExtent(weights, w, h, point, radius) {
    const columns = verticalTraceColumns(point.x, w);
    const rows = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      rows[y] = columns.reduce(
        (sum, sample) => sum + weights[maskIndex(sample.column, y, w)] * sample.weight,
        0
      );
    }

    const center = clamp(Math.floor(point.y), 0, h - 1);
    const markerFallback = () => {
      let top = Infinity;
      let bottom = -Infinity;
      const left = clamp(Math.floor(point.x - radius), 0, w - 1);
      const right = clamp(Math.ceil(point.x + radius), 0, w - 1);
      const localTop = clamp(Math.floor(point.y - radius), 0, h - 1);
      const localBottom = clamp(Math.ceil(point.y + radius), 0, h - 1);
      const r2 = radius * radius;
      for (let y = localTop; y <= localBottom; y++) {
        for (let x = left; x <= right; x++) {
          const dx = x - point.x;
          const dy = y - point.y;
          if (dx * dx + dy * dy <= r2 && weights[maskIndex(x, y, w)] > 0) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }
      if (Number.isFinite(top) && Number.isFinite(bottom) && bottom > top) return { top, bottom };
      return { top: point.y - radius / 2, bottom: point.y + radius / 2 };
    };
    let seed = center;
    if (rows[seed] <= 0) {
      let bestDistance = Infinity;
      for (let y = Math.max(0, center - 3); y <= Math.min(h - 1, center + 3); y++) {
        if (rows[y] > 0 && Math.abs(y - center) < bestDistance) {
          seed = y;
          bestDistance = Math.abs(y - center);
        }
      }
      if (!Number.isFinite(bestDistance)) {
        return markerFallback();
      }
    }

    // Permit tiny anti-aliasing gaps, but stop before unrelated features in the
    // same column. Hollow markers therefore expose a shorter bar inside them.
    const maxGap = 2;
    const walk = (direction) => {
      let edge = seed;
      let gap = 0;
      for (let y = seed + direction; y >= 0 && y < h; y += direction) {
        if (rows[y] > 0) {
          edge = y;
          gap = 0;
        } else {
          gap += 1;
          if (gap > maxGap) break;
        }
      }
      return edge;
    };
    const top = walk(-1);
    const bottom = walk(1);
    return bottom > top ? { top, bottom } : markerFallback();
  }

  function runColorMarkerCenters(state, markerAware) {
    const info = getDisplayImageData(state);
    if (!info) return [];
    resizeMaskIfNeeded(state);
    const { data, w, h } = info;
    const auto = state.auto;
    if (!auto.mask) return [];
    const raw = runPointMode(state);
    if (!markerAware) return raw;
    const radius = Math.max(1, auto.minDist);
    const weights = matchedPixelMap(data, w, h, auto, auto.mask);
    return collapseVerticalCandidates(raw, weights, w, h, radius);
  }

  function addVerticalErrorBars(state, centers) {
    const info = getDisplayImageData(state);
    if (!info || !centers.length) return centers;
    resizeMaskIfNeeded(state);
    const { data, w, h } = info;
    const auto = state.auto;
    if (!auto.mask) return centers;
    const radius = Math.max(1, auto.minDist);
    const weights = matchedPixelMap(data, w, h, auto, auto.mask);
    return centers.map((point) => {
      const extent = traceVerticalExtent(weights, w, h, point, radius);
      const detected = {
        x: point.x,
        y: point.y,
        errorBar: {
          top: { x: point.x, y: extent.top },
          bottom: { x: point.x, y: extent.bottom }
        }
      };
      if (hooks.normalizeErrorBar) hooks.normalizeErrorBar(detected);
      return detected;
    });
  }

  function runMarkerDetection(state) {
    if (!state.auto) return [];
    ensureAutoState(state);
    if (state.auto.detectMode === "template") return runTemplateMode(state);
    else if (state.auto.detectMode === "point") {
      return runColorMarkerCenters(state, true);
    }
    return runLineMode(state);
  }

  function runAutoDigitize(state) {
    const centers = runMarkerDetection(state);
    if (state.auto.detectMode === "line") return centers;
    return state.auto.traceErrorBars ? addVerticalErrorBars(state, centers) : centers;
  }

  function replacePointsWithDetection(state, includeErrorBars) {
    syncParamsFromInputs(state);
    const detected = includeErrorBars === false ? runMarkerDetection(state) : runAutoDigitize(state);
    const keepTemplateMarkerSelected = state.selected
      && (state.selected.type === "auto-template-marker"
        || state.selected.type === "auto-template-handle")
      && state.auto.templateMarker;
    state.points = detected;
    if (detected.length) {
      if (!keepTemplateMarkerSelected) {
        state.selected = { type: "data", index: detected.length - 1 };
      }
      if (state.modeByTab) state.modeByTab.plot = "add";
      state.mode = "add";
    } else if (state.selected && (state.selected.type === "data" || state.selected.type === "data-error")) {
      state.selected = null;
    }
    return detected;
  }

  let liveAutoTimer = null;

  function applyLiveAutoDigitize(state) {
    ensureAutoState(state);
    if (!state.auto.liveUpdate) return false;
    replacePointsWithDetection(state);
    return true;
  }

  function runAutoDigitizeNow() {
    const state = hooks.getState();
    ensureAutoState(state);
    if (state.auto.detectMode === "template" && !state.auto.templateRect) {
      hooks.flashStatus("Select Marker kernel, then drag a tight rectangle around one marker.");
      return;
    }
    const detected = replacePointsWithDetection(state, false);
    hooks.refreshAll();
    hooks.flashStatus(`${detected.length} marker${detected.length === 1 ? "" : "s"} detected.`);
  }

  function runErrorBarDetectionNow() {
    const state = hooks.getState();
    ensureAutoState(state);
    syncParamsFromInputs(state);
    if (!state.points.length) {
      hooks.flashStatus("Detect or add marker centers before detecting error bars.");
      return;
    }
    state.points = addVerticalErrorBars(
      state,
      state.points.map((point) => ({ x: point.x, y: point.y }))
    );
    hooks.refreshAll();
    hooks.flashStatus(`Error bars detected for ${state.points.length} marker${state.points.length === 1 ? "" : "s"}.`);
  }

  function requestLiveAutoDigitize(immediate) {
    if (liveAutoTimer) {
      clearTimeout(liveAutoTimer);
      liveAutoTimer = null;
    }
    const run = () => {
      const state = hooks.getState();
      if (applyLiveAutoDigitize(state)) {
        hooks.refreshAll();
      }
    };
    if (immediate) {
      run();
    } else {
      liveAutoTimer = setTimeout(run, 180);
    }
  }

  function isAutoMode(mode) {
    return AUTO_MODES.has(mode);
  }

  function isMaskMode(mode) {
    return AUTO_MASK_MODES.has(mode);
  }

  function cancelInProgress(state) {
    ensureAutoState(state);
    state.auto.polyPoints = [];
    state.auto.lassoPoints = [];
    state.auto.dragStart = null;
    state.auto.dragCurrent = null;
    state.auto.maskDrag = null;
  }

  function onMaskModeChange(state, mode) {
    cancelInProgress(state);
    if (mode === "auto-mask-poly") {
      state.auto.polyPoints = [];
    }
  }

  function sampleColorAt(state, p) {
    const info = getDisplayImageData(state);
    if (!info) return null;
    const x = clamp(Math.round(p.x), 0, info.w - 1);
    const y = clamp(Math.round(p.y), 0, info.h - 1);
    const i = maskIndex(x, y, info.w) * 4;
    return {
      r: info.data[i],
      g: info.data[i + 1],
      b: info.data[i + 2]
    };
  }

  function handleCanvasClick(p) {
    const state = hooks.getState();
    if (!state.image || state.activeTab !== "plot") return false;
    const mode = state.mode;
    if (!isAutoMode(mode)) return false;

    ensureAutoState(state);
    resizeMaskIfNeeded(state);

    if (mode === "auto-pick-data") {
      const rgb = sampleColorAt(state, p);
      if (!rgb) return true;
      state.auto.dataColor = rgb;
      syncColorInputs(state);
      hooks.flashStatus(`Data color set to ${rgbToHex(rgb.r, rgb.g, rgb.b)}.`);
      requestLiveAutoDigitize(true);
      hooks.refreshAll();
      return true;
    }

    if (mode === "auto-pick-bg") {
      const rgb = sampleColorAt(state, p);
      if (!rgb) return true;
      state.auto.bgColor = rgb;
      syncColorInputs(state);
      hooks.flashStatus(`Background color set to ${rgbToHex(rgb.r, rgb.g, rgb.b)}.`);
      requestLiveAutoDigitize(true);
      hooks.refreshAll();
      return true;
    }

    if (mode === "auto-mask-poly") {
      const pts = state.auto.polyPoints;
      if (pts.length >= 3) {
        const first = pts[0];
        const closeR = POLY_CLOSE_RADIUS_PX * hooks.displayScale();
        if (Math.hypot(p.x - first.x, p.y - first.y) <= closeR) {
          applyPolygonToMask(state, pts);
          state.auto.polyPoints = [];
          hooks.flashStatus("Polygon region applied.");
          requestLiveAutoDigitize(true);
          hooks.refreshAll();
          return true;
        }
      }
      pts.push({ x: p.x, y: p.y });
      hooks.redrawCanvas();
      return true;
    }

    return false;
  }

  function handleMouseDown(p) {
    const state = hooks.getState();
    if (!state.image || state.activeTab !== "plot") return false;
    const mode = state.mode;
    if (mode !== "auto-mask-rect" && mode !== "auto-mask-lasso" && mode !== "auto-template-rect") return false;

    ensureAutoState(state);
    resizeMaskIfNeeded(state);
    state.auto.maskDrag = {
      kind: mode === "auto-template-rect" ? "template" : mode === "auto-mask-rect" ? "rect" : "lasso",
      startPt: { x: p.x, y: p.y },
      currentPt: { x: p.x, y: p.y },
      moved: false
    };
    if (mode === "auto-mask-lasso") {
      state.auto.lassoPoints = [{ x: p.x, y: p.y }];
    }
    state.cursor = { x: p.x, y: p.y };
    state.pointerInside = true;
    startMaskDragListeners();
    return true;
  }

  let maskDragMove = null;
  let maskDragEnd = null;

  function stopMaskDragListeners() {
    if (maskDragMove) {
      window.removeEventListener("mousemove", maskDragMove);
      maskDragMove = null;
    }
    if (maskDragEnd) {
      window.removeEventListener("mouseup", maskDragEnd);
      maskDragEnd = null;
    }
  }

  function onMaskDragMove(e) {
    const state = hooks.getState();
    if (!state.auto || !state.auto.maskDrag) return;
    const p = hooks.clientToImage(e, state.auto.maskDrag.kind === "template");
    state.auto.maskDrag.currentPt = p;
    state.auto.maskDrag.moved = true;
    if (state.auto.maskDrag.kind === "lasso") {
      const pts = state.auto.lassoPoints;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 1.5) {
        pts.push({ x: p.x, y: p.y });
      }
    }
    state.cursor = { x: p.x, y: p.y };
    state.pointerInside = true;
    hooks.redrawCanvas();
  }

  function onMaskDragEnd() {
    stopMaskDragListeners();
    const state = hooks.getState();
    if (!state.auto || !state.auto.maskDrag) return;
    const drag = state.auto.maskDrag;
    state.auto.maskDrag = null;

    if (!drag.moved) return;

    if (drag.kind === "template") {
      const rect = normalizedRect(drag.startPt, drag.currentPt);
      const info = getDisplayImageData(state);
      const bounds = info ? integerTemplateBounds(rect, info.w, info.h) : null;
      if (info && bounds) {
        state.auto.templateRect = canonicalTemplateRect(bounds);
        state.auto.templateMarker = defaultTemplateMarker(bounds);
        state.selected = { type: "auto-template-marker" };
        state.cursor = {
          x: state.auto.templateMarker.x,
          y: state.auto.templateMarker.y
        };
        state.pointerInside = true;
        state.auto.detectMode = "template";
        syncParamsToInputs(state);
        hooks.flashStatus(`Marker kernel set (${bounds.width} × ${bounds.height} px).`);
      } else {
        hooks.flashStatus("Draw a kernel rectangle at least 3 × 3 pixels.");
      }
    } else if (drag.kind === "rect") {
      applyRectToMask(state, drag.startPt.x, drag.startPt.y, drag.currentPt.x, drag.currentPt.y);
      hooks.flashStatus(state.auto.subtract ? "Rectangle subtracted from region." : "Rectangle added to region.");
    } else if (drag.kind === "lasso") {
      const pts = state.auto.lassoPoints.slice();
      if (pts.length >= 3) {
        applyPolygonToMask(state, pts);
        hooks.flashStatus(state.auto.subtract ? "Lasso region subtracted." : "Lasso region added.");
      }
      state.auto.lassoPoints = [];
    }

    state.suppressNextClick = true;
    requestLiveAutoDigitize(true);
    hooks.refreshAll();
  }

  function startMaskDragListeners() {
    stopMaskDragListeners();
    maskDragMove = onMaskDragMove;
    maskDragEnd = onMaskDragEnd;
    window.addEventListener("mousemove", maskDragMove);
    window.addEventListener("mouseup", maskDragEnd, { once: true });
  }

  function handleEscape(state) {
    ensureAutoState(state);
    if (state.auto.polyPoints.length || state.auto.lassoPoints.length || state.auto.maskDrag) {
      cancelInProgress(state);
      stopMaskDragListeners();
      return true;
    }
    return false;
  }

  function fillGreyOutsideRect(ctx, w, h, x0, y0, x1, y1) {
    const left = clamp(Math.floor(Math.min(x0, x1)), 0, w - 1);
    const right = clamp(Math.ceil(Math.max(x0, x1)), 0, w - 1);
    const top = clamp(Math.floor(Math.min(y0, y1)), 0, h - 1);
    const bottom = clamp(Math.ceil(Math.max(y0, y1)), 0, h - 1);
    ctx.fillRect(0, 0, w, top);
    ctx.fillRect(0, bottom + 1, w, h - bottom - 1);
    ctx.fillRect(0, top, left, bottom - top + 1);
    ctx.fillRect(right + 1, top, w - right - 1, bottom - top + 1);
  }

  function fillGreyInsideRect(ctx, x0, y0, x1, y1) {
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    if (width > 0 && height > 0) {
      ctx.fillRect(left, top, width, height);
    }
  }

  function drawExcludedMaskOverlay(ctx, mask, w, h) {
    if (!mask || !mask.some((v) => v === 0)) return;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
    for (let y = 0; y < h; y++) {
      let runStart = -1;
      for (let x = 0; x <= w; x++) {
        const excluded = x < w && !mask[maskIndex(x, y, w)];
        if (excluded && runStart < 0) runStart = x;
        else if (!excluded && runStart >= 0) {
          ctx.fillRect(runStart, y, x - runStart, 1);
          runStart = -1;
        }
      }
    }
    ctx.restore();
  }

  function drawTemplateOverlay(ctx, rect, marker, scale, isDraft, selectedMarker, selectedHandle) {
    if (!rect || rect.w <= 0 || rect.h <= 0) return;
    const s = scale || 1;
    ctx.save();
    ctx.fillStyle = isDraft ? "rgba(126, 63, 152, 0.12)" : "rgba(126, 63, 152, 0.2)";
    ctx.strokeStyle = "#7e3f98";
    ctx.lineWidth = 2 * s;
    ctx.setLineDash(isDraft ? [5 * s, 4 * s] : []);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    if (marker) {
      const r = 5 * s;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(marker.x - r, marker.y);
      ctx.lineTo(marker.x + r, marker.y);
      ctx.moveTo(marker.x, marker.y - r);
      ctx.lineTo(marker.x, marker.y + r);
      ctx.stroke();
      if (selectedMarker) {
        ctx.strokeStyle = "#f1c054";
        ctx.lineWidth = 2.5 * s;
        ctx.beginPath();
        ctx.arc(marker.x, marker.y, 8 * s, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (!isDraft) {
      const handleSize = 7 * s;
      Object.entries(templateHandlePoints(rect)).forEach(([key, point]) => {
        ctx.setLineDash([]);
        ctx.fillStyle = key === selectedHandle ? "#f1c054" : "#fff";
        ctx.strokeStyle = "#7e3f98";
        ctx.lineWidth = 1.5 * s;
        ctx.fillRect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize);
      });
    }
    ctx.restore();
  }

  function drawOverlays(ctx, scale) {
    const state = hooks.getState();
    if (!state.image || state.activeTab !== "plot") return;
    ensureAutoState(state);
    resizeMaskIfNeeded(state);

    const auto = state.auto;
    const w = auto.maskW;
    const h = auto.maskH;
    if (!auto.mask || !w || !h) return;

    const s = scale || 1;

    drawExcludedMaskOverlay(ctx, auto.mask, w, h);

    if (auto.templateRect) {
      drawTemplateOverlay(
        ctx,
        auto.templateRect,
        auto.templateMarker,
        s,
        false,
        state.selected && state.selected.type === "auto-template-marker",
        state.selected && state.selected.type === "auto-template-handle"
          ? state.selected.key
          : null
      );
    }

    if (auto.maskDrag && auto.maskDrag.kind === "template" && auto.maskDrag.moved) {
      drawTemplateOverlay(
        ctx,
        normalizedRect(auto.maskDrag.startPt, auto.maskDrag.currentPt),
        null,
        s,
        true,
        false,
        null
      );
    }

    if (auto.maskDrag && auto.maskDrag.kind === "rect") {
      const a = auto.maskDrag.startPt;
      const b = auto.maskDrag.currentPt;
      if (auto.maskDrag.moved) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
        if (auto.subtract) {
          fillGreyInsideRect(ctx, a.x, a.y, b.x, b.y);
        } else if (maskIsFull(auto.mask)) {
          fillGreyOutsideRect(ctx, w, h, a.x, a.y, b.x, b.y);
        }
        ctx.restore();
      }
      ctx.save();
      ctx.strokeStyle = auto.subtract ? "#c0392b" : "#2a8c5f";
      ctx.lineWidth = 2 * s;
      ctx.setLineDash([6 * s, 4 * s]);
      ctx.strokeRect(
        Math.min(a.x, b.x) + 0.5,
        Math.min(a.y, b.y) + 0.5,
        Math.abs(b.x - a.x),
        Math.abs(b.y - a.y)
      );
      ctx.restore();
    }

    if (auto.lassoPoints.length >= 2) {
      ctx.save();
      ctx.strokeStyle = auto.subtract ? "#c0392b" : "#2a8c5f";
      ctx.lineWidth = 2 * s;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(auto.lassoPoints[0].x, auto.lassoPoints[0].y);
      for (let i = 1; i < auto.lassoPoints.length; i++) {
        ctx.lineTo(auto.lassoPoints[i].x, auto.lassoPoints[i].y);
      }
      if (auto.lassoPoints.length >= 3) {
        ctx.lineTo(auto.lassoPoints[0].x, auto.lassoPoints[0].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (auto.polyPoints.length) {
      ctx.save();
      ctx.strokeStyle = auto.subtract ? "#c0392b" : "#2a8c5f";
      ctx.fillStyle = auto.subtract ? "rgba(192, 57, 43, 0.15)" : "rgba(42, 140, 95, 0.15)";
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(auto.polyPoints[0].x, auto.polyPoints[0].y);
      for (let i = 1; i < auto.polyPoints.length; i++) {
        ctx.lineTo(auto.polyPoints[i].x, auto.polyPoints[i].y);
      }
      if (state.cursor && state.pointerInside && auto.polyPoints.length) {
        ctx.lineTo(state.cursor.x, state.cursor.y);
      }
      if (auto.polyPoints.length >= 3) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
      auto.polyPoints.forEach((pt, i) => {
        ctx.beginPath();
        ctx.fillStyle = i === 0 && auto.polyPoints.length >= 3 ? "#f1c054" : "#fff";
        ctx.strokeStyle = auto.subtract ? "#c0392b" : "#2a8c5f";
        ctx.lineWidth = 1.5 * s;
        ctx.arc(pt.x, pt.y, (i === 0 ? 6 : 4) * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }
  }

  function drawZoomOverlays(ctx, sx, sy, k) {
    const state = hooks.getState();
    if (!state.image || state.activeTab !== "plot") return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.clip();
    ctx.translate(-sx * k, -sy * k);
    ctx.scale(k, k);
    drawOverlays(ctx, 1 / k);
    ctx.restore();
  }

  function updateStatus(state, statusEl) {
    if (!statusEl || state.activeTab !== "plot") return false;
    const mode = state.mode;
    if (!isAutoMode(mode)) return false;

    ensureAutoState(state);
    if (mode === "auto-mask-rect") {
      statusEl.textContent = state.auto.subtract
        ? "Click and drag a rectangle to subtract from the selected region."
        : "Click and drag a rectangle to add to the selected region.";
      return true;
    }
    if (mode === "auto-mask-lasso") {
      statusEl.textContent = state.auto.subtract
        ? "Click and drag a freeform lasso to subtract from the region (release to close)."
        : "Click and drag a freeform lasso to add to the region (release to close).";
      return true;
    }
    if (mode === "auto-mask-poly") {
      statusEl.textContent = state.auto.subtract
        ? "Click to add polygon vertices. Click the first point or press Esc to finish."
        : "Click to add polygon vertices. Click the first point or press Esc to finish.";
      return true;
    }
    if (mode === "auto-pick-data") {
      statusEl.textContent = "Click on the plot to pick the data color.";
      return true;
    }
    if (mode === "auto-pick-bg") {
      statusEl.textContent = "Click on the plot to pick the background color.";
      return true;
    }
    if (mode === "auto-template-rect") {
      statusEl.textContent = "Drag a tight rectangle around one complete marker to use it as the marker kernel.";
      return true;
    }
    return false;
  }

  const els = {};

  function syncColorInputs(state) {
    ensureAutoState(state);
    const dataHex = rgbToHex(state.auto.dataColor.r, state.auto.dataColor.g, state.auto.dataColor.b);
    const bgHex = rgbToHex(state.auto.bgColor.r, state.auto.bgColor.g, state.auto.bgColor.b);
    if (els.dataColor) els.dataColor.value = dataHex;
    if (els.dataHex) els.dataHex.value = dataHex;
    if (els.bgColor) els.bgColor.value = bgHex;
    if (els.bgHex) els.bgHex.value = bgHex;
  }

  function syncParamsFromInputs(state) {
    ensureAutoState(state);
    if (els.subtract) state.auto.subtract = els.subtract.checked;
    if (els.liveUpdate) state.auto.liveUpdate = els.liveUpdate.checked;
    if (els.grayscaleOnly) state.auto.grayscaleOnly = els.grayscaleOnly.checked;
    if (els.toleranceRange) {
      state.auto.tolerance = Number(els.toleranceRange.value);
      if (els.tolerance) els.tolerance.value = String(state.auto.tolerance);
    } else if (els.tolerance) {
      state.auto.tolerance = clamp(Number(els.tolerance.value), 0, 120);
    }
    if (els.minDistRange) {
      state.auto.minDist = Number(els.minDistRange.value);
      if (els.minDist) els.minDist.value = String(state.auto.minDist);
    } else if (els.minDist) {
      state.auto.minDist = clamp(Number(els.minDist.value), 1, 80);
    }
    if (els.templateThresholdRange) {
      state.auto.templateThreshold = Number(els.templateThresholdRange.value);
      if (els.templateThreshold) els.templateThreshold.value = String(state.auto.templateThreshold);
    } else if (els.templateThreshold) {
      state.auto.templateThreshold = clamp(Number(els.templateThreshold.value), 5, 99);
    }
    if (els.traceErrorBars) state.auto.traceErrorBars = els.traceErrorBars.checked;
    const peakRadio = document.querySelector('input[name="dig-auto-peak-position"]:checked');
    if (peakRadio) {
      state.auto.templatePeakPosition = peakRadio.value === "centroid" ? "centroid" : "maximum";
    }
    const modeRadio = document.querySelector('input[name="dig-auto-detect-mode"]:checked');
    if (modeRadio) {
      state.auto.detectMode = ["point", "template"].includes(modeRadio.value)
        ? modeRadio.value
        : "line";
    }
    updateDetectionControlVisibility(state);
  }

  function syncParamsToInputs(state) {
    ensureAutoState(state);
    if (els.subtract) els.subtract.checked = !!state.auto.subtract;
    if (els.liveUpdate) els.liveUpdate.checked = !!state.auto.liveUpdate;
    if (els.grayscaleOnly) els.grayscaleOnly.checked = !!state.auto.grayscaleOnly;
    if (els.tolerance) els.tolerance.value = String(state.auto.tolerance);
    if (els.toleranceRange) els.toleranceRange.value = String(state.auto.tolerance);
    if (els.minDist) els.minDist.value = String(state.auto.minDist);
    if (els.minDistRange) els.minDistRange.value = String(state.auto.minDist);
    if (els.templateThreshold) els.templateThreshold.value = String(state.auto.templateThreshold);
    if (els.templateThresholdRange) els.templateThresholdRange.value = String(state.auto.templateThreshold);
    if (els.traceErrorBars) els.traceErrorBars.checked = !!state.auto.traceErrorBars;
    document.querySelectorAll('input[name="dig-auto-detect-mode"]').forEach((el) => {
      el.checked = el.value === state.auto.detectMode;
    });
    document.querySelectorAll('input[name="dig-auto-peak-position"]').forEach((el) => {
      el.checked = el.value === state.auto.templatePeakPosition;
    });
    syncColorInputs(state);
    updateDetectionControlVisibility(state);
    updateTemplateReadout(state);
  }

  function updateDetectionControlVisibility(state) {
    ensureAutoState(state);
    const markerMode = state.auto.detectMode === "point" || state.auto.detectMode === "template";
    if (els.minDistRow) els.minDistRow.hidden = !markerMode;
    if (els.templateThresholdRow) els.templateThresholdRow.hidden = state.auto.detectMode !== "template";
    if (els.peakPositionRow) els.peakPositionRow.hidden = state.auto.detectMode !== "template";
    if (els.errorRow) els.errorRow.hidden = !markerMode;
    if (els.runErrorsBtn) els.runErrorsBtn.disabled = !markerMode || !state.auto.traceErrorBars;
    if (els.colorSettings) {
      els.colorSettings.hidden = state.auto.detectMode === "template" && !state.auto.traceErrorBars;
    }
    if (els.colorGroup) {
      els.colorGroup.hidden = state.auto.detectMode === "template" && !state.auto.traceErrorBars;
    }
    if (els.colorToolButtons) {
      const hideColorTools = state.auto.detectMode === "template" && !state.auto.traceErrorBars;
      els.colorToolButtons.forEach((button) => { button.hidden = hideColorTools; });
    }
  }

  function updateTemplateReadout(state) {
    if (!els.templateReadout) return;
    const bounds = state.auto.maskW && state.auto.maskH
      ? integerTemplateBounds(state.auto.templateRect, state.auto.maskW, state.auto.maskH)
      : null;
    els.templateReadout.textContent = bounds
      ? `Kernel: ${bounds.width} × ${bounds.height} px.`
      : "No marker kernel selected.";
    if (els.clearTemplateBtn) els.clearTemplateBtn.hidden = !bounds;
  }

  function wireControls() {
    els.subtract = document.getElementById("dig-auto-subtract");
    els.dataColor = document.getElementById("dig-auto-data-color");
    els.dataHex = document.getElementById("dig-auto-data-hex");
    els.bgColor = document.getElementById("dig-auto-bg-color");
    els.bgHex = document.getElementById("dig-auto-bg-hex");
    els.tolerance = document.getElementById("dig-auto-tolerance");
    els.toleranceRange = document.getElementById("dig-auto-tolerance-range");
    els.minDist = document.getElementById("dig-auto-min-dist");
    els.minDistRange = document.getElementById("dig-auto-min-dist-range");
    els.minDistRow = document.getElementById("dig-auto-min-dist-row");
    els.templateThreshold = document.getElementById("dig-auto-template-threshold");
    els.templateThresholdRange = document.getElementById("dig-auto-template-threshold-range");
    els.templateThresholdRow = document.getElementById("dig-auto-template-threshold-row");
    els.peakPositionRow = document.getElementById("dig-auto-peak-position-row");
    els.colorSettings = document.getElementById("dig-auto-color-settings");
    els.colorGroup = document.getElementById("dig-auto-color-group");
    els.colorToolButtons = document.querySelectorAll(
      '.digitizer-auto-mode-bar [data-mode="auto-pick-data"], '
      + '.digitizer-auto-mode-bar [data-mode="auto-pick-bg"]'
    );
    els.traceErrorBars = document.getElementById("dig-auto-trace-errors");
    els.errorRow = document.getElementById("dig-auto-error-row");
    els.clearTemplateBtn = document.getElementById("dig-auto-clear-template");
    els.templateReadout = document.getElementById("dig-auto-template-readout");
    els.runBtn = document.getElementById("dig-auto-run");
    els.runErrorsBtn = document.getElementById("dig-auto-run-errors");
    els.resetMaskBtn = document.getElementById("dig-auto-reset-mask");
    els.liveUpdate = document.getElementById("dig-auto-live");
    els.grayscaleOnly = document.getElementById("dig-auto-grayscale");

    if (els.runBtn) {
      els.runBtn.addEventListener("click", runAutoDigitizeNow);
    }
    if (els.runErrorsBtn) {
      els.runErrorsBtn.addEventListener("click", runErrorBarDetectionNow);
    }

    if (els.subtract) {
      els.subtract.addEventListener("change", () => {
        syncParamsFromInputs(hooks.getState());
        hooks.refreshAll();
      });
    }

    if (els.liveUpdate) {
      els.liveUpdate.addEventListener("change", () => {
        const state = hooks.getState();
        syncParamsFromInputs(state);
        if (state.auto.liveUpdate) {
          requestLiveAutoDigitize(true);
        } else {
          hooks.refreshAll();
        }
      });
    }

    if (els.grayscaleOnly) {
      els.grayscaleOnly.addEventListener("change", () => {
        syncParamsFromInputs(hooks.getState());
        requestLiveAutoDigitize(true);
        hooks.refreshAll();
      });
    }

    if (els.traceErrorBars) {
      els.traceErrorBars.addEventListener("change", () => {
        syncParamsFromInputs(hooks.getState());
        requestLiveAutoDigitize(true);
        hooks.refreshAll();
      });
    }

    function wireColorPair(colorEl, hexEl, key) {
      if (!colorEl || !hexEl) return;
      colorEl.addEventListener("input", () => {
        hexEl.value = colorEl.value;
        const rgb = parseColorInput(colorEl.value);
        if (rgb) {
          hooks.getState().auto[key] = rgb;
          requestLiveAutoDigitize();
        }
      });
      hexEl.addEventListener("change", () => {
        const rgb = parseColorInput(hexEl.value);
        if (rgb) {
          colorEl.value = rgbToHex(rgb.r, rgb.g, rgb.b);
          hexEl.value = rgbToHex(rgb.r, rgb.g, rgb.b);
          hooks.getState().auto[key] = rgb;
          requestLiveAutoDigitize(true);
        }
      });
    }
    wireColorPair(els.dataColor, els.dataHex, "dataColor");
    wireColorPair(els.bgColor, els.bgHex, "bgColor");

    function wireRangePair(rangeEl, numEl, key, min, max) {
      if (!rangeEl || !numEl) return;
      const apply = (fromRange) => {
        const state = hooks.getState();
        ensureAutoState(state);
        const v = fromRange ? Number(rangeEl.value) : clamp(Number(numEl.value), min, max);
        state.auto[key] = v;
        rangeEl.value = String(v);
        numEl.value = String(v);
      };
      rangeEl.addEventListener("input", () => {
        numEl.value = rangeEl.value;
        apply(true);
        requestLiveAutoDigitize();
      });
      numEl.addEventListener("change", () => {
        apply(false);
        requestLiveAutoDigitize(true);
      });
    }
    wireRangePair(els.toleranceRange, els.tolerance, "tolerance", 0, 120);
    wireRangePair(els.minDistRange, els.minDist, "minDist", 1, 80);
    wireRangePair(
      els.templateThresholdRange,
      els.templateThreshold,
      "templateThreshold",
      5,
      99
    );

    document.querySelectorAll('input[name="dig-auto-detect-mode"]').forEach((el) => {
      el.addEventListener("change", () => {
        const state = hooks.getState();
        syncParamsFromInputs(state);
        if (state.auto.detectMode === "template" && !state.auto.templateRect) {
          hooks.flashStatus("Select Marker kernel, then drag around one complete marker.");
        }
        requestLiveAutoDigitize(true);
        hooks.refreshAll();
      });
    });

    document.querySelectorAll('input[name="dig-auto-peak-position"]').forEach((el) => {
      el.addEventListener("change", () => {
        syncParamsFromInputs(hooks.getState());
        requestLiveAutoDigitize(true);
        hooks.refreshAll();
      });
    });

    if (els.clearTemplateBtn) {
      els.clearTemplateBtn.addEventListener("click", () => {
        const state = hooks.getState();
        ensureAutoState(state);
        state.auto.templateRect = null;
        state.auto.templateMarker = null;
        if (state.selected && (state.selected.type === "auto-template-marker"
            || state.selected.type === "auto-template-handle")) {
          state.selected = null;
        }
        updateTemplateReadout(state);
        if (state.auto.detectMode === "template") {
          state.points = [];
          if (state.selected && (state.selected.type === "data" || state.selected.type === "data-error")) {
            state.selected = null;
          }
        }
        hooks.flashStatus("Marker kernel cleared.");
        hooks.refreshAll();
      });
    }

    if (els.resetMaskBtn) {
      els.resetMaskBtn.addEventListener("click", () => {
        resetMask(hooks.getState());
        hooks.flashStatus("Region reset to the full plot.");
        requestLiveAutoDigitize(true);
        hooks.refreshAll();
      });
    }
  }

  window.DigitizerAuto = {
    AUTO_MODES,
    AUTO_MASK_MODES,
    AUTO_PICK_MODES,
    AUTO_MODE_LABELS,
    init(h) {
      hooks = h;
      const state = hooks.getState();
      if (!state.auto) state.auto = defaultAutoState();
      wireControls();
      syncParamsToInputs(state);
    },
    onImageLoaded(state) {
      ensureAutoState(state);
      state.auto.templateRect = null;
      state.auto.templateMarker = null;
      initMask(state);
      syncParamsToInputs(state);
    },
    restoreState(state) {
      ensureAutoState(state);
      resizeMaskIfNeeded(state);
      canonicalizeTemplateGeometry(state);
      cancelInProgress(state);
      syncParamsToInputs(state);
    },
    onImageCleared(state) {
      ensureAutoState(state);
      state.auto.mask = null;
      state.auto.templateRect = null;
      state.auto.templateMarker = null;
      cancelInProgress(state);
    },
    isAutoMode,
    isMaskMode,
    onMaskModeChange,
    handleCanvasClick,
    handleMouseDown,
    handleEscape,
    findTemplateHandleHit,
    findTemplateMarkerHit,
    getTemplateHandlePoint,
    getTemplateMarker,
    moveTemplateHandleTo,
    moveTemplateHandleBy,
    moveTemplateMarkerTo,
    moveTemplateMarkerBy,
    drawOverlays,
    drawZoomOverlays,
    updateStatus,
    resetMask,
    resizeMaskIfNeeded,
    requestLiveAutoDigitize
  };
})();
