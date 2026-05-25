const poissonForm = document.getElementById("poisson-subtraction-form");
const poissonSignalRateInput = document.getElementById("poisson-signal-rate");
const poissonBackgroundRateInput = document.getElementById("poisson-background-rate");
const poissonSignalModelInput = document.getElementById("poisson-signal-model");
const poissonSolveModeInput = document.getElementById("poisson-solve-mode");
const poissonTargetInput = document.getElementById("poisson-target");
const poissonTargetField = document.getElementById("poisson-target-field");
const poissonTotalTimeInput = document.getElementById("poisson-total-time");
const poissonTotalTimeField = document.getElementById("poisson-total-time-field");
const poissonPrecisionModeInput = document.getElementById("poisson-precision-mode");
const poissonSigmaXInput = document.getElementById("poisson-sigma-x");
const poissonSigmaXField = document.getElementById("poisson-sigma-x-field");
const poissonSigmaYInput = document.getElementById("poisson-sigma-y");
const poissonSigmaYField = document.getElementById("poisson-sigma-y-field");
const poissonSummary = document.getElementById("poisson-summary");
const poissonResults = document.getElementById("poisson-results");

const PRECISION_FULL_SIG_FIGS = 8;

function effectiveSigFigsFromUncertainty(value, uncertainty) {
  if (!Number.isFinite(value) || value === 0) return PRECISION_FULL_SIG_FIGS;
  if (!Number.isFinite(uncertainty) || uncertainty <= 0) return PRECISION_FULL_SIG_FIGS;
  const valuePos = Math.floor(Math.log10(Math.abs(value)));
  const uncertaintyPos = Math.floor(Math.log10(uncertainty));
  return Math.max(1, valuePos - uncertaintyPos + 1);
}

function countSigFigs(rawString) {
  if (typeof rawString !== "string") return 0;
  const trimmed = rawString.trim();
  if (!trimmed) return 0;

  const match = trimmed.match(/^[+-]?(\d*\.?\d+|\d+\.?)(?:[eE][+-]?\d+)?$/);
  if (!match) return 0;

  const numberPart = match[1];
  const hasDecimal = numberPart.includes(".");
  const noDecimal = numberPart.replace(".", "");
  const significantDigits = noDecimal.replace(/^0+/, "");

  if (hasDecimal) return significantDigits.length;

  const trimmedTrailing = significantDigits.replace(/0+$/, "");
  return trimmedTrailing.length || (significantDigits.length ? 1 : 0);
}

function clampSigFigs(value) {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(15, Math.round(value));
}

function minSigFigs(...values) {
  const filtered = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!filtered.length) return 1;
  return clampSigFigs(Math.min(...filtered));
}

function formatToSigFigs(value, sigFigs) {
  if (!Number.isFinite(value)) return "n/a";
  if (value === 0) return "0";

  const safeSigFigs = clampSigFigs(sigFigs);
  const precise = value.toPrecision(safeSigFigs);
  if (!precise.includes("e")) return precise;

  const absValue = Math.abs(value);
  if (absValue >= 1e7 || absValue < 1e-3) {
    return precise.replace(/e\+/, "e");
  }

  const num = Number(precise);
  const order = Math.floor(Math.log10(absValue));
  const decimalPlaces = Math.max(0, safeSigFigs - order - 1);
  return num.toFixed(decimalPlaces);
}

function formatMeasurement(value, sigFigs, unit = "") {
  const formatted = formatToSigFigs(value, sigFigs);
  if (formatted === "n/a") return "n/a";
  if (!unit) return formatted;
  return `${formatted} ${unit}`;
}

function formatPercent(value, sigFigs) {
  if (!Number.isFinite(value)) return "n/a";
  return `${formatToSigFigs(100 * value, sigFigs)}%`;
}

function parsePositiveInput(input, label) {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

function parseNonNegativeInput(input, label) {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater.`);
  return value;
}

function poissonRates() {
  const enteredSignalRate = parsePositiveInput(poissonSignalRateInput, "Signal rate X");
  const backgroundRate = parseNonNegativeInput(poissonBackgroundRateInput, "Background rate Y");
  const isGross = poissonSignalModelInput.value === "gross";
  const grossSignalRate = isGross ? enteredSignalRate : enteredSignalRate + backgroundRate;
  const netRate = grossSignalRate - backgroundRate;

  if (grossSignalRate <= 0) throw new Error("The signal channel rate must be greater than zero.");
  if (backgroundRate <= 0) throw new Error("Background rate Y must be greater than zero for an optimized background count.");

  return { enteredSignalRate, grossSignalRate, backgroundRate, netRate, isGross };
}

function optimizedTimes(grossSignalRate, backgroundRate, totalTime) {
  const signalWeight = Math.sqrt(grossSignalRate);
  const backgroundWeight = Math.sqrt(backgroundRate);
  const totalWeight = signalWeight + backgroundWeight;

  return {
    signalTime: totalTime * signalWeight / totalWeight,
    backgroundTime: totalTime * backgroundWeight / totalWeight
  };
}

function poissonPlan() {
  const { enteredSignalRate, grossSignalRate, backgroundRate, netRate, isGross } = poissonRates();
  const solveMode = poissonSolveModeInput.value;
  const precisionMode = poissonPrecisionModeInput.value;
  let totalTime = null;

  if (solveMode === "relative") {
    if (netRate === 0) throw new Error("Relative uncertainty is undefined when the subtracted rate is zero.");
    const targetSigma = Math.abs(netRate) * parsePositiveInput(poissonTargetInput, "Desired relative uncertainty") / 100;
    totalTime = ((Math.sqrt(grossSignalRate) + Math.sqrt(backgroundRate)) / targetSigma) ** 2;
  } else if (solveMode === "absolute") {
    const targetSigma = parsePositiveInput(poissonTargetInput, "Desired absolute uncertainty");
    totalTime = ((Math.sqrt(grossSignalRate) + Math.sqrt(backgroundRate)) / targetSigma) ** 2;
  } else {
    totalTime = parsePositiveInput(poissonTotalTimeInput, "Total count time");
  }

  const { signalTime, backgroundTime } = optimizedTimes(grossSignalRate, backgroundRate, totalTime);
  const signalCounts = grossSignalRate * signalTime;
  const backgroundCounts = backgroundRate * backgroundTime;
  const signalRateSigma = Math.sqrt(signalCounts) / signalTime;
  const backgroundRateSigma = Math.sqrt(backgroundCounts) / backgroundTime;
  const netRateSigma = Math.sqrt(signalRateSigma ** 2 + backgroundRateSigma ** 2);
  const relativeSigma = netRate === 0 ? Infinity : Math.abs(netRateSigma / netRate);
  const subtractedCounts = netRate * signalTime;
  const subtractedCountsSigma = signalTime * netRateSigma;
  const timeRatio = signalTime / backgroundTime;

  let sfX;
  let sfY;
  if (precisionMode === "full") {
    sfX = PRECISION_FULL_SIG_FIGS;
    sfY = PRECISION_FULL_SIG_FIGS;
  } else if (precisionMode === "uncertainty") {
    const sigmaX = Number(poissonSigmaXInput.value);
    const sigmaY = Number(poissonSigmaYInput.value);
    sfX = effectiveSigFigsFromUncertainty(enteredSignalRate, sigmaX);
    sfY = effectiveSigFigsFromUncertainty(backgroundRate, sigmaY);
  } else {
    sfX = countSigFigs(poissonSignalRateInput.value);
    sfY = countSigFigs(poissonBackgroundRateInput.value);
  }
  const sfGross = isGross ? sfX : minSigFigs(sfX, sfY);
  const sfNet = minSigFigs(sfGross, sfY);

  const useInputStringSigFigs = precisionMode === "sigfigs";
  const sfTotalTimeInput = solveMode === "time"
    ? (useInputStringSigFigs ? countSigFigs(poissonTotalTimeInput.value) : PRECISION_FULL_SIG_FIGS)
    : null;
  const sfTargetInput = solveMode !== "time"
    ? (useInputStringSigFigs ? countSigFigs(poissonTargetInput.value) : PRECISION_FULL_SIG_FIGS)
    : null;
  const sfTotalTime = solveMode === "time"
    ? sfTotalTimeInput
    : minSigFigs(sfX, sfY, sfTargetInput);

  const sfTime = minSigFigs(sfX, sfY, sfTotalTime);
  const sfSignalCounts = minSigFigs(sfGross, sfTime);
  const sfBackgroundCounts = minSigFigs(sfY, sfTime);
  const sfSignalRateSigma = minSigFigs(sfSignalCounts, sfTime);
  const sfBackgroundRateSigma = minSigFigs(sfBackgroundCounts, sfTime);
  const sfNetRateSigma = minSigFigs(sfSignalRateSigma, sfBackgroundRateSigma);
  const sfRelativeSigma = minSigFigs(sfNetRateSigma, sfNet);
  const sfSubtractedCounts = minSigFigs(sfNet, sfTime);
  const sfSubtractedCountsSigma = minSigFigs(sfNetRateSigma, sfTime);
  const sfRatio = minSigFigs(sfGross, sfY);
  const sfFraction = minSigFigs(sfGross, sfY);

  return {
    solveMode,
    grossSignalRate,
    backgroundRate,
    netRate,
    totalTime,
    signalTime,
    backgroundTime,
    signalCounts,
    backgroundCounts,
    signalRateSigma,
    backgroundRateSigma,
    netRateSigma,
    relativeSigma,
    subtractedCounts,
    subtractedCountsSigma,
    timeRatio,
    sigFigs: {
      X: sfX,
      Y: sfY,
      gross: sfGross,
      net: sfNet,
      totalTime: sfTotalTime,
      time: sfTime,
      signalCounts: sfSignalCounts,
      backgroundCounts: sfBackgroundCounts,
      signalRateSigma: sfSignalRateSigma,
      backgroundRateSigma: sfBackgroundRateSigma,
      netRateSigma: sfNetRateSigma,
      relativeSigma: sfRelativeSigma,
      subtractedCounts: sfSubtractedCounts,
      subtractedCountsSigma: sfSubtractedCountsSigma,
      ratio: sfRatio,
      fraction: sfFraction
    }
  };
}

function renderPoissonCard(label, value, note = "") {
  return `
    <div class="tool-result-card">
      <h3>${label}</h3>
      <p>${value}</p>
      ${note ? `<span>${note}</span>` : ""}
    </div>
  `;
}

function renderPoissonPlan() {
  const solveMode = poissonSolveModeInput.value;
  const usesTarget = solveMode !== "time";
  poissonTargetField.hidden = !usesTarget;
  poissonTotalTimeField.hidden = usesTarget;
  poissonTargetInput.required = usesTarget;
  poissonTotalTimeInput.required = !usesTarget;
  poissonTargetField.querySelector("label").textContent = solveMode === "absolute"
    ? "Desired absolute uncertainty (counts/s)"
    : "Desired relative uncertainty (%)";

  const precisionMode = poissonPrecisionModeInput.value;
  const usesUncertainty = precisionMode === "uncertainty";
  poissonSigmaXField.hidden = !usesUncertainty;
  poissonSigmaYField.hidden = !usesUncertainty;
  poissonSigmaXInput.required = usesUncertainty;
  poissonSigmaYInput.required = usesUncertainty;

  try {
    const plan = poissonPlan();
    const sf = plan.sigFigs;
    const signalModel = poissonSignalModelInput.value === "gross"
      ? "X is treated as the measured signal channel rate."
      : "X is treated as the already background-subtracted rate.";
    const precisionNote = precisionMode === "full"
      ? "Outputs are shown at full numerical precision."
      : precisionMode === "uncertainty"
        ? "Sig figs come from σ_X and σ_Y; the total time and target are treated as exact."
        : "Sig figs are taken from the input values and propagated to each output.";

    poissonSummary.textContent = `${signalModel} ${precisionNote}`;
    poissonResults.innerHTML = `
      <div class="tool-result-grid">
        ${renderPoissonCard(
          "Ideal count-time ratio",
          `${formatToSigFigs(plan.timeRatio, sf.ratio)} : 1`,
          "signal time : background time = sqrt(signal channel rate) : sqrt(background rate)"
        )}
        ${renderPoissonCard(
          "Signal time",
          formatMeasurement(plan.signalTime, sf.time, "s"),
          `${formatPercent(plan.signalTime / plan.totalTime, sf.fraction)} of total`
        )}
        ${renderPoissonCard(
          "Background time",
          formatMeasurement(plan.backgroundTime, sf.time, "s"),
          `${formatPercent(plan.backgroundTime / plan.totalTime, sf.fraction)} of total`
        )}
        ${renderPoissonCard(
          "Total time",
          formatMeasurement(plan.totalTime, sf.totalTime, "s"),
          plan.solveMode === "time" ? "fixed input" : "required for target"
        )}
        ${renderPoissonCard(
          "Signal channel counts",
          formatMeasurement(plan.signalCounts, sf.signalCounts, "counts"),
          `sigma = ${formatMeasurement(Math.sqrt(plan.signalCounts), sf.signalCounts, "counts")}`
        )}
        ${renderPoissonCard(
          "Background counts",
          formatMeasurement(plan.backgroundCounts, sf.backgroundCounts, "counts"),
          `sigma = ${formatMeasurement(Math.sqrt(plan.backgroundCounts), sf.backgroundCounts, "counts")}`
        )}
        ${renderPoissonCard(
          "Subtracted rate",
          formatMeasurement(plan.netRate, sf.net, "counts/s"),
          `sigma = ${formatMeasurement(plan.netRateSigma, sf.netRateSigma, "counts/s")} (${formatPercent(plan.relativeSigma, sf.relativeSigma)})`
        )}
        ${renderPoissonCard(
          "Signal channel rate",
          formatMeasurement(plan.grossSignalRate, sf.gross, "counts/s"),
          `rate sigma = ${formatMeasurement(plan.signalRateSigma, sf.signalRateSigma, "counts/s")}`
        )}
        ${renderPoissonCard(
          "Background rate",
          formatMeasurement(plan.backgroundRate, sf.Y, "counts/s"),
          `rate sigma = ${formatMeasurement(plan.backgroundRateSigma, sf.backgroundRateSigma, "counts/s")}`
        )}
        ${renderPoissonCard(
          "Subtracted counts",
          formatMeasurement(plan.subtractedCounts, sf.subtractedCounts, "counts"),
          `scaled to signal time; sigma = ${formatMeasurement(plan.subtractedCountsSigma, sf.subtractedCountsSigma, "counts")}`
        )}
      </div>
    `;
  } catch (error) {
    poissonSummary.textContent = "Could not calculate an optimized count plan.";
    poissonResults.innerHTML = `<p class="tool-output">${error.message}</p>`;
  }
}

[
  poissonSignalRateInput,
  poissonBackgroundRateInput,
  poissonSignalModelInput,
  poissonSolveModeInput,
  poissonTargetInput,
  poissonTotalTimeInput,
  poissonPrecisionModeInput,
  poissonSigmaXInput,
  poissonSigmaYInput
].forEach((input) => {
  input.addEventListener("input", renderPoissonPlan);
  input.addEventListener("change", renderPoissonPlan);
});

poissonForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderPoissonPlan();
});

renderPoissonPlan();
