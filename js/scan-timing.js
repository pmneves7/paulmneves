const planForm = document.getElementById("plan-form");
const planSolveForInput = document.getElementById("plan-solve-for");
const planNumInput = document.getElementById("plan-num");
const planCountInput = document.getElementById("plan-count");
const planDeadInput = document.getElementById("plan-dead");
const planTotalInput = document.getElementById("plan-total");
const planStartTimeInput = document.getElementById("plan-start-time");
const planStartNowButton = document.getElementById("plan-start-now");
const planRateInput = document.getElementById("plan-rate");
const planRateTimeUnitInput = document.getElementById("plan-rate-time-unit");
const planRateUnitLabelInput = document.getElementById("plan-rate-unit-label");
const planSummary = document.getElementById("plan-summary");
const planResults = document.getElementById("plan-results");

const RATE_TIME_UNIT_SECONDS = {
  second: 1,
  minute: 60,
  hour: 3600
};

const RATE_TIME_UNIT_LABEL = {
  second: "s",
  minute: "min",
  hour: "h"
};

const progressForm = document.getElementById("progress-form");
const progressTotalInput = document.getElementById("progress-total");
const progressFirstInput = document.getElementById("progress-first");
const progressDoneInput = document.getElementById("progress-done");
const progressCalAInput = document.getElementById("progress-cal-a");
const progressCalATimeInput = document.getElementById("progress-cal-a-time");
const progressCalBInput = document.getElementById("progress-cal-b");
const progressCalBTimeInput = document.getElementById("progress-cal-b-time");
const progressCurrentTimeInput = document.getElementById("progress-current-time");
const progressCurrentNowButton = document.getElementById("progress-current-now");
const progressSummary = document.getElementById("progress-summary");
const progressResults = document.getElementById("progress-results");

const PLAN_FIELDS = {
  num: planNumInput,
  count: planCountInput,
  dead: planDeadInput,
  total: planTotalInput
};

const PLAN_LABELS = {
  num: "Number of scans",
  count: "Count time per scan",
  dead: "Dead time between scans",
  total: "Total run time"
};

const SECONDS_PER_DAY = 86400;

function pad2(value) {
  const v = Math.floor(value);
  return String(v).padStart(2, "0");
}

function formatNumberShort(n, maxFrac = 3) {
  if (!Number.isFinite(n)) return "n/a";
  const rounded = Math.round(n * 1e9) / 1e9;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
  const factor = 10 ** maxFrac;
  const trimmed = Math.round(rounded * factor) / factor;
  let str = trimmed.toFixed(maxFrac);
  str = str.replace(/0+$/, "").replace(/\.$/, "");
  return str;
}

function formatHMS(seconds) {
  if (!Number.isFinite(seconds)) return "n/a";
  if (seconds < 0) return `−${formatHMS(-seconds)}`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds - hours * 3600) / 60);
  const secs = seconds - hours * 3600 - minutes * 60;
  if (hours === 0 && minutes === 0) {
    return `${formatNumberShort(secs)} s`;
  }
  const secsRounded = Math.round(secs * 1000) / 1000;
  let secsStr;
  if (Number.isInteger(secsRounded)) {
    secsStr = pad2(secsRounded);
  } else {
    const padded = secsRounded < 10 ? "0" : "";
    secsStr = padded + formatNumberShort(secsRounded);
  }
  if (hours > 0) return `${hours}:${pad2(minutes)}:${secsStr}`;
  return `${minutes}:${secsStr}`;
}

function formatHMSInput(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  return formatHMS(seconds);
}

function formatTimeOfDay(seconds) {
  if (!Number.isFinite(seconds)) return "n/a";
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  let s = seconds - days * SECONDS_PER_DAY;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const mi = Math.floor(s / 60);
  const se = s - mi * 60;
  const seRounded = Math.round(se);
  let hh = h;
  let mm = mi;
  let ss = seRounded;
  if (ss === 60) { ss = 0; mm += 1; }
  if (mm === 60) { mm = 0; hh += 1; }
  let extraDays = days;
  if (hh === 24) { hh = 0; extraDays += 1; }
  const tod = `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  if (extraDays === 0) return tod;
  if (extraDays === 1) return `${tod} (next day)`;
  return `${tod} (+${extraDays} d)`;
}

function parseDuration(rawInput) {
  if (rawInput == null) return null;
  const s = String(rawInput).trim().toLowerCase();
  if (!s) return null;

  if (/^[+-]?(\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  if (/^\d+(?::\d+){1,2}(?:\.\d+)?$/.test(s)) {
    const parts = s.split(":").map(Number);
    if (parts.some((p) => !Number.isFinite(p) || p < 0)) return NaN;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  const tokenRegex = /(\d+\.?\d*|\.\d+)\s*(days|day|d|hours|hour|hrs|hr|h|minutes|minute|mins|min|m|seconds|second|secs|sec|s)(?=\s|\d|\.|$)\s*/gi;
  let total = 0;
  let matched = false;
  let lastIndex = 0;
  let match;
  while ((match = tokenRegex.exec(s)) !== null) {
    const between = s.slice(lastIndex, match.index).trim();
    if (between) return NaN;
    matched = true;
    const v = Number(match[1]);
    if (!Number.isFinite(v) || v < 0) return NaN;
    const unit = match[2].toLowerCase();
    if (unit.startsWith("d")) total += v * SECONDS_PER_DAY;
    else if (unit.startsWith("h")) total += v * 3600;
    else if (unit.startsWith("s")) total += v;
    else total += v * 60;
    lastIndex = tokenRegex.lastIndex;
  }
  if (!matched) return NaN;
  if (s.slice(lastIndex).trim()) return NaN;
  return total;
}

function parseTimeOfDay(rawInput) {
  if (rawInput == null) return null;
  const s = String(rawInput).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/);
  if (!m) return NaN;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const se = m[3] ? Number(m[3]) : 0;
  if (h > 23 || mi > 59 || se >= 60) return NaN;
  return h * 3600 + mi * 60 + se;
}

function currentTimeOfDayString(includeSeconds = true) {
  const now = new Date();
  const h = pad2(now.getHours());
  const m = pad2(now.getMinutes());
  if (!includeSeconds) return `${h}:${m}`;
  const s = pad2(now.getSeconds());
  return `${h}:${m}:${s}`;
}

function secondsToTimeInputValue(seconds) {
  const wrapped = ((seconds % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const h = Math.floor(wrapped / 3600);
  const m = Math.floor((wrapped - h * 3600) / 60);
  const s = wrapped - h * 3600 - m * 60;
  const sInt = Math.floor(s);
  const frac = s - sInt;
  const sStr = frac > 0 ? pad2(sInt) + (Math.round(frac * 1000) / 1000).toString().slice(1) : pad2(sInt);
  return `${pad2(h)}:${pad2(m)}:${sStr}`;
}

function attachTimePasteHandler(input) {
  input.addEventListener("paste", (event) => {
    const clipboard = event.clipboardData || window.clipboardData;
    if (!clipboard) return;
    const text = clipboard.getData("text");
    if (!text) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const seconds = parseTimeOfDay(trimmed);
    if (seconds == null || !Number.isFinite(seconds)) return;
    event.preventDefault();
    input.value = secondsToTimeInputValue(seconds);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function setSolvedField(solveFor) {
  Object.entries(PLAN_FIELDS).forEach(([key, input]) => {
    const isSolved = key === solveFor;
    input.readOnly = isSolved;
    input.classList.toggle("tool-input-readonly", isSolved);
    if (isSolved) {
      input.setAttribute("aria-readonly", "true");
    } else {
      input.removeAttribute("aria-readonly");
    }
  });
}

function readPlanInputs(solveFor) {
  const values = {};

  if (solveFor !== "num") {
    const raw = planNumInput.value;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
      throw new Error("Number of scans must be a positive integer.");
    }
    values.num = n;
  }
  if (solveFor !== "count") {
    const t = parseDuration(planCountInput.value);
    if (t == null) throw new Error("Enter a count time per scan.");
    if (!Number.isFinite(t) || t <= 0) throw new Error("Count time per scan must be a positive duration.");
    values.count = t;
  }
  if (solveFor !== "dead") {
    const d = parseDuration(planDeadInput.value);
    if (d == null) throw new Error("Enter a dead time between scans (use 0 for none).");
    if (!Number.isFinite(d) || d < 0) throw new Error("Dead time between scans must be zero or a positive duration.");
    values.dead = d;
  }
  if (solveFor !== "total") {
    const T = parseDuration(planTotalInput.value);
    if (T == null) throw new Error("Enter a total run time.");
    if (!Number.isFinite(T) || T <= 0) throw new Error("Total run time must be a positive duration.");
    values.total = T;
  }
  return values;
}

function computePlan(solveFor, v) {
  if (solveFor === "count") {
    const remaining = v.total - (v.num - 1) * v.dead;
    if (remaining <= 0) {
      throw new Error(`Dead time alone (${formatHMS((v.num - 1) * v.dead)}) already meets or exceeds the total run time.`);
    }
    v.count = remaining / v.num;
  } else if (solveFor === "dead") {
    if (v.num < 2) {
      throw new Error("Dead time can only be solved when there are at least two scans.");
    }
    const slack = v.total - v.num * v.count;
    if (slack < 0) {
      throw new Error(`Total counting time (${formatHMS(v.num * v.count)}) already exceeds the total run time.`);
    }
    v.dead = slack / (v.num - 1);
  } else if (solveFor === "num") {
    const denom = v.count + v.dead;
    if (denom <= 0) throw new Error("Count time plus dead time must be positive.");
    const exact = (v.total + v.dead) / denom;
    const num = Math.floor(exact + 1e-9);
    if (num < 1) {
      throw new Error("The total run time is shorter than a single scan.");
    }
    v.num = num;
    v.numExact = exact;
  } else {
    v.total = v.num * v.count + (v.num - 1) * v.dead;
  }

  v.totalCount = v.num * v.count;
  v.totalDead = (v.num - 1) * v.dead;
  v.totalElapsed = v.totalCount + v.totalDead;
  v.cyclePeriod = v.count + v.dead;
  v.dutyCycle = v.totalElapsed > 0 ? v.totalCount / v.totalElapsed : 0;
  return v;
}

function formatTargetValue(value, sigFigs = 6) {
  if (!Number.isFinite(value)) return "n/a";
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs < 0.001 || abs >= 1e7) {
    return value.toExponential(Math.max(0, sigFigs - 1));
  }
  let str = value.toPrecision(sigFigs);
  if (str.includes("e")) str = Number(str).toString();
  if (str.includes(".")) str = str.replace(/0+$/, "").replace(/\.$/, "");
  return str;
}

function readPlanRate() {
  const raw = planRateInput.value.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  const timeUnit = planRateTimeUnitInput.value;
  const perSecond = value / RATE_TIME_UNIT_SECONDS[timeUnit];
  const label = planRateUnitLabelInput.value.trim();
  return {
    value,
    timeUnit,
    timeUnitLabel: RATE_TIME_UNIT_LABEL[timeUnit],
    perSecond,
    label
  };
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

function renderPlanResults(plan, solveFor, startSecOpt) {
  const cards = [];
  const solvedLabel = `${PLAN_LABELS[solveFor]} (computed)`;

  if (solveFor === "num") {
    const exactNote = Math.abs(plan.numExact - plan.num) < 1e-6
      ? "exact integer fit"
      : `(${formatNumberShort(plan.numExact, 4)} would fit exactly; floored to ${plan.num})`;
    cards.push(renderResultCard(solvedLabel, String(plan.num), exactNote));
  } else if (solveFor === "count") {
    cards.push(renderResultCard(
      solvedLabel,
      formatHMS(plan.count),
      `${formatNumberShort(plan.count)} s per scan`
    ));
  } else if (solveFor === "dead") {
    cards.push(renderResultCard(
      solvedLabel,
      formatHMS(plan.dead),
      `${formatNumberShort(plan.dead)} s between scans`
    ));
  } else {
    cards.push(renderResultCard(
      solvedLabel,
      formatHMS(plan.total),
      `${formatNumberShort(plan.total)} s total`
    ));
  }

  cards.push(renderResultCard(
    "Per-scan cycle",
    formatHMS(plan.cyclePeriod),
    "count + dead, repeated for each scan after the first"
  ));
  cards.push(renderResultCard(
    "Total counting time",
    formatHMS(plan.totalCount),
    `${formatNumberShort(100 * plan.dutyCycle, 2)}% of the run`
  ));
  cards.push(renderResultCard(
    "Total dead time",
    formatHMS(plan.totalDead),
    `${formatNumberShort(100 * (1 - plan.dutyCycle), 2)}% of the run`
  ));
  cards.push(renderResultCard(
    "Total run time",
    formatHMS(plan.total),
    `${formatNumberShort(plan.total)} s`
  ));

  if (Number.isFinite(startSecOpt)) {
    const endSec = startSecOpt + plan.total;
    cards.push(renderResultCard(
      "Estimated end time",
      formatTimeOfDay(endSec),
      `start ${formatTimeOfDay(startSecOpt)} + ${formatHMS(plan.total)}`
    ));
  }

  if (plan.rate) {
    const perScanTarget = plan.rate.perSecond * plan.count;
    const totalTarget = plan.rate.perSecond * plan.totalCount;
    const unit = plan.rate.label;
    const unitSuffix = unit ? ` ${unit}` : "";
    const rateSuffix = unit ? ` ${unit}/${plan.rate.timeUnitLabel}` : ` /${plan.rate.timeUnitLabel}`;
    cards.push(renderResultCard(
      "Target per scan",
      `${formatTargetValue(perScanTarget)}${unitSuffix}`,
      `${formatTargetValue(plan.rate.value)}${rateSuffix} × ${formatHMS(plan.count)}`
    ));
    cards.push(renderResultCard(
      "Total target (all scans)",
      `${formatTargetValue(totalTarget)}${unitSuffix}`,
      `${plan.num} × per-scan target; counting time only`
    ));
  }

  planResults.innerHTML = `<div class="tool-result-grid">${cards.join("")}</div>`;
}

function recalcPlan() {
  const solveFor = planSolveForInput.value;
  setSolvedField(solveFor);

  let startSec = null;
  const rawStart = planStartTimeInput.value.trim();
  if (rawStart) {
    const parsed = parseTimeOfDay(rawStart);
    if (parsed == null || Number.isNaN(parsed)) {
      startSec = null;
    } else {
      startSec = parsed;
    }
  }

  try {
    const inputs = readPlanInputs(solveFor);
    const plan = computePlan(solveFor, inputs);
    plan.rate = readPlanRate();

    if (solveFor === "num") {
      planNumInput.value = String(plan.num);
    } else if (solveFor === "count") {
      planCountInput.value = formatHMSInput(plan.count);
    } else if (solveFor === "dead") {
      planDeadInput.value = formatHMSInput(plan.dead);
    } else {
      planTotalInput.value = formatHMSInput(plan.total);
    }

    let summary = `Series of ${plan.num} scan${plan.num === 1 ? "" : "s"}: each scan counts ${formatHMS(plan.count)}`;
    if (plan.num > 1) {
      summary += `, separated by ${formatHMS(plan.dead)} of dead time`;
    }
    summary += `, for a total run of ${formatHMS(plan.total)}.`;
    planSummary.textContent = summary;

    renderPlanResults(plan, solveFor, Number.isFinite(startSec) ? startSec : null);
  } catch (error) {
    planSummary.textContent = error.message;
    planResults.innerHTML = "";
  }
}

function readProgressInputs() {
  const total = Number(progressTotalInput.value);
  if (!Number.isFinite(total) || total < 1 || !Number.isInteger(total)) {
    throw new Error("Total scans in the sequence must be a positive integer.");
  }

  let first = 1;
  if (progressFirstInput.value.trim()) {
    const f = Number(progressFirstInput.value);
    if (!Number.isFinite(f) || !Number.isInteger(f)) {
      throw new Error("First scan number must be an integer.");
    }
    first = f;
  }
  const lastScan = first + total - 1;

  const aRaw = progressCalAInput.value;
  const bRaw = progressCalBInput.value;
  const a = Number(aRaw);
  const b = Number(bRaw);
  if (!Number.isFinite(a) || !Number.isInteger(a)) {
    throw new Error("Calibration scan number A must be an integer.");
  }
  if (!Number.isFinite(b) || !Number.isInteger(b)) {
    throw new Error("Calibration scan number B must be an integer.");
  }
  if (a < first || a > lastScan) {
    throw new Error(`Calibration scan A (${a}) is outside the sequence range ${first}–${lastScan}.`);
  }
  if (b < first || b > lastScan) {
    throw new Error(`Calibration scan B (${b}) is outside the sequence range ${first}–${lastScan}.`);
  }
  if (b < a) {
    throw new Error("Calibration scan B must be greater than or equal to scan A.");
  }

  const xSec = parseTimeOfDay(progressCalATimeInput.value);
  const ySec = parseTimeOfDay(progressCalBTimeInput.value);
  if (xSec == null) throw new Error("Enter the start time of scan A.");
  if (ySec == null) throw new Error("Enter the end time of scan B.");
  if (Number.isNaN(xSec) || Number.isNaN(ySec)) {
    throw new Error("Calibration times must be in HH:MM or HH:MM:SS format.");
  }

  let elapsed = ySec - xSec;
  let yWrapped = false;
  if (elapsed < 0) {
    elapsed += SECONDS_PER_DAY;
    yWrapped = true;
  }
  if (elapsed <= 0) {
    throw new Error("Calibration window has zero or negative elapsed time.");
  }

  let doneScanNumber = null;
  if (progressDoneInput.value.trim()) {
    const d = Number(progressDoneInput.value);
    if (!Number.isFinite(d) || !Number.isInteger(d)) {
      throw new Error("Last completed scan number must be an integer.");
    }
    if (d > lastScan) {
      throw new Error(`Last completed scan number (${d}) exceeds the last scan in the sequence (${lastScan}).`);
    }
    if (d < b) {
      throw new Error(`Last completed scan number (${d}) cannot be less than calibration scan B (${b}).`);
    }
    doneScanNumber = d;
  }

  let currentSec = null;
  let currentRaw = progressCurrentTimeInput.value.trim();
  if (currentRaw) {
    const parsed = parseTimeOfDay(currentRaw);
    if (parsed == null || Number.isNaN(parsed)) {
      throw new Error("Current time must be in HH:MM or HH:MM:SS format.");
    }
    currentSec = parsed;
  }

  return {
    total,
    first,
    lastScan,
    a,
    b,
    xSec,
    ySec: yWrapped ? ySec + SECONDS_PER_DAY : ySec,
    elapsed,
    doneScanNumber,
    currentSec,
    yWrapped
  };
}

function computeProgress(input) {
  const numCalScans = input.b - input.a + 1;
  const perScan = input.elapsed / numCalScans;
  const doneScan = input.doneScanNumber != null ? input.doneScanNumber : input.b;
  const completedCount = doneScan - input.first + 1;
  const remaining = input.total - completedCount;

  let nowSec;
  let nowSource;
  if (input.currentSec != null) {
    const yDays = Math.floor(input.ySec / SECONDS_PER_DAY);
    nowSec = input.currentSec + yDays * SECONDS_PER_DAY;
    if (nowSec < input.ySec) nowSec += SECONDS_PER_DAY;
    nowSource = "user-entered current time";
  } else if (doneScan === input.b) {
    nowSec = input.ySec;
    nowSource = "end of scan B";
  } else {
    nowSec = input.ySec + (doneScan - input.b) * perScan;
    nowSource = "extrapolated from scan B at the calibrated rate";
  }

  const remainingTime = remaining * perScan;
  const endSec = nowSec + remainingTime;
  const fractionDone = input.total > 0 ? completedCount / input.total : 0;

  return {
    ...input,
    numCalScans,
    perScan,
    doneScan,
    completedCount,
    remaining,
    remainingTime,
    nowSec,
    nowSource,
    endSec,
    fractionDone
  };
}

function renderProgressResults(p) {
  const rangeNote = p.first === 1
    ? `scans 1–${p.lastScan}`
    : `scans ${p.first}–${p.lastScan}`;
  const cards = [];
  cards.push(renderResultCard(
    "Estimated end time",
    formatTimeOfDay(p.endSec),
    `from ${formatTimeOfDay(p.nowSec)} + ${formatHMS(p.remainingTime)}`
  ));
  cards.push(renderResultCard(
    "Per-scan elapsed",
    formatHMS(p.perScan),
    `count + dead, averaged over ${p.numCalScans} scan${p.numCalScans === 1 ? "" : "s"}`
  ));
  cards.push(renderResultCard(
    "Calibration window",
    `scans ${p.a}–${p.b}`,
    `${p.numCalScans} scan${p.numCalScans === 1 ? "" : "s"} in ${formatHMS(p.elapsed)}${p.yWrapped ? " (wraps midnight)" : ""}`
  ));
  cards.push(renderResultCard(
    "Progress",
    `${p.completedCount} / ${p.total}`,
    `last completed: scan ${p.doneScan} (of ${rangeNote}); ${formatNumberShort(100 * p.fractionDone, 2)}% done; ${p.remaining} scan${p.remaining === 1 ? "" : "s"} remaining`
  ));
  cards.push(renderResultCard(
    "Time remaining",
    formatHMS(p.remainingTime),
    `≈ ${p.remaining} × ${formatHMS(p.perScan)}`
  ));
  cards.push(renderResultCard(
    "Reference 'now'",
    formatTimeOfDay(p.nowSec),
    p.nowSource
  ));

  progressResults.innerHTML = `<div class="tool-result-grid">${cards.join("")}</div>`;
}

function recalcProgress() {
  try {
    const inputs = readProgressInputs();
    const p = computeProgress(inputs);
    let summary = `Calibration window: ${p.numCalScans} scan${p.numCalScans === 1 ? "" : "s"} (#${p.a}–#${p.b}) took ${formatHMS(p.elapsed)} → ${formatHMS(p.perScan)} per scan.`;
    if (p.remaining === 0) {
      summary += " Sequence is complete.";
    } else {
      summary += ` ${p.remaining} scan${p.remaining === 1 ? "" : "s"} remaining.`;
    }
    progressSummary.textContent = summary;
    renderProgressResults(p);
  } catch (error) {
    progressSummary.textContent = error.message;
    progressResults.innerHTML = "";
  }
}

[
  planSolveForInput,
  planNumInput,
  planCountInput,
  planDeadInput,
  planTotalInput,
  planStartTimeInput,
  planRateInput,
  planRateTimeUnitInput,
  planRateUnitLabelInput
].forEach((input) => {
  input.addEventListener("input", recalcPlan);
  input.addEventListener("change", recalcPlan);
});

planForm.addEventListener("submit", (event) => {
  event.preventDefault();
  recalcPlan();
});

planStartNowButton.addEventListener("click", () => {
  planStartTimeInput.value = currentTimeOfDayString(true);
  recalcPlan();
});

[
  progressTotalInput,
  progressFirstInput,
  progressDoneInput,
  progressCalAInput,
  progressCalATimeInput,
  progressCalBInput,
  progressCalBTimeInput,
  progressCurrentTimeInput
].forEach((input) => {
  input.addEventListener("input", recalcProgress);
  input.addEventListener("change", recalcProgress);
});

progressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  recalcProgress();
});

progressCurrentNowButton.addEventListener("click", () => {
  progressCurrentTimeInput.value = currentTimeOfDayString(true);
  recalcProgress();
});

[
  planStartTimeInput,
  progressCalATimeInput,
  progressCalBTimeInput,
  progressCurrentTimeInput
].forEach(attachTimePasteHandler);

recalcPlan();
recalcProgress();
