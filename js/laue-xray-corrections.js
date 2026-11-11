(function (global) {
  "use strict";

  function interpolate(table, coordinate, stride) {
    if (!table || !Number.isFinite(coordinate) ||
        coordinate < table[0] || coordinate > table[table.length - stride]) return null;
    let lo = 0, hi = table.length / stride - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (table[mid * stride] <= coordinate) lo = mid;
      else hi = mid;
    }
    const a = lo * stride, b = hi * stride;
    const t = (coordinate - table[a]) / (table[b] - table[a]);
    const values = [];
    for (let i = 1; i < stride; i += 1) {
      values.push(table[a + i] + t * (table[b + i] - table[a + i]));
    }
    return values;
  }

  function dispersion(element, energy) {
    return interpolate(global.LaueXrayData?.dispersion[element === "D" ? "H" : element], energy, 3);
  }

  function highQFormFactor(element, s) {
    return interpolate(global.LaueXrayData?.rayleigh[element === "D" ? "H" : element], s, 2)?.[0];
  }

  function createTransmission(settings, instrument) {
    const distanceCm = instrument.detDistance / 10;
    const incidentCm = settings.incidentAirCm ?? distanceCm;
    const beMm = settings.beWindowMm, petUm = settings.detectorFilmUm;
    if (!(distanceCm > 0) || !Number.isFinite(distanceCm)) {
      throw new Error("Detector distance must be positive to calculate attenuation.");
    }
    if (![incidentCm, beMm, petUm].every(v => Number.isFinite(v) && v >= 0)) {
      throw new Error("Air path and window thicknesses must be finite and nonnegative.");
    }
    const table = global.LaueXrayData?.attenuation;
    if (!table) throw new Error("X-ray attenuation data failed to load.");
    // Xraylib mass attenuation coefficients in cm²/g. Use dry air at
    // 1.205 mg/cm³, Be at 1.848 g/cm³, and PET at 1.39 g/cm³.
    // The actual detector entrance stack can be represented by a PET-equivalent
    // thickness. Detector gas efficiency and specimen attenuation are separate.
    return peak => {
      const energy = global.LaueSpectrum.HC_KEV_ANGSTROM / peak.lambda;
      const coefficients = interpolate(table, energy, 4);
      if (!coefficients) throw new Error("Air and window attenuation data cover 0.5–300 keV.");
      const [air, be, pet] = coefficients;
      const outgoingCm = Math.hypot(distanceCm, peak.xLab / 10, peak.yLab / 10);
      const airMass = 0.001205 * (incidentCm + outgoingCm);
      const beMass = 1.848 * beMm / 10;
      const petMass = 1.39 * petUm / 10000 * outgoingCm / distanceCm;
      return Math.exp(-(airMass * air + beMass * be + petMass * pet));
    };
  }

  global.LaueXrayCorrections = { createTransmission, dispersion, highQFormFactor };
})(typeof window !== "undefined" ? window : globalThis);
