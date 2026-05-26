(function () {
  "use strict";

  const STORAGE_KEY = "laue-analysis-config-v1";

  const canvas = document.getElementById("laue-canvas");
  const curveCanvas = document.getElementById("laue-curve-canvas");
  const colorbarCanvas = document.getElementById("laue-colorbar");
  const canvasInner = document.getElementById("laue-canvas-inner");
  const canvasStage = document.getElementById("laue-canvas-stage");
  const canvasViewport = document.getElementById("laue-canvas-viewport");
  const zoomRectEl = document.getElementById("laue-zoom-rect");
  const viewerFrame = document.getElementById("laue-viewer-frame");
  const viewerPlaceholder = document.getElementById("laue-viewer-placeholder");
  const colorbarMaxEl = document.getElementById("laue-colorbar-max");
  const colorbarMinEl = document.getElementById("laue-colorbar-min");
  const zoomLabel = document.getElementById("laue-zoom-label");
  const statusEl = document.getElementById("laue-status");
  const loadError = document.getElementById("laue-load-error");
  const peaksTbody = document.getElementById("laue-peaks-tbody");
  const refineResult = document.getElementById("laue-refine-result");
  const idealResult = document.getElementById("laue-ideal-result");

  const ctx = canvas.getContext("2d");
  const curveCtx = curveCanvas.getContext("2d");

  const state = {
    rawData: null,
    displayData: null,
    imageData: null,
    transform: { rotate90: 0, flipH: false, flipV: false },
    display: {
      colormap: "gray",
      vmin: 0,
      vmax: null,
      reverseColormap: true,
      invertIntensity: false,
      curvePoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
    },
    overlay: {
      predColor: "#8b0000",
      predLineWidth: 2,
      predRadius: 10,
      showBeamCenter: true,
      showObservedPeaks: true
    },
    crystal: { a: 5.43, b: 5.43, c: 5.43, alpha: 90, beta: 90, gamma: 90, spaceGroup: "Fm-3m" },
    instrument: {
      detDistance: 150,
      detWidth: 100,
      detHeight: 100,
      detOffsetX: 0,
      detOffsetY: 0,
      detOmega: 0,
      detChi: 90,
      detOmegaMisalign: 0,
      detChiMisalign: 0,
      laueMode: "backscatter",
      autoFlipH: false,
      autoFlipV: false,
      autoRotate90: 0,
      sampleOmega: 0,
      sampleChi: 0,
      samplePhi: 0,
      sampleSignOmega: 1,
      sampleSignChi: 1,
      sampleSignPhi: 1,
      beamX: null,
      beamY: null,
      beamRadius: 30,
      maxHklSq: 25,
      qMin: 0,
      qMax: 10,
      patternRotation: 0,
      peakThreshold: 500,
      peakMinRadius: 3
    },
    predictedPeaks: [],
    observedPeaks: [],
    mode: "view",
    view: { zoom: 1, fitScale: 1, centerX: null, centerY: null, tx: 0, ty: 0, totalScale: 1 },
    drag: null,
    curveDrag: null
  };

  const modeButtons = Array.from(document.querySelectorAll(".laue-mode-btn[data-mode]"));

  function showError(msg) {
    if (!msg) {
      loadError.hidden = true;
      loadError.textContent = "";
      return;
    }
    loadError.hidden = false;
    loadError.textContent = msg;
  }

  function setStatus(msg) {
    statusEl.textContent = msg || "";
  }

  function readCrystal() {
    return {
      a: num("laue-a"),
      b: num("laue-b"),
      c: num("laue-c"),
      alpha: num("laue-alpha"),
      beta: num("laue-beta"),
      gamma: num("laue-gamma"),
      spaceGroup: document.getElementById("laue-spacegroup").value.trim()
    };
  }

  function readInstrument() {
    const inst = { ...state.instrument };
    inst.detDistance = num("laue-det-distance");
    inst.detWidth = num("laue-det-width");
    inst.detHeight = num("laue-det-height");
    inst.detOffsetX = num("laue-det-offset-x");
    inst.detOffsetY = num("laue-det-offset-y");
    inst.detOmega = num("laue-det-omega");
    inst.detChi = num("laue-det-chi");
    inst.detOmegaMisalign = num("laue-det-omega-mis");
    inst.detChiMisalign = num("laue-det-chi-mis");
    inst.laueMode = document.getElementById("laue-laue-mode").value;
    inst.autoFlipH = document.getElementById("laue-auto-flip-h").checked;
    inst.autoFlipV = document.getElementById("laue-auto-flip-v").checked;
    inst.autoRotate90 = Number(document.getElementById("laue-auto-rotate").value) || 0;
    inst.sampleOmega = num("laue-sample-omega");
    inst.sampleChi = num("laue-sample-chi");
    inst.samplePhi = num("laue-sample-phi");
    inst.sampleSignOmega = document.getElementById("laue-sign-omega").value === "-1" ? -1 : 1;
    inst.sampleSignChi = document.getElementById("laue-sign-chi").value === "-1" ? -1 : 1;
    inst.sampleSignPhi = document.getElementById("laue-sign-phi").value === "-1" ? -1 : 1;
    inst.maxHklSq = num("laue-max-hkl-sq");
    inst.qMin = num("laue-q-min");
    inst.qMax = num("laue-q-max");
    inst.patternRotation = num("laue-pattern-rotation");
    inst.peakThreshold = num("laue-peak-threshold");
    inst.peakMinRadius = num("laue-peak-min-radius");
    if (state.instrument.beamX != null) {
      inst.beamX = state.instrument.beamX;
      inst.beamY = state.instrument.beamY;
      inst.beamRadius = state.instrument.beamRadius;
    }
    return inst;
  }

  function num(id) {
    const v = Number(document.getElementById(id).value);
    return Number.isFinite(v) ? v : 0;
  }

  function writeInstrumentToForm(inst) {
    const fields = {
      "laue-det-distance": inst.detDistance,
      "laue-det-width": inst.detWidth,
      "laue-det-height": inst.detHeight,
      "laue-det-offset-x": inst.detOffsetX,
      "laue-det-offset-y": inst.detOffsetY,
      "laue-det-omega": inst.detOmega,
      "laue-det-chi": inst.detChi,
      "laue-det-omega-mis": inst.detOmegaMisalign,
      "laue-det-chi-mis": inst.detChiMisalign,
      "laue-sample-omega": inst.sampleOmega,
      "laue-sample-chi": inst.sampleChi,
      "laue-sample-phi": inst.samplePhi,
      "laue-max-hkl-sq": inst.maxHklSq,
      "laue-q-min": inst.qMin,
      "laue-q-max": inst.qMax,
      "laue-pattern-rotation": inst.patternRotation,
      "laue-peak-threshold": inst.peakThreshold,
      "laue-peak-min-radius": inst.peakMinRadius
    };
    for (const [id, val] of Object.entries(fields)) {
      const el = document.getElementById(id);
      if (el) el.value = val;
    }
    document.getElementById("laue-laue-mode").value = inst.laueMode || "backscatter";
    document.getElementById("laue-sign-omega").value = String(inst.sampleSignOmega || 1);
    document.getElementById("laue-sign-chi").value = String(inst.sampleSignChi || 1);
    document.getElementById("laue-sign-phi").value = String(inst.sampleSignPhi || 1);
    document.getElementById("laue-auto-flip-h").checked = !!inst.autoFlipH;
    document.getElementById("laue-auto-flip-v").checked = !!inst.autoFlipV;
    document.getElementById("laue-auto-rotate").value = String(inst.autoRotate90 || 0);
    state.instrument.beamX = inst.beamX;
    state.instrument.beamY = inst.beamY;
    state.instrument.beamRadius = inst.beamRadius;
  }

  function extinctionContext() {
    if (!window.resolveExtinctionContext) return null;
    try {
      return resolveExtinctionContext(readCrystal().spaceGroup);
    } catch (_) {
      return null;
    }
  }

  function isAllowed(h, k, l) {
    const ctx = extinctionContext();
    if (!ctx || !window.isReflectionAllowed) return true;
    return isReflectionAllowed(h, k, l, ctx);
  }

  function buildConfig(inst) {
    return {
      ...inst,
      sampleSigns: { omega: inst.sampleSignOmega, chi: inst.sampleSignChi, phi: inst.sampleSignPhi }
    };
  }

  function defaultCurvePoints() {
    return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  }

  function ensureCurveEndpoints() {
    const pts = state.display.curvePoints;
    if (!pts.some((p) => Math.abs(p.x) < 1e-6)) pts.push({ x: 0, y: 0 });
    if (!pts.some((p) => Math.abs(p.x - 1) < 1e-6)) pts.push({ x: 1, y: 1 });
    pts.sort((a, b) => a.x - b.x);
    pts.forEach((p) => {
      if (Math.abs(p.x) < 1e-6) p.x = 0;
      if (Math.abs(p.x - 1) < 1e-6) p.x = 1;
    });
    state.display.curvePoints = pts;
  }

  function readDisplaySettings() {
    state.display.colormap = document.getElementById("laue-colormap").value;
    state.display.vmin = num("laue-vmin");
    const vmaxRaw = document.getElementById("laue-vmax").value;
    state.display.vmax = vmaxRaw === "" ? null : Number(vmaxRaw);
    state.display.reverseColormap = document.getElementById("laue-reverse-colormap").checked;
    state.display.invertIntensity = document.getElementById("laue-invert-intensity").checked;
    return state.display;
  }

  function readOverlaySettings() {
    state.overlay.predColor = document.getElementById("laue-pred-color").value;
    state.overlay.predLineWidth = num("laue-pred-linewidth") || 2;
    state.overlay.predRadius = num("laue-pred-radius") || 10;
    state.overlay.showBeamCenter = document.getElementById("laue-show-beam-center").checked;
    state.overlay.showObservedPeaks = document.getElementById("laue-show-observed-peaks").checked;
    return state.overlay;
  }

  function applyIntensityRangeFromData() {
    if (!state.displayData) return;
    const range = LaueFormats.intensityRange(state.displayData.intensities);
    document.getElementById("laue-vmin").value = range.min;
    document.getElementById("laue-vmax").value = range.max;
    state.display.vmin = range.min;
    state.display.vmax = range.max;
  }

  function reprocessImage() {
    if (!state.rawData) return;
    const data = {
      ...state.rawData,
      intensities: state.rawData.intensities.slice()
    };
    const inst = readInstrument();
    state.instrument = { ...state.instrument, ...inst };
    const t = {
      rotate90: (state.transform.rotate90 + (inst.autoRotate90 || 0)) % 4,
      flipH: Boolean(state.transform.flipH) !== Boolean(inst.autoFlipH),
      flipV: Boolean(state.transform.flipV) !== Boolean(inst.autoFlipV)
    };
    state.displayData = LaueFormats.applyDisplayTransform(data, t);
    if (state.instrument.beamX == null) {
      state.instrument.beamX = state.displayData.width / 2;
      state.instrument.beamY = state.displayData.height / 2;
    }
    const display = readDisplaySettings();
    const range = LaueFormats.intensityRange(state.displayData.intensities);
    const vmax = display.vmax ?? range.max;
    const vmin = display.vmin ?? range.min;
    state.imageData = LaueFormats.renderToImageData(state.displayData, {
      ...display,
      vmin,
      vmax
    });
    canvas.width = state.displayData.width;
    canvas.height = state.displayData.height;
    viewerPlaceholder.hidden = true;
    viewerFrame.hidden = false;
    updateColorbar();
    applyViewTransform();
    updatePredictions();
    redraw();
  }

  function resetCurve() {
    state.display.curvePoints = defaultCurvePoints();
    drawCurveEditor();
    reprocessImage();
    persistConfig();
  }

  function resetSampleOrientation() {
    document.getElementById("laue-sample-omega").value = 0;
    document.getElementById("laue-sample-chi").value = 0;
    document.getElementById("laue-sample-phi").value = 0;
    document.getElementById("laue-pattern-rotation").value = 0;
    updatePredictions();
    persistConfig();
    setStatus("Sample orientation reset to zero.");
  }

  function alignBeamHKL() {
    const hkl = parseHKL(document.getElementById("laue-align-beam-hkl").value);
    const resultEl = document.getElementById("laue-align-beam-result");
    if (!hkl) {
      resultEl.textContent = "Enter a valid HKL triple.";
      return;
    }
    const inst = readInstrument();
    const aligned = LaueMath.alignHKLToBeam(
      readCrystal(),
      hkl,
      { omega: inst.sampleOmega, chi: inst.sampleChi, phi: inst.samplePhi },
      { omega: inst.sampleSignOmega, chi: inst.sampleSignChi, phi: inst.sampleSignPhi }
    );
    document.getElementById("laue-sample-omega").value = aligned.omega.toFixed(4);
    document.getElementById("laue-sample-chi").value = aligned.chi.toFixed(4);
    document.getElementById("laue-sample-phi").value = aligned.phi.toFixed(4);
    updatePredictions();
    persistConfig();
    resultEl.textContent = `Aligned (${hkl.join(" ")}) to beam — dot product ${aligned.alignment.toFixed(5)}.`;
  }

  function syncColorbarHeight() {
    if (!canvasViewport || !colorbarCanvas) return;
    const h = Math.max(180, Math.min(canvasViewport.clientHeight || 220, 480));
    colorbarCanvas.height = h;
  }

  function updateColorbar() {
    if (!state.displayData || !colorbarCanvas) return;
    syncColorbarHeight();
    const display = readDisplaySettings();
    const range = LaueFormats.intensityRange(state.displayData.intensities);
    const result = LaueFormats.renderColorbar(
      colorbarCanvas,
      {
        ...display,
        vmin: display.vmin ?? range.min,
        vmax: display.vmax ?? range.max
      },
      state.displayData.maxIntensity
    ) || { minI: 0, maxI: 0 };
    if (colorbarMaxEl) colorbarMaxEl.textContent = formatIntensity(result.maxI);
    if (colorbarMinEl) colorbarMinEl.textContent = formatIntensity(result.minI);
  }

  function formatIntensity(value) {
    if (!Number.isFinite(value)) return "—";
    if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) {
      return value.toExponential(2);
    }
    return Number(value.toPrecision(4)).toString();
  }

  function computeFitScale() {
    if (!canvasViewport || !canvas.width || !canvas.height) return 1;
    const vw = canvasViewport.clientWidth;
    const vh = canvasViewport.clientHeight;
    if (vw <= 0 || vh <= 0) return 1;
    return Math.min(vw / canvas.width, vh / canvas.height);
  }

  function resetViewToFit() {
    state.view.zoom = 1;
    if (canvas.width && canvas.height) {
      state.view.centerX = canvas.width / 2;
      state.view.centerY = canvas.height / 2;
    } else {
      state.view.centerX = null;
      state.view.centerY = null;
    }
    applyViewTransform();
  }

  function applyViewTransform() {
    if (!canvasInner || !canvas.width || !canvas.height) return;
    const fit = computeFitScale();
    state.view.fitScale = fit;
    const total = fit * state.view.zoom;
    state.view.totalScale = total;

    if (state.view.centerX == null || state.view.centerY == null) {
      state.view.centerX = canvas.width / 2;
      state.view.centerY = canvas.height / 2;
    }

    const vw = canvasViewport ? canvasViewport.clientWidth : canvas.width;
    const vh = canvasViewport ? canvasViewport.clientHeight : canvas.height;
    const tx = vw / 2 - state.view.centerX * total;
    const ty = vh / 2 - state.view.centerY * total;
    state.view.tx = tx;
    state.view.ty = ty;

    canvasInner.style.transform = `translate(${tx}px, ${ty}px) scale(${total})`;
    canvasInner.style.transformOrigin = "0 0";
    if (zoomLabel) zoomLabel.textContent = `${Math.round(state.view.zoom * 100)}%`;
  }

  function viewportPoint(event) {
    const rect = canvasViewport.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function viewportToImage(vx, vy) {
    const total = state.view.totalScale || computeFitScale() * state.view.zoom;
    return {
      x: (vx - state.view.tx) / total,
      y: (vy - state.view.ty) / total
    };
  }

  function showZoomRect(x0, y0, x1, y1) {
    if (!zoomRectEl) return;
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    zoomRectEl.hidden = false;
    zoomRectEl.style.left = `${left}px`;
    zoomRectEl.style.top = `${top}px`;
    zoomRectEl.style.width = `${width}px`;
    zoomRectEl.style.height = `${height}px`;
  }

  function hideZoomRect() {
    if (!zoomRectEl) return;
    zoomRectEl.hidden = true;
  }

  function applyZoomToImageRect(x1, y1, x2, y2) {
    const iw = Math.abs(x2 - x1);
    const ih = Math.abs(y2 - y1);
    if (iw < 3 || ih < 3) return;

    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const vw = canvasViewport.clientWidth;
    const vh = canvasViewport.clientHeight;
    const fit = computeFitScale();
    const newTotal = Math.min(vw / iw, vh / ih);
    state.view.zoom = Math.min(8, Math.max(0.25, newTotal / fit));
    state.view.centerX = cx;
    state.view.centerY = cy;
    applyViewTransform();
  }

  function zoomAtPoint(factor, vx, vy) {
    const anchor = viewportToImage(vx, vy);
    state.view.zoom = Math.min(8, Math.max(0.25, state.view.zoom * factor));
    applyViewTransform();
    const after = viewportToImage(vx, vy);
    state.view.centerX += anchor.x - after.x;
    state.view.centerY += anchor.y - after.y;
    applyViewTransform();
  }

  function setZoom(nextZoom) {
    if (!canvasViewport) {
      state.view.zoom = Math.min(8, Math.max(0.25, nextZoom));
      applyViewTransform();
      return;
    }
    const center = { x: canvasViewport.clientWidth / 2, y: canvasViewport.clientHeight / 2 };
    const anchor = viewportToImage(center.x, center.y);
    state.view.zoom = Math.min(8, Math.max(0.25, nextZoom));
    applyViewTransform();
    const after = viewportToImage(center.x, center.y);
    state.view.centerX += anchor.x - after.x;
    state.view.centerY += anchor.y - after.y;
    applyViewTransform();
  }

  async function loadFile(file) {
    showError("");
    setStatus("Loading…");
    try {
      state.rawData = await LaueFormats.loadLaueFile(file);
      state.instrument.beamX = null;
      state.instrument.beamY = null;
      const meta = state.rawData.meta || {};
      if (meta.detDistanceMm) {
        document.getElementById("laue-det-distance").value = meta.detDistanceMm;
      }
      reprocessImage();
      applyIntensityRangeFromData();
      reprocessImage();
      resetViewToFit();
      requestAnimationFrame(() => resetViewToFit());
      setStatus(`Loaded ${file.name} (${state.displayData.width}×${state.displayData.height}, ${state.rawData.source})`);
    } catch (err) {
      showError(err.message || String(err));
      setStatus("");
    }
  }

  function setDetectorSizeFromImage() {
    if (!state.displayData) {
      setStatus("Load an image first.");
      return;
    }
    const w = state.displayData.width;
    const h = state.displayData.height;
    document.getElementById("laue-det-width").value = w;
    document.getElementById("laue-det-height").value = h;
    state.instrument.detWidth = w;
    state.instrument.detHeight = h;
    updatePredictions();
    persistConfig();
    setStatus(`Detector size set to ${w} × ${h} px (1 px/mm scale).`);
  }

  function updatePredictions() {
    if (!state.displayData) return;
    state.crystal = readCrystal();
    const inst = readInstrument();
    state.instrument = { ...state.instrument, ...inst };
    const config = buildConfig(state.instrument);
    const imageSize = { width: state.displayData.width, height: state.displayData.height };
    try {
      state.predictedPeaks = LaueMath.computePredictedPeaks(
        state.crystal,
        config,
        imageSize,
        isAllowed
      );
      renderPeaksTable();
    } catch (err) {
      setStatus(err.message);
    }
    redraw();
  }

  function renderPeaksTable() {
    if (!peaksTbody) return;
    const rows = state.predictedPeaks
      .sort((a, b) => a.hklSq - b.hklSq)
      .slice(0, 200)
      .map((p) => `
        <tr>
          <td>(${p.h}, ${p.k}, ${p.l})</td>
          <td>${p.q.toFixed(4)}</td>
          <td>${p.x.toFixed(1)}</td>
          <td>${p.y.toFixed(1)}</td>
        </tr>`)
      .join("");
    peaksTbody.innerHTML = rows || '<tr><td colspan="4">No peaks in range.</td></tr>';
  }

  function displayScale() {
    const rect = canvas.getBoundingClientRect();
    return rect.width ? canvas.width / rect.width : 1;
  }

  function clientToImage(event) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / Math.max(rect.width, 1);
    const sy = canvas.height / Math.max(rect.height, 1);
    return {
      x: (event.clientX - rect.left) * sx,
      y: (event.clientY - rect.top) * sy
    };
  }

  function redraw() {
    if (!state.imageData) return;
    ctx.putImageData(state.imageData, 0, 0);
    const s = displayScale();

    const beamX = state.instrument.beamX;
    const beamY = state.instrument.beamY;
    const beamR = state.instrument.beamRadius;

    const overlay = readOverlaySettings();

    if (overlay.showBeamCenter && beamX != null) {
      ctx.strokeStyle = "rgba(255, 220, 0, 0.9)";
      ctx.lineWidth = 1 / s;
      ctx.beginPath();
      ctx.arc(beamX, beamY, beamR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 220, 0, 0.95)";
      ctx.beginPath();
      ctx.arc(beamX, beamY, (4 / 3) / s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 120, 0, 0.95)";
      ctx.beginPath();
      ctx.arc(beamX + beamR, beamY, (5 / 3) / s, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = `${11 / s}px sans-serif`;
    ctx.strokeStyle = overlay.predColor;
    ctx.lineWidth = overlay.predLineWidth / s;
    for (const p of state.predictedPeaks) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, overlay.predRadius / s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = overlay.predColor;
      ctx.fillText(`${p.h}${p.k}${p.l}`, p.x + overlay.predRadius / s + 2 / s, p.y - 2 / s);
    }

    if (overlay.showObservedPeaks) {
      for (const p of state.observedPeaks) {
        ctx.strokeStyle = p.selected ? "rgba(255, 60, 60, 0.95)" : "rgba(255, 80, 80, 0.8)";
        ctx.lineWidth = 1 / s;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 / s, 0, Math.PI * 2);
        ctx.stroke();
        if (p.matchedH != null) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.fillText(`${p.matchedH}${p.matchedK}${p.matchedL}`, p.x + 6 / s, p.y + 12 / s);
        }
      }
    }
  }

  function curveToPx(pt, w, h) {
    return {
      x: pt.x * (w - 20) + 10,
      y: (1 - pt.y) * (h - 20) + 10
    };
  }

  function drawCurveEditor() {
    const w = curveCanvas.width;
    const h = curveCanvas.height;
    curveCtx.fillStyle = "#1a1d24";
    curveCtx.fillRect(0, 0, w, h);
    curveCtx.strokeStyle = "#4a5568";
    curveCtx.lineWidth = 1;
    curveCtx.strokeRect(0.5, 0.5, w - 1, h - 1);

    const pts = [...state.display.curvePoints].sort((a, b) => a.x - b.x);
    curveCtx.strokeStyle = "#63b3ed";
    curveCtx.lineWidth = 2;
    curveCtx.beginPath();
    for (let i = 0; i <= 100; i += 1) {
      const t = i / 100;
      const y = LaueFormats.evaluateCurve(pts, t);
      const px = t * (w - 20) + 10;
      const py = (1 - y) * (h - 20) + 10;
      if (i === 0) curveCtx.moveTo(px, py);
      else curveCtx.lineTo(px, py);
    }
    curveCtx.stroke();

    for (const pt of pts) {
      const px = curveToPx(pt, w, h);
      curveCtx.fillStyle = "#f6ad55";
      curveCtx.beginPath();
      curveCtx.arc(px.x, px.y, 5, 0, Math.PI * 2);
      curveCtx.fill();
    }
  }

  function curvePointFromEvent(event) {
    const rect = curveCanvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  function hitCurvePoint(event, radius = 10) {
    const w = curveCanvas.width;
    const h = curveCanvas.height;
    const pos = curvePointFromEvent(event);
    for (let i = 0; i < state.display.curvePoints.length; i += 1) {
      const pt = state.display.curvePoints[i];
      const px = pt.x * (w - 20) + 10;
      const py = (1 - pt.y) * (h - 20) + 10;
      const cx = pos.x * w;
      const cy = (1 - pos.y) * h;
      if ((px - cx) ** 2 + (py - cy) ** 2 < radius * radius) return i;
    }
    return -1;
  }

  function saveConfigToObject() {
    return {
      crystal: readCrystal(),
      instrument: readInstrument(),
      transform: state.transform,
      display: readDisplaySettings(),
      overlay: readOverlaySettings(),
      view: state.view,
      observedPeaks: state.observedPeaks.map(({ x, y, matchedH, matchedK, matchedL }) => ({
        x, y, matchedH, matchedK, matchedL
      }))
    };
  }

  function loadConfigFromObject(obj) {
    if (!obj) return;
    if (obj.crystal) {
      for (const [key, val] of Object.entries(obj.crystal)) {
        const el = document.getElementById(`laue-${key === "spaceGroup" ? "spacegroup" : key}`);
        if (el) el.value = val;
      }
    }
    if (obj.instrument) writeInstrumentToForm(obj.instrument);
    if (obj.transform) state.transform = { ...obj.transform };
    if (obj.display) {
      state.display = { ...state.display, ...obj.display };
      ensureCurveEndpoints();
    }
    if (obj.overlay) state.overlay = { ...state.overlay, ...obj.overlay };
    if (obj.observedPeaks) state.observedPeaks = obj.observedPeaks.map((p, i) => ({ ...p, id: i }));
    if (obj.view) state.view = { ...state.view, ...obj.view };
    document.getElementById("laue-colormap").value = state.display.colormap || "gray";
    document.getElementById("laue-vmin").value = state.display.vmin ?? 0;
    document.getElementById("laue-vmax").value = state.display.vmax ?? "";
    document.getElementById("laue-reverse-colormap").checked = state.display.reverseColormap !== false;
    document.getElementById("laue-invert-intensity").checked = !!state.display.invertIntensity;
    document.getElementById("laue-pred-color").value = state.overlay.predColor || "#8b0000";
    document.getElementById("laue-pred-linewidth").value = state.overlay.predLineWidth ?? 2;
    document.getElementById("laue-pred-radius").value = state.overlay.predRadius ?? 10;
    document.getElementById("laue-show-beam-center").checked = state.overlay.showBeamCenter !== false;
    document.getElementById("laue-show-observed-peaks").checked = state.overlay.showObservedPeaks !== false;
    if (state.rawData) reprocessImage();
    else applyViewTransform();
    drawCurveEditor();
  }

  function persistConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saveConfigToObject()));
    } catch (_) { /* quota */ }
  }

  function restoreConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) loadConfigFromObject(JSON.parse(raw));
    } catch (_) { /* ignore */ }
  }

  function runAutoDetect() {
    if (!state.displayData) return;
    const inst = readInstrument();
    const display = readDisplaySettings();
    const range = LaueFormats.intensityRange(state.displayData.intensities);
    const maxI = display.vmax ?? range.max;
    const minI = display.vmin ?? range.min;
    const intensities = LaueFormats.getEffectiveIntensities(
      state.displayData.intensities,
      minI,
      maxI,
      display.invertIntensity
    );
    state.observedPeaks = LaueMath.autoDetectPeaks(
      intensities,
      state.displayData.width,
      state.displayData.height,
      inst.peakThreshold,
      inst.peakMinRadius
    );
    matchPeaks();
    redraw();
    setStatus(`Detected ${state.observedPeaks.length} peaks.`);
  }

  function matchPeaks() {
    const matched = LaueMath.matchObservedToPredicted(state.observedPeaks, state.predictedPeaks, 25);
    state.observedPeaks = matched;
  }

  function runRefinement() {
    if (!state.displayData) return;
    const flags = {
      sampleOmega: document.getElementById("laue-refine-omega").checked,
      sampleChi: document.getElementById("laue-refine-chi").checked,
      samplePhi: document.getElementById("laue-refine-phi").checked,
      detDistance: document.getElementById("laue-refine-distance").checked,
      detOffsetX: document.getElementById("laue-refine-offset-x").checked,
      detOffsetY: document.getElementById("laue-refine-offset-y").checked,
      detOmegaMisalign: document.getElementById("laue-refine-det-omega").checked,
      detChiMisalign: document.getElementById("laue-refine-det-chi").checked
    };
    matchPeaks();
    const result = LaueMath.refineOrientation(
      readCrystal(),
      buildConfig(readInstrument()),
      { width: state.displayData.width, height: state.displayData.height },
      state.observedPeaks,
      flags,
      isAllowed,
      30
    );
    writeInstrumentToForm(result.config);
    updatePredictions();
    refineResult.textContent = result.rms != null
      ? `RMS pixel residual: ${result.rms.toFixed(2)} px`
      : "Assign index matches to observed peaks first (auto-detect + match).";
  }

  function runIdealOrientation() {
    const beamHKL = parseHKL(document.getElementById("laue-target-beam-hkl").value);
    const horizHKL = parseHKL(document.getElementById("laue-target-horiz-hkl").value);
    if (!beamHKL || !horizHKL) {
      idealResult.textContent = "Enter valid HKL triples.";
      return;
    }
    const inst = readInstrument();
    const dev = LaueMath.idealOrientationDeviation(
      readCrystal(),
      { omega: inst.sampleOmega, chi: inst.sampleChi, phi: inst.samplePhi },
      beamHKL,
      horizHKL,
      { omega: inst.sampleSignOmega, chi: inst.sampleSignChi, phi: inst.sampleSignPhi }
    );
    idealResult.innerHTML = `
      Beam misalignment: ${dev.beamMisalignmentDeg.toFixed(3)}°<br>
      Horizontal-plane misalignment: ${dev.horizontalMisalignmentDeg.toFixed(3)}°<br>
      Suggested Ω correction: ${dev.suggestedOmegaCorrection.toFixed(3)}°`;
  }

  function parseHKL(text) {
    const parts = String(text).trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return null;
    return parts;
  }

  function applyCifData(data) {
    if (data.a != null) document.getElementById("laue-a").value = data.a;
    if (data.b != null) document.getElementById("laue-b").value = data.b;
    if (data.c != null) document.getElementById("laue-c").value = data.c;
    if (data.alpha != null) document.getElementById("laue-alpha").value = data.alpha;
    if (data.beta != null) document.getElementById("laue-beta").value = data.beta;
    if (data.gamma != null) document.getElementById("laue-gamma").value = data.gamma;
    if (data.spaceGroupName) document.getElementById("laue-spacegroup").value = data.spaceGroupName;
    const status = document.getElementById("cif-status");
    if (status) {
      status.textContent = describeCif(data);
      status.classList.remove("tool-cif-status-error");
    }
    updatePredictions();
    persistConfig();
  }

  function onCanvasMouseDown(event) {
    if (!state.displayData) return;

    if (state.mode === "zoom-area" && event.button === 0) {
      const vp = viewportPoint(event);
      state.drag = { type: "zoom-rect", x0: vp.x, y0: vp.y, x1: vp.x, y1: vp.y };
      showZoomRect(vp.x, vp.y, vp.x, vp.y);
      return;
    }

    if (event.button !== 0) return;

    const pos = clientToImage(event);
    const beamX = state.instrument.beamX;
    const beamY = state.instrument.beamY;
    const beamR = state.instrument.beamRadius;
    const s = displayScale();

    if (state.mode === "beam") {
      const onRadius = Math.hypot(pos.x - (beamX + beamR), pos.y - beamY) < 10 / s;
      const onCenter = Math.hypot(pos.x - beamX, pos.y - beamY) < 10 / s;
      if (onRadius) state.drag = { type: "beam-radius", startR: beamR, cx: beamX, cy: beamY };
      else if (onCenter) state.drag = { type: "beam-center", dx: pos.x - beamX, dy: pos.y - beamY };
      else state.drag = { type: "beam-center", dx: 0, dy: 0 };
      return;
    }

    if (state.mode === "add-peak") {
      state.observedPeaks.push({ x: pos.x, y: pos.y, id: state.observedPeaks.length });
      matchPeaks();
      redraw();
      return;
    }

    if (state.mode === "remove-peak") {
      const hit = state.observedPeaks.findIndex((p) => Math.hypot(p.x - pos.x, p.y - pos.y) < 12 / s);
      if (hit >= 0) state.observedPeaks.splice(hit, 1);
      redraw();
      return;
    }

    if (state.mode === "pan-orientation") {
      state.drag = { type: "pan-orient", lastX: pos.x, lastY: pos.y };
      return;
    }

    if (state.mode === "rotate-pattern") {
      state.drag = { type: "rotate-pattern", cx: beamX, cy: beamY, startAngle: Math.atan2(pos.y - beamY, pos.x - beamX) };
    }
  }

  function onCanvasMouseMove(event) {
    if (state.drag && state.drag.type === "zoom-rect") {
      const vp = viewportPoint(event);
      state.drag.x1 = vp.x;
      state.drag.y1 = vp.y;
      showZoomRect(state.drag.x0, state.drag.y0, state.drag.x1, state.drag.y1);
      return;
    }
    if (!state.drag) return;
    const pos = clientToImage(event);

    if (state.drag.type === "beam-center") {
      state.instrument.beamX = pos.x - (state.drag.dx || 0);
      state.instrument.beamY = pos.y - (state.drag.dy || 0);
      redraw();
    } else if (state.drag.type === "beam-radius") {
      state.instrument.beamRadius = Math.max(5, Math.hypot(pos.x - state.drag.cx, pos.y - state.drag.cy));
      redraw();
    } else if (state.drag.type === "pan-orient") {
      const dx = pos.x - state.drag.lastX;
      const dy = pos.y - state.drag.lastY;
      state.drag.lastX = pos.x;
      state.drag.lastY = pos.y;
      const sens = 0.05;
      document.getElementById("laue-sample-omega").value = num("laue-sample-omega") + dx * sens;
      document.getElementById("laue-sample-chi").value = num("laue-sample-chi") - dy * sens;
      updatePredictions();
    } else if (state.drag.type === "rotate-pattern") {
      const angle = Math.atan2(pos.y - state.drag.cy, pos.x - state.drag.cx);
      const delta = (angle - state.drag.startAngle) * 180 / Math.PI;
      state.drag.startAngle = angle;
      document.getElementById("laue-pattern-rotation").value = num("laue-pattern-rotation") + delta;
      updatePredictions();
    }
  }

  function endDrag() {
    if (state.drag && state.drag.type === "zoom-rect") {
      const { x0, y0, x1, y1 } = state.drag;
      hideZoomRect();
      const p0 = viewportToImage(x0, y0);
      const p1 = viewportToImage(x1, y1);
      applyZoomToImageRect(p0.x, p0.y, p1.x, p1.y);
      state.drag = null;
      persistConfig();
      return;
    }
    if (state.drag) {
      state.drag = null;
      persistConfig();
    }
  }

  function onCanvasContextMenu(event) {
    event.preventDefault();
    resetViewToFit();
    hideZoomRect();
    setStatus("Zoom reset to fit image.");
  }

  function setMode(mode) {
    state.mode = mode;
    modeButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    if (canvasViewport) {
      canvasViewport.classList.toggle("laue-zoom-area-mode", mode === "zoom-area");
    }
    setStatus({
      view: "View mode — scroll wheel to zoom; right-click resets zoom",
      "zoom-area": "Drag a rectangle to zoom; right-click resets zoom",
      beam: "Drag beam center; drag orange handle to scale circle",
      "pan-orientation": "Drag to adjust sample Ω and χ",
      "rotate-pattern": "Drag to rotate predicted pattern about beam center",
      "add-peak": "Click to add observed peak",
      "remove-peak": "Click to remove nearest observed peak"
    }[mode] || mode);
  }

  function bindEvents() {
    document.getElementById("laue-file-input").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) loadFile(file);
      e.target.value = "";
    });
    document.getElementById("laue-upload-btn").addEventListener("click", () => {
      document.getElementById("laue-file-input").click();
    });

    document.addEventListener("paste", (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) loadFile(file);
          break;
        }
      }
    });

    document.getElementById("laue-example-btn").addEventListener("click", async () => {
      try {
        const resp = await fetch("../files/laue/example_laue.png");
        const blob = await resp.blob();
        await loadFile(new File([blob], "example_laue.png", { type: "image/png" }));
      } catch (err) {
        showError("Could not load example image.");
      }
    });

    ["laue-rotate-cw", "laue-flip-h", "laue-flip-v"].forEach((id) => {
      document.getElementById(id).addEventListener("click", () => {
        if (id === "laue-rotate-cw") state.transform.rotate90 = (state.transform.rotate90 + 1) % 4;
        if (id === "laue-flip-h") state.transform.flipH = !state.transform.flipH;
        if (id === "laue-flip-v") state.transform.flipV = !state.transform.flipV;
        reprocessImage();
        persistConfig();
      });
    });

    document.getElementById("laue-det-size-from-image").addEventListener("click", setDetectorSizeFromImage);

    document.getElementById("laue-colormap").addEventListener("change", () => reprocessImage());
    document.getElementById("laue-vmin").addEventListener("input", () => reprocessImage());
    document.getElementById("laue-vmax").addEventListener("input", () => reprocessImage());
    document.getElementById("laue-reverse-colormap").addEventListener("change", () => reprocessImage());
    document.getElementById("laue-invert-intensity").addEventListener("change", () => reprocessImage());
    document.getElementById("laue-curve-reset").addEventListener("click", resetCurve);
    document.getElementById("laue-reset-orientation").addEventListener("click", resetSampleOrientation);
    document.getElementById("laue-align-beam-btn").addEventListener("click", alignBeamHKL);

    ["laue-pred-color", "laue-pred-linewidth", "laue-pred-radius", "laue-show-beam-center", "laue-show-observed-peaks"].forEach((id) => {
      document.getElementById(id).addEventListener("input", () => { readOverlaySettings(); redraw(); persistConfig(); });
      document.getElementById(id).addEventListener("change", () => { readOverlaySettings(); redraw(); persistConfig(); });
    });

    document.getElementById("laue-zoom-in").addEventListener("click", () => setZoom(state.view.zoom * 1.25));
    document.getElementById("laue-zoom-out").addEventListener("click", () => setZoom(state.view.zoom / 1.25));
    document.getElementById("laue-zoom-reset").addEventListener("click", () => resetViewToFit());

    if (canvasViewport) {
      canvasViewport.addEventListener("wheel", (e) => {
        if (!state.displayData) return;
        e.preventDefault();
        const vp = viewportPoint(e);
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        zoomAtPoint(factor, vp.x, vp.y);
      }, { passive: false });

      canvasViewport.addEventListener("mousedown", (e) => {
        if (state.mode !== "zoom-area" || e.button !== 0 || !state.displayData) return;
        if (e.target === canvas) return;
        const vp = viewportPoint(e);
        state.drag = { type: "zoom-rect", x0: vp.x, y0: vp.y, x1: vp.x, y1: vp.y };
        showZoomRect(vp.x, vp.y, vp.x, vp.y);
      });

      canvasViewport.addEventListener("contextmenu", onCanvasContextMenu);
    }

    document.getElementById("laue-clear-peaks-btn").addEventListener("click", () => {
      state.observedPeaks = [];
      redraw();
      setStatus("Removed all observed peaks.");
      persistConfig();
    });

    curveCanvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const idx = hitCurvePoint(e);
      if (idx >= 0) {
        state.curveDrag = idx;
        return;
      }
      const pt = curvePointFromEvent(e);
      state.display.curvePoints.push(pt);
      ensureCurveEndpoints();
      drawCurveEditor();
      reprocessImage();
    });
    curveCanvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const idx = hitCurvePoint(e);
      if (idx < 0 || state.display.curvePoints.length <= 2) return;
      const pt = state.display.curvePoints[idx];
      if (Math.abs(pt.x) < 1e-6 || Math.abs(pt.x - 1) < 1e-6) return;
      state.display.curvePoints.splice(idx, 1);
      ensureCurveEndpoints();
      drawCurveEditor();
      reprocessImage();
      persistConfig();
    });
    curveCanvas.addEventListener("mousemove", (e) => {
      if (state.curveDrag == null) return;
      const pt = curvePointFromEvent(e);
      const dragged = state.display.curvePoints[state.curveDrag];
      const lockX = Math.abs(dragged.x) < 1e-6 ? 0 : (Math.abs(dragged.x - 1) < 1e-6 ? 1 : pt.x);
      pt.x = lockX;
      pt.y = curvePointFromEvent(e).y;
      state.display.curvePoints[state.curveDrag] = pt;
      ensureCurveEndpoints();
      state.curveDrag = state.display.curvePoints.findIndex(
        (p) => Math.abs(p.x - lockX) < 1e-6 && Math.abs(p.y - pt.y) < 0.15
      );
      if (state.curveDrag < 0) {
        state.curveDrag = state.display.curvePoints.findIndex((p) => Math.abs(p.x - lockX) < 1e-6);
      }
      drawCurveEditor();
      reprocessImage();
    });
    window.addEventListener("mouseup", () => {
      state.curveDrag = null;
      endDrag();
    });
    window.addEventListener("mousemove", (e) => {
      if (state.drag && state.drag.type === "zoom-rect") {
        onCanvasMouseMove(e);
      }
    });

    canvas.addEventListener("mousedown", onCanvasMouseDown);
    canvas.addEventListener("mousemove", onCanvasMouseMove);
    canvas.addEventListener("contextmenu", onCanvasContextMenu);

    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => setMode(btn.dataset.mode));
    });

    document.querySelectorAll("#laue-crystal-form input, #laue-instrument-form input, #laue-instrument-form select")
      .forEach((el) => {
        el.addEventListener("input", () => { updatePredictions(); persistConfig(); });
        el.addEventListener("change", () => {
          if (el.id === "laue-auto-flip-h" || el.id === "laue-auto-flip-v" || el.id === "laue-auto-rotate") {
            reprocessImage();
          } else {
            updatePredictions();
          }
          persistConfig();
        });
      });

    window.addEventListener("resize", () => {
      if (state.displayData) {
        applyViewTransform();
        updateColorbar();
      }
    });

    document.getElementById("laue-auto-detect-btn").addEventListener("click", runAutoDetect);
    document.getElementById("laue-match-btn").addEventListener("click", () => { matchPeaks(); redraw(); });
    document.getElementById("laue-refine-btn").addEventListener("click", runRefinement);
    document.getElementById("laue-ideal-btn").addEventListener("click", runIdealOrientation);

    document.getElementById("laue-save-config-btn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(saveConfigToObject(), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "laue-config.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    document.getElementById("laue-load-config-btn").addEventListener("click", () => {
      document.getElementById("laue-config-file").click();
    });
    document.getElementById("laue-config-file").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      file.text().then((text) => loadConfigFromObject(JSON.parse(text))).catch(() => showError("Invalid config file."));
      e.target.value = "";
    });

    const cifLoadButton = document.getElementById("cif-load-button");
    const cifFileInput = document.getElementById("cif-file");
    if (cifLoadButton && cifFileInput) {
      cifLoadButton.addEventListener("click", () => cifFileInput.click());
      cifFileInput.addEventListener("change", () => {
        const file = cifFileInput.files && cifFileInput.files[0];
        if (!file) return;
        file.text().then((text) => {
          try {
            applyCifData(parseCif(text));
          } catch (err) {
            const status = document.getElementById("cif-status");
            status.textContent = err.message;
            status.classList.add("tool-cif-status-error");
          }
        });
        cifFileInput.value = "";
      });
    }

    const presetSelect = document.getElementById("crystal-preset");
    if (presetSelect && window.populateCrystalPresetSelect) {
      populateCrystalPresetSelect(presetSelect);
      presetSelect.addEventListener("change", () => {
        const preset = getCrystalPreset(presetSelect.value);
        if (!preset) return;
        applyCrystalPresetToFields(preset, {
          a: document.getElementById("laue-a"),
          b: document.getElementById("laue-b"),
          c: document.getElementById("laue-c"),
          alpha: document.getElementById("laue-alpha"),
          beta: document.getElementById("laue-beta"),
          gamma: document.getElementById("laue-gamma"),
          spaceGroup: document.getElementById("laue-spacegroup")
        });
        updatePredictions();
        persistConfig();
      });
    }
  }

  bindEvents();
  ensureCurveEndpoints();
  drawCurveEditor();
  restoreConfig();
  setMode("view");
})();
