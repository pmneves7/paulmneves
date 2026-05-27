(function () {
  "use strict";

  const STORAGE_KEY = "sans-planner-config-v1";
  const M = window.SansPlannerMath;

  const DEFAULTS = {
    lambdaAngstrom: 5,
    detWidthCm: 100,
    detHeightCm: 100,
    sampleDistanceM: 5,
    beamOffsetXMm: 0,
    beamOffsetYMm: 0,
    beamstopRadiusMm: 25,
    deltaLambdaOverLambda: 0.1,
    pinhole1Mm: 30,
    pinhole2Mm: 10,
    aperture1ToSampleM: 6,
    aperture2ToSampleM: 0.5,
    pixelWidthMm: 5,
    pixelHeightMm: 5,
    qInterest: 0.025,
    sampleWidth: {
      q: { value: "", unit: "q", widthType: "sigma" },
      az: { value: "", unit: "q", widthType: "sigma" },
      rock: { value: "", unit: "q", widthType: "sigma" }
    }
  };

  const SAMPLE_WIDTH_KEYS = ["q", "az", "rock"];

  const FIELD_IDS = [
    "sans-lambda",
    "sans-det-width",
    "sans-det-height",
    "sans-sample-distance",
    "sans-beam-offset-x",
    "sans-beam-offset-y",
    "sans-beamstop-radius",
    "sans-dll",
    "sans-pinhole1",
    "sans-pinhole2",
    "sans-aperture1-sample",
    "sans-aperture2-sample",
    "sans-pixel-width",
    "sans-pixel-height",
    "sans-q-interest"
  ];

  const qRangeEl = document.getElementById("sans-q-range");
  const dRangeEl = document.getElementById("sans-d-range");
  const twoThetaRangeEl = document.getElementById("sans-2theta-range");
  const interestResultsEl = document.getElementById("sans-interest-results");
  const sampleCorrelationResultsEl = document.getElementById("sans-sample-correlation-results");
  const resolutionNoteEl = document.getElementById("sans-resolution-note");

  const plotCanvases = {
    qVsTwoTheta: document.getElementById("sans-plot-q-2theta"),
    qzVsTwoTheta: document.getElementById("sans-plot-qz-2theta"),
    qPerpVsQz: document.getElementById("sans-plot-qperp-qz"),
    sigmaX: document.getElementById("sans-plot-sigma-x"),
    sigmaY: document.getElementById("sans-plot-sigma-y"),
    sigmaZ: document.getElementById("sans-plot-sigma-z")
  };

  function num(id) {
    return Number(document.getElementById(id).value);
  }

  function readParams() {
    return {
      lambdaAngstrom: num("sans-lambda"),
      detWidthMm: num("sans-det-width") * 10,
      detHeightMm: num("sans-det-height") * 10,
      sampleDistanceM: num("sans-sample-distance"),
      beamOffsetXMm: num("sans-beam-offset-x"),
      beamOffsetYMm: num("sans-beam-offset-y"),
      beamstopRadiusMm: num("sans-beamstop-radius"),
      deltaLambdaOverLambda: num("sans-dll"),
      pinhole1Mm: num("sans-pinhole1"),
      pinhole2Mm: num("sans-pinhole2"),
      aperture1ToSampleM: num("sans-aperture1-sample"),
      aperture2ToSampleM: num("sans-aperture2-sample"),
      pixelWidthMm: num("sans-pixel-width"),
      pixelHeightMm: num("sans-pixel-height"),
      qInterest: num("sans-q-interest")
    };
  }

  function paramsToFormValues(p) {
    const detWidthCm = p.detWidthCm ?? (p.detWidthMm != null ? p.detWidthMm / 10 : DEFAULTS.detWidthCm);
    const detHeightCm = p.detHeightCm ?? (p.detHeightMm != null ? p.detHeightMm / 10 : DEFAULTS.detHeightCm);
    return {
      "sans-lambda": p.lambdaAngstrom,
      "sans-det-width": detWidthCm,
      "sans-det-height": detHeightCm,
      "sans-sample-distance": p.sampleDistanceM,
      "sans-beam-offset-x": p.beamOffsetXMm,
      "sans-beam-offset-y": p.beamOffsetYMm,
      "sans-beamstop-radius": p.beamstopRadiusMm,
      "sans-dll": p.deltaLambdaOverLambda,
      "sans-pinhole1": p.pinhole1Mm,
      "sans-pinhole2": p.pinhole2Mm,
      "sans-aperture1-sample": p.aperture1ToSampleM,
      "sans-aperture2-sample": p.aperture2ToSampleM,
      "sans-pixel-width": p.pixelWidthMm,
      "sans-pixel-height": p.pixelHeightMm,
      "sans-q-interest": p.qInterest
    };
  }

  function writeParamsToForm(p) {
    const map = paramsToFormValues(p);
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el != null && val != null) el.value = val;
    });
  }

  function formatNum(value, digits = 4) {
    if (!Number.isFinite(value)) return "n/a";
    if (value === 0) return "0";
    const abs = Math.abs(value);
    if (abs < 0.001 || abs >= 10000) return value.toExponential(3);
    let str = value.toPrecision(digits);
    if (str.includes("e")) str = Number(str).toString();
    if (str.includes(".")) str = str.replace(/0+$/, "").replace(/\.$/, "");
    return str;
  }

  function renderResultCard(label, value, note = "") {
    return `
      <div class="tool-result-card">
        <h3>${label}</h3>
        <p>${value}</p>
        ${note ? `<span>${note}</span>` : ""}
      </div>
    `;
  }

  function renderMetricRow(label, value, unit) {
    return `
      <div class="sans-metric-line">
        <span class="sans-metric-label">${label}:</span>
        <span class="sans-metric-value">${formatNum(value)} ${unit}</span>
      </div>
    `;
  }

  function renderMetricCard(title, rows) {
    return `
      <div class="tool-result-card sans-metric-card">
        <h3>${title}</h3>
        <div class="sans-metric-lines">${rows.join("")}</div>
      </div>
    `;
  }

  function correlationLengthAngstrom(sigmaQ) {
    if (!Number.isFinite(sigmaQ) || sigmaQ <= 0) return null;
    return 1 / sigmaQ;
  }

  function renderResolutionWidthCard(title, sigmaQ, fwhmQ, sigmaDeg, fwhmDeg) {
    const rows = [
      renderMetricRow("σ", sigmaQ, "Å⁻¹"),
      renderMetricRow("FWHM", fwhmQ, "Å⁻¹")
    ];
    if (sigmaDeg != null && fwhmDeg != null) {
      rows.push(renderMetricRow("σ", sigmaDeg, "°"));
      rows.push(renderMetricRow("FWHM", fwhmDeg, "°"));
    }
    return renderMetricCard(title, rows);
  }

  function renderCorrelationLengthCard(title, sigmaQ, fwhmQ) {
    const xiSigma = correlationLengthAngstrom(sigmaQ);
    const xiFwhm = correlationLengthAngstrom(fwhmQ);
    return renderMetricCard(title, [
      renderMetricRow("σ", xiSigma, "Å"),
      renderMetricRow("FWHM", xiFwhm, "Å")
    ]);
  }

  function readSampleWidthObserved() {
    const readDir = (key) => {
      const valueRaw = document.getElementById(`sans-obs-${key}-width-value`).value.trim();
      const value = valueRaw === "" ? null : Number(valueRaw);
      const unit = document.querySelector(`input[name="sans-obs-${key}-unit"]:checked`)?.value ?? "q";
      const widthType = document.querySelector(`input[name="sans-obs-${key}-width-type"]:checked`)?.value ?? "sigma";
      return { value, unit, widthType };
    };
    return {
      q: readDir("q"),
      az: readDir("az"),
      rock: readDir("rock")
    };
  }

  function writeSampleWidthToForm(sampleWidth) {
    if (!sampleWidth) return;
    SAMPLE_WIDTH_KEYS.forEach((key) => {
      const cfg = sampleWidth[key];
      if (!cfg) return;
      const input = document.getElementById(`sans-obs-${key}-width-value`);
      if (input && cfg.value != null) input.value = cfg.value;
      const unitEl = document.querySelector(`input[name="sans-obs-${key}-unit"][value="${cfg.unit}"]`);
      if (unitEl) unitEl.checked = true;
      const typeEl = document.querySelector(`input[name="sans-obs-${key}-width-type"][value="${cfg.widthType}"]`);
      if (typeEl) typeEl.checked = true;
    });
  }

  function observedSigmaQ(width, options, direction, ctx) {
    if (width == null || !Number.isFinite(width) || width <= 0) return null;
    const sigmaWidth = options.widthType === "fwhm" ? width / M.FWHM_TO_SIGMA : width;
    if (options.unit === "q") return sigmaWidth;
    const degToRad = Math.PI / 180;
    if (direction === "q") {
      return (sigmaWidth * degToRad * ctx.k * Math.cos(ctx.theta));
    }
    return (sigmaWidth * degToRad * ctx.q0);
  }

  function sampleSigmaFromObserved(observedSigmaQ, instrumentSigma) {
    if (observedSigmaQ == null || instrumentSigma == null) return { sigmaSample: null, imaginary: false, empty: true };
    const variance = observedSigmaQ ** 2 - instrumentSigma ** 2;
    if (variance <= 0) return { sigmaSample: null, imaginary: true, empty: false };
    return { sigmaSample: Math.sqrt(variance), imaginary: false, empty: false };
  }

  function renderSampleCorrelationCard(title, result) {
    if (result.empty) {
      return renderMetricCard(title, [
        `<div class="sans-metric-line sans-sample-empty-line"><span class="sans-metric-value sans-sample-placeholder">—</span></div>`
      ]);
    }
    if (result.imaginary) {
      return renderMetricCard(title, [
        `<div class="sans-metric-line sans-sample-imaginary-line"><span class="sans-metric-value">Imaginary ξ</span></div>`
      ]);
    }
    const sigmaFwhm = result.sigmaSample * M.FWHM_TO_SIGMA;
    return renderCorrelationLengthCard(title, result.sigmaSample, sigmaFwhm);
  }

  function renderSampleCorrelationResults(results, note) {
    const rows = [
      `<div class="sans-interest-row tool-result-grid">
        ${renderSampleCorrelationCard("Sample correlation length |Q|", results.q)}
        ${renderSampleCorrelationCard("Sample correlation length azimuthal", results.az)}
        ${renderSampleCorrelationCard("Sample correlation length rocking", results.rock)}
      </div>`
    ];
    if (note) rows.push(`<p class="tool-note sans-interest-note">${note}</p>`);
    return `<div class="sans-interest-results">${rows.join("")}</div>`;
  }

  function updateSampleCorrelation(interest, p) {
    if (!sampleCorrelationResultsEl) return;
    if (!interest) {
      sampleCorrelationResultsEl.innerHTML =
        "<p class=\"tool-note\">Set a valid |Q| of interest in section 3 to subtract instrumental resolution.</p>";
      return;
    }

    const ctx = {
      q0: interest.q0,
      k: M.waveNumber(p.lambdaAngstrom),
      theta: interest.theta
    };
    const observed = readSampleWidthObserved();
    const instrument = {
      q: interest.sigmaX,
      az: interest.sigmaY,
      rock: interest.sigmaZ
    };

    const results = {};
    let anyImaginary = false;
    let anyFilled = false;

    SAMPLE_WIDTH_KEYS.forEach((key) => {
      const obs = observed[key];
      const sigmaObs = observedSigmaQ(obs.value, obs, key === "q" ? "q" : key, ctx);
      const deconv = sampleSigmaFromObserved(sigmaObs, instrument[key]);
      results[key] = deconv;
      if (deconv.imaginary) anyImaginary = true;
      if (!deconv.empty) anyFilled = true;
    });

    if (!anyFilled) {
      sampleCorrelationResultsEl.innerHTML = "";
      return;
    }

    let note = "";
    if (anyImaginary) {
      note = "If the calculated correlation length is imaginary, the resolution estimator does not match the instrument perfectly or the sample is predominantly resolution limited.";
    }

    sampleCorrelationResultsEl.innerHTML = renderSampleCorrelationResults(results, note);
  }

  function renderInterestResults(interest, interestNote) {
    const rows = [
      `<div class="sans-interest-row tool-result-grid">
        ${renderResultCard("2θ", `${formatNum(interest.twoThetaDeg)}°`, "full scattering angle")}
        ${renderResultCard("q<sub>z</sub>", `${formatNum(interest.qz)} Å⁻¹`, "longitudinal component")}
      </div>`,
      `<div class="sans-interest-row tool-result-grid">
        ${renderResolutionWidthCard(
          "σ along |Q|",
          interest.sigmaX,
          interest.sigmaXFwhm,
          interest.sigmaXTwoThetaDeg,
          interest.sigmaXTwoThetaDegFwhm
        )}
        ${renderResolutionWidthCard("σ azimuthal (ψ)", interest.sigmaY, interest.sigmaYFwhm, interest.sigmaYDeg, interest.sigmaYDegFwhm)}
        ${renderResolutionWidthCard("σ rocking (ω)", interest.sigmaZ, interest.sigmaZFwhm, interest.sigmaZDeg, interest.sigmaZDegFwhm)}
      </div>`,
      `<div class="sans-interest-row tool-result-grid">
        ${renderCorrelationLengthCard("Inverse instrument resolution |Q|", interest.sigmaX, interest.sigmaXFwhm)}
        ${renderCorrelationLengthCard("Inverse instrument resolution azimuthal", interest.sigmaY, interest.sigmaYFwhm)}
        ${renderCorrelationLengthCard("Inverse instrument resolution rocking", interest.sigmaZ, interest.sigmaZFwhm)}
      </div>`
    ];
    if (interestNote) {
      rows.push(`<p class="tool-note sans-interest-note">${interestNote}</p>`);
    }
    return `<div class="sans-interest-results">${rows.join("")}</div>`;
  }

  function prepareCanvas(canvas, minLogicalW = 840, aspect = 280 / 480) {
    if (!canvas) return null;
    const parentW = canvas.parentElement?.clientWidth || minLogicalW;
    const logicalW = Math.max(minLogicalW, parentW);
    const logicalH = Math.round(logicalW * aspect);
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(logicalW * dpr);
    canvas.height = Math.round(logicalH * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.aspectRatio = `${logicalW} / ${logicalH}`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    return { ctx, w: logicalW, h: logicalH };
  }

  function niceTicks(min, max, count = 5) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      return { min: 0, max: 1, ticks: [0, 0.5, 1] };
    }
    const span = max - min;
    const raw = span / Math.max(1, count - 1);
    const mag = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / mag;
    let step = mag;
    if (norm <= 1) step = mag;
    else if (norm <= 2) step = 2 * mag;
    else if (norm <= 5) step = 5 * mag;
    else step = 10 * mag;

    const tMin = Math.floor(min / step) * step;
    const tMax = Math.ceil(max / step) * step;
    const ticks = [];
    for (let t = tMin; t <= tMax + step * 0.5; t += step) {
      if (t >= min - step * 0.01 && t <= max + step * 0.01) ticks.push(t);
    }
    return { min: tMin, max: tMax, ticks };
  }

  function plotArea(w, h, pad = {}) {
    const left = pad.left ?? 56;
    const right = pad.right ?? 16;
    const top = pad.top ?? 16;
    const bottom = pad.bottom ?? 44;
    return {
      left,
      top,
      width: w - left - right,
      height: h - top - bottom
    };
  }

  function dataToPx(x, y, xScale, yScale, area) {
    const px = area.left + ((x - xScale.min) / (xScale.max - xScale.min)) * area.width;
    const py = area.top + (1 - (y - yScale.min) / (yScale.max - yScale.min)) * area.height;
    return { x: px, y: py };
  }

  /** Parse q_z, q_x², σ_|Q| style markup into canvas draw tokens. */
  function parseLabelMarkup(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      if (text[i] === "_") {
        i += 1;
        let sub = "";
        while (i < text.length && text[i] !== "_" && text[i] !== "²" && text[i] !== " " && text[i] !== "+") {
          sub += text[i];
          i += 1;
        }
        if (sub) tokens.push({ type: "sub", text: sub });
      } else if (text[i] === "²") {
        tokens.push({ type: "sup", text: "2" });
        i += 1;
      } else {
        let chunk = "";
        while (i < text.length && text[i] !== "_" && text[i] !== "²") {
          chunk += text[i];
          i += 1;
        }
        if (chunk) tokens.push({ type: "normal", text: chunk });
      }
    }
    return tokens;
  }

  function measureRichLabel(ctx, tokens, baseSize = 12) {
    const subScale = 0.72;
    let width = 0;
    for (const token of tokens) {
      const size = token.type === "normal" ? baseSize : baseSize * subScale;
      ctx.font = `${size}px system-ui, sans-serif`;
      width += ctx.measureText(token.text).width;
    }
    return width;
  }

  function drawRichLabel(ctx, text, x, y, options = {}) {
    const {
      baseSize = 12,
      color = "#1f2933",
      align = "center"
    } = options;
    const tokens = parseLabelMarkup(text);
    const subScale = 0.72;
    const width = measureRichLabel(ctx, tokens, baseSize);
    let cursorX = x;
    if (align === "center") cursorX = x - width / 2;
    else if (align === "right") cursorX = x - width;

    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    for (const token of tokens) {
      const size = token.type === "normal" ? baseSize : baseSize * subScale;
      ctx.font = `${size}px system-ui, sans-serif`;
      let drawY = y;
      if (token.type === "sub") drawY = y + baseSize * 0.28;
      if (token.type === "sup") drawY = y - baseSize * 0.38;
      ctx.fillText(token.text, cursorX, drawY);
      cursorX += ctx.measureText(token.text).width;
    }
  }

  /**
   * @param {object} opts
   * @param {Array<{x:number,y:number}>} opts.series
   * @param {Array<{x:number,y:number,y2?:number}>} [opts.series2]
   * @param {{x:number,y:number}|null} [opts.marker]
   * @param {{x:number,y:number,y2?:number}|null} [opts.marker2]
   */
  function drawLinePlot(canvas, opts) {
    const prep = prepareCanvas(canvas);
    if (!prep) return;
    const { ctx, w, h } = prep;
    const {
      xLabel,
      yLabel,
      y2Label,
      series,
      series2 = null,
      marker = null,
      marker2 = null,
      xScale: xScaleIn = null,
      yScale: yScaleIn = null,
      y2Scale: y2ScaleIn = null
    } = opts;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    if (!series.length) {
      ctx.fillStyle = "#5f6b7a";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText("No data in visible Q range.", 20, h / 2);
      return;
    }

    const xs = series.map((p) => p.x);
    const ys = series.map((p) => p.y);
    const xScale = xScaleIn || niceTicks(Math.min(...xs), Math.max(...xs));
    const yScale = yScaleIn || niceTicks(Math.min(...ys), Math.max(...ys));

    let y2Scale = null;
    if (series2 && series2.length) {
      const ys2 = series2.map((p) => p.y);
      y2Scale = y2ScaleIn || niceTicks(Math.min(...ys2), Math.max(...ys2));
    }

    let rightPad = 16;
    if (y2Scale) {
      ctx.font = "11px system-ui, sans-serif";
      let maxTickW = 0;
      y2Scale.ticks.forEach((tick) => {
        maxTickW = Math.max(maxTickW, ctx.measureText(formatNum(tick, 3)).width);
      });
      rightPad = 6 + maxTickW + 10 + 14 + 10;
    }

    const area = plotArea(w, h, {
      left: 58,
      right: rightPad,
      bottom: 48
    });

    ctx.strokeStyle = "#d9dee5";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#5f6b7a";
    ctx.font = "11px system-ui, sans-serif";

    xScale.ticks.forEach((tick) => {
      const { x } = dataToPx(tick, yScale.min, xScale, yScale, area);
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.top + area.height);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(formatNum(tick, 3), x, area.top + area.height + 16);
    });

    yScale.ticks.forEach((tick) => {
      const { y } = dataToPx(xScale.min, tick, xScale, yScale, area);
      ctx.beginPath();
      ctx.moveTo(area.left, y);
      ctx.lineTo(area.left + area.width, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(formatNum(tick, 3), area.left - 6, y + 4);
    });

    if (y2Scale) {
      y2Scale.ticks.forEach((tick) => {
        const { y } = dataToPx(xScale.min, tick, xScale, y2Scale, area);
        ctx.textAlign = "left";
        ctx.fillStyle = "#8a4a30";
        ctx.fillText(formatNum(tick, 3), area.left + area.width + 6, y + 4);
        ctx.fillStyle = "#5f6b7a";
      });
    }

    ctx.strokeStyle = "#1f4163";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    series.forEach((pt, i) => {
      const { x, y } = dataToPx(pt.x, pt.y, xScale, yScale, area);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    if (series2 && series2.length && y2Scale) {
      ctx.strokeStyle = "#8a4a30";
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      series2.forEach((pt, i) => {
        const { x, y } = dataToPx(pt.x, pt.y, xScale, y2Scale, area);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawMarker(pt, color, ySc) {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      const clampedY = Math.min(ySc.max, Math.max(ySc.min, pt.y));
      const { x, y } = dataToPx(pt.x, clampedY, xScale, ySc, area);
      ctx.fillStyle = color;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    drawMarker(marker, "#c0392b", yScale);
    if (marker2 && y2Scale) drawMarker(marker2, "#c0392b", y2Scale);

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.strokeRect(area.left, area.top, area.width, area.height);

    ctx.fillStyle = "#1f2933";
    drawRichLabel(ctx, xLabel, area.left + area.width / 2, h - 8, {
      baseSize: 12,
      color: "#1f2933",
      align: "center"
    });

    ctx.save();
    ctx.translate(14, area.top + area.height / 2);
    ctx.rotate(-Math.PI / 2);
    drawRichLabel(ctx, yLabel, 0, 0, {
      baseSize: 12,
      color: "#1f4163",
      align: "center"
    });
    ctx.restore();

    if (y2Label && y2Scale) {
      ctx.save();
      ctx.translate(w - 10, area.top + area.height / 2);
      ctx.rotate(-Math.PI / 2);
      drawRichLabel(ctx, y2Label, 0, 0, {
        baseSize: 12,
        color: "#8a4a30",
        align: "center"
      });
      ctx.restore();
    }
  }

  function validateParams(p) {
    if (!Number.isFinite(p.lambdaAngstrom) || p.lambdaAngstrom <= 0) {
      throw new Error("Neutron wavelength must be positive.");
    }
    if (!Number.isFinite(p.detWidthMm) || p.detWidthMm <= 0 || !Number.isFinite(p.detHeightMm) || p.detHeightMm <= 0) {
      throw new Error("Detector width and height must be positive.");
    }
    if (!Number.isFinite(p.sampleDistanceM) || p.sampleDistanceM <= 0) {
      throw new Error("Sample-to-detector distance must be positive.");
    }
    if (!Number.isFinite(p.beamstopRadiusMm) || p.beamstopRadiusMm < 0) {
      throw new Error("Beamstop radius must be zero or greater.");
    }
    if (!Number.isFinite(p.deltaLambdaOverLambda) || p.deltaLambdaOverLambda < 0) {
      throw new Error("Wavelength spread must be zero or greater.");
    }
    if (!Number.isFinite(p.pinhole1Mm) || p.pinhole1Mm <= 0 || !Number.isFinite(p.pinhole2Mm) || p.pinhole2Mm <= 0) {
      throw new Error("First pinhole and second aperture/sample diameters must be positive.");
    }
    if (!Number.isFinite(p.aperture1ToSampleM) || p.aperture1ToSampleM <= 0) {
      throw new Error("First aperture-to-sample distance must be positive.");
    }
    if (!Number.isFinite(p.aperture2ToSampleM) || p.aperture2ToSampleM < 0) {
      throw new Error("Second aperture-to-sample distance must be zero or greater.");
    }
    if (p.aperture2ToSampleM >= p.aperture1ToSampleM) {
      throw new Error("Second aperture must be closer to the sample than the first.");
    }
    if (!Number.isFinite(p.pixelWidthMm) || p.pixelWidthMm <= 0 || !Number.isFinite(p.pixelHeightMm) || p.pixelHeightMm <= 0) {
      throw new Error("Detector pixel sizes must be positive.");
    }
  }

  function recalc() {
    try {
      const p = readParams();
      validateParams(p);

      const { qMin, qMax, rMin, rMax } = M.visibleQRange(p);
      if (!Number.isFinite(qMin) || !Number.isFinite(qMax) || qMax <= qMin) {
        throw new Error("No visible Q range — check detector size and beamstop.");
      }

      qRangeEl.textContent = `|Q| = ${formatNum(qMin)} – ${formatNum(qMax)} Å⁻¹`;
      const qMagMin = M.qMagFromQPerp(qMin, p.lambdaAngstrom);
      const qMagMax = M.qMagFromQPerp(qMax, p.lambdaAngstrom);
      dRangeEl.textContent = `d = ${formatNum(M.distanceFromQ(qMagMax))} – ${formatNum(M.distanceFromQ(qMagMin))} Å`;
      const twoThetaMin = M.twoThetaDegFromQPerp(qMin, p.lambdaAngstrom);
      const twoThetaMax = M.twoThetaDegFromQPerp(qMax, p.lambdaAngstrom);
      twoThetaRangeEl.textContent = `2θ = ${formatNum(twoThetaMin)} – ${formatNum(twoThetaMax)}°`;

      const geom = M.geometryCurve(p);
      const resCurve = M.resolutionCurve(p);

      const qInt = p.qInterest;
      const k = M.waveNumber(p.lambdaAngstrom);
      const qPhysicalMax = 2 * k;
      let interest = null;
      let interestNote = "";
      let qPerpInterest = null;

      if (Number.isFinite(qInt) && qInt > 0) {
        if (qInt > qPhysicalMax) {
          interestNote = `|Q| = ${formatNum(qInt)} Å⁻¹ exceeds the elastic limit (${formatNum(qPhysicalMax)} Å⁻¹) for this wavelength.`;
        } else {
          interest = M.instrumentResolution(qInt, p);
          qPerpInterest = M.qPerpFromQ(qInt, p.lambdaAngstrom);
          if (qPerpInterest == null || qPerpInterest < qMin || qPerpInterest > qMax) {
            interestNote = `|Q| = ${formatNum(qInt)} Å⁻¹ is outside the visible detector range (${formatNum(qMin)}–${formatNum(qMax)} Å⁻¹); marker omitted from plots.`;
          }
        }
      }

      const markerVisible = interest && qPerpInterest != null && qPerpInterest >= qMin && qPerpInterest <= qMax;

      drawLinePlot(plotCanvases.qVsTwoTheta, {
        xLabel: "2θ (deg)",
        yLabel: "|Q| (Å⁻¹)",
        series: geom.map((pt) => ({ x: pt.twoThetaDeg, y: pt.q })),
        marker: markerVisible && interest
          ? { x: interest.twoThetaDeg, y: qPerpInterest }
          : null
      });

      drawLinePlot(plotCanvases.qzVsTwoTheta, {
        xLabel: "2θ (deg)",
        yLabel: "q_z (Å⁻¹)",
        series: geom.map((pt) => ({ x: pt.twoThetaDeg, y: pt.qz })),
        marker: markerVisible && interest ? { x: interest.twoThetaDeg, y: interest.qz } : null
      });

      drawLinePlot(plotCanvases.qPerpVsQz, {
        xLabel: "√(q_x² + q_y²) (Å⁻¹)",
        yLabel: "q_z (Å⁻¹)",
        series: geom.map((pt) => ({ x: pt.qPerp, y: pt.qz })),
        marker: markerVisible && interest ? { x: qPerpInterest, y: interest.qz } : null
      });

      const resX = resCurve.map((pt) => ({ x: pt.q0, y: pt.sigmaX }));
      const resY = resCurve.map((pt) => ({ x: pt.q0, y: pt.sigmaY }));
      const resYdeg = resCurve.map((pt) => ({ x: pt.q0, y: pt.sigmaYDeg }));
      const resZ = resCurve.map((pt) => ({ x: pt.q0, y: pt.sigmaZ }));
      const resZdeg = resCurve.map((pt) => ({ x: pt.q0, y: pt.sigmaZDeg }));

      drawLinePlot(plotCanvases.sigmaX, {
        xLabel: "|Q| (Å⁻¹)",
        yLabel: "σ_|Q| (Å⁻¹)",
        series: resX,
        marker: markerVisible && interest ? { x: qInt, y: interest.sigmaX } : null
      });

      drawLinePlot(plotCanvases.sigmaY, {
        xLabel: "|Q| (Å⁻¹)",
        yLabel: "σ_az (Å⁻¹)",
        y2Label: "σ_az (deg)",
        series: resY,
        series2: resYdeg,
        marker: markerVisible && interest ? { x: qInt, y: interest.sigmaY } : null,
        marker2: markerVisible && interest ? { x: qInt, y: interest.sigmaYDeg } : null
      });

      drawLinePlot(plotCanvases.sigmaZ, {
        xLabel: "|Q| (Å⁻¹)",
        yLabel: "σ_rock (Å⁻¹)",
        y2Label: "σ_rock (deg)",
        series: resZ,
        series2: resZdeg,
        marker: markerVisible && interest ? { x: qInt, y: interest.sigmaZ } : null,
        marker2: markerVisible && interest ? { x: qInt, y: interest.sigmaZDeg } : null
      });

      const collimationLength = p.aperture1ToSampleM - p.aperture2ToSampleM;
      resolutionNoteEl.textContent =
        `Collimation length ${formatNum(collimationLength)} m (pinhole separation). ` +
        "Resolution estimates follow Pedersen et al., J. Appl. Cryst. 23 (1990) and Harris et al., J. Appl. Cryst. 28 (1995).";

      if (interest) {
        interestResultsEl.innerHTML = renderInterestResults(interest, interestNote || "");
      } else if (interestNote) {
        interestResultsEl.innerHTML = `<p class="tool-note">${interestNote}</p>`;
      } else {
        interestResultsEl.innerHTML = "";
      }

      updateSampleCorrelation(interest, p);

      persistConfig();
    } catch (err) {
      qRangeEl.textContent = err.message;
      dRangeEl.textContent = "";
      twoThetaRangeEl.textContent = "";
      interestResultsEl.innerHTML = "";
      if (sampleCorrelationResultsEl) sampleCorrelationResultsEl.innerHTML = "";
      Object.values(plotCanvases).forEach((canvas) => {
        const prep = prepareCanvas(canvas);
        if (!prep) return;
        prep.ctx.clearRect(0, 0, prep.w, prep.h);
      });
    }
  }

  function saveConfigToObject() {
    const p = readParams();
    return {
      lambdaAngstrom: p.lambdaAngstrom,
      detWidthCm: p.detWidthMm / 10,
      detHeightCm: p.detHeightMm / 10,
      sampleDistanceM: p.sampleDistanceM,
      beamOffsetXMm: p.beamOffsetXMm,
      beamOffsetYMm: p.beamOffsetYMm,
      beamstopRadiusMm: p.beamstopRadiusMm,
      deltaLambdaOverLambda: p.deltaLambdaOverLambda,
      pinhole1Mm: p.pinhole1Mm,
      pinhole2Mm: p.pinhole2Mm,
      aperture1ToSampleM: p.aperture1ToSampleM,
      aperture2ToSampleM: p.aperture2ToSampleM,
      pixelWidthMm: p.pixelWidthMm,
      pixelHeightMm: p.pixelHeightMm,
      qInterest: p.qInterest,
      sampleWidth: readSampleWidthObserved()
    };
  }

  function loadConfigFromObject(obj) {
    writeParamsToForm({ ...DEFAULTS, ...obj });
    writeSampleWidthToForm(obj.sampleWidth ?? DEFAULTS.sampleWidth);
    recalc();
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
      else recalc();
    } catch (_) {
      recalc();
    }
  }

  function bindEvents() {
    FIELD_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", recalc);
      el.addEventListener("change", recalc);
    });

    SAMPLE_WIDTH_KEYS.forEach((key) => {
      const input = document.getElementById(`sans-obs-${key}-width-value`);
      if (input) {
        input.addEventListener("input", recalc);
        input.addEventListener("change", recalc);
      }
      document.querySelectorAll(`input[name="sans-obs-${key}-unit"], input[name="sans-obs-${key}-width-type"]`).forEach((el) => {
        el.addEventListener("change", recalc);
      });
    });

    document.getElementById("sans-save-config-btn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(saveConfigToObject(), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sans-planner-config.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    document.getElementById("sans-load-config-btn").addEventListener("click", () => {
      document.getElementById("sans-config-file").click();
    });

    document.getElementById("sans-config-file").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      file.text()
        .then((text) => loadConfigFromObject(JSON.parse(text)))
        .catch(() => {
          qRangeEl.textContent = "Invalid configuration file.";
        });
      e.target.value = "";
    });

    window.addEventListener("resize", recalc);
  }

  writeParamsToForm(DEFAULTS);
  writeSampleWidthToForm(DEFAULTS.sampleWidth);
  bindEvents();
  restoreConfig();
})();
