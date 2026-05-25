const latticeForm = document.getElementById("lattice-form");
const inputModeSelect = document.getElementById("lattice-input-mode");
const conventionSelect = document.getElementById("lattice-convention");

const sectionByMode = {
  "direct-params": document.getElementById("direct-params-section"),
  "direct-vectors": document.getElementById("direct-vectors-section"),
  "reciprocal-params": document.getElementById("reciprocal-params-section"),
  "reciprocal-vectors": document.getElementById("reciprocal-vectors-section")
};

const directAInput = document.getElementById("direct-a");
const directBInput = document.getElementById("direct-b");
const directCInput = document.getElementById("direct-c");
const directAlphaInput = document.getElementById("direct-alpha");
const directBetaInput = document.getElementById("direct-beta");
const directGammaInput = document.getElementById("direct-gamma");

const directAVecInput = document.getElementById("direct-a-vec");
const directBVecInput = document.getElementById("direct-b-vec");
const directCVecInput = document.getElementById("direct-c-vec");

const recipAInput = document.getElementById("recip-a");
const recipBInput = document.getElementById("recip-b");
const recipCInput = document.getElementById("recip-c");
const recipAlphaInput = document.getElementById("recip-alpha");
const recipBetaInput = document.getElementById("recip-beta");
const recipGammaInput = document.getElementById("recip-gamma");

const recipAVecInput = document.getElementById("recip-a-vec");
const recipBVecInput = document.getElementById("recip-b-vec");
const recipCVecInput = document.getElementById("recip-c-vec");

const lookupInput = document.getElementById("lookup-hkl");

const summaryEl = document.getElementById("lattice-summary");
const resultsEl = document.getElementById("lattice-results");

const allInputs = [
  inputModeSelect,
  conventionSelect,
  directAInput,
  directBInput,
  directCInput,
  directAlphaInput,
  directBetaInput,
  directGammaInput,
  directAVecInput,
  directBVecInput,
  directCVecInput,
  recipAInput,
  recipBInput,
  recipCInput,
  recipAlphaInput,
  recipBetaInput,
  recipGammaInput,
  recipAVecInput,
  recipBVecInput,
  recipCVecInput,
  lookupInput
];

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function scale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function norm(v) {
  return Math.sqrt(dot(v, v));
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function degToRad(deg) {
  return deg * Math.PI / 180;
}

function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

function conventionFactor() {
  return conventionSelect.value === "physicist" ? 2 * Math.PI : 1;
}

function parsePositive(input, label) {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return value;
}

function parseAngle(input, label) {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0 || value >= 180) {
    throw new Error(`${label} must be between 0 and 180 degrees.`);
  }
  return value;
}

function parseVectorField(input, label) {
  const text = (input.value || "").trim();
  const parts = text.split(/[\s,]+/).filter((part) => part.length > 0).map(Number);
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} must be three numeric components separated by spaces or commas.`);
  }
  return parts;
}

function parseHKLField(input) {
  const text = (input.value || "").trim();
  if (!text) return null;
  const parts = text.split(/[\s,]+/).filter((part) => part.length > 0).map(Number);
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) return null;
  return parts;
}

function vectorsFromParams(a, b, c, alphaDeg, betaDeg, gammaDeg) {
  const alpha = degToRad(alphaDeg);
  const beta = degToRad(betaDeg);
  const gamma = degToRad(gammaDeg);
  const sinGamma = Math.sin(gamma);

  if (Math.abs(sinGamma) < 1e-12) {
    throw new Error("γ must not be 0 or 180 degrees.");
  }

  const va = [a, 0, 0];
  const vb = [b * Math.cos(gamma), b * sinGamma, 0];
  const cx = c * Math.cos(beta);
  const cy = c * (Math.cos(alpha) - Math.cos(beta) * Math.cos(gamma)) / sinGamma;
  const czSquared = c * c - cx * cx - cy * cy;

  if (czSquared <= 0) {
    throw new Error("Those lattice parameters do not define a valid unit cell.");
  }

  return { va, vb, vc: [cx, cy, Math.sqrt(czSquared)] };
}

function paramsFromVectors(va, vb, vc) {
  const a = norm(va);
  const b = norm(vb);
  const c = norm(vc);
  if (a === 0 || b === 0 || c === 0) {
    throw new Error("Lattice vectors must be non-zero.");
  }
  const alpha = radToDeg(Math.acos(clamp(dot(vb, vc) / (b * c), -1, 1)));
  const beta = radToDeg(Math.acos(clamp(dot(vc, va) / (c * a), -1, 1)));
  const gamma = radToDeg(Math.acos(clamp(dot(va, vb) / (a * b), -1, 1)));
  return { a, b, c, alpha, beta, gamma };
}

function dualBasis(va, vb, vc, K) {
  const volume = dot(va, cross(vb, vc));
  if (Math.abs(volume) < 1e-12) {
    throw new Error("Lattice vectors are linearly dependent.");
  }
  return {
    va: scale(cross(vb, vc), K / volume),
    vb: scale(cross(vc, va), K / volume),
    vc: scale(cross(va, vb), K / volume)
  };
}

function readDirectVectors(K) {
  const mode = inputModeSelect.value;

  if (mode === "direct-params") {
    const a = parsePositive(directAInput, "a");
    const b = parsePositive(directBInput, "b");
    const c = parsePositive(directCInput, "c");
    const alpha = parseAngle(directAlphaInput, "α");
    const beta = parseAngle(directBetaInput, "β");
    const gamma = parseAngle(directGammaInput, "γ");
    return vectorsFromParams(a, b, c, alpha, beta, gamma);
  }

  if (mode === "direct-vectors") {
    return {
      va: parseVectorField(directAVecInput, "a vector"),
      vb: parseVectorField(directBVecInput, "b vector"),
      vc: parseVectorField(directCVecInput, "c vector")
    };
  }

  if (mode === "reciprocal-params") {
    const aS = parsePositive(recipAInput, "a*");
    const bS = parsePositive(recipBInput, "b*");
    const cS = parsePositive(recipCInput, "c*");
    const alphaS = parseAngle(recipAlphaInput, "α*");
    const betaS = parseAngle(recipBetaInput, "β*");
    const gammaS = parseAngle(recipGammaInput, "γ*");
    const recipVectors = vectorsFromParams(aS, bS, cS, alphaS, betaS, gammaS);
    return dualBasis(recipVectors.va, recipVectors.vb, recipVectors.vc, K);
  }

  if (mode === "reciprocal-vectors") {
    const recipVa = parseVectorField(recipAVecInput, "a* vector");
    const recipVb = parseVectorField(recipBVecInput, "b* vector");
    const recipVc = parseVectorField(recipCVecInput, "c* vector");
    return dualBasis(recipVa, recipVb, recipVc, K);
  }

  throw new Error("Unknown input mode.");
}

function showActiveSection() {
  const mode = inputModeSelect.value;
  for (const [key, element] of Object.entries(sectionByMode)) {
    if (!element) continue;
    element.hidden = key !== mode;
  }
}

function formatNumber(value, digits = 5) {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  return Number(value.toPrecision(digits)).toString();
}

function cleanVector(v, relativeEpsilon = 1e-10) {
  const maxAbs = Math.max(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
  if (maxAbs === 0) return [0, 0, 0];
  const threshold = maxAbs * relativeEpsilon;
  return v.map((value) => (Math.abs(value) <= threshold ? 0 : value));
}

function formatVector(v, digits = 5) {
  const cleaned = cleanVector(v);
  return `[${formatNumber(cleaned[0], digits)}, ${formatNumber(cleaned[1], digits)}, ${formatNumber(cleaned[2], digits)}]`;
}

function formatHKLTuple(hkl) {
  return `(${hkl.map((value) => formatNumber(value, 5)).join(", ")})`;
}

function renderCard(label, value, note = "") {
  return `
    <div class="tool-result-card">
      <h3>${label}</h3>
      <p>${value}</p>
      ${note ? `<span>${note}</span>` : ""}
    </div>
  `;
}

function renderSection(title, gridHTML, extraHTML = "") {
  return `
    <div class="tool-results-section">
      <h3>${title}</h3>
      ${gridHTML}
      ${extraHTML}
    </div>
  `;
}

function conventionDescription() {
  if (conventionSelect.value === "physicist") {
    return "Physicist convention: a* · a = 2π and |G(hkl)| equals 2π/d.";
  }
  return "Crystallographer convention: a* · a = 1 and |G(hkl)| equals 1/d.";
}

function inputModeDescription() {
  switch (inputModeSelect.value) {
    case "direct-params":
      return "Real-space lattice parameters were used to build the direct lattice in a Cartesian frame with a along x and b in the xy-plane.";
    case "direct-vectors":
      return "Real-space lattice vectors were taken directly in their input frame.";
    case "reciprocal-params":
      return "Reciprocal-space lattice parameters were used to build the reciprocal lattice in a Cartesian frame with a* along x and b* in the xy-plane; the direct lattice was obtained by inversion.";
    case "reciprocal-vectors":
      return "Reciprocal-space lattice vectors were taken directly in their input frame; the direct lattice was obtained by inversion.";
    default:
      return "";
  }
}

function buildLookupHTML(recip, K) {
  const hkl = parseHKLField(lookupInput);
  if (!hkl) {
    return `
      <p class="tool-note">
        Enter three numeric Miller indices separated by spaces or commas to compute |G(hkl)| in Å⁻¹.
      </p>
    `;
  }

  const gVector = add(
    add(scale(recip.va, hkl[0]), scale(recip.vb, hkl[1])),
    scale(recip.vc, hkl[2])
  );
  const gMagnitude = norm(gVector);
  const dSpacing = gMagnitude > 0 ? K / gMagnitude : Infinity;
  const conventionLabel = conventionSelect.value === "physicist"
    ? "d = 2π / |G|"
    : "d = 1 / |G|";

  return `
    <div class="tool-result-grid">
      ${renderCard(
        `G${formatHKLTuple(hkl)}`,
        formatVector(gVector),
        "Cartesian components in Å⁻¹"
      )}
      ${renderCard(
        `|G${formatHKLTuple(hkl)}|`,
        `${formatNumber(gMagnitude)} Å⁻¹`,
        "absolute value of the reciprocal-lattice vector"
      )}
      ${renderCard(
        `d${formatHKLTuple(hkl)}`,
        Number.isFinite(dSpacing) ? `${formatNumber(dSpacing)} Å` : "∞",
        conventionLabel
      )}
    </div>
  `;
}

function render() {
  showActiveSection();

  try {
    const K = conventionFactor();
    const direct = readDirectVectors(K);
    const directParams = paramsFromVectors(direct.va, direct.vb, direct.vc);
    const recip = dualBasis(direct.va, direct.vb, direct.vc, K);
    const recipParams = paramsFromVectors(recip.va, recip.vb, recip.vc);
    const directVolume = Math.abs(dot(direct.va, cross(direct.vb, direct.vc)));
    const recipVolume = Math.abs(dot(recip.va, cross(recip.vb, recip.vc)));

    summaryEl.textContent = `${conventionDescription()} ${inputModeDescription()}`;

    const directParamsGrid = `
      <div class="tool-result-grid">
        ${renderCard("a", `${formatNumber(directParams.a)} Å`)}
        ${renderCard("b", `${formatNumber(directParams.b)} Å`)}
        ${renderCard("c", `${formatNumber(directParams.c)} Å`)}
        ${renderCard("α", `${formatNumber(directParams.alpha)}°`, "angle between b and c")}
        ${renderCard("β", `${formatNumber(directParams.beta)}°`, "angle between c and a")}
        ${renderCard("γ", `${formatNumber(directParams.gamma)}°`, "angle between a and b")}
      </div>
    `;

    const directVectorsGrid = `
      <div class="tool-result-grid">
        ${renderCard("a", formatVector(direct.va), `|a| = ${formatNumber(directParams.a)} Å`)}
        ${renderCard("b", formatVector(direct.vb), `|b| = ${formatNumber(directParams.b)} Å`)}
        ${renderCard("c", formatVector(direct.vc), `|c| = ${formatNumber(directParams.c)} Å`)}
      </div>
    `;

    const recipParamsGrid = `
      <div class="tool-result-grid">
        ${renderCard("a*", `${formatNumber(recipParams.a)} Å⁻¹`)}
        ${renderCard("b*", `${formatNumber(recipParams.b)} Å⁻¹`)}
        ${renderCard("c*", `${formatNumber(recipParams.c)} Å⁻¹`)}
        ${renderCard("α*", `${formatNumber(recipParams.alpha)}°`, "angle between b* and c*")}
        ${renderCard("β*", `${formatNumber(recipParams.beta)}°`, "angle between c* and a*")}
        ${renderCard("γ*", `${formatNumber(recipParams.gamma)}°`, "angle between a* and b*")}
      </div>
    `;

    const recipVectorsGrid = `
      <div class="tool-result-grid">
        ${renderCard("a*", formatVector(recip.va), `|a*| = ${formatNumber(recipParams.a)} Å⁻¹`)}
        ${renderCard("b*", formatVector(recip.vb), `|b*| = ${formatNumber(recipParams.b)} Å⁻¹`)}
        ${renderCard("c*", formatVector(recip.vc), `|c*| = ${formatNumber(recipParams.c)} Å⁻¹`)}
      </div>
    `;

    const volumeGrid = `
      <div class="tool-result-grid">
        ${renderCard("V", `${formatNumber(directVolume)} Å³`, "real-space cell volume")}
        ${renderCard("V*", `${formatNumber(recipVolume)} Å⁻³`, "reciprocal-space cell volume")}
      </div>
    `;

    const lookupHTML = buildLookupHTML(recip, K);

    resultsEl.innerHTML = `
      ${renderSection("Real-space lattice parameters", directParamsGrid)}
      ${renderSection("Real-space lattice vectors", directVectorsGrid)}
      ${renderSection("Reciprocal-space lattice parameters", recipParamsGrid)}
      ${renderSection("Reciprocal-space lattice vectors", recipVectorsGrid)}
      ${renderSection("Cell volumes", volumeGrid)}
      ${renderSection("Reciprocal vector lookup", lookupHTML)}
    `;
  } catch (error) {
    summaryEl.textContent = "Could not perform the conversion.";
    resultsEl.innerHTML = `<p class="tool-output">${error.message}</p>`;
  }
}

allInputs.forEach((input) => {
  if (!input) return;
  input.addEventListener("input", render);
  input.addEventListener("change", render);
});

latticeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  render();
});

render();
