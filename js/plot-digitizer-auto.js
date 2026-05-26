(function () {
  "use strict";

  /**
   * Auto-digitization for the plot digitizer: region masking, color picking,
   * and line / point detection algorithms.
   */

  const AUTO_MASK_MODES = new Set(["auto-mask-rect", "auto-mask-lasso", "auto-mask-poly"]);
  const AUTO_PICK_MODES = new Set(["auto-pick-data", "auto-pick-bg"]);
  const AUTO_MODES = new Set([...AUTO_MASK_MODES, ...AUTO_PICK_MODES]);

  const AUTO_MODE_LABELS = {
    "auto-mask-rect": "rectangle region",
    "auto-mask-lasso": "lasso region",
    "auto-mask-poly": "polygon region",
    "auto-pick-data": "data color",
    "auto-pick-bg": "background color"
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
    if (!state.auto) state.auto = defaultAutoState();
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

  function runAutoDigitize(state) {
    if (!state.auto) return [];
    if (state.auto.detectMode === "point") return runPointMode(state);
    return runLineMode(state);
  }

  let liveAutoTimer = null;

  function applyLiveAutoDigitize(state) {
    ensureAutoState(state);
    if (!state.auto.liveUpdate) return false;
    if (!hooks.readyToDigitize()) return false;
    syncParamsFromInputs(state);
    const detected = runAutoDigitize(state);
    state.points = detected;
    if (detected.length) {
      state.selected = { type: "data", index: detected.length - 1 };
      if (state.modeByTab) state.modeByTab.plot = "add";
      state.mode = "add";
    } else if (state.selected && state.selected.type === "data") {
      state.selected = null;
    }
    return true;
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
    if (mode !== "auto-mask-rect" && mode !== "auto-mask-lasso") return false;

    ensureAutoState(state);
    resizeMaskIfNeeded(state);
    state.auto.maskDrag = {
      kind: mode === "auto-mask-rect" ? "rect" : "lasso",
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
    const p = hooks.clientToImage(e);
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

    if (drag.kind === "rect") {
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
    const modeRadio = document.querySelector('input[name="dig-auto-detect-mode"]:checked');
    if (modeRadio) state.auto.detectMode = modeRadio.value === "point" ? "point" : "line";
    updateMinDistVisibility(state);
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
    document.querySelectorAll('input[name="dig-auto-detect-mode"]').forEach((el) => {
      el.checked = el.value === state.auto.detectMode;
    });
    syncColorInputs(state);
    updateMinDistVisibility(state);
  }

  function updateMinDistVisibility(state) {
    ensureAutoState(state);
    const show = state.auto.detectMode === "point";
    if (els.minDistRow) els.minDistRow.hidden = !show;
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
    els.resetMaskBtn = document.getElementById("dig-auto-reset-mask");
    els.liveUpdate = document.getElementById("dig-auto-live");
    els.grayscaleOnly = document.getElementById("dig-auto-grayscale");

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

    document.querySelectorAll('input[name="dig-auto-detect-mode"]').forEach((el) => {
      el.addEventListener("change", () => {
        syncParamsFromInputs(hooks.getState());
        requestLiveAutoDigitize(true);
        hooks.refreshAll();
      });
    });

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
      initMask(state);
      syncParamsToInputs(state);
    },
    onImageCleared(state) {
      ensureAutoState(state);
      state.auto.mask = null;
      cancelInProgress(state);
    },
    isAutoMode,
    isMaskMode,
    onMaskModeChange,
    handleCanvasClick,
    handleMouseDown,
    handleEscape,
    drawOverlays,
    updateStatus,
    resetMask,
    resizeMaskIfNeeded,
    requestLiveAutoDigitize
  };
})();
