(function () {
  "use strict";

  const STORAGE_KEY = "laue-analysis-config-v1";

  const canvas = document.getElementById("laue-canvas");
  const overlayCanvas = document.getElementById("laue-overlay-canvas");
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
  const overlayCtx = overlayCanvas ? overlayCanvas.getContext("2d") : null;
  const curveCtx = curveCanvas.getContext("2d");

  const state = {
    rawData: null,
    transformedData: null,
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
    corrections: {
      gaussianBlur: false,
      blurRadius: 1.5,
      radialNormalize: false,
      radialBins: 32
    },
    rawIntensityRange: null,
    overlay: {
      predColor: "#006400",
      predLineWidth: 2,
      predRadius: 5,
      predAlpha: 0.8,
      obsColor: "#8b0000",
      obsLineWidth: 2,
      obsRadius: 5,
      obsAlpha: 0.8,
      showBeamCenter: true,
      showObservedPeaks: true,
      showPredictedPeaks: true,
      showPredictedLabels: true,
      showObservedLabels: true
    },
    crystal: { a: 5.43, b: 5.43, c: 5.43, alpha: 90, beta: 90, gamma: 90, spaceGroup: "Fd-3m" },
    instrument: {
      detDistance: 150,
      detWidth: 256,
      detHeight: 256,
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
    curveDrag: null,
    refinementUndo: null
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
      spaceGroup: document.getElementById("laue-spacegroup").value.trim(),
      diamondBasis: document.getElementById("laue-diamond-basis").checked
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
      const crystal = readCrystal();
      return resolveExtinctionContext(crystal.spaceGroup, {
        applyDiamondBasis: crystal.diamondBasis
      });
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
    const cfg = {
      ...inst,
      sampleSigns: { omega: inst.sampleSignOmega, chi: inst.sampleSignChi, phi: inst.sampleSignPhi }
    };
    if (state.displayData) {
      const beam = beamCenterPosition();
      cfg.beamX = beam.x;
      cfg.beamY = beam.y;
    }
    return cfg;
  }

  function imageBeamReference() {
    if (!state.displayData) {
      return {
        x: state.instrument.beamX ?? 0,
        y: state.instrument.beamY ?? 0
      };
    }
    return {
      x: state.displayData.width / 2,
      y: state.displayData.height / 2
    };
  }

  function beamCenterPosition() {
    const ref = imageBeamReference();
    const offsetX = Number.isFinite(state.instrument.detOffsetX)
      ? state.instrument.detOffsetX
      : num("laue-det-offset-x");
    const offsetY = Number.isFinite(state.instrument.detOffsetY)
      ? state.instrument.detOffsetY
      : num("laue-det-offset-y");
    return { x: ref.x + offsetX, y: ref.y + offsetY };
  }

  function setBeamCenterPosition(x, y) {
    const ref = imageBeamReference();
    state.instrument.beamX = ref.x;
    state.instrument.beamY = ref.y;
    state.instrument.detOffsetX = x - ref.x;
    state.instrument.detOffsetY = y - ref.y;
    document.getElementById("laue-det-offset-x").value = state.instrument.detOffsetX;
    document.getElementById("laue-det-offset-y").value = state.instrument.detOffsetY;
  }

  /** Fold legacy beamX/beamY stored away from image center into detector offsets. */
  function normalizeBeamStorage() {
    if (!state.displayData) return;
    const ref = imageBeamReference();
    const bx = state.instrument.beamX;
    const by = state.instrument.beamY;
    if (bx != null && by != null && (Math.abs(bx - ref.x) > 1e-6 || Math.abs(by - ref.y) > 1e-6)) {
      state.instrument.detOffsetX = (state.instrument.detOffsetX ?? num("laue-det-offset-x")) + (bx - ref.x);
      state.instrument.detOffsetY = (state.instrument.detOffsetY ?? num("laue-det-offset-y")) + (by - ref.y);
      document.getElementById("laue-det-offset-x").value = state.instrument.detOffsetX;
      document.getElementById("laue-det-offset-y").value = state.instrument.detOffsetY;
    }
    state.instrument.beamX = ref.x;
    state.instrument.beamY = ref.y;
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

  function colorInputToRgba(hex, alpha) {
    const h = (hex || "#8b0000").replace("#", "");
    if (h.length !== 6) return `rgba(139, 0, 0, ${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function syncDetectorSizeFromImage() {
    if (!state.displayData) return;
    const w = state.displayData.width;
    const h = state.displayData.height;
    document.getElementById("laue-det-width").value = w;
    document.getElementById("laue-det-height").value = h;
    state.instrument.detWidth = w;
    state.instrument.detHeight = h;
  }

  function readOverlayAlpha(inputId) {
    return Math.min(1, Math.max(0, (num(inputId) ?? 80) / 100));
  }

  function readOverlaySettings() {
    state.overlay.predColor = document.getElementById("laue-pred-color").value;
    state.overlay.predLineWidth = num("laue-pred-linewidth") || 2;
    state.overlay.predRadius = num("laue-pred-radius") || 5;
    state.overlay.predAlpha = readOverlayAlpha("laue-pred-alpha");
    state.overlay.obsColor = document.getElementById("laue-obs-color").value;
    state.overlay.obsLineWidth = num("laue-obs-linewidth") || 2;
    state.overlay.obsRadius = num("laue-obs-radius") || 5;
    state.overlay.obsAlpha = readOverlayAlpha("laue-obs-alpha");
    state.overlay.showBeamCenter = document.getElementById("laue-show-beam-center").checked;
    state.overlay.showObservedPeaks = document.getElementById("laue-show-observed-peaks").checked;
    state.overlay.showPredictedPeaks = document.getElementById("laue-show-predicted-peaks").checked;
    state.overlay.showPredictedLabels = document.getElementById("laue-show-predicted-labels").checked;
    state.overlay.showObservedLabels = document.getElementById("laue-show-observed-labels").checked;
    return state.overlay;
  }

  function writeOverlaySettingsToForm(overlay) {
    const o = overlay || state.overlay;
    document.getElementById("laue-pred-color").value = o.predColor || "#006400";
    document.getElementById("laue-pred-linewidth").value = o.predLineWidth ?? 2;
    document.getElementById("laue-pred-radius").value = o.predRadius ?? 5;
    document.getElementById("laue-pred-alpha").value = Math.round((o.predAlpha ?? 0.8) * 100);
    document.getElementById("laue-obs-color").value = o.obsColor || "#8b0000";
    document.getElementById("laue-obs-linewidth").value = o.obsLineWidth ?? 2;
    document.getElementById("laue-obs-radius").value = o.obsRadius ?? 5;
    const obsAlpha = o.obsAlpha ?? o.observedAlpha ?? 0.8;
    document.getElementById("laue-obs-alpha").value = Math.round(obsAlpha * 100);
    document.getElementById("laue-show-beam-center").checked = o.showBeamCenter !== false;
    document.getElementById("laue-show-observed-peaks").checked = o.showObservedPeaks !== false;
    document.getElementById("laue-show-predicted-peaks").checked = o.showPredictedPeaks !== false;
    document.getElementById("laue-show-predicted-labels").checked = o.showPredictedLabels !== false;
    document.getElementById("laue-show-observed-labels").checked = o.showObservedLabels !== false;
  }

  function readCorrections() {
    state.corrections.gaussianBlur = document.getElementById("laue-correction-blur").checked;
    state.corrections.blurRadius = Math.max(0, num("laue-blur-radius"));
    state.corrections.radialNormalize = document.getElementById("laue-correction-radial").checked;
    state.corrections.radialBins = Math.max(4, Math.round(num("laue-radial-bins") || 32));
    return state.corrections;
  }

  function writeCorrectionsToForm(corrections) {
    const c = corrections || state.corrections;
    document.getElementById("laue-correction-blur").checked = !!c.gaussianBlur;
    document.getElementById("laue-correction-radial").checked = !!c.radialNormalize;
    document.getElementById("laue-blur-radius").value = c.blurRadius ?? 1.5;
    document.getElementById("laue-radial-bins").value = c.radialBins ?? 32;
  }

  function autoScaleForRadialNorm() {
    if (!state.displayData || !readCorrections().radialNormalize) return null;
    const pr = LaueFormats.intensityPercentileRange(state.displayData.intensities, 0.02, 0.98);
    const minVal = pr.min;
    const maxVal = pr.max > minVal ? pr.max : minVal + 1;
    document.getElementById("laue-vmin").value = minVal;
    document.getElementById("laue-vmax").value = maxVal;
    state.display.vmin = minVal;
    state.display.vmax = maxVal;
    return { min: minVal, max: maxVal };
  }

  function restoreRawIntensityRange() {
    if (!state.rawIntensityRange) return null;
    document.getElementById("laue-vmin").value = state.rawIntensityRange.min;
    document.getElementById("laue-vmax").value = state.rawIntensityRange.max;
    state.display.vmin = state.rawIntensityRange.min;
    state.display.vmax = state.rawIntensityRange.max;
    return { ...state.rawIntensityRange };
  }

  function displayIntensityLimits() {
    const display = readDisplaySettings();
    if (!state.displayData) {
      return { min: display.vmin ?? 0, max: display.vmax ?? 1 };
    }
    const range = LaueFormats.intensityRange(state.displayData.intensities);
    return {
      min: display.vmin ?? range.min,
      max: display.vmax ?? range.max
    };
  }

  function refreshCorrectedDisplay(rescaleIntensity) {
    if (!state.transformedData) return;
    if (state.instrument.beamX == null && state.transformedData) {
      state.instrument.beamX = state.transformedData.width / 2;
      state.instrument.beamY = state.transformedData.height / 2;
    }
    normalizeBeamStorage();
    const corrections = readCorrections();
    const beam = beamCenterPosition();
    state.displayData = LaueFormats.applyCorrections(
      state.transformedData,
      corrections,
      beam.x,
      beam.y
    );
    if (rescaleIntensity !== false) {
      if (corrections.radialNormalize) autoScaleForRadialNorm();
      else restoreRawIntensityRange();
    }
    const display = readDisplaySettings();
    const limits = displayIntensityLimits();
    state.imageData = LaueFormats.renderToImageData(state.displayData, {
      ...display,
      vmin: limits.min,
      vmax: limits.max
    });
    canvas.width = state.displayData.width;
    canvas.height = state.displayData.height;
    viewerPlaceholder.hidden = true;
    viewerFrame.hidden = false;
    updateColorbar();
    applyViewTransform();
    updatePredictions();
    drawCurveEditor();
    redraw();
  }

  function onBeamCenterChanged() {
    if (readCorrections().radialNormalize) refreshCorrectedDisplay();
    else updatePredictions();
  }

  function applyIntensityRangeFromData() {
    const source = state.transformedData || state.displayData;
    if (!source) return;
    const range = LaueFormats.intensityRange(source.intensities);
    state.rawIntensityRange = range;
    if (!readCorrections().radialNormalize) {
      document.getElementById("laue-vmin").value = range.min;
      document.getElementById("laue-vmax").value = range.max;
      state.display.vmin = range.min;
      state.display.vmax = range.max;
    }
  }

  function setIntensityLimitsToDataRange() {
    const source = state.displayData || state.transformedData;
    if (!source) {
      setStatus("Load an image first.");
      return;
    }
    const range = LaueFormats.intensityRange(source.intensities);
    document.getElementById("laue-vmin").value = range.min;
    document.getElementById("laue-vmax").value = range.max;
    state.display.vmin = range.min;
    state.display.vmax = range.max;
    if (!readCorrections().radialNormalize) {
      state.rawIntensityRange = range;
    }
    reprocessImage({ rescaleIntensity: false });
    persistConfig();
    setStatus(`Intensity limits set to ${formatIntensity(range.min)} – ${formatIntensity(range.max)}.`);
  }

  function reprocessImage(options) {
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
    state.transformedData = LaueFormats.applyDisplayTransform(data, t);
    if (!state.rawIntensityRange) {
      state.rawIntensityRange = LaueFormats.intensityRange(state.transformedData.intensities);
    }
    if (state.instrument.beamX == null) {
      state.instrument.beamX = state.transformedData.width / 2;
      state.instrument.beamY = state.transformedData.height / 2;
    }
    refreshCorrectedDisplay(options?.rescaleIntensity);
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
    const limits = displayIntensityLimits();
    const result = LaueFormats.renderColorbar(
      colorbarCanvas,
      {
        ...display,
        vmin: limits.min,
        vmax: limits.max
      },
      limits.max
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
    if (state.imageData) redraw();
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

  async function finishImageLoad(buildStatusMessage) {
    state.rawIntensityRange = null;
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
    if (!state.displayData) {
      throw new Error("Image could not be displayed.");
    }
    setStatus(typeof buildStatusMessage === "function" ? buildStatusMessage() : buildStatusMessage);
  }

  async function loadFile(file) {
    showError("");
    setStatus("Loading…");
    try {
      state.rawData = await LaueFormats.loadLaueFile(file);
      await finishImageLoad(
        () => `Loaded ${file.name} (${state.displayData.width}×${state.displayData.height}, ${state.rawData.source})`
      );
    } catch (err) {
      showError(err.message || String(err));
      setStatus("");
    }
  }

  async function loadExamplePng() {
    showError("");
    setStatus("Loading…");
    const url = new URL("../files/laue/example_laue.png", window.location.href).href;
    try {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const blob = await resp.blob();
          await loadFile(new File([blob], "example_laue.png", { type: blob.type || "image/png" }));
          return;
        }
      } catch (_) {
        /* fetch unavailable (e.g. file://) — fall back to Image loader */
      }
      state.rawData = await LaueFormats.loadImageFromUrl(url);
      await finishImageLoad(
        () => `Loaded example (${state.displayData.width}×${state.displayData.height}, image)`
      );
    } catch (err) {
      showError(err.message || "Could not load example image.");
      setStatus("");
    }
  }

  function setDetectorSizeFromImage() {
    if (!state.displayData) {
      setStatus("Load an image first.");
      return;
    }
    syncDetectorSizeFromImage();
    updatePredictions();
    persistConfig();
    setStatus(`Detector size set to ${state.displayData.width} × ${state.displayData.height} px (1 px/mm scale).`);
  }

  function detectorScaleHint(inst, imageSize) {
    if (!imageSize) return "";
    const w = imageSize.width;
    const h = imageSize.height;
    const dw = inst.detWidth;
    const dh = inst.detHeight;
    if (!Number.isFinite(dw) || !Number.isFinite(dh) || dw <= 0 || dh <= 0) return "";
    const tol = 0.05;
    if (Math.abs(dw - w) / w > tol || Math.abs(dh - h) / h > tol) {
      return (
        ` Detector is ${dw} × ${dh} mm over a ${w} × ${h} px image ` +
        `(scale ${(w / dw).toFixed(2)} px/mm). Match detector size to the active area in mm, ` +
        "or use Use image pixel size when 1 px = 1 mm."
      );
    }
    return "";
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
      const onImage = state.predictedPeaks.filter((p) => p.onImage).length;
      const total = state.predictedPeaks.length;
      const scaleHint = detectorScaleHint(state.instrument, imageSize);
      if (!total) {
        setStatus(
          "No predicted peaks in Q range (check lattice, space group, sample orientation, and Q min/max)." +
          scaleHint
        );
      } else if (!onImage) {
        setStatus(
          `${total} predicted peaks, none on image.${scaleHint} ` +
          "For backscatter Laue at zero orientation, only high-order reflections may appear far off-screen — " +
          "try Align HKL to direct beam (e.g. 0 0 1 for Si), adjust sample angles, or check transmission vs backscatter."
        );
      } else if (onImage < total) {
        setStatus(
          `${total} predicted peaks, ${onImage} on image (${total - onImage} off-screen).${scaleHint}`
        );
      } else {
        setStatus(`${total} predicted peaks on image.${scaleHint}`);
      }
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
        <tr class="${p.onImage ? "" : "laue-peak-offscreen"}">
          <td>(${p.h}, ${p.k}, ${p.l})</td>
          <td>${p.q.toFixed(4)}</td>
          <td>${p.x.toFixed(1)}</td>
          <td>${p.y.toFixed(1)}</td>
        </tr>`)
      .join("");
    peaksTbody.innerHTML = rows || '<tr><td colspan="4">No peaks in range.</td></tr>';
  }

  function viewTotalScale() {
    return state.view.totalScale || computeFitScale() * state.view.zoom || 1;
  }

  /** Convert desired on-screen pixels to canvas/image units (for hit testing). */
  function screenPxToCanvas(px) {
    return px / viewTotalScale();
  }

  function imageToViewport(ix, iy) {
    const total = viewTotalScale();
    return {
      x: ix * total + (state.view.tx ?? 0),
      y: iy * total + (state.view.ty ?? 0)
    };
  }

  function syncOverlayCanvas() {
    if (!overlayCanvas || !overlayCtx || !canvasViewport) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvasViewport.clientWidth;
    const h = canvasViewport.clientHeight;
    if (w <= 0 || h <= 0) return;
    const bw = Math.max(1, Math.round(w * dpr));
    const bh = Math.max(1, Math.round(h * dpr));
    if (overlayCanvas.width !== bw || overlayCanvas.height !== bh) {
      overlayCanvas.width = bw;
      overlayCanvas.height = bh;
    }
    overlayCanvas.style.width = `${w}px`;
    overlayCanvas.style.height = `${h}px`;
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function hexToRgb(hex) {
    const h = (hex || "#000000").replace("#", "");
    if (h.length !== 6) return [0, 0, 0];
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16)
    ];
  }

  function setOverlayStroke(ctx2d, hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    ctx2d.globalAlpha = alpha;
    ctx2d.strokeStyle = `rgb(${r}, ${g}, ${b})`;
  }

  function formatPeakIndexLabel(h, k, l) {
    return `${h}${k}${l}`;
  }

  function drawPeakIndexLabel(ctx2d, pos, h, k, l, alpha) {
    setOverlayFill(ctx2d, "#ffffff", alpha);
    ctx2d.font = "11px sans-serif";
    ctx2d.fillText(formatPeakIndexLabel(h, k, l), pos.x + 6, pos.y + 12);
  }

  function setOverlayFill(ctx2d, hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    ctx2d.globalAlpha = alpha;
    ctx2d.fillStyle = `rgb(${r}, ${g}, ${b})`;
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

  function redrawOverlays() {
    if (!overlayCanvas || !overlayCtx || !canvasViewport) return;
    syncOverlayCanvas();
    const w = canvasViewport.clientWidth;
    const h = canvasViewport.clientHeight;
    overlayCtx.clearRect(0, 0, w, h);
    if (!state.displayData) return;

    const overlay = readOverlaySettings();
    const total = viewTotalScale();
    const beam = beamCenterPosition();
    const beamVp = imageToViewport(beam.x, beam.y);
    const beamR = state.instrument.beamRadius;

    if (overlay.showBeamCenter) {
      overlayCtx.globalAlpha = 1;
      overlayCtx.strokeStyle = "rgb(255, 220, 0)";
      overlayCtx.lineWidth = 1;
      overlayCtx.beginPath();
      overlayCtx.arc(beamVp.x, beamVp.y, beamR * total, 0, Math.PI * 2);
      overlayCtx.stroke();
      overlayCtx.fillStyle = "rgb(255, 220, 0)";
      overlayCtx.beginPath();
      overlayCtx.arc(beamVp.x, beamVp.y, 4, 0, Math.PI * 2);
      overlayCtx.fill();
      overlayCtx.fillStyle = "rgb(255, 120, 0)";
      overlayCtx.beginPath();
      overlayCtx.arc(beamVp.x + beamR * total, beamVp.y, 5, 0, Math.PI * 2);
      overlayCtx.fill();
    }

    if (overlay.showPredictedPeaks) {
      const predA = overlay.predAlpha ?? 0.8;
      setOverlayStroke(overlayCtx, overlay.predColor, predA);
      overlayCtx.lineWidth = overlay.predLineWidth ?? 2;
      for (const p of state.predictedPeaks) {
        if (!p.onImage) continue;
        const pos = imageToViewport(p.x, p.y);
        overlayCtx.beginPath();
        overlayCtx.arc(pos.x, pos.y, overlay.predRadius, 0, Math.PI * 2);
        overlayCtx.stroke();
        if (overlay.showPredictedLabels) {
          drawPeakIndexLabel(overlayCtx, pos, p.h, p.k, p.l, predA);
        }
      }
    }

    if (overlay.showObservedPeaks) {
      const obsA = overlay.obsAlpha ?? overlay.observedAlpha ?? 0.8;
      setOverlayStroke(overlayCtx, overlay.obsColor || "#8b0000", obsA);
      overlayCtx.lineWidth = overlay.obsLineWidth ?? 2;
      for (const p of state.observedPeaks) {
        const pos = imageToViewport(p.x, p.y);
        overlayCtx.beginPath();
        overlayCtx.arc(pos.x, pos.y, overlay.obsRadius ?? 5, 0, Math.PI * 2);
        overlayCtx.stroke();
        if (overlay.showObservedLabels && p.matchedH != null) {
          drawPeakIndexLabel(overlayCtx, pos, p.matchedH, p.matchedK, p.matchedL, obsA);
        }
      }
    }

    overlayCtx.globalAlpha = 1;
  }

  function redraw() {
    if (!state.imageData) return;
    ctx.putImageData(state.imageData, 0, 0);
    redrawOverlays();
  }

  function formatAxisIntensity(value) {
    if (!Number.isFinite(value)) return "—";
    const abs = Math.abs(value);
    if (abs >= 10000 || (abs > 0 && abs < 0.001)) return value.toExponential(1);
    if (abs >= 1000) return value.toFixed(0);
    if (abs >= 10) return value.toFixed(1);
    return value.toPrecision(3);
  }

  function curveIntensityRange() {
    const display = state.display;
    if (state.displayData) {
      const range = LaueFormats.intensityRange(state.displayData.intensities);
      return {
        min: display.vmin ?? range.min ?? 0,
        max: display.vmax ?? range.max ?? 1
      };
    }
    return {
      min: display.vmin ?? 0,
      max: display.vmax ?? 1
    };
  }

  function intensityAtNorm(t, minI, maxI) {
    return minI + t * (maxI - minI);
  }

  const CURVE_LOGICAL_WIDTH = 380;
  const CURVE_LOGICAL_HEIGHT = 210;
  const CURVE_DARK_BLUE = "#1e3a8a";

  function prepareCurveCanvas() {
    const w = CURVE_LOGICAL_WIDTH;
    const h = CURVE_LOGICAL_HEIGHT;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (curveCanvas.width !== bw || curveCanvas.height !== bh) {
      curveCanvas.width = bw;
      curveCanvas.height = bh;
    }
    curveCanvas.style.width = `${w}px`;
    curveCanvas.style.height = `${h}px`;
    curveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    curveCtx.imageSmoothingEnabled = true;
    curveCtx.imageSmoothingQuality = "high";
    return { w, h };
  }

  function curvePlotArea(w, h, leftPad) {
    const left = leftPad ?? 44;
    const top = 10;
    const right = 12;
    const bottom = 28;
    return {
      left,
      top,
      right,
      bottom,
      width: w - left - right,
      height: h - top - bottom
    };
  }

  function curvePlotLeftPad(minI, maxI) {
    const samples = [0, 0.5, 1].map((t) => formatAxisIntensity(intensityAtNorm(t, minI, maxI)));
    const maxLen = Math.max(...samples.map((s) => s.length));
    return Math.max(44, maxLen * 6.5 + 14);
  }

  function curveToPx(pt, plot) {
    return {
      x: plot.left + pt.x * plot.width,
      y: plot.top + (1 - pt.y) * plot.height
    };
  }

  function drawCurveEditor() {
    const { w, h } = prepareCurveCanvas();
    const { min: minI, max: maxI } = curveIntensityRange();
    const plot = curvePlotArea(w, h, curvePlotLeftPad(minI, maxI));
    const axisColor = "#94a3b8";
    const textColor = "#334155";
    const tickFracs = [0, 0.25, 0.5, 0.75, 1];

    curveCtx.fillStyle = "#ffffff";
    curveCtx.fillRect(0, 0, w, h);

    curveCtx.strokeStyle = axisColor;
    curveCtx.lineWidth = 1;
    curveCtx.beginPath();
    curveCtx.moveTo(plot.left, plot.top + plot.height + 0.5);
    curveCtx.lineTo(plot.left + plot.width, plot.top + plot.height + 0.5);
    curveCtx.moveTo(plot.left + 0.5, plot.top);
    curveCtx.lineTo(plot.left + 0.5, plot.top + plot.height);
    curveCtx.stroke();

    curveCtx.fillStyle = textColor;
    curveCtx.font = "10px system-ui, sans-serif";
    curveCtx.textAlign = "center";
    curveCtx.textBaseline = "top";
    for (const tick of tickFracs) {
      const x = plot.left + tick * plot.width;
      curveCtx.beginPath();
      curveCtx.moveTo(x, plot.top + plot.height);
      curveCtx.lineTo(x, plot.top + plot.height + 4);
      curveCtx.stroke();
      curveCtx.fillText(formatAxisIntensity(intensityAtNorm(tick, minI, maxI)), x, plot.top + plot.height + 6);
    }
    curveCtx.fillText("Input intensity", plot.left + plot.width / 2, h - 11);

    curveCtx.textAlign = "right";
    curveCtx.textBaseline = "middle";
    for (const tick of tickFracs) {
      const y = plot.top + (1 - tick) * plot.height;
      curveCtx.beginPath();
      curveCtx.moveTo(plot.left - 4, y);
      curveCtx.lineTo(plot.left, y);
      curveCtx.stroke();
      curveCtx.fillText(formatAxisIntensity(intensityAtNorm(tick, minI, maxI)), plot.left - 6, y);
    }
    curveCtx.save();
    curveCtx.translate(14, plot.top + plot.height / 2);
    curveCtx.rotate(-Math.PI / 2);
    curveCtx.textAlign = "center";
    curveCtx.textBaseline = "bottom";
    curveCtx.fillText("Output intensity", 0, 0);
    curveCtx.restore();

    const pts = [...state.display.curvePoints].sort((a, b) => a.x - b.x);
    const steps = Math.max(240, Math.round(plot.width * 3));
    curveCtx.strokeStyle = CURVE_DARK_BLUE;
    curveCtx.lineWidth = 2;
    curveCtx.lineJoin = "round";
    curveCtx.lineCap = "round";
    curveCtx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const y = LaueFormats.evaluateCurve(pts, t);
      const x = plot.left + t * plot.width;
      const py = plot.top + (1 - y) * plot.height;
      if (i === 0) curveCtx.moveTo(x, py);
      else curveCtx.lineTo(x, py);
    }
    curveCtx.stroke();

    for (const pt of pts) {
      const px = curveToPx(pt, plot);
      curveCtx.fillStyle = CURVE_DARK_BLUE;
      curveCtx.beginPath();
      curveCtx.arc(px.x, px.y, 4.5, 0, Math.PI * 2);
      curveCtx.fill();
      curveCtx.strokeStyle = "#ffffff";
      curveCtx.lineWidth = 1.5;
      curveCtx.stroke();
    }
  }

  function canvasPointFromEvent(event) {
    const rect = curveCanvas.getBoundingClientRect();
    const w = CURVE_LOGICAL_WIDTH;
    const h = CURVE_LOGICAL_HEIGHT;
    return {
      x: (event.clientX - rect.left) * (w / Math.max(rect.width, 1)),
      y: (event.clientY - rect.top) * (h / Math.max(rect.height, 1))
    };
  }

  function curvePointFromEvent(event) {
    const { w, h } = prepareCurveCanvas();
    const { min: minI, max: maxI } = curveIntensityRange();
    const plot = curvePlotArea(w, h, curvePlotLeftPad(minI, maxI));
    const cpos = canvasPointFromEvent(event);
    const x = (cpos.x - plot.left) / plot.width;
    const y = 1 - (cpos.y - plot.top) / plot.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  function hitCurvePoint(event, radius = 10) {
    const { w, h } = prepareCurveCanvas();
    const { min: minI, max: maxI } = curveIntensityRange();
    const plot = curvePlotArea(w, h, curvePlotLeftPad(minI, maxI));
    const cpos = canvasPointFromEvent(event);
    for (let i = 0; i < state.display.curvePoints.length; i += 1) {
      const px = curveToPx(state.display.curvePoints[i], plot);
      if ((px.x - cpos.x) ** 2 + (px.y - cpos.y) ** 2 < radius * radius) return i;
    }
    return -1;
  }

  function saveConfigToObject() {
    return {
      crystal: readCrystal(),
      instrument: readInstrument(),
      transform: state.transform,
      display: readDisplaySettings(),
      corrections: readCorrections(),
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
        if (key === "diamondBasis") {
          const el = document.getElementById("laue-diamond-basis");
          if (el) el.checked = !!val;
          continue;
        }
        const el = document.getElementById(`laue-${key === "spaceGroup" ? "spacegroup" : key}`);
        if (el) el.value = val;
      }
    }
    if (obj.instrument) {
      writeInstrumentToForm(obj.instrument);
      normalizeBeamStorage();
      state.refinementUndo = null;
      setRefinementUndoAvailable(false);
    }
    if (obj.transform) state.transform = { ...obj.transform };
    if (obj.display) {
      state.display = { ...state.display, ...obj.display };
      ensureCurveEndpoints();
    }
    if (obj.corrections) {
      state.corrections = { ...state.corrections, ...obj.corrections };
      writeCorrectionsToForm(state.corrections);
    }
    if (obj.overlay) {
      state.overlay = { ...state.overlay, ...obj.overlay };
      if (obj.overlay.observedAlpha != null && obj.overlay.obsAlpha == null) {
        state.overlay.obsAlpha = obj.overlay.observedAlpha;
      }
    }
    if (obj.observedPeaks) state.observedPeaks = obj.observedPeaks.map((p, i) => ({ ...p, id: i }));
    if (obj.view) state.view = { ...state.view, ...obj.view };
    document.getElementById("laue-colormap").value = state.display.colormap || "gray";
    document.getElementById("laue-vmin").value = state.display.vmin ?? 0;
    document.getElementById("laue-vmax").value = state.display.vmax ?? "";
    document.getElementById("laue-reverse-colormap").checked = state.display.reverseColormap !== false;
    document.getElementById("laue-invert-intensity").checked = !!state.display.invertIntensity;
    writeOverlaySettingsToForm(state.overlay);
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

  function snapshotRefinementInstrument() {
    const inst = readInstrument();
    return {
      sampleOmega: inst.sampleOmega,
      sampleChi: inst.sampleChi,
      samplePhi: inst.samplePhi,
      detDistance: inst.detDistance,
      detOffsetX: inst.detOffsetX,
      detOffsetY: inst.detOffsetY,
      detOmegaMisalign: inst.detOmegaMisalign,
      detChiMisalign: inst.detChiMisalign
    };
  }

  function setRefinementUndoAvailable(available) {
    const btn = document.getElementById("laue-refine-undo-btn");
    if (btn) btn.disabled = !available;
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
    const before = snapshotRefinementInstrument();
    const result = LaueMath.refineOrientation(
      readCrystal(),
      buildConfig(readInstrument()),
      { width: state.displayData.width, height: state.displayData.height },
      state.observedPeaks,
      flags,
      isAllowed,
      30
    );
    if (result.rms != null) {
      if (!result.improved) {
        refineResult.textContent = result.initialRms != null
          ? `Refinement rejected (unstable). RMS stayed at ${result.initialRms.toFixed(2)} px — use Undo if needed.`
          : "Refinement did not improve the fit.";
        return;
      }
      state.refinementUndo = before;
      setRefinementUndoAvailable(true);
      writeInstrumentToForm(result.config);
      updatePredictions();
      persistConfig();
      const beforeTxt = result.initialRms != null ? ` (was ${result.initialRms.toFixed(2)} px)` : "";
      refineResult.textContent = `RMS pixel residual: ${result.rms.toFixed(2)} px${beforeTxt}`;
      return;
    }
    refineResult.textContent = "Assign index matches to observed peaks first (auto-detect + match).";
  }

  function undoRefinement() {
    if (!state.refinementUndo) return;
    const restored = { ...readInstrument(), ...state.refinementUndo };
    state.refinementUndo = null;
    setRefinementUndoAvailable(false);
    writeInstrumentToForm(restored);
    updatePredictions();
    persistConfig();
    refineResult.textContent = "Restored parameters from before the last refinement.";
    setStatus("Undid last orientation refinement.");
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
      Beam misalignment (angle to +x): ${dev.beamMisalignmentDeg.toFixed(3)}°
      (‖G‖·x̂ = ${dev.currentBeamDot.toFixed(4)}, 1 = on-beam)<br>
      Out-of-plane tilt for horizontal HKL: ${dev.horizontalMisalignmentDeg.toFixed(3)}°
      (0° = in plane ⊥ beam)<br>
      In-plane azimuth vs lab +y: ${dev.inPlaneAzimuthDeg.toFixed(3)}°<br>
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
    else if (Number.isInteger(data.spaceGroupNumber)) {
      document.getElementById("laue-spacegroup").value = String(data.spaceGroupNumber);
    }
    const status = document.getElementById("cif-status");
    if (status) {
      status.textContent = describeCif(data);
      status.classList.remove("tool-cif-status-error");
    }
    updatePredictions();
    persistConfig();
  }

  function findNearestPredictedPeak(x, y) {
    let best = null;
    for (const p of state.predictedPeaks) {
      if (!p.onImage) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (!best || d < best.d) best = { peak: p, d };
    }
    return best;
  }

  function findObservedPeakIndex(x, y, radiusPx) {
    const hitR = screenPxToCanvas(radiusPx ?? 12);
    let best = -1;
    let bestDist = hitR;
    for (let i = 0; i < state.observedPeaks.length; i += 1) {
      const p = state.observedPeaks[i];
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  function clearObservedPeakSelection() {
    for (const p of state.observedPeaks) {
      p.selected = false;
    }
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
    const beam = beamCenterPosition();
    const beamX = beam.x;
    const beamY = beam.y;
    const beamR = state.instrument.beamRadius;
    const hitR = screenPxToCanvas(10);

    if (state.mode === "beam") {
      const onRadius = Math.hypot(pos.x - (beamX + beamR), pos.y - beamY) < hitR;
      const onCenter = Math.hypot(pos.x - beamX, pos.y - beamY) < hitR;
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
      const hit = findObservedPeakIndex(pos.x, pos.y);
      if (hit >= 0) state.observedPeaks.splice(hit, 1);
      redraw();
      return;
    }

    if (state.mode === "move-peak") {
      const hit = findObservedPeakIndex(pos.x, pos.y);
      if (hit >= 0) {
        clearObservedPeakSelection();
        const peak = state.observedPeaks[hit];
        peak.selected = true;
        state.drag = {
          type: "move-peak",
          index: hit,
          dx: pos.x - peak.x,
          dy: pos.y - peak.y
        };
        if (canvasViewport) canvasViewport.classList.add("laue-dragging");
        redraw();
      }
      return;
    }

    if (state.mode === "pan-orientation") {
      const anchor = findNearestPredictedPeak(pos.x, pos.y);
      if (!anchor) {
        setStatus("Pan: no predicted peaks on image — check orientation and Q range.");
        return;
      }
      state.drag = {
        type: "pan-orient",
        startX: pos.x,
        startY: pos.y,
        startOmega: num("laue-sample-omega"),
        startChi: num("laue-sample-chi"),
        startPhi: num("laue-sample-phi"),
        hkl: [anchor.peak.h, anchor.peak.k, anchor.peak.l],
        offsetX: pos.x - anchor.peak.x,
        offsetY: pos.y - anchor.peak.y
      };
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
      setBeamCenterPosition(pos.x - (state.drag.dx || 0), pos.y - (state.drag.dy || 0));
      onBeamCenterChanged();
    } else if (state.drag.type === "beam-radius") {
      state.instrument.beamRadius = Math.max(5, Math.hypot(pos.x - state.drag.cx, pos.y - state.drag.cy));
      redraw();
    } else if (state.drag.type === "pan-orient") {
      const signs = {
        omega: document.getElementById("laue-sign-omega").value === "-1" ? -1 : 1,
        chi: document.getElementById("laue-sign-chi").value === "-1" ? -1 : 1,
        phi: document.getElementById("laue-sign-phi").value === "-1" ? -1 : 1
      };
      const inst = readInstrument();
      const config = buildConfig(inst);
      const imageSize = state.displayData
        ? { width: state.displayData.width, height: state.displayData.height }
        : null;
      if (!imageSize) return;
      const angles = LaueMath.panSampleOrientationTrackPoint(
        readCrystal(),
        {
          omega: state.drag.startOmega,
          chi: state.drag.startChi,
          phi: state.drag.startPhi
        },
        signs,
        {
          detOmega: inst.detOmega,
          detChi: inst.detChi,
          laueMode: inst.laueMode,
          detOmegaMisalign: inst.detOmegaMisalign,
          detChiMisalign: inst.detChiMisalign
        },
        state.drag.hkl,
        pos.x - state.drag.offsetX,
        pos.y - state.drag.offsetY,
        config,
        imageSize
      );
      document.getElementById("laue-sample-omega").value = angles.omega;
      document.getElementById("laue-sample-chi").value = angles.chi;
      document.getElementById("laue-sample-phi").value = angles.phi;
      updatePredictions();
    } else if (state.drag.type === "rotate-pattern") {
      const angle = Math.atan2(pos.y - state.drag.cy, pos.x - state.drag.cx);
      const delta = (angle - state.drag.startAngle) * 180 / Math.PI;
      state.drag.startAngle = angle;
      document.getElementById("laue-pattern-rotation").value = num("laue-pattern-rotation") + delta;
      updatePredictions();
    } else if (state.drag.type === "move-peak") {
      const peak = state.observedPeaks[state.drag.index];
      if (peak) {
        peak.x = pos.x - state.drag.dx;
        peak.y = pos.y - state.drag.dy;
        redraw();
      }
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
      if (state.drag.type === "move-peak") {
        clearObservedPeakSelection();
        if (canvasViewport) canvasViewport.classList.remove("laue-dragging");
      }
      state.drag = null;
      redraw();
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
    if (state.drag?.type === "move-peak") {
      clearObservedPeakSelection();
      if (canvasViewport) canvasViewport.classList.remove("laue-dragging");
    }
    state.drag = null;
    state.mode = mode;
    modeButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    if (canvasViewport) {
      canvasViewport.classList.toggle("laue-zoom-area-mode", mode === "zoom-area");
      canvasViewport.classList.toggle("laue-move-peak-mode", mode === "move-peak");
    }
    setStatus({
      view: "View mode — scroll wheel to zoom; right-click resets zoom",
      "zoom-area": "Drag a rectangle to zoom; right-click resets zoom",
      beam: "Drag beam center; drag orange handle to scale circle",
      "pan-orientation": "Drag to pan — the point under the cursor stays under the cursor",
      "rotate-pattern": "Drag to rotate predicted pattern about beam center",
      "add-peak": "Click to add observed peak",
      "move-peak": "Click and drag detected peaks to reposition them",
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

    document.getElementById("laue-example-btn").addEventListener("click", () => {
      loadExamplePng();
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
    document.getElementById("laue-intensity-autoscale").addEventListener("click", setIntensityLimitsToDataRange);

    document.getElementById("laue-colormap").addEventListener("change", () => reprocessImage());
    document.getElementById("laue-vmin").addEventListener("input", () => reprocessImage({ rescaleIntensity: false }));
    document.getElementById("laue-vmax").addEventListener("input", () => reprocessImage({ rescaleIntensity: false }));
    document.getElementById("laue-reverse-colormap").addEventListener("change", () => reprocessImage());
    document.getElementById("laue-invert-intensity").addEventListener("change", () => reprocessImage());

    ["laue-correction-blur", "laue-correction-radial", "laue-blur-radius", "laue-radial-bins"].forEach((id) => {
      document.getElementById(id).addEventListener("input", () => { reprocessImage(); persistConfig(); });
      document.getElementById(id).addEventListener("change", () => { reprocessImage(); persistConfig(); });
    });

    document.getElementById("laue-curve-reset").addEventListener("click", resetCurve);
    document.getElementById("laue-reset-orientation").addEventListener("click", resetSampleOrientation);
    document.getElementById("laue-align-beam-btn").addEventListener("click", alignBeamHKL);

    [
      "laue-pred-color", "laue-pred-linewidth", "laue-pred-radius", "laue-pred-alpha",
      "laue-obs-color", "laue-obs-linewidth", "laue-obs-radius", "laue-obs-alpha",
      "laue-show-beam-center", "laue-show-observed-peaks", "laue-show-predicted-peaks",
      "laue-show-predicted-labels", "laue-show-observed-labels"
    ].forEach((id) => {
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
        el.addEventListener("input", () => {
          if (el.id === "laue-det-offset-x" || el.id === "laue-det-offset-y") onBeamCenterChanged();
          else updatePredictions();
          persistConfig();
        });
        el.addEventListener("change", () => {
          if (el.id === "laue-auto-flip-h" || el.id === "laue-auto-flip-v" || el.id === "laue-auto-rotate") {
            reprocessImage();
          } else if (el.id === "laue-det-offset-x" || el.id === "laue-det-offset-y") {
            onBeamCenterChanged();
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
    document.getElementById("laue-refine-undo-btn").addEventListener("click", undoRefinement);
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
          spaceGroup: document.getElementById("laue-spacegroup"),
          diamondBasis: document.getElementById("laue-diamond-basis")
        });
        if (preset.id === "si-diamond" || preset.id === "ge-diamond") {
          const crystal = readCrystal();
          const signs = {
            omega: num("laue-sign-omega") || 1,
            chi: num("laue-sign-chi") || 1,
            phi: num("laue-sign-phi") || 1
          };
          const aligned = LaueMath.alignHKLToBeam(
            crystal,
            [0, 0, 1],
            { omega: 0, chi: 0, phi: 0 },
            signs
          );
          document.getElementById("laue-sample-omega").value = aligned.omega;
          document.getElementById("laue-sample-chi").value = aligned.chi;
          document.getElementById("laue-sample-phi").value = aligned.phi;
        }
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
