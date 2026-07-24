(function () {
  "use strict";

  // --- DOM ----------------------------------------------------------------

  const uploadBtn = document.getElementById("dig-upload-btn");
  const fileInput = document.getElementById("dig-file-input");
  const urlInput = document.getElementById("dig-url-input");
  const urlBtn = document.getElementById("dig-url-btn");
  const clearBtn = document.getElementById("dig-clear-btn");
  const loadError = document.getElementById("dig-load-error");

  const workspace = document.getElementById("dig-workspace");
  const canvasArea = document.querySelector(".digitizer-canvas-area");
  const canvasWrap = document.getElementById("dig-canvas-wrap");
  const canvas = document.getElementById("dig-canvas");
  const zoomCanvas = document.getElementById("dig-zoom");
  const statusEl = document.getElementById("dig-status");
  const coordPixelEl = document.getElementById("dig-coord-pixel");
  const coordDataEl = document.getElementById("dig-coord-data");
  const coordSelectedEl = document.getElementById("dig-coord-selected");

  const tabButtons = Array.from(document.querySelectorAll(".digitizer-tab"));
  const tabPanes = Array.from(document.querySelectorAll("[data-tab-pane]"));

  const swapYBtn = document.getElementById("dig-swap-y");
  const swapXBtn = document.getElementById("dig-swap-x");
  const linkOriginEl = document.getElementById("dig-link-origin");
  const swapScaleBtn = document.getElementById("dig-scale-swap");
  const rotateCcwBtn = document.getElementById("dig-rotate-ccw");
  const flipHBtn = document.getElementById("dig-flip-h");
  const flipVBtn = document.getElementById("dig-flip-v");

  const dataSection = document.getElementById("dig-data");
  const dataNote = document.getElementById("dig-data-note");
  const tbody = document.getElementById("dig-points-tbody");
  const pointsXHeader = document.getElementById("dig-points-x-header");
  const pointsYHeader = document.getElementById("dig-points-y-header");
  const pointsErrorHeader = document.getElementById("dig-points-error-header");
  const copyBtn = document.getElementById("dig-copy-btn");
  const downloadBtn = document.getElementById("dig-download-btn");
  const clearPointsBtn = document.getElementById("dig-clear-points-btn");
  const equalErrorBarsEl = document.getElementById("dig-equal-error-bars");
  const clearCalibrationsBtn = document.getElementById("dig-clear-calibrations");
  const zoomOutBtn = document.getElementById("dig-zoom-out");
  const zoomInBtn = document.getElementById("dig-zoom-in");
  const zoomFitBtn = document.getElementById("dig-zoom-fit");
  const viewZoomEl = document.getElementById("dig-view-zoom");

  const measurementsTbody = document.getElementById("dig-measurements-tbody");
  const measurementsNote = document.getElementById("dig-measurements-note");
  const copyMeasurementsBtn = document.getElementById("dig-copy-measurements");
  const clearMeasurementsBtn = document.getElementById("dig-clear-measurements");
  const scaleDistanceInput = document.getElementById("dig-scale-distance");
  const scaleUnitInput = document.getElementById("dig-scale-unit");
  const scaleReadoutEl = document.getElementById("dig-scale-readout");

  const modeButtons = Array.from(document.querySelectorAll(".digitizer-mode-btn[data-mode]"));
  const editCancelBtn = document.getElementById("dig-edit-cancel-action");
  const valueInputs = {
    y1: document.getElementById("dig-y1-val"),
    y2: document.getElementById("dig-y2-val"),
    x1: document.getElementById("dig-x1-val"),
    x2: document.getElementById("dig-x2-val")
  };
  const logXEl = document.getElementById("dig-logx");
  const logYEl = document.getElementById("dig-logy");
  const transformedEl = document.getElementById("dig-transformed");

  const ctx = canvas.getContext("2d");
  const zoomCtx = zoomCanvas.getContext("2d");

  // --- Constants & state --------------------------------------------------

  const CALIBRATION_KEYS = ["y1", "y2", "x1", "x2"];
  const AUTO_MODES = window.DigitizerAuto ? window.DigitizerAuto.AUTO_MODES : new Set();
  const COLORMAP_MODES = window.DigitizerColormap ? window.DigitizerColormap.MODES : new Set();
  const PLOT_MODES = new Set(["y1", "y2", "x1", "x2", "add", ...AUTO_MODES]);
  const MAP_MODES = new Set(["scale-a", "scale-b", "measure-distance", "measure-angle"]);
  const EDIT_MODES = window.DigitizerImageEdit ? window.DigitizerImageEdit.EDIT_MODES : new Set();
  const PLOT_MODE_LABELS = {
    y1: "Y₁", y2: "Y₂", x1: "X₁", x2: "X₂", add: "Add points",
    ...(window.DigitizerAuto ? window.DigitizerAuto.AUTO_MODE_LABELS : {})
  };
  const MAP_MODE_LABELS = {
    "scale-a": "scale P₁",
    "scale-b": "scale P₂",
    "measure-distance": "distance",
    "measure-angle": "angle"
  };
  const ZOOM_FACTOR = 10;
  const ZOOM_DISPLAY_SIZE = 260;
  const POINT_HIT_RADIUS_PX = 12;
  const SELECT_HIT_RADIUS_PX = 10;
  const DEFAULT_PLOT_PROBE = document.getElementById("dig-default-plot");
  const SESSION_DB_NAME = "plot-digitizer-session";
  const SESSION_STORE_NAME = "sessions";
  const SESSION_KEY = "current";
  const MIN_VIEW_ZOOM = 0.1;
  const MAX_VIEW_ZOOM = 8;
  let sessionSaveTimer = null;
  let restoringSession = false;

  zoomCanvas.width = ZOOM_DISPLAY_SIZE;
  zoomCanvas.height = ZOOM_DISPLAY_SIZE;

  const state = {
    image: null,
    activeTab: "edit",
    modeByTab: { plot: "y1", colormap: "cm-y1", map: "scale-a", edit: null },
    mode: null,
    cursor: null,
    pointerInside: false,

    // Plot mode state
    calibration: { y1: null, y2: null, x1: null, x2: null },
    linkOrigin: false,
    points: [],

    // Map mode state
    scale: { a: null, b: null },
    measurements: [],
    // While building a measurement: { type: "distance"|"angle", points: [{x,y}, ...] }
    pendingMeasurement: null,

    // Selection (for arrow-key nudging). Possible shapes:
    //   { type: "calibration", key }
    //   { type: "data", index }
    //   { type: "scale", key }
    //   { type: "measurement", index, key }
    selected: null,
    pointDrag: null,
    suppressNextClick: false,
    viewZoom: 1,
    viewFit: false
  };

  // --- Small helpers ------------------------------------------------------

  function showLoadError(message) {
    if (!message) {
      loadError.hidden = true;
      loadError.textContent = "";
      return;
    }
    loadError.hidden = false;
    loadError.textContent = message;
  }

  function flashStatus(message, durationMs = 1800) {
    statusEl.textContent = message;
    if (flashStatus._timer) clearTimeout(flashStatus._timer);
    flashStatus._timer = setTimeout(() => {
      flashStatus._timer = null;
      updateStatus();
    }, durationMs);
  }

  function displayScale() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return 1;
    return canvas.width / rect.width;
  }

  function snapHalfPixel(value) {
    return Math.round(value * 2) / 2;
  }

  function snapPointerCoordinate(value, max, usePixelEdge) {
    if (usePixelEdge) return Math.max(0, Math.min(max, Math.round(value)));
    return Math.max(0.5, Math.min(max - 0.5, Math.floor(value) + 0.5));
  }

  function clientToImage(event) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / Math.max(rect.width, 1);
    const sy = canvas.height / Math.max(rect.height, 1);
    return {
      x: snapPointerCoordinate((event.clientX - rect.left) * sx, canvas.width, event.altKey),
      y: snapPointerCoordinate((event.clientY - rect.top) * sy, canvas.height, event.altKey)
    };
  }

  function applyViewZoom() {
    if (!state.image) return;
    const z = Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, state.viewZoom || 1));
    state.viewZoom = z;
    canvas.style.width = `${canvas.width * z}px`;
    canvas.style.height = `${canvas.height * z}px`;
    if (viewZoomEl) viewZoomEl.textContent = `${Math.round(z * 100)}%`;
  }

  function fitViewZoom() {
    if (!state.image) return;
    const available = Math.max(1, canvasWrap.clientWidth - 2);
    state.viewFit = true;
    state.viewZoom = Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, available / canvas.width));
    applyViewZoom();
    redrawCanvas();
    scheduleSessionSave();
  }

  function setViewZoom(next, clientX, clientY) {
    if (!state.image) return;
    const oldRect = canvas.getBoundingClientRect();
    const oldZoom = state.viewZoom || 1;
    const anchorX = clientX == null ? canvasWrap.clientWidth / 2 : clientX - oldRect.left;
    const anchorY = clientY == null ? canvasWrap.clientHeight / 2 : clientY - oldRect.top;
    const imageX = anchorX / oldZoom;
    const imageY = anchorY / oldZoom;
    state.viewFit = false;
    state.viewZoom = Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, next));
    applyViewZoom();
    const newRect = canvas.getBoundingClientRect();
    if (clientX != null) canvasWrap.scrollLeft += (newRect.left + imageX * state.viewZoom) - clientX;
    if (clientY != null) canvasWrap.scrollTop += (newRect.top + imageY * state.viewZoom) - clientY;
    redrawCanvas();
    scheduleSessionSave();
  }

  function openSessionDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const request = indexedDB.open(SESSION_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(SESSION_STORE_NAME)) {
          request.result.createObjectStore(SESSION_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function sessionRequest(mode, action) {
    return openSessionDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE_NAME, mode);
      const request = action(tx.objectStore(SESSION_STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    }));
  }

  function canvasBlob(source) {
    return new Promise((resolve) => source.toBlob(resolve, "image/png"));
  }

  function captureControlValues() {
    const result = {};
    workspace.querySelectorAll("input[id], select[id], textarea[id]").forEach((el) => {
      if (el.type === "file") return;
      result[el.id] = { value: el.value, checked: !!el.checked };
    });
    return result;
  }

  function restoreControlValues(values) {
    Object.entries(values || {}).forEach(([id, saved]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if ("value" in saved) el.value = saved.value;
      if ((el.type === "checkbox" || el.type === "radio") && "checked" in saved) el.checked = saved.checked;
    });
  }

  function snapshotState() {
    const auto = state.auto ? {
      ...state.auto,
      dragStart: null,
      dragCurrent: null,
      maskDrag: null,
      templateDrag: null,
      polyPoints: [],
      lassoPoints: []
    } : null;
    const edit = state.edit ? { ...state.edit, removeDrag: null, removePolyPoints: [], removeLassoPoints: [] } : null;
    const colormap = state.colormap ? { ...state.colormap, drag: null, result: null } : null;
    return {
      activeTab: state.activeTab,
      modeByTab: state.modeByTab,
      calibration: state.calibration,
      linkOrigin: state.linkOrigin,
      points: state.points,
      scale: state.scale,
      measurements: state.measurements,
      selected: state.selected,
      viewZoom: state.viewZoom,
      viewFit: state.viewFit,
      auto,
      edit,
      colormap
    };
  }

  async function saveSessionNow() {
    if (!state.image || restoringSession) return;
    try {
      const [imageBlob, originalBlob] = await Promise.all([
        canvasBlob(state.image),
        state.originalImage ? canvasBlob(state.originalImage) : Promise.resolve(null)
      ]);
      if (!imageBlob) return;
      await sessionRequest("readwrite", (store) => store.put({
        version: 1,
        savedAt: Date.now(),
        imageBlob,
        originalBlob,
        state: snapshotState(),
        controls: captureControlValues()
      }, SESSION_KEY));
    } catch (err) {
      // Persistence is a convenience; private browsing/storage limits must not break the tool.
    }
  }

  function scheduleSessionSave() {
    if (restoringSession || !state.image) return;
    if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
    sessionSaveTimer = setTimeout(() => {
      sessionSaveTimer = null;
      saveSessionNow();
    }, 700);
  }

  function blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Invalid stored image")); };
      img.src = url;
    });
  }

  async function restoreSession() {
    restoringSession = true;
    try {
      const saved = await sessionRequest("readonly", (store) => store.get(SESSION_KEY));
      if (!saved || !saved.imageBlob || !saved.state) return false;
      const img = await blobToImage(saved.imageBlob);
      setImage(img, { noScroll: true, restoring: true });
      const restored = saved.state;
      ["modeByTab", "calibration", "points", "scale", "measurements", "selected", "auto", "edit", "colormap"].forEach((key) => {
        if (restored[key] != null) state[key] = restored[key];
      });
      state.linkOrigin = !!restored.linkOrigin;
      state.viewZoom = Number(restored.viewZoom) || 1;
      state.viewFit = !!restored.viewFit;
      state.pendingMeasurement = null;
      state.pointDrag = null;
      if (saved.originalBlob) {
        const original = await blobToImage(saved.originalBlob);
        state.originalImage = imageToCanvas(original);
      }
      restoreControlValues(saved.controls);
      if (linkOriginEl) linkOriginEl.checked = state.linkOrigin;
      if (window.DigitizerImageEdit?.restoreState) window.DigitizerImageEdit.restoreState();
      if (window.DigitizerAuto?.restoreState) window.DigitizerAuto.restoreState(state);
      const tab = ["edit", "plot", "colormap", "map"].includes(restored.activeTab) ? restored.activeTab : "plot";
      setActiveTab(tab, true);
      state.selected = restored.selected || null;
      if (state.viewFit) fitViewZoom(); else applyViewZoom();
      refreshAll();
      flashStatus("Restored your previous digitizer session.", 2600);
      return true;
    } catch (err) {
      return false;
    } finally {
      restoringSession = false;
    }
  }

  function deleteStoredSession() {
    if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
    sessionRequest("readwrite", (store) => store.delete(SESSION_KEY)).catch(() => {});
  }

  function formatValue(v) {
    if (!Number.isFinite(v)) return "—";
    if (v === 0) return "0";
    const abs = Math.abs(v);
    if (abs >= 1e5 || abs < 1e-3) return v.toExponential(4);
    return Number(v.toPrecision(6)).toString();
  }

  function formatPixelPoint(p) {
    if (!p) return "";
    return `(${snapHalfPixel(p.x)}, ${snapHalfPixel(p.y)})`;
  }

  // --- Plot calibration validity -----------------------------------------

  function calibrationComplete() {
    return CALIBRATION_KEYS.every((k) => state.calibration[k]);
  }

  function axisValuesValid() {
    const y1 = Number(valueInputs.y1.value);
    const y2 = Number(valueInputs.y2.value);
    const x1 = Number(valueInputs.x1.value);
    const x2 = Number(valueInputs.x2.value);
    if (![y1, y2, x1, x2].every(Number.isFinite)) return false;
    if (valueInputs.y1.value === "" || valueInputs.y2.value === "") return false;
    if (valueInputs.x1.value === "" || valueInputs.x2.value === "") return false;
    if (y1 === y2 || x1 === x2) return false;
    if (logYEl.checked && (y1 <= 0 || y2 <= 0)) return false;
    if (logXEl.checked && (x1 <= 0 || x2 <= 0)) return false;
    return true;
  }

  function calibrationGeometryProblem() {
    if (!calibrationComplete()) return "";
    const cal = state.calibration;
    if (!transformedEl.checked) {
      const problems = [];
      if (Math.abs(cal.x2.x - cal.x1.x) < 1e-9) {
        problems.push("X₁ and X₂ need different horizontal positions");
      }
      if (Math.abs(cal.y2.y - cal.y1.y) < 1e-9) {
        problems.push("Y₁ and Y₂ need different vertical positions");
      }
      return problems.join("; ");
    }
    const vxX = cal.x2.x - cal.x1.x;
    const vxY = cal.x2.y - cal.x1.y;
    const vyX = cal.y2.x - cal.y1.x;
    const vyY = cal.y2.y - cal.y1.y;
    const det = vxX * vyY - vxY * vyX;
    return Math.abs(det) < 1e-9
      ? "the X and Y calibration directions are parallel"
      : "";
  }

  function calibrationGeometryValid() {
    return calibrationComplete() && !calibrationGeometryProblem();
  }

  function readyToDigitize() {
    return calibrationComplete() && axisValuesValid() && calibrationGeometryValid();
  }

  // --- Map scale validity -------------------------------------------------

  function scaleEndpointsSet() {
    return !!(state.scale.a && state.scale.b);
  }

  function scalePixelDistance() {
    if (!scaleEndpointsSet()) return null;
    return Math.hypot(state.scale.b.x - state.scale.a.x, state.scale.b.y - state.scale.a.y);
  }

  function scaleRealDistance() {
    const v = Number(scaleDistanceInput.value);
    if (!Number.isFinite(v) || v <= 0) return null;
    return v;
  }

  function scaleUnit() {
    return (scaleUnitInput.value || "").trim();
  }

  function scaleCalibrated() {
    const pix = scalePixelDistance();
    const real = scaleRealDistance();
    return Number.isFinite(pix) && pix > 0 && Number.isFinite(real) && real > 0;
  }

  function pixelsToReal(pixels) {
    if (!scaleCalibrated()) return null;
    return pixels * (scaleRealDistance() / scalePixelDistance());
  }

  // --- Plot data coords ---------------------------------------------------

  function interpAxis(v1, v2, t, log) {
    if (log) {
      const l1 = Math.log(v1);
      const l2 = Math.log(v2);
      return Math.exp(l1 + t * (l2 - l1));
    }
    return v1 + t * (v2 - v1);
  }

  function computeDataCoords(p) {
    if (!readyToDigitize()) return null;
    const cal = state.calibration;
    const y1V = Number(valueInputs.y1.value);
    const y2V = Number(valueInputs.y2.value);
    const x1V = Number(valueInputs.x1.value);
    const x2V = Number(valueInputs.x2.value);

    if (!transformedEl.checked) {
      const dx = cal.x2.x - cal.x1.x;
      const dy = cal.y2.y - cal.y1.y;
      if (dx === 0 || dy === 0) return null;
      const tx = (p.x - cal.x1.x) / dx;
      const ty = (p.y - cal.y1.y) / dy;
      return {
        x: interpAxis(x1V, x2V, tx, logXEl.checked),
        y: interpAxis(y1V, y2V, ty, logYEl.checked)
      };
    }

    const vx = { x: cal.x2.x - cal.x1.x, y: cal.x2.y - cal.x1.y };
    const vy = { x: cal.y2.x - cal.y1.x, y: cal.y2.y - cal.y1.y };
    const det = vx.x * vy.y - vx.y * vy.x;
    if (Math.abs(det) < 1e-9) return null;

    const decompose = (pt) => {
      const dx = pt.x - cal.x1.x;
      const dy = pt.y - cal.x1.y;
      return {
        a: (dx * vy.y - dy * vy.x) / det,
        b: (-dx * vx.y + dy * vx.x) / det
      };
    };

    const dp = decompose(p);
    const dy1 = decompose(cal.y1);

    const dataX = interpAxis(x1V, x2V, dp.a, logXEl.checked);
    let dataY;
    if (logYEl.checked) {
      const ly1 = Math.log(y1V);
      const ly2 = Math.log(y2V);
      const lyOrigin = ly1 - dy1.b * (ly2 - ly1);
      dataY = Math.exp(lyOrigin + dp.b * (ly2 - ly1));
    } else {
      const yOrigin = y1V - dy1.b * (y2V - y1V);
      dataY = yOrigin + dp.b * (y2V - y1V);
    }
    return { x: dataX, y: dataY };
  }

  function computeErrorBarValue(p) {
    if (!p || !p.errorBar || !p.errorBar.top || !p.errorBar.bottom) return null;
    const top = computeDataCoords(p.errorBar.top);
    const bottom = computeDataCoords(p.errorBar.bottom);
    if (!top || !bottom || !Number.isFinite(top.y) || !Number.isFinite(bottom.y)) return null;
    return Math.abs(bottom.y - top.y) / 2;
  }

  // --- Measurement math ---------------------------------------------------

  function distanceBetween(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  // Returns the unsigned angle at vertex `b` formed by rays b→a and b→c, in degrees.
  function angleAtVertex(a, b, c) {
    const v1x = a.x - b.x;
    const v1y = a.y - b.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const n1 = Math.hypot(v1x, v1y);
    const n2 = Math.hypot(v2x, v2y);
    if (n1 < 1e-9 || n2 < 1e-9) return NaN;
    let cos = (v1x * v2x + v1y * v2y) / (n1 * n2);
    cos = Math.max(-1, Math.min(1, cos));
    return Math.acos(cos) * 180 / Math.PI;
  }

  function formatDistance(pixels) {
    if (!Number.isFinite(pixels)) return "—";
    const real = pixelsToReal(pixels);
    const unit = scaleUnit();
    if (real != null) {
      return unit ? `${formatValue(real)} ${unit}` : formatValue(real);
    }
    return `${formatValue(pixels)} px`;
  }

  function formatAngle(deg) {
    if (!Number.isFinite(deg)) return "—";
    return `${deg.toFixed(2)}°`;
  }

  function measurementValueText(m) {
    if (m.type === "distance") {
      return formatDistance(distanceBetween(m.a, m.b));
    }
    if (m.type === "angle") {
      return formatAngle(angleAtVertex(m.a, m.b, m.c));
    }
    return "";
  }

  function measurementEndpointsText(m) {
    if (m.type === "distance") {
      return `${formatPixelPoint(m.a)} → ${formatPixelPoint(m.b)}`;
    }
    if (m.type === "angle") {
      return `${formatPixelPoint(m.a)} → ${formatPixelPoint(m.b)} (vertex) → ${formatPixelPoint(m.c)}`;
    }
    return "";
  }

  // --- Tab handling -------------------------------------------------------

  function setActiveTab(tabName, force) {
    if (tabName !== "plot" && tabName !== "colormap" && tabName !== "map" && tabName !== "edit") return;
    const prevTab = state.activeTab;
    if (!force && state.activeTab === tabName) return;
    state.activeTab = tabName;
    state.selected = null;
    state.pendingMeasurement = null;
    state.mode = state.modeByTab[tabName]
      ?? (tabName === "plot" ? "y1" : tabName === "colormap" ? "cm-y1" : tabName === "map" ? "scale-a" : null);

    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    tabPanes.forEach((pane) => {
      pane.hidden = pane.dataset.tabPane !== tabName;
    });
    if (canvasWrap) {
      canvasWrap.classList.toggle("is-editing", tabName === "edit");
    }
    if (canvasArea) canvasArea.classList.toggle("is-colormap", tabName === "colormap");
    if (tabName === "edit" && window.DigitizerImageEdit) {
      window.DigitizerImageEdit.onTabEnter();
    } else {
      if (prevTab === "edit" && window.DigitizerImageEdit) {
        window.DigitizerImageEdit.onTabLeave();
      }
      refreshAll();
    }
  }

  // --- Mode handling ------------------------------------------------------

  function setMode(mode) {
    if (!state.image || !mode) return;
    if (state.activeTab === "plot" && !PLOT_MODES.has(mode)) return;
    if (state.activeTab === "colormap" && !COLORMAP_MODES.has(mode)) return;
    if (state.activeTab === "map" && !MAP_MODES.has(mode)) return;
    if (state.activeTab === "edit" && !EDIT_MODES.has(mode)) return;
    if (mode === "add" && !readyToDigitize()) return;
    if (state.activeTab === "colormap" && mode === "cm-run" && window.DigitizerColormap) {
      window.DigitizerColormap.run();
      return;
    }

    if (state.activeTab === "plot" && state.mode === mode && AUTO_MODES.has(mode)) {
      state.mode = null;
      state.modeByTab.plot = null;
      state.pendingMeasurement = null;
      if (window.DigitizerAuto) window.DigitizerAuto.onMaskModeChange(state, null);
      updateModeBar();
      updateStatus();
      draw();
      return;
    }

    if (state.activeTab === "edit" && state.mode === "edit-persp" && mode === "edit-persp") {
      if (window.DigitizerImageEdit && window.DigitizerImageEdit.applyActiveRegionEdit("edit-persp")) {
        return;
      }
    }

    if (state.activeTab === "edit" && state.mode === "edit-crop" && mode === "edit-crop") {
      if (window.DigitizerImageEdit && window.DigitizerImageEdit.applyActiveRegionEdit("edit-crop")) {
        return;
      }
    }

    state.mode = mode;
    state.modeByTab[state.activeTab] = mode;
    state.pendingMeasurement = null;
    if (state.activeTab === "plot" && window.DigitizerAuto && AUTO_MODES.has(mode)) {
      window.DigitizerAuto.onMaskModeChange(state, mode);
    }
    if (state.activeTab === "edit" && window.DigitizerImageEdit) {
      window.DigitizerImageEdit.onEditModeChange(mode);
    }
    updateModeBar();
    updateStatus();
    draw();
  }

  function updateModeBar() {
    modeButtons.forEach((btn) => {
      const m = btn.dataset.mode;
      const isPlot = PLOT_MODES.has(m);
      const isMap = MAP_MODES.has(m);
      const isColormap = COLORMAP_MODES.has(m);
      const isEdit = EDIT_MODES.has(m);
      const visibleInActiveTab = (state.activeTab === "plot" && isPlot)
        || (state.activeTab === "map" && isMap)
        || (state.activeTab === "colormap" && isColormap)
        || (state.activeTab === "edit" && isEdit);
      btn.classList.toggle("active", visibleInActiveTab && m === state.mode);

      if (m === "add") {
        btn.disabled = !readyToDigitize();
        btn.classList.toggle("completed", false);
      } else if (m === "scale-a" || m === "scale-b") {
        const key = m === "scale-a" ? "a" : "b";
        btn.disabled = false;
        btn.classList.toggle("completed", !!state.scale[key] && m !== state.mode);
      } else if (m === "measure-distance" || m === "measure-angle") {
        btn.disabled = false;
        btn.classList.toggle("completed", false);
      } else if (COLORMAP_MODES.has(m)) {
        btn.disabled = false;
        btn.classList.toggle("completed", !!(window.DigitizerColormap && window.DigitizerColormap.isModeComplete(m)) && m !== state.mode);
      } else if (EDIT_MODES.has(m)) {
        btn.disabled = false;
        btn.classList.toggle("completed", false);
      } else {
        btn.disabled = false;
        btn.classList.toggle("completed", !!state.calibration[m] && m !== state.mode);
      }
    });

    if (editCancelBtn) {
      const inRegionMode = state.activeTab === "edit"
        && (state.mode === "edit-crop" || state.mode === "edit-persp");
      editCancelBtn.hidden = !inRegionMode;
      editCancelBtn.disabled = !inRegionMode
        || !window.DigitizerImageEdit
        || !window.DigitizerImageEdit.hasActiveRegionAction(state);
    }
  }

  function updateStatus() {
    if (!state.image) {
      statusEl.textContent = "";
      return;
    }

    if (state.activeTab === "plot") {
      if (window.DigitizerAuto && window.DigitizerAuto.updateStatus(state, statusEl)) {
        return;
      }
      if (state.mode === "add") {
        statusEl.textContent = "Click to add a data point. Right-click a point (or use the table) to remove it.";
        return;
      }
      if (PLOT_MODE_LABELS[state.mode]) {
        statusEl.textContent = `Click on the image to set the ${PLOT_MODE_LABELS[state.mode]} reference point.`;
        return;
      }
      statusEl.textContent = "Select a mode above to begin.";
      return;
    }

    if (state.activeTab === "map") {
      if (state.mode === "scale-a" || state.mode === "scale-b") {
        statusEl.textContent = `Click on the image to set the ${MAP_MODE_LABELS[state.mode]} endpoint.`;
        return;
      }
      if (state.mode === "measure-distance") {
        const n = state.pendingMeasurement ? state.pendingMeasurement.points.length : 0;
        statusEl.textContent = n === 1
          ? "Click the second point to complete the distance."
          : "Click two points to measure the distance between them.";
        return;
      }
      if (state.mode === "measure-angle") {
        const n = state.pendingMeasurement ? state.pendingMeasurement.points.length : 0;
        if (n === 1) statusEl.textContent = "Click the vertex (the middle point of the angle).";
        else if (n === 2) statusEl.textContent = "Click the third point to complete the angle.";
        else statusEl.textContent = "Click three points: ray end, vertex, then the other ray end.";
        return;
      }
      statusEl.textContent = "Select a mode above to begin.";
      return;
    }

    if (state.activeTab === "colormap" && window.DigitizerColormap) {
      if (window.DigitizerColormap.updateStatus(state, statusEl)) return;
    }

    if (state.activeTab === "edit") {
      if (state.mode === "edit-crop") {
        if (state.edit.cropAwaitingDraw && !state.edit.crop) {
          statusEl.textContent = "Click and drag on the image to draw a crop region.";
          return;
        }
        statusEl.textContent = "Drag the crop handles to adjust the region. Click Crop region again to apply, or Cancel to discard. Crop and perspective correction cannot be used together.";
        return;
      }
      if (state.mode === "edit-persp") {
        if (state.edit.perspAwaitingDraw && !state.edit.corners) {
          statusEl.textContent = "Click and drag on the image to draw a perspective region.";
          return;
        }
        statusEl.textContent = "Drag green corner handles for perspective, blue edge handles to bow each side (barrel/pincushion). Click Correct perspective again to apply, or Cancel to discard.";
        return;
      }
      if (state.mode === "edit-lens-center") {
        statusEl.textContent = "Click on the image to set the lens distortion center (optical center).";
        return;
      }
      if (state.mode === "edit-bg-pick") {
        statusEl.textContent = "Click on the image to pick a background color to make transparent. Repeat for additional colors.";
        return;
      }
      if (state.mode === "edit-remove-rect") {
        statusEl.textContent = "Click and drag a rectangle, then press Delete or Backspace to remove those pixels.";
        return;
      }
      if (state.mode === "edit-remove-lasso") {
        statusEl.textContent = "Click and drag a freeform lasso, then press Delete or Backspace to remove those pixels.";
        return;
      }
      if (state.mode === "edit-remove-poly") {
        statusEl.textContent = "Click polygon vertices. Click the first point to close, then press Delete or Backspace.";
        return;
      }
      statusEl.textContent = "Adjust sliders in the sidebar for live preview, then click Apply edits.";
      return;
    }

    statusEl.textContent = "";
  }

  function nextCalibrationMode(current) {
    const order = ["y1", "y2", "x1", "x2"];
    const startIdx = order.indexOf(current);
    for (let i = 1; i < order.length; i++) {
      const candidate = order[(startIdx + i) % order.length];
      if (!state.calibration[candidate]) return candidate;
    }
    return readyToDigitize() ? "add" : null;
  }

  function nextMapMode(current) {
    if (current === "scale-a" && !state.scale.b) return "scale-b";
    if (current === "scale-b" && !state.scale.a) return "scale-a";
    if ((current === "scale-a" || current === "scale-b") && scaleEndpointsSet()) return "measure-distance";
    return null;
  }

  // --- Image lifecycle ----------------------------------------------------

  function imageToCanvas(img) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0);
    return c;
  }

  function setImage(img, opts) {
    if (state.image && !(opts && opts.restoring)) clearCalibrationsAndPoints();
    state.image = imageToCanvas(img);
    state.selected = null;
    state.pendingMeasurement = null;
    canvas.width = state.image.width;
    canvas.height = state.image.height;
    state.viewZoom = 1;
    state.viewFit = false;
    applyViewZoom();
    workspace.hidden = false;
    dataSection.hidden = false;
    clearBtn.hidden = false;
    if (!state.mode) state.mode = state.modeByTab[state.activeTab];
    if (window.DigitizerImageEdit) window.DigitizerImageEdit.onImageLoaded();
    if (window.DigitizerAuto) window.DigitizerAuto.onImageLoaded(state);
    if (window.DigitizerColormap) window.DigitizerColormap.onImageLoaded(state);
    refreshAll();
    if (!(opts && opts.noScroll)) workspace.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearAnnotationState() {
    state.calibration = { y1: null, y2: null, x1: null, x2: null };
    state.points = [];
    state.scale = { a: null, b: null };
    state.measurements = [];
    state.pendingMeasurement = null;
    state.selected = null;
    state.pointDrag = null;
    state.suppressNextClick = false;
    state.linkOrigin = false;
    state.colormap = null;
  }

  function hasCalibrationOrPoints() {
    if (CALIBRATION_KEYS.some((k) => state.calibration[k])) return true;
    if (state.points.length) return true;
    if (state.scale.a || state.scale.b) return true;
    if (state.measurements.length) return true;
    if (CALIBRATION_KEYS.some((k) => valueInputs[k].value !== "")) return true;
    if (scaleDistanceInput && scaleDistanceInput.value !== "") return true;
    if (scaleUnitInput && scaleUnitInput.value.trim() !== "") return true;
    if (state.colormap && (state.colormap.plot || state.colormap.bar || Object.values(state.colormap.cal).some(Boolean) || Object.values(state.colormap.colorCal || {}).some(Boolean))) return true;
    return false;
  }

  function clearCalibrationsAndPoints() {
    if (!state.image || !hasCalibrationOrPoints()) return;
    clearAnnotationState();
    CALIBRATION_KEYS.forEach((k) => { valueInputs[k].value = ""; });
    ["cm-x1-value", "cm-x2-value", "cm-y1-value", "cm-y2-value", "cm-i1-value", "cm-i2-value", "cm-c1-value", "cm-c2-value"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });
    if (scaleDistanceInput) scaleDistanceInput.value = "";
    if (scaleUnitInput) scaleUnitInput.value = "";
    if (linkOriginEl) linkOriginEl.checked = false;
    ["cm-link-origin", "cm-logx", "cm-logy", "cm-transformed", "cm-log-i", "cm-discrete"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.checked = false;
    });
    state.modeByTab.plot = "y1";
    state.modeByTab.colormap = "cm-y1";
    state.modeByTab.map = "scale-a";
    state.mode = state.modeByTab[state.activeTab];
    if (window.DigitizerColormap) window.DigitizerColormap.onAnnotationsCleared();
    refreshAll();
  }

  function clearAll() {
    deleteStoredSession();
    state.image = null;
    state.originalImage = null;
    clearAnnotationState();
    state.modeByTab = { plot: "y1", colormap: "cm-y1", map: "scale-a", edit: null };
    state.mode = state.modeByTab[state.activeTab];
    state.cursor = null;
    state.pointerInside = false;
    canvas.width = 0;
    canvas.height = 0;
    canvas.style.width = "";
    canvas.style.height = "";
    workspace.hidden = true;
    dataSection.hidden = true;
    clearBtn.hidden = true;
    showLoadError("");
    statusEl.textContent = "";
    if (window.DigitizerImageEdit) window.DigitizerImageEdit.onImageCleared();
    if (window.DigitizerAuto) window.DigitizerAuto.onImageCleared(state);
    if (window.DigitizerColormap) window.DigitizerColormap.onImageCleared(state);
    renderPointsTable();
    renderMeasurementsTable();
    updateCoordReadout();
    updateScaleReadout();
  }

  function loadImageFromSrc(src, opts) {
    showLoadError("");
    const triedCors = opts && opts.triedCors;
    const img = new Image();
    if (!triedCors) img.crossOrigin = "anonymous";
    img.onload = () => setImage(img);
    img.onerror = () => {
      if (!triedCors && /^https?:\/\//i.test(src)) {
        loadImageFromSrc(src, { triedCors: true });
      } else {
        showLoadError(
          "Could not load that image. If you're using a URL, the host may block embedding; try downloading and uploading the file instead."
        );
      }
    };
    img.src = src;
  }

  function loadImageFromBlob(blob) {
    const reader = new FileReader();
    reader.onload = () => loadImageFromSrc(reader.result);
    reader.onerror = () => showLoadError("Could not read that file.");
    reader.readAsDataURL(blob);
  }

  function loadDefaultSamplePlot() {
    if (state.image) return;

    function tryFallbackUrls() {
      const candidates = [
        new URL("../media/plot-digitizer/sample-plot.png", window.location.href).href
      ];
      if (window.location.protocol !== "file:") {
        candidates.push(new URL("/media/plot-digitizer/sample-plot.png", window.location.origin).href);
      }
      if (DEFAULT_PLOT_PROBE && DEFAULT_PLOT_PROBE.src) {
        candidates.unshift(DEFAULT_PLOT_PROBE.src);
      }
      const sources = [...new Set(candidates)].filter((src) => {
        return !(DEFAULT_PLOT_PROBE && DEFAULT_PLOT_PROBE.src === src && DEFAULT_PLOT_PROBE.complete && !DEFAULT_PLOT_PROBE.naturalWidth);
      });

      let index = 0;
      function tryNext() {
        if (index >= sources.length) return;
        const src = sources[index];
        index += 1;
        const img = new Image();
        img.onload = () => setImage(img);
        img.onerror = tryNext;
        img.src = src;
      }
      tryNext();
    }

    if (!DEFAULT_PLOT_PROBE) {
      tryFallbackUrls();
      return;
    }

    const useProbe = () => {
      if (DEFAULT_PLOT_PROBE.naturalWidth > 0) setImage(DEFAULT_PLOT_PROBE);
      else tryFallbackUrls();
    };

    if (DEFAULT_PLOT_PROBE.complete) useProbe();
    else {
      DEFAULT_PLOT_PROBE.addEventListener("load", useProbe, { once: true });
      DEFAULT_PLOT_PROBE.addEventListener("error", tryFallbackUrls, { once: true });
    }
  }

  // --- Image transforms ---------------------------------------------------

  function transformImage(kind) {
    if (!state.image) return;
    const src = state.image;
    const w = src.naturalWidth || src.width;
    const h = src.naturalHeight || src.height;
    if (!w || !h) return;

    let newW;
    let newH;
    let mapPoint;
    let applyTransform;

    if (kind === "rotate-ccw") {
      newW = h;
      newH = w;
      mapPoint = (p) => ({ x: p.y, y: w - 1 - p.x });
      applyTransform = (c) => {
        c.translate(0, w);
        c.rotate(-Math.PI / 2);
      };
    } else if (kind === "mirror-h") {
      newW = w;
      newH = h;
      mapPoint = (p) => ({ x: w - 1 - p.x, y: p.y });
      applyTransform = (c) => {
        c.translate(w, 0);
        c.scale(-1, 1);
      };
    } else if (kind === "mirror-v") {
      newW = w;
      newH = h;
      mapPoint = (p) => ({ x: p.x, y: h - 1 - p.y });
      applyTransform = (c) => {
        c.translate(0, h);
        c.scale(1, -1);
      };
    } else {
      return;
    }

    const off = document.createElement("canvas");
    off.width = newW;
    off.height = newH;
    const offCtx = off.getContext("2d");
    offCtx.imageSmoothingEnabled = false;
    applyTransform(offCtx);
    offCtx.drawImage(src, 0, 0);

    state.image = off;
    canvas.width = newW;
    canvas.height = newH;

    CALIBRATION_KEYS.forEach((k) => {
      if (state.calibration[k]) state.calibration[k] = mapPoint(state.calibration[k]);
    });
    if (state.colormap) {
      Object.keys(state.colormap.cal).forEach((k) => {
        if (state.colormap.cal[k]) state.colormap.cal[k] = mapPoint(state.colormap.cal[k]);
      });
      Object.keys(state.colormap.colorCal || {}).forEach((k) => {
        if (state.colormap.colorCal[k]) state.colormap.colorCal[k] = mapPoint(state.colormap.colorCal[k]);
      });
      ["plot", "bar"].forEach((key) => {
        const r = state.colormap[key];
        if (!r) return;
        const corners = [mapPoint({ x: r.x, y: r.y }), mapPoint({ x: r.x + r.w, y: r.y }), mapPoint({ x: r.x, y: r.y + r.h }), mapPoint({ x: r.x + r.w, y: r.y + r.h })];
        const xs = corners.map((p) => p.x);
        const ys = corners.map((p) => p.y);
        state.colormap[key] = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      });
      state.colormap.dirty = true;
    }
    state.points = state.points.map((p) => {
      const mapped = mapPoint(p);
      if (p.errorBar && p.errorBar.top && p.errorBar.bottom) {
        mapped.errorBar = {
          top: mapPoint(p.errorBar.top),
          bottom: mapPoint(p.errorBar.bottom)
        };
      }
      return mapped;
    });

    if (state.scale.a) state.scale.a = mapPoint(state.scale.a);
    if (state.scale.b) state.scale.b = mapPoint(state.scale.b);
    state.measurements = state.measurements.map((m) => {
      const out = { type: m.type, a: mapPoint(m.a), b: mapPoint(m.b) };
      if (m.c) out.c = mapPoint(m.c);
      return out;
    });
    if (state.pendingMeasurement) {
      state.pendingMeasurement.points = state.pendingMeasurement.points.map(mapPoint);
    }

    if (state.edit && state.edit.corners) {
      CORNER_KEYS_EDIT.forEach((k) => {
        if (state.edit.corners[k]) state.edit.corners[k] = mapPoint(state.edit.corners[k]);
      });
    }
    if (state.edit && state.edit.lensCenter) {
      state.edit.lensCenter = mapPoint(state.edit.lensCenter);
    }

    state.cursor = null;
    state.pointerInside = false;
    if (window.DigitizerImageEdit) window.DigitizerImageEdit.markPreviewDirty();
    if (window.DigitizerAuto) window.DigitizerAuto.onImageLoaded(state);
  }

  const CORNER_KEYS_EDIT = ["tl", "tr", "br", "bl"];

  function handleTransformClick(kind) {
    if (!state.image) {
      flashStatus("Load an image first.");
      return;
    }
    transformImage(kind);
    refreshAll();
  }

  // --- Selection helpers --------------------------------------------------

  function isSelectedCalibration(key) {
    return state.selected && state.selected.type === "calibration" && state.selected.key === key;
  }

  function isSelectedDataIndex(idx) {
    return state.selected
      && (state.selected.type === "data" || state.selected.type === "data-error")
      && state.selected.index === idx;
  }

  function isSelectedScale(key) {
    return state.selected && state.selected.type === "scale" && state.selected.key === key;
  }

  function isSelectedMeasurement(index, key) {
    return state.selected && state.selected.type === "measurement"
      && state.selected.index === index
      && (key == null || state.selected.key === key);
  }

  function equalErrorBarsEnabled() {
    return !!(equalErrorBarsEl && equalErrorBarsEl.checked);
  }

  function normalizeEqualErrorBar(point, preferredKey) {
    if (!point || !point.errorBar || !equalErrorBarsEnabled()) return;
    const top = point.errorBar.top;
    const bottom = point.errorBar.bottom;
    if (!top || !bottom) return;
    let halfHeight;
    if (preferredKey === "top" || preferredKey === "bottom") {
      halfHeight = Math.abs(point.errorBar[preferredKey].y - point.y);
    } else {
      halfHeight = Math.max(Math.abs(top.y - point.y), Math.abs(bottom.y - point.y));
    }
    const imageHeight = state.image ? state.image.height : Infinity;
    if (Number.isFinite(imageHeight)) {
      halfHeight = Math.min(halfHeight, Math.max(0, Math.min(point.y, imageHeight - 1 - point.y)));
    }
    halfHeight = Math.round(halfHeight * 2) / 2;
    top.x = point.x;
    top.y = snapHalfPixel(point.y - halfHeight);
    bottom.x = point.x;
    bottom.y = snapHalfPixel(point.y + halfHeight);
  }

  function getSelectedPoint() {
    const s = state.selected;
    if (!s) return null;
    if (s.type === "persp" && window.DigitizerImageEdit) {
      return window.DigitizerImageEdit.getPerspHandleDisplayPoint(s.key);
    }
    if (s.type === "calibration") return state.calibration[s.key];
    if (s.type === "data") return state.points[s.index] || null;
    if (s.type === "data-error") {
      const p = state.points[s.index];
      return p && p.errorBar ? p.errorBar[s.key] || null : null;
    }
    if (s.type === "scale") return state.scale[s.key];
    if (s.type === "measurement") {
      const m = state.measurements[s.index];
      return m ? m[s.key] || null : null;
    }
    return null;
  }

  function describeSelection(sel) {
    if (!sel) return "";
    if (sel.type === "calibration") {
      return { y1: "Y₁", y2: "Y₂", x1: "X₁", x2: "X₂" }[sel.key] || sel.key;
    }
    if (sel.type === "data") return `point #${sel.index + 1}`;
    if (sel.type === "data-error") {
      return `point #${sel.index + 1} ${sel.key === "top" ? "upper" : "lower"} error cap`;
    }
    if (sel.type === "scale") return sel.key === "a" ? "scale P₁" : "scale P₂";
    if (sel.type === "measurement") {
      const m = state.measurements[sel.index];
      if (!m) return "measurement";
      if (m.type === "distance") {
        const which = sel.key === "a" ? "start" : "end";
        return `distance #${sel.index + 1} ${which}`;
      }
      const which = sel.key === "b" ? "vertex" : sel.key === "a" ? "ray A end" : "ray B end";
      return `angle #${sel.index + 1} ${which}`;
    }
    if (sel.type === "persp") {
      const labels = window.DigitizerImageEdit && window.DigitizerImageEdit.PERSP_HANDLE_LABELS;
      const label = labels && labels[sel.key] ? labels[sel.key] : sel.key;
      return `perspective ${label}`;
    }
    return "";
  }

  function moveSelectedBy(dx, dy) {
    if (!state.selected) return false;
    if (state.selected.type === "persp") {
      if (window.DigitizerImageEdit) {
        return window.DigitizerImageEdit.movePerspHandleBy(state.selected.key, dx, dy);
      }
      return false;
    }
    const p = getSelectedPoint();
    if (!p) return false;
    const owner = state.selected.type === "data-error" ? state.points[state.selected.index] : null;
    const nextX = owner ? owner.x : snapHalfPixel(p.x + dx);
    const nextY = snapHalfPixel(p.y + dy);
    const actualDx = nextX - p.x;
    const actualDy = nextY - p.y;
    if (state.selected.type === "data" && p.errorBar) {
      p.errorBar.top.x += actualDx;
      p.errorBar.top.y += actualDy;
      p.errorBar.bottom.x += actualDx;
      p.errorBar.bottom.y += actualDy;
    }
    p.x = nextX;
    p.y = nextY;
    if (state.selected.type === "data-error" && owner) {
      normalizeEqualErrorBar(owner, state.selected.key);
    }
    if (state.selected.type === "calibration") {
      syncLinkedOrigin(state.selected.key);
    }
    return true;
  }

  function snapCursorToSelection() {
    const pt = getSelectedPoint();
    if (!pt) return;
    state.cursor = { x: pt.x, y: pt.y };
    state.pointerInside = true;
  }

  function onPointDragMove(e) {
    if (!state.pointDrag || !state.image) return;
    const p = clientToImage(e);
    const pt = getSelectedPoint();
    if (!pt) return;
    if (state.selected && state.selected.type === "data" && pt.errorBar) {
      const dx = p.x - pt.x;
      const dy = p.y - pt.y;
      pt.errorBar.top.x += dx;
      pt.errorBar.top.y += dy;
      pt.errorBar.bottom.x += dx;
      pt.errorBar.bottom.y += dy;
    }
    const owner = state.selected && state.selected.type === "data-error"
      ? state.points[state.selected.index]
      : null;
    pt.x = owner ? owner.x : p.x;
    pt.y = p.y;
    if (state.selected && state.selected.type === "data-error" && owner) {
      normalizeEqualErrorBar(owner, state.selected.key);
    }
    if (state.selected && state.selected.type === "calibration") {
      syncLinkedOrigin(state.selected.key);
    }
    state.cursor = { x: pt.x, y: pt.y };
    state.pointerInside = true;
    state.pointDrag.moved = true;
    redrawCanvas();
  }

  function endPointDrag() {
    window.removeEventListener("mousemove", onPointDragMove);
    if (state.pointDrag && state.pointDrag.moved) {
      state.suppressNextClick = true;
      refreshAll();
    }
    state.pointDrag = null;
  }

  function startPointDrag() {
    window.addEventListener("mousemove", onPointDragMove);
    window.addEventListener("mouseup", endPointDrag, { once: true });
  }

  // --- Drawing ------------------------------------------------------------

  function drawAlphaCheckerboard(context, w, h, cellSize) {
    const cell = cellSize || 16;
    context.fillStyle = "#b8bcc4";
    context.fillRect(0, 0, w, h);
    context.fillStyle = "#868c96";
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        if ((Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0) continue;
        context.fillRect(x, y, cell, cell);
      }
    }
  }

  function drawAlphaPreviewBackground(context, w, h, cellSize) {
    const fill = window.DigitizerImageEdit?.getAlphaPreviewBackgroundFill?.(state);
    if (fill) {
      context.fillStyle = fill;
      context.fillRect(0, 0, w, h);
      return;
    }
    drawAlphaCheckerboard(context, w, h, cellSize);
  }

  function needsAlphaCheckerboard(displayImage) {
    if (!window.DigitizerImageEdit || !window.DigitizerImageEdit.needsAlphaCheckerboard) return false;
    return window.DigitizerImageEdit.needsAlphaCheckerboard(state, displayImage);
  }

  function draw() {
    if (!state.image) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    let displayImage = state.image;
    if (window.DigitizerImageEdit) {
      const preview = window.DigitizerImageEdit.getDisplayCanvas
        ? window.DigitizerImageEdit.getDisplayCanvas()
        : (state.activeTab === "edit" ? window.DigitizerImageEdit.getPreviewCanvas() : null);
      if (preview) displayImage = preview;
    }

    if (canvas.width !== displayImage.width || canvas.height !== displayImage.height) {
      canvas.width = displayImage.width;
      canvas.height = displayImage.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (needsAlphaCheckerboard(displayImage)) {
      drawAlphaPreviewBackground(ctx, canvas.width, canvas.height);
    }
    ctx.drawImage(displayImage, 0, 0);
    const s = displayScale();

    if (state.activeTab === "plot") {
      drawAxisLines(s);
      drawCalibrationMarkers(s);
      drawDataPoints(s);
      if (window.DigitizerAuto) window.DigitizerAuto.drawOverlays(ctx, s);
    } else if (state.activeTab === "map") {
      drawScaleAnnotation(s);
      drawMeasurements(s);
      drawPendingMeasurement(s);
    } else if (state.activeTab === "edit" && window.DigitizerImageEdit) {
      window.DigitizerImageEdit.drawOverlays(ctx, s);
    } else if (state.activeTab === "colormap" && window.DigitizerColormap) {
      window.DigitizerColormap.draw(ctx, s);
    }

    drawCursorCrosshair(s);
  }

  function drawSelectionHalo(p, baseRadius, s) {
    ctx.save();
    ctx.strokeStyle = "#f1c054";
    ctx.lineWidth = 2.5 * s;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, baseRadius + 4 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawAxisLines(s) {
    const cal = state.calibration;
    ctx.save();
    ctx.lineWidth = 1.5 * s;
    if (cal.y1 && cal.y2) {
      ctx.strokeStyle = "rgba(48, 92, 138, 0.65)";
      ctx.beginPath();
      ctx.moveTo(cal.y1.x, cal.y1.y);
      ctx.lineTo(cal.y2.x, cal.y2.y);
      ctx.stroke();
    }
    if (cal.x1 && cal.x2) {
      ctx.strokeStyle = "rgba(217, 154, 63, 0.85)";
      ctx.beginPath();
      ctx.moveTo(cal.x1.x, cal.x1.y);
      ctx.lineTo(cal.x2.x, cal.x2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCalibrationMarkers(s) {
    const markers = [
      { key: "y1", color: "#1f4163", label: "Y₁" },
      { key: "y2", color: "#1f4163", label: "Y₂" },
      { key: "x1", color: "#a25d12", label: "X₁" },
      { key: "x2", color: "#a25d12", label: "X₂" }
    ];
    markers.forEach((m) => {
      const p = state.calibration[m.key];
      if (!p) return;
      const r = 8 * s;
      if (isSelectedCalibration(m.key)) drawSelectionHalo(p, r, s);
      drawCrosshairMarker(p, m.color, m.label, r, s);
    });
  }

  function drawCrosshairMarker(p, color, label, radius, s) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - radius * 1.1, p.y);
    ctx.lineTo(p.x + radius * 1.1, p.y);
    ctx.moveTo(p.x, p.y - radius * 1.1);
    ctx.lineTo(p.x, p.y + radius * 1.1);
    ctx.stroke();

    if (label) {
      ctx.font = `bold ${12 * s}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "bottom";
      ctx.textAlign = "left";
      const tx = p.x + radius * 1.3;
      const ty = p.y - radius * 0.4;
      const pad = 3 * s;
      const metrics = ctx.measureText(label);
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.fillRect(tx - pad, ty - 12 * s - pad, metrics.width + pad * 2, 12 * s + pad * 2);
      ctx.fillStyle = color;
      ctx.fillText(label, tx, ty);
    }
    ctx.restore();
  }

  function drawDataPoints(s) {
    if (!state.points.length) return;
    const r = 4 * s;
    state.points.forEach((p, i) => {
      if (p.errorBar && p.errorBar.top && p.errorBar.bottom) {
        const top = p.errorBar.top;
        const bottom = p.errorBar.bottom;
        const dx = bottom.x - top.x;
        const dy = bottom.y - top.y;
        const len = Math.hypot(dx, dy) || 1;
        const capX = -dy / len * 4 * s;
        const capY = dx / len * 4 * s;
        ctx.save();
        ctx.strokeStyle = "rgba(217, 38, 38, 0.9)";
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.moveTo(top.x - capX, top.y - capY);
        ctx.lineTo(top.x + capX, top.y + capY);
        ctx.moveTo(bottom.x - capX, bottom.y - capY);
        ctx.lineTo(bottom.x + capX, bottom.y + capY);
        ctx.stroke();
        ["top", "bottom"].forEach((key) => {
          const endpoint = p.errorBar[key];
          if (state.selected && state.selected.type === "data-error"
              && state.selected.index === i && state.selected.key === key) {
            drawSelectionHalo(endpoint, 5 * s, s);
          }
          ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
          ctx.strokeStyle = "rgba(217, 38, 38, 0.95)";
          ctx.lineWidth = 1.25 * s;
          ctx.beginPath();
          ctx.arc(endpoint.x, endpoint.y, 2.75 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        ctx.restore();
      }
      if (isSelectedDataIndex(i)) drawSelectionHalo(p, r, s);
      ctx.save();
      ctx.fillStyle = "#d92626";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawScaleAnnotation(s) {
    const a = state.scale.a;
    const b = state.scale.b;
    if (a && b) {
      ctx.save();
      ctx.strokeStyle = "#2a8c5f";
      ctx.lineWidth = 2.25 * s;
      ctx.setLineDash([8 * s, 5 * s]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
      const label = scaleCalibrated()
        ? `${formatValue(scaleRealDistance())} ${scaleUnit()}`.trim()
        : `${formatValue(distanceBetween(a, b))} px`;
      drawSegmentLabel(a, b, label, "#1b6644", s);
    }
    const r = 8 * s;
    if (a) {
      if (isSelectedScale("a")) drawSelectionHalo(a, r, s);
      drawCrosshairMarker(a, "#2a8c5f", "P₁", r, s);
    }
    if (b) {
      if (isSelectedScale("b")) drawSelectionHalo(b, r, s);
      drawCrosshairMarker(b, "#2a8c5f", "P₂", r, s);
    }
  }

  function drawMeasurements(s) {
    state.measurements.forEach((m, idx) => {
      if (m.type === "distance") drawDistanceMeasurement(m, idx, s);
      else if (m.type === "angle") drawAngleMeasurement(m, idx, s);
    });
  }

  function drawDistanceMeasurement(m, idx, s) {
    const color = "#305c8a";
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8 * s;
    ctx.beginPath();
    ctx.moveTo(m.a.x, m.a.y);
    ctx.lineTo(m.b.x, m.b.y);
    ctx.stroke();
    ctx.restore();

    drawMeasurementEndpoint(m.a, color, idx, "a", s);
    drawMeasurementEndpoint(m.b, color, idx, "b", s);

    const label = `#${idx + 1}: ${formatDistance(distanceBetween(m.a, m.b))}`;
    drawSegmentLabel(m.a, m.b, label, color, s);
  }

  function drawAngleMeasurement(m, idx, s) {
    const color = "#7a3d8a";
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8 * s;
    ctx.beginPath();
    ctx.moveTo(m.a.x, m.a.y);
    ctx.lineTo(m.b.x, m.b.y);
    ctx.lineTo(m.c.x, m.c.y);
    ctx.stroke();
    ctx.restore();

    drawAngleArc(m.a, m.b, m.c, color, s);

    drawMeasurementEndpoint(m.a, color, idx, "a", s);
    drawMeasurementEndpoint(m.b, color, idx, "b", s);
    drawMeasurementEndpoint(m.c, color, idx, "c", s);

    const deg = angleAtVertex(m.a, m.b, m.c);
    drawPointLabel(m.b, `#${idx + 1}: ${formatAngle(deg)}`, color, s, { offsetX: 12 * s, offsetY: -12 * s });
  }

  function drawAngleArc(a, b, c, color, s) {
    const r = Math.min(distanceBetween(a, b), distanceBetween(c, b)) * 0.35;
    if (!Number.isFinite(r) || r < 4 * s) return;
    const start = Math.atan2(a.y - b.y, a.x - b.x);
    const end = Math.atan2(c.y - b.y, c.x - b.x);
    // Pick the smaller (≤π) arc between the two rays.
    let delta = end - start;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    while (delta > Math.PI) delta -= Math.PI * 2;
    const counterclockwise = delta < 0;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * s;
    ctx.setLineDash([3 * s, 3 * s]);
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, start, start + delta, counterclockwise);
    ctx.stroke();
    ctx.restore();
  }

  function drawMeasurementEndpoint(p, color, idx, key, s) {
    const r = 5 * s;
    if (isSelectedMeasurement(idx, key)) drawSelectionHalo(p, r, s);
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawSegmentLabel(a, b, text, color, s) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    // Offset the label perpendicular to the segment so it doesn't sit on top of the line.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = 12 * s;
    drawPointLabel({ x: mx + nx * offset, y: my + ny * offset }, text, color, s);
  }

  function drawPointLabel(p, text, color, s, options) {
    if (!text) return;
    const offsetX = (options && options.offsetX) || 0;
    const offsetY = (options && options.offsetY) || 0;
    ctx.save();
    ctx.font = `bold ${12 * s}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const pad = 4 * s;
    const metrics = ctx.measureText(text);
    const tx = p.x + offsetX;
    const ty = p.y + offsetY;
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fillRect(tx - pad, ty - 7 * s - pad, metrics.width + pad * 2, 14 * s + pad * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 * s;
    ctx.strokeRect(tx - pad, ty - 7 * s - pad, metrics.width + pad * 2, 14 * s + pad * 2);
    ctx.fillStyle = color;
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }

  function drawPendingMeasurement(s) {
    const pending = state.pendingMeasurement;
    if (!pending || !pending.points.length) return;
    const cursor = state.pointerInside && state.cursor ? state.cursor : null;
    const color = pending.type === "angle" ? "#7a3d8a" : "#305c8a";

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6 * s;
    ctx.setLineDash([6 * s, 4 * s]);
    ctx.beginPath();
    const pts = pending.points.slice();
    if (cursor) pts.push(cursor);
    if (pts.length >= 2) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.restore();

    pending.points.forEach((p) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      ctx.lineWidth = 1.4 * s;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawCursorCrosshair(s) {
    if (!state.pointerInside || !state.cursor) return;
    ctx.save();
    ctx.strokeStyle = "rgba(31, 41, 51, 0.55)";
    ctx.lineWidth = 1 * s;
    ctx.setLineDash([4 * s, 4 * s]);
    ctx.beginPath();
    ctx.moveTo(0, state.cursor.y);
    ctx.lineTo(canvas.width, state.cursor.y);
    ctx.moveTo(state.cursor.x, 0);
    ctx.lineTo(state.cursor.x, canvas.height);
    ctx.stroke();
    ctx.restore();
  }

  // --- Zoom panel ---------------------------------------------------------

  function drawZoom() {
    zoomCtx.imageSmoothingEnabled = false;

    if (!state.image || !state.cursor || !state.pointerInside) {
      zoomCtx.fillStyle = "#1a1a1a";
      zoomCtx.fillRect(0, 0, ZOOM_DISPLAY_SIZE, ZOOM_DISPLAY_SIZE);
      drawZoomCrosshair();
      return;
    }

    let zoomSource = state.image;
    if (window.DigitizerImageEdit) {
      const preview = window.DigitizerImageEdit.getDisplayCanvas
        ? window.DigitizerImageEdit.getDisplayCanvas()
        : (state.activeTab === "edit" ? window.DigitizerImageEdit.getPreviewCanvas() : null);
      if (preview) zoomSource = preview;
    }

    const srcSize = ZOOM_DISPLAY_SIZE / ZOOM_FACTOR;
    const half = srcSize / 2;
    const sx = state.cursor.x - half;
    const sy = state.cursor.y - half;
    if (needsAlphaCheckerboard(zoomSource)) {
      drawAlphaPreviewBackground(zoomCtx, ZOOM_DISPLAY_SIZE, ZOOM_DISPLAY_SIZE, 8);
    } else {
      zoomCtx.fillStyle = "#1a1a1a";
      zoomCtx.fillRect(0, 0, ZOOM_DISPLAY_SIZE, ZOOM_DISPLAY_SIZE);
    }
    try {
      zoomCtx.drawImage(
        zoomSource,
        sx, sy, srcSize, srcSize,
        0, 0, ZOOM_DISPLAY_SIZE, ZOOM_DISPLAY_SIZE
      );
    } catch (err) { /* ignore edge cases */ }

    const k = ZOOM_FACTOR;
    const marker = (p, color, fillCenter, selected) => {
      const zx = (p.x - sx) * k;
      const zy = (p.y - sy) * k;
      if (zx < -12 || zy < -12 || zx > ZOOM_DISPLAY_SIZE + 12 || zy > ZOOM_DISPLAY_SIZE + 12) return;
      if (selected) {
        zoomCtx.save();
        zoomCtx.strokeStyle = "#f1c054";
        zoomCtx.lineWidth = 2.5;
        zoomCtx.beginPath();
        zoomCtx.arc(zx, zy, 9, 0, Math.PI * 2);
        zoomCtx.stroke();
        zoomCtx.restore();
      }
      zoomCtx.save();
      zoomCtx.strokeStyle = color;
      zoomCtx.fillStyle = fillCenter || "rgba(255, 255, 255, 0.9)";
      zoomCtx.lineWidth = 1.5;
      zoomCtx.beginPath();
      zoomCtx.arc(zx, zy, 5, 0, Math.PI * 2);
      if (fillCenter) zoomCtx.fill();
      zoomCtx.stroke();
      zoomCtx.restore();
    };

    if (state.activeTab === "plot") {
      if (window.DigitizerAuto && window.DigitizerAuto.drawZoomOverlays) {
        window.DigitizerAuto.drawZoomOverlays(zoomCtx, sx, sy, k);
      }
      const cal = state.calibration;
      if (cal.y1) marker(cal.y1, "#1f4163", null, isSelectedCalibration("y1"));
      if (cal.y2) marker(cal.y2, "#1f4163", null, isSelectedCalibration("y2"));
      if (cal.x1) marker(cal.x1, "#a25d12", null, isSelectedCalibration("x1"));
      if (cal.x2) marker(cal.x2, "#a25d12", null, isSelectedCalibration("x2"));
      state.points.forEach((p, i) => {
        marker(p, "#d92626", "#d92626", isSelectedDataIndex(i));
        if (p.errorBar && p.errorBar.top && p.errorBar.bottom) {
          const topX = (p.errorBar.top.x - sx) * k;
          const topY = (p.errorBar.top.y - sy) * k;
          const bottomX = (p.errorBar.bottom.x - sx) * k;
          const bottomY = (p.errorBar.bottom.y - sy) * k;
          const dx = bottomX - topX;
          const dy = bottomY - topY;
          const len = Math.hypot(dx, dy) || 1;
          const capX = -dy / len * 4;
          const capY = dx / len * 4;
          zoomCtx.save();
          zoomCtx.strokeStyle = "#d92626";
          zoomCtx.lineWidth = 1.5;
          zoomCtx.beginPath();
          zoomCtx.moveTo(topX, topY);
          zoomCtx.lineTo(bottomX, bottomY);
          zoomCtx.moveTo(topX - capX, topY - capY);
          zoomCtx.lineTo(topX + capX, topY + capY);
          zoomCtx.moveTo(bottomX - capX, bottomY - capY);
          zoomCtx.lineTo(bottomX + capX, bottomY + capY);
          zoomCtx.stroke();
          [["top", topX, topY], ["bottom", bottomX, bottomY]].forEach(([key, x, y]) => {
            const selected = state.selected && state.selected.type === "data-error"
              && state.selected.index === i && state.selected.key === key;
            if (selected) {
              zoomCtx.strokeStyle = "#f1c054";
              zoomCtx.lineWidth = 2.5;
              zoomCtx.beginPath();
              zoomCtx.arc(x, y, 8, 0, Math.PI * 2);
              zoomCtx.stroke();
            }
            zoomCtx.fillStyle = "rgba(255, 255, 255, 0.95)";
            zoomCtx.strokeStyle = "#d92626";
            zoomCtx.lineWidth = 1.25;
            zoomCtx.beginPath();
            zoomCtx.arc(x, y, 3, 0, Math.PI * 2);
            zoomCtx.fill();
            zoomCtx.stroke();
          });
          zoomCtx.restore();
        }
      });
    } else if (state.activeTab === "colormap" && window.DigitizerColormap) {
      window.DigitizerColormap.drawZoom(zoomCtx, sx, sy, k, marker);
    } else if (state.activeTab === "map") {
      if (state.scale.a) marker(state.scale.a, "#2a8c5f", null, isSelectedScale("a"));
      if (state.scale.b) marker(state.scale.b, "#2a8c5f", null, isSelectedScale("b"));
      state.measurements.forEach((m, i) => {
        const color = m.type === "angle" ? "#7a3d8a" : "#305c8a";
        marker(m.a, color, color, isSelectedMeasurement(i, "a"));
        marker(m.b, color, color, isSelectedMeasurement(i, "b"));
        if (m.c) marker(m.c, color, color, isSelectedMeasurement(i, "c"));
      });
      if (state.pendingMeasurement) {
        const color = state.pendingMeasurement.type === "angle" ? "#7a3d8a" : "#305c8a";
        state.pendingMeasurement.points.forEach((p) => marker(p, color, color, false));
      }
    } else if (state.activeTab === "edit" && window.DigitizerImageEdit) {
      window.DigitizerImageEdit.drawZoomPerspOverlay(zoomCtx, sx, sy, k, marker);
    }

    drawZoomCrosshair();
  }

  function drawZoomCrosshair() {
    const mid = ZOOM_DISPLAY_SIZE / 2;
    zoomCtx.save();
    zoomCtx.strokeStyle = "rgba(217, 38, 38, 0.85)";
    zoomCtx.lineWidth = 1;
    zoomCtx.beginPath();
    zoomCtx.moveTo(0, mid + 0.5);
    zoomCtx.lineTo(ZOOM_DISPLAY_SIZE, mid + 0.5);
    zoomCtx.moveTo(mid + 0.5, 0);
    zoomCtx.lineTo(mid + 0.5, ZOOM_DISPLAY_SIZE);
    zoomCtx.stroke();
    zoomCtx.strokeStyle = "rgba(217, 38, 38, 0.85)";
    zoomCtx.lineWidth = 1.5;
    zoomCtx.beginPath();
    zoomCtx.arc(mid, mid, 6, 0, Math.PI * 2);
    zoomCtx.stroke();
    zoomCtx.restore();
  }

  // --- Coord / scale readouts --------------------------------------------

  function updateCoordReadout() {
    if (!state.image) {
      coordPixelEl.textContent = "Move the cursor over the plot.";
      coordDataEl.textContent = "";
    } else if (!state.cursor || !state.pointerInside) {
      coordPixelEl.textContent = "Move the cursor over the plot.";
      coordDataEl.textContent = "";
    } else {
      coordPixelEl.textContent = `Pixel: (${snapHalfPixel(state.cursor.x)}, ${snapHalfPixel(state.cursor.y)})`;
      let dataLine = "";
      if (state.activeTab === "plot" && readyToDigitize()) {
        const d = computeDataCoords(state.cursor);
        if (d && Number.isFinite(d.x) && Number.isFinite(d.y)) {
          dataLine = `Data: (${formatValue(d.x)}, ${formatValue(d.y)})`;
        }
      }
      if (state.activeTab === "colormap" && window.DigitizerColormap) {
        const d = window.DigitizerColormap.dataAtCursor(state.cursor);
        if (d && Number.isFinite(d.x) && Number.isFinite(d.y)) {
          dataLine = `Data: (${formatValue(d.x)}, ${formatValue(d.y)})`;
        }
      }
      if (state.activeTab === "map") {
        const preview = pendingMeasurementPreview();
        if (preview) dataLine = preview;
      }
      if (state.activeTab === "edit") {
        dataLine = "";
      }
      coordDataEl.textContent = dataLine;
    }
    updateSelectionReadout();
  }

  function pendingMeasurementPreview() {
    const pending = state.pendingMeasurement;
    if (!pending || !state.cursor || !state.pointerInside) return "";
    const pts = pending.points;
    if (pending.type === "distance" && pts.length === 1) {
      return `Length: ${formatDistance(distanceBetween(pts[0], state.cursor))}`;
    }
    if (pending.type === "angle") {
      if (pts.length === 1) return `Leg A length: ${formatDistance(distanceBetween(pts[0], state.cursor))}`;
      if (pts.length === 2) {
        const deg = angleAtVertex(pts[0], pts[1], state.cursor);
        return `Pending angle: ${formatAngle(deg)}`;
      }
    }
    return "";
  }

  function updateSelectionReadout() {
    if (state.activeTab === "colormap" && window.DigitizerColormap) {
      coordSelectedEl.textContent = window.DigitizerColormap.selectedText();
      return;
    }
    if (!state.selected) {
      coordSelectedEl.textContent = "";
      return;
    }
    const label = describeSelection(state.selected);
    const pt = getSelectedPoint();
    if (!pt) {
      coordSelectedEl.textContent = "";
      return;
    }
    coordSelectedEl.textContent = `Selected ${label} @ ${formatPixelPoint(pt)} — use arrow keys`;
  }

  function updateScaleReadout() {
    if (!scaleReadoutEl) return;
    if (!scaleEndpointsSet()) {
      scaleReadoutEl.textContent = "Set both scale endpoints to read the pixel distance.";
      return;
    }
    const pix = scalePixelDistance();
    if (scaleCalibrated()) {
      const real = scaleRealDistance();
      const unit = scaleUnit();
      const perPx = real / pix;
      const unitStr = unit || "units";
      scaleReadoutEl.textContent = `${formatValue(pix)} px = ${formatValue(real)} ${unitStr}  ·  ${formatValue(perPx)} ${unitStr}/px`;
    } else {
      scaleReadoutEl.textContent = `Pixel distance: ${formatValue(pix)} px. Enter the real distance above to enable measurements.`;
    }
  }

  // --- Plot table ---------------------------------------------------------

  function renderPointsTable() {
    tbody.innerHTML = "";
    const ready = readyToDigitize();
    if (pointsXHeader) pointsXHeader.textContent = ready ? "X" : "X (px)";
    if (pointsYHeader) pointsYHeader.textContent = ready ? "Y" : "Y (px)";
    if (pointsErrorHeader) pointsErrorHeader.textContent = ready ? "Error bar" : "Error bar (px)";
    const geometryProblem = calibrationGeometryProblem();
    if (!state.image) {
      dataNote.textContent = "";
    } else if (!state.points.length) {
      if (ready) {
        dataNote.textContent = "Click inside the plot in Add points mode to digitize data.";
      } else if (geometryProblem) {
        dataNote.textContent = `Axis calibration cannot convert pixels to data: ${geometryProblem}.`;
      } else {
        dataNote.textContent = "Calibrate the four axis points and enter their values to start digitizing.";
      }
    } else {
      if (ready) {
        dataNote.textContent = `${state.points.length} point${state.points.length === 1 ? "" : "s"} digitized.`;
      } else if (geometryProblem) {
        dataNote.textContent = `${state.points.length} pixel point${state.points.length === 1 ? "" : "s"} stored. Axis calibration cannot convert them to data: ${geometryProblem}.`;
      } else {
        dataNote.textContent = `${state.points.length} pixel point${state.points.length === 1 ? "" : "s"} stored; complete the axis calibration to see data coordinates.`;
      }
    }

    state.points.forEach((p, idx) => {
      const d = computeDataCoords(p);
      const tr = document.createElement("tr");
      if (isSelectedDataIndex(idx)) tr.classList.add("digitizer-row-selected");

      const tdIdx = document.createElement("td");
      tdIdx.textContent = String(idx + 1);
      const tdX = document.createElement("td");
      tdX.textContent = d ? formatValue(d.x) : formatValue(p.x);
      const tdY = document.createElement("td");
      tdY.textContent = d ? formatValue(d.y) : formatValue(p.y);
      const tdError = document.createElement("td");
      const error = d ? computeErrorBarValue(p) : null;
      const pixelError = p.errorBar && p.errorBar.top && p.errorBar.bottom
        ? Math.abs(p.errorBar.bottom.y - p.errorBar.top.y) / 2
        : null;
      tdError.textContent = error != null
        ? formatValue(error)
        : pixelError != null ? formatValue(pixelError) : "—";

      const tdAction = document.createElement("td");
      const errorBtn = document.createElement("button");
      errorBtn.type = "button";
      errorBtn.className = "tool-inline-button";
      errorBtn.textContent = p.errorBar ? "remove error" : "add error";
      errorBtn.addEventListener("click", () => toggleDataErrorBar(idx));
      tdAction.appendChild(errorBtn);
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "tool-inline-button";
      removeBtn.textContent = "remove";
      removeBtn.addEventListener("click", () => removeDataPoint(idx));
      if (tdAction.childNodes.length) tdAction.appendChild(document.createTextNode(" "));
      tdAction.appendChild(removeBtn);

      tr.appendChild(tdIdx);
      tr.appendChild(tdX);
      tr.appendChild(tdY);
      tr.appendChild(tdError);
      tr.appendChild(tdAction);
      tr.tabIndex = 0;
      const selectRowPoint = () => {
        state.selected = { type: "data", index: idx };
        snapCursorToSelection();
        refreshAll();
      };
      tr.addEventListener("click", (event) => {
        if (event.target.closest("button, a, input, select, textarea")) return;
        selectRowPoint();
      });
      tr.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectRowPoint();
      });
      tbody.appendChild(tr);
    });
  }

  function toggleDataErrorBar(idx) {
    const p = state.points[idx];
    if (!p) return;
    if (p.errorBar) {
      p.errorBar = null;
      if (state.selected && state.selected.type === "data-error" && state.selected.index === idx) {
        state.selected = { type: "data", index: idx };
      }
    } else {
      const halfHeight = 5;
      p.errorBar = {
        top: { x: p.x, y: snapHalfPixel(p.y - halfHeight) },
        bottom: { x: p.x, y: snapHalfPixel(p.y + halfHeight) }
      };
      state.selected = { type: "data-error", index: idx, key: "top" };
      flashStatus("Drag the upper and lower error caps, or nudge them with the arrow keys.");
    }
    refreshAll();
  }

  function removeDataPoint(idx) {
    if (idx < 0 || idx >= state.points.length) return;
    state.points.splice(idx, 1);
    if (state.selected && (state.selected.type === "data" || state.selected.type === "data-error")) {
      if (state.selected.index === idx) state.selected = null;
      else if (state.selected.index > idx) state.selected = { ...state.selected, index: state.selected.index - 1 };
    }
    refreshAll();
  }

  // --- Measurements table -------------------------------------------------

  function renderMeasurementsTable() {
    if (!measurementsTbody) return;
    measurementsTbody.innerHTML = "";

    if (!state.image) {
      measurementsNote.textContent = "";
    } else if (!state.measurements.length) {
      const calibratedMsg = scaleCalibrated()
        ? "Switch to Distance or Angle mode and click points to start measuring."
        : "Set the two scale endpoints and enter their real distance, then choose Distance or Angle mode.";
      measurementsNote.textContent = calibratedMsg;
    } else {
      const calMsg = scaleCalibrated()
        ? ""
        : " · Add a real scale distance above to convert pixels into real units.";
      measurementsNote.textContent = `${state.measurements.length} measurement${state.measurements.length === 1 ? "" : "s"} recorded.${calMsg}`;
    }

    state.measurements.forEach((m, idx) => {
      const tr = document.createElement("tr");
      if (isSelectedMeasurement(idx)) tr.classList.add("digitizer-row-selected");

      const tdIdx = document.createElement("td");
      tdIdx.textContent = String(idx + 1);
      const tdType = document.createElement("td");
      tdType.textContent = m.type === "angle" ? "Angle" : "Distance";
      const tdValue = document.createElement("td");
      tdValue.textContent = measurementValueText(m);
      const tdPts = document.createElement("td");
      tdPts.textContent = measurementEndpointsText(m);

      const tdAction = document.createElement("td");
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "tool-inline-button";
      removeBtn.textContent = "remove";
      removeBtn.addEventListener("click", () => removeMeasurement(idx));
      tdAction.appendChild(removeBtn);

      tr.appendChild(tdIdx);
      tr.appendChild(tdType);
      tr.appendChild(tdValue);
      tr.appendChild(tdPts);
      tr.appendChild(tdAction);
      measurementsTbody.appendChild(tr);
    });
  }

  function removeMeasurement(idx) {
    if (idx < 0 || idx >= state.measurements.length) return;
    state.measurements.splice(idx, 1);
    if (state.selected && state.selected.type === "measurement") {
      if (state.selected.index === idx) state.selected = null;
      else if (state.selected.index > idx) {
        state.selected = { type: "measurement", index: state.selected.index - 1, key: state.selected.key };
      }
    }
    refreshAll();
  }

  // --- Hit testing --------------------------------------------------------

  function findHit(p) {
    const r = SELECT_HIT_RADIUS_PX * displayScale();
    let best = null;
    let bestDist = Infinity;

    const consider = (sel, pt) => {
      if (!pt) return;
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d < r && d < bestDist) {
        bestDist = d;
        best = sel;
      }
    };

    if (state.activeTab === "plot") {
      for (const key of CALIBRATION_KEYS) consider({ type: "calibration", key }, state.calibration[key]);
      state.points.forEach((pt, i) => {
        if (pt.errorBar) {
          consider({ type: "data-error", index: i, key: "top" }, pt.errorBar.top);
          consider({ type: "data-error", index: i, key: "bottom" }, pt.errorBar.bottom);
        }
        consider({ type: "data", index: i }, pt);
      });
    } else if (state.activeTab === "map") {
      consider({ type: "scale", key: "a" }, state.scale.a);
      consider({ type: "scale", key: "b" }, state.scale.b);
      state.measurements.forEach((m, i) => {
        consider({ type: "measurement", index: i, key: "a" }, m.a);
        consider({ type: "measurement", index: i, key: "b" }, m.b);
        if (m.c) consider({ type: "measurement", index: i, key: "c" }, m.c);
      });
    }

    return best;
  }

  function findHitForDeletion(p) {
    const r = POINT_HIT_RADIUS_PX * displayScale();
    let best = null;
    let bestDist = Infinity;

    if (state.activeTab === "plot") {
      state.points.forEach((pt, i) => {
        const d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d < r && d < bestDist) {
          bestDist = d;
          best = { kind: "data", index: i };
        }
      });
    } else if (state.activeTab === "map") {
      state.measurements.forEach((m, i) => {
        ["a", "b", "c"].forEach((key) => {
          const pt = m[key];
          if (!pt) return;
          const d = Math.hypot(pt.x - p.x, pt.y - p.y);
          if (d < r && d < bestDist) {
            bestDist = d;
            best = { kind: "measurement", index: i };
          }
        });
      });
    }
    return best;
  }

  // --- Action helpers -----------------------------------------------------

  function refreshAll() {
    updateModeBar();
    updateStatus();
    if (state.image) {
      dataSection.hidden = state.activeTab === "edit" || state.activeTab === "colormap";
    }
    renderPointsTable();
    renderMeasurementsTable();
    updateCoordReadout();
    updateScaleReadout();
    draw();
    drawZoom();
    if (window.DigitizerImageEdit) window.DigitizerImageEdit.updateCanvasWrap();
    scheduleSessionSave();
  }

  function redrawCanvas() {
    updateCoordReadout();
    draw();
    drawZoom();
  }

  function swapAxisPair(keyA, keyB) {
    const pixA = state.calibration[keyA];
    const pixB = state.calibration[keyB];
    state.calibration[keyA] = pixB;
    state.calibration[keyB] = pixA;
    const valA = valueInputs[keyA].value;
    valueInputs[keyA].value = valueInputs[keyB].value;
    valueInputs[keyB].value = valA;
    if (state.selected && state.selected.type === "calibration") {
      if (state.selected.key === keyA) state.selected = { type: "calibration", key: keyB };
      else if (state.selected.key === keyB) state.selected = { type: "calibration", key: keyA };
    }
  }

  function syncLinkedOrigin(fromKey) {
    if (!state.linkOrigin) return;
    if (fromKey === "y1" && state.calibration.y1) {
      state.calibration.x1 = { x: state.calibration.y1.x, y: state.calibration.y1.y };
    } else if (fromKey === "x1" && state.calibration.x1) {
      state.calibration.y1 = { x: state.calibration.x1.x, y: state.calibration.x1.y };
    }
  }

  function applyLinkOrigin() {
    const y1 = state.calibration.y1;
    const x1 = state.calibration.x1;
    if (y1) {
      state.calibration.x1 = { x: y1.x, y: y1.y };
      return true;
    }
    if (x1) {
      state.calibration.y1 = { x: x1.x, y: x1.y };
      return true;
    }
    return false;
  }

  function advanceFromLinkedX1Step() {
    if (state.activeTab !== "plot" || state.mode !== "x1") return;
    if (!state.calibration.y1 || !state.calibration.x1) return;
    state.selected = { type: "calibration", key: "x1" };
    const next = !state.calibration.y2 ? "y2" : nextCalibrationMode("x1");
    if (next) {
      state.mode = next;
      state.modeByTab.plot = next;
    }
  }

  function swapScaleEndpoints() {
    const a = state.scale.a;
    state.scale.a = state.scale.b;
    state.scale.b = a;
    if (state.selected && state.selected.type === "scale") {
      state.selected = { type: "scale", key: state.selected.key === "a" ? "b" : "a" };
    }
  }

  // --- CSV / text export --------------------------------------------------

  function buildPlotCsv() {
    if (!readyToDigitize()) return "";
    return state.points
      .map((p) => {
        const d = computeDataCoords(p);
        if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return null;
        const error = computeErrorBarValue(p);
        return `${d.x},${d.y},${error == null ? "" : error}`;
      })
      .filter((line) => line !== null)
      .join("\n");
  }

  function buildMeasurementsText() {
    if (!state.measurements.length) return "";
    const unit = scaleUnit();
    const lines = ["#,type,value,unit,p1_x,p1_y,p2_x,p2_y,p3_x,p3_y"];
    state.measurements.forEach((m, idx) => {
      const cols = [String(idx + 1), m.type];
      if (m.type === "distance") {
        const realPx = distanceBetween(m.a, m.b);
        const real = pixelsToReal(realPx);
        cols.push(real != null ? String(real) : String(realPx));
        cols.push(real != null ? (unit || "") : "px");
        cols.push(String(m.a.x), String(m.a.y), String(m.b.x), String(m.b.y), "", "");
      } else {
        cols.push(String(angleAtVertex(m.a, m.b, m.c)));
        cols.push("deg");
        cols.push(String(m.a.x), String(m.a.y), String(m.b.x), String(m.b.y), String(m.c.x), String(m.c.y));
      }
      lines.push(cols.join(","));
    });
    return lines.join("\n");
  }

  async function copyToClipboard(text, btn) {
    if (!text) return false;
    const restoreLabel = (label) => {
      const original = btn.textContent;
      btn.textContent = label;
      setTimeout(() => { btn.textContent = original; }, 1200);
    };
    try {
      await navigator.clipboard.writeText(text);
      restoreLabel("Copied!");
      return true;
    } catch (err) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); }
      catch (err2) { ok = false; }
      document.body.removeChild(ta);
      if (ok) restoreLabel("Copied!");
      return ok;
    }
  }

  function isEditableElement(el) {
    if (!el) return false;
    return el.tagName === "INPUT"
      || el.tagName === "TEXTAREA"
      || el.tagName === "SELECT"
      || el.isContentEditable;
  }

  function hasSelectedText() {
    const selection = window.getSelection ? window.getSelection() : null;
    if (selection && selection.toString()) return true;
    const ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) {
      return ae.selectionStart !== ae.selectionEnd;
    }
    return false;
  }

  // --- Events: image loading ----------------------------------------------

  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) loadImageFromBlob(file);
    fileInput.value = "";
  });
  urlBtn.addEventListener("click", () => {
    const url = urlInput.value.trim();
    if (url) loadImageFromSrc(url);
  });
  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      urlBtn.click();
    }
  });
  clearBtn.addEventListener("click", clearAll);

  if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => setViewZoom((state.viewZoom || 1) / 1.25));
  if (zoomInBtn) zoomInBtn.addEventListener("click", () => setViewZoom((state.viewZoom || 1) * 1.25));
  if (zoomFitBtn) zoomFitBtn.addEventListener("click", fitViewZoom);
  canvasWrap.addEventListener("wheel", (e) => {
    if (!state.image || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.01);
    setViewZoom((state.viewZoom || 1) * factor, e.clientX, e.clientY);
  }, { passive: false });
  ["input", "change"].forEach((eventName) => {
    workspace.addEventListener(eventName, (e) => {
      if (e.target && e.target.matches("input, select, textarea")) scheduleSessionSave();
    });
  });

  document.addEventListener("paste", (e) => {
    if (!e.clipboardData) return;
    const items = e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          loadImageFromBlob(file);
        }
        return;
      }
    }
  });

  // --- Events: tabs -------------------------------------------------------

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  // --- Events: mode bar ---------------------------------------------------

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  if (editCancelBtn) {
    editCancelBtn.addEventListener("click", () => {
      if (window.DigitizerImageEdit) {
        window.DigitizerImageEdit.cancelActiveRegion();
      }
    });
  }

  // --- Events: plot input fields ------------------------------------------

  CALIBRATION_KEYS.forEach((k) => {
    valueInputs[k].addEventListener("input", () => {
      updateModeBar();
      renderPointsTable();
      updateCoordReadout();
      if (window.DigitizerAuto) window.DigitizerAuto.requestLiveAutoDigitize(true);
    });
  });
  [logXEl, logYEl].forEach((el) => {
    el.addEventListener("change", () => {
      updateModeBar();
      renderPointsTable();
      updateCoordReadout();
    });
  });
  transformedEl.addEventListener("change", () => {
    renderPointsTable();
    updateCoordReadout();
  });

  // --- Events: scale input fields -----------------------------------------

  [scaleDistanceInput, scaleUnitInput].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      renderMeasurementsTable();
      updateScaleReadout();
      updateCoordReadout();
      draw();
    });
  });

  // --- Events: canvas pointer ---------------------------------------------

  let cursorFrame = null;
  let cursorEvent = null;

  function scheduleCursorRedraw() {
    if (cursorFrame) return;
    cursorFrame = requestAnimationFrame(() => {
      cursorFrame = null;
      const e = cursorEvent;
      if (!e || !state.image) return;
      if (state.pointDrag || state.editDrag) return;
      state.cursor = clientToImage(e);
      state.pointerInside = true;
      if (state.activeTab === "edit" && window.DigitizerImageEdit) {
        if (window.DigitizerImageEdit.handleMouseMove(state.cursor)) return;
      }
      if (state.activeTab === "colormap" && window.DigitizerColormap) {
        if (window.DigitizerColormap.onMouseMove(state.cursor)) return;
      }
      redrawCanvas();
    });
  }

  canvas.addEventListener("mousemove", (e) => {
    if (!state.image) return;
    cursorEvent = e;
    scheduleCursorRedraw();
  });
  canvas.addEventListener("mousedown", (e) => {
    if (!state.image || e.button !== 0) return;
    const p = clientToImage(e);

    if (state.activeTab === "edit" && window.DigitizerImageEdit) {
      const perspHit = window.DigitizerImageEdit.findPerspHandleHit(p);
      if (perspHit) {
        state.selected = { type: "persp", key: perspHit };
        snapCursorToSelection();
        redrawCanvas();
      }
      if (window.DigitizerImageEdit.handleMouseDown(p)) {
        e.preventDefault();
        return;
      }
    }

    if (state.activeTab === "plot" || state.activeTab === "map") {
      const hit = findHit(p);
      if (hit) {
        canvas.focus({ preventScroll: true });
        state.selected = hit;
        state.pointDrag = { moved: false };
        startPointDrag();
        snapCursorToSelection();
        redrawCanvas();
        e.preventDefault();
        return;
      }
    }

    if (state.activeTab === "plot" && window.DigitizerAuto) {
      if (window.DigitizerAuto.handleMouseDown(p)) {
        e.preventDefault();
        return;
      }
    }
    if (state.activeTab === "colormap" && window.DigitizerColormap && window.DigitizerColormap.onMouseDown(p)) {
      e.preventDefault();
      return;
    }
  });
  window.addEventListener("mouseup", () => {
    if (state.activeTab === "edit" && window.DigitizerImageEdit) {
      window.DigitizerImageEdit.handleMouseUp();
    }
    if (state.activeTab === "colormap" && window.DigitizerColormap) window.DigitizerColormap.onMouseUp();
  });
  canvas.addEventListener("mouseenter", () => { state.pointerInside = true; });
  canvas.addEventListener("mouseleave", () => {
    if (state.pointDrag) return;
    state.pointerInside = false;
    updateCoordReadout();
    draw();
    drawZoom();
  });

  canvas.addEventListener("click", (e) => {
    if (!state.image) return;

    if (state.suppressNextClick) {
      state.suppressNextClick = false;
      return;
    }

    const p = clientToImage(e);

    if (state.activeTab === "edit" && window.DigitizerImageEdit) {
      const perspHit = window.DigitizerImageEdit.findPerspHandleHit(p);
      if (perspHit) {
        state.selected = { type: "persp", key: perspHit };
        snapCursorToSelection();
        refreshAll();
        return;
      }
      if (window.DigitizerImageEdit.handleCanvasClick(p)) return;
    }

    // If a measurement is in progress, every click feeds it (no selection takeover).
    if (state.pendingMeasurement) {
      state.pendingMeasurement.points.push(p);
      finalizePendingIfReady();
      refreshAll();
      return;
    }

    if (state.activeTab === "plot" && window.DigitizerAuto) {
      if (window.DigitizerAuto.handleCanvasClick(p)) return;
    }
    if (state.activeTab === "colormap" && window.DigitizerColormap) {
      if (window.DigitizerColormap.onClick(p)) return;
    }

    // Otherwise: clicking an existing marker / endpoint selects it.
    const hit = findHit(p);
    if (hit) {
      state.selected = hit;
      snapCursorToSelection();
      refreshAll();
      return;
    }

    if (state.activeTab === "plot") {
      handlePlotClick(p);
    } else if (state.activeTab === "map") {
      handleMapClick(p);
    }
  });

  function handlePlotClick(p) {
    if (state.mode === "add") {
      if (!readyToDigitize()) {
        flashStatus("Set all four calibration points and axis values before adding data points.");
        return;
      }
      state.points.push(p);
      state.selected = { type: "data", index: state.points.length - 1 };
      refreshAll();
      return;
    }
    if (state.mode && state.mode in state.calibration) {
      const wasAlreadySet = !!state.calibration[state.mode];
      state.calibration[state.mode] = p;
      if (state.linkOrigin && (state.mode === "y1" || state.mode === "x1")) {
        syncLinkedOrigin(state.mode);
      }
      state.selected = { type: "calibration", key: state.mode };
      if (!wasAlreadySet) {
        const next = nextCalibrationMode(state.mode);
        if (next) {
          state.mode = next;
          state.modeByTab.plot = next;
        }
      }
      refreshAll();
    }
  }

  function handleMapClick(p) {
    if (state.mode === "scale-a" || state.mode === "scale-b") {
      const key = state.mode === "scale-a" ? "a" : "b";
      const wasAlreadySet = !!state.scale[key];
      state.scale[key] = p;
      state.selected = { type: "scale", key };
      if (!wasAlreadySet) {
        const next = nextMapMode(state.mode);
        if (next) {
          state.mode = next;
          state.modeByTab.map = next;
        }
      }
      refreshAll();
      return;
    }
    if (state.mode === "measure-distance" || state.mode === "measure-angle") {
      const kind = state.mode === "measure-distance" ? "distance" : "angle";
      state.pendingMeasurement = { type: kind, points: [p] };
      finalizePendingIfReady();
      refreshAll();
    }
  }

  function finalizePendingIfReady() {
    const pending = state.pendingMeasurement;
    if (!pending) return;
    if (pending.type === "distance" && pending.points.length >= 2) {
      const [a, b] = pending.points;
      state.measurements.push({ type: "distance", a, b });
      state.selected = {
        type: "measurement",
        index: state.measurements.length - 1,
        key: "b"
      };
      state.pendingMeasurement = null;
      return;
    }
    if (pending.type === "angle" && pending.points.length >= 3) {
      const [a, b, c] = pending.points;
      state.measurements.push({ type: "angle", a, b, c });
      state.selected = {
        type: "measurement",
        index: state.measurements.length - 1,
        key: "c"
      };
      state.pendingMeasurement = null;
    }
  }

  canvas.addEventListener("contextmenu", (e) => {
    if (!state.image) return;
    e.preventDefault();
    const p = clientToImage(e);

    if (state.pendingMeasurement) {
      state.pendingMeasurement = null;
      refreshAll();
      return;
    }

    const hit = findHitForDeletion(p);
    if (!hit) return;
    if (hit.kind === "data") removeDataPoint(hit.index);
    else if (hit.kind === "measurement") removeMeasurement(hit.index);
  });

  // --- Events: plot output ------------------------------------------------

  copyBtn.addEventListener("click", async () => {
    const csv = buildPlotCsv();
    if (!csv) {
      showLoadError("Calibrate the axes and add some points before copying.");
      return;
    }
    showLoadError("");
    const ok = await copyToClipboard(csv, copyBtn);
    if (!ok) showLoadError("Could not copy to the clipboard.");
  });

  downloadBtn.addEventListener("click", () => {
    const csv = buildPlotCsv();
    if (!csv) {
      showLoadError("Calibrate the axes and add some points before exporting.");
      return;
    }
    showLoadError("");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "digitized.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  clearPointsBtn.addEventListener("click", () => {
    if (!state.points.length) return;
    state.points = [];
    if (state.selected && (state.selected.type === "data" || state.selected.type === "data-error")) {
      state.selected = null;
    }
    refreshAll();
  });

  if (equalErrorBarsEl) {
    equalErrorBarsEl.addEventListener("change", () => {
      if (equalErrorBarsEl.checked) {
        state.points.forEach((point) => normalizeEqualErrorBar(point));
      }
      refreshAll();
    });
  }

  if (clearCalibrationsBtn) {
    clearCalibrationsBtn.addEventListener("click", clearCalibrationsAndPoints);
  }

  // --- Events: plot calibration actions -----------------------------------

  swapYBtn.addEventListener("click", () => { swapAxisPair("y1", "y2"); refreshAll(); });
  swapXBtn.addEventListener("click", () => { swapAxisPair("x1", "x2"); refreshAll(); });
  if (linkOriginEl) {
    linkOriginEl.addEventListener("change", () => {
      state.linkOrigin = linkOriginEl.checked;
      if (!state.linkOrigin) {
        refreshAll();
        return;
      }
      if (!applyLinkOrigin()) {
        flashStatus("Set Y₁ or X₁ first, then enable linking to share an origin.");
        refreshAll();
        return;
      }
      advanceFromLinkedX1Step();
      refreshAll();
    });
  }

  // --- Events: scale actions / output -------------------------------------

  if (swapScaleBtn) {
    swapScaleBtn.addEventListener("click", () => { swapScaleEndpoints(); refreshAll(); });
  }

  if (copyMeasurementsBtn) {
    copyMeasurementsBtn.addEventListener("click", async () => {
      const text = buildMeasurementsText();
      if (!text) {
        flashStatus("Take at least one measurement first.");
        return;
      }
      const ok = await copyToClipboard(text, copyMeasurementsBtn);
      if (!ok) flashStatus("Could not copy to the clipboard.");
    });
  }
  if (clearMeasurementsBtn) {
    clearMeasurementsBtn.addEventListener("click", () => {
      if (!state.measurements.length) return;
      state.measurements = [];
      if (state.selected && state.selected.type === "measurement") state.selected = null;
      refreshAll();
    });
  }

  // --- Events: keyboard ---------------------------------------------------

  document.addEventListener("keydown", (e) => {
    if (!state.image) return;
    const ae = document.activeElement;
    const copyShortcut = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "c";
    if (copyShortcut) {
      if (!hasSelectedText() && !isEditableElement(ae) && window.DigitizerImageEdit) {
        e.preventDefault();
        window.DigitizerImageEdit.copyImageToClipboard();
      }
      return;
    }

    if (isEditableElement(ae)) {
      return;
    }

    if (e.key === "Tab" && state.activeTab === "plot" && state.points.length
        && state.selected && (state.selected.type === "data" || state.selected.type === "data-error")) {
      e.preventDefault();
      const direction = e.shiftKey ? -1 : 1;
      const index = (state.selected.index + direction + state.points.length) % state.points.length;
      state.selected = { type: "data", index };
      snapCursorToSelection();
      refreshAll();
      return;
    }

    if (e.key === "Escape") {
      let changed = false;
      if (state.activeTab === "plot" && window.DigitizerAuto && window.DigitizerAuto.handleEscape(state)) {
        changed = true;
      } else if (state.activeTab === "edit" && window.DigitizerImageEdit && window.DigitizerImageEdit.handleEscape(state)) {
        changed = true;
      } else if (state.pendingMeasurement) {
        state.pendingMeasurement = null;
        changed = true;
      } else if (state.pointDrag) {
        endPointDrag();
        changed = true;
      } else if (state.editDrag) {
        if (window.DigitizerImageEdit) window.DigitizerImageEdit.cancelEditDrag();
        else state.editDrag = null;
        changed = true;
      } else if (state.selected) {
        state.selected = null;
        changed = true;
      }
      if (changed) {
        refreshAll();
        e.preventDefault();
      }
      return;
    }

    if ((e.key === "Backspace" || e.key === "Delete") && state.activeTab === "edit" && window.DigitizerImageEdit) {
      if (window.DigitizerImageEdit.deleteSelectedPixels()) {
        e.preventDefault();
      }
      return;
    }

    if ((e.key === "Backspace" || e.key === "Delete") && state.activeTab === "plot"
        && state.selected && (state.selected.type === "data" || state.selected.type === "data-error")) {
      e.preventDefault();
      removeDataPoint(state.selected.index);
      return;
    }

    if (!state.selected) return;

    let dx = 0;
    let dy = 0;
    switch (e.key) {
      case "ArrowLeft": dx = -1; break;
      case "ArrowRight": dx = 1; break;
      case "ArrowUp": dy = -1; break;
      case "ArrowDown": dy = 1; break;
      default: return;
    }
    e.preventDefault();
    const step = e.shiftKey ? 5 : 0.5;
    if (moveSelectedBy(dx * step, dy * step)) {
      snapCursorToSelection();
      refreshAll();
    }
  });

  // --- Init image edit module ---------------------------------------------

  if (window.DigitizerImageEdit) {
    window.DigitizerImageEdit.init({
      getState: () => state,
      clientToImage,
      CALIBRATION_KEYS,
      refreshAll,
      updateModeBar,
      flashStatus,
      transformImage: (kind) => {
        handleTransformClick(kind);
      },
      clearAnnotationState,
      displayScale,
      setCanvasSize(w, h) {
        canvas.width = w;
        canvas.height = h;
      },
      redrawCanvas
    });
  }

  if (window.DigitizerAuto) {
    window.DigitizerAuto.init({
      getState: () => state,
      clientToImage,
      displayScale,
      refreshAll,
      flashStatus,
      redrawCanvas,
      readyToDigitize,
      normalizeErrorBar: normalizeEqualErrorBar
    });
  }
  if (window.DigitizerColormap) {
    window.DigitizerColormap.init({ getState: () => state, refreshAll, flashStatus, redrawCanvas });
  }

  setActiveTab("edit", true);
  restoreSession().then((restored) => {
    if (!restored) loadDefaultSamplePlot();
  });

  window.addEventListener("resize", () => {
    if (!state.image) return;
    if (state.viewFit) fitViewZoom();
    else draw();
  });
})();
