(function (global) {
  "use strict";

  function gcd(a, b) {
    while (b) [a, b] = [b, a % b];
    return a;
  }

  function directionKey(peak) {
    const indices = [peak.h, peak.k, peak.l];
    if (!indices.every(Number.isInteger)) throw new Error("Laue indices must be integers.");
    const divisor = indices.reduce((a, b) => gcd(a, Math.abs(b)), 0);
    if (!divisor) throw new Error("The direct beam has no Laue intensity.");
    // Keep the sign: Friedel partners are different outgoing directions.
    return indices.map(value => value / divisor || 0).join(",");
  }

  function symmetryOperations(crystal) {
    if (crystal.incompleteSymmetryOperations) throw new Error("CIF symmetry operations are incomplete; load a complete symmetry loop.");
    const explicit = crystal.symmetryOperations?.length;
    const group = !explicit && global.SpaceGroupEngine?.lookupSpaceGroup(crystal.spaceGroup, crystal.spaceGroupSetting);
    const operations = explicit ? crystal.symmetryOperations : group?.operations;
    if (!operations?.length) throw new Error("Cannot resolve CIF symmetry. Supply symmetry operations or a recognized space group.");
    return operations.map(operation => {
      const text = String(operation).toLowerCase().replace(/\s+/g, "");
      const rows = text.split(",");
      if (rows.length !== 3) throw new Error("Invalid CIF symmetry operation.");
      const rotation = [], translation = [];
      for (const row of rows) {
        const terms = (/^[+-]/.test(row) ? row : `+${row}`).match(/[+-][^+-]+/g) || [];
        if (!terms.length || terms.join("") !== (/^[+-]/.test(row) ? row : `+${row}`)) throw new Error("Invalid CIF symmetry operation.");
        const coefficients = [0, 0, 0];
        let shift = 0;
        for (const term of terms) {
          const sign = term[0] === "-" ? -1 : 1, value = term.slice(1);
          if (/^[xyz]$/.test(value)) coefficients["xyz".indexOf(value)] += sign;
          else if (/^[0-9.]+(?:\/[0-9.]+)?$/.test(value)) {
            const [numerator, denominator = "1"] = value.split("/");
            const number = Number(numerator) / Number(denominator);
            if (!Number.isFinite(number)) throw new Error("Invalid CIF symmetry translation.");
            shift += sign * number;
          } else throw new Error("Unsupported CIF symmetry expression; expected x, y, z and rational translations.");
        }
        rotation.push(coefficients); translation.push(shift);
      }
      const [a,b,c] = rotation;
      const determinant = a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
      if (Math.abs(determinant) !== 1) throw new Error("Invalid CIF symmetry rotation.");
      return { text, rotation, translation };
    });
  }

  function allowedPredicate(crystal) {
    const operations = symmetryOperations(crystal);
    return (h, k, l) => {
      const indices = [h, k, l];
      if (!indices.some(value => value !== 0)) return false;
      // F(h) = exp(2πi h·t) F(R^T h). A nonintegral phase for an
      // operation fixing h forces F(h)=0, in the CIF's own axis setting.
      return operations.every(({ rotation, translation }) => {
        const invariant = indices.every((value, j) => rotation.reduce((sum, row, i) => sum + row[j] * indices[i], 0) === value);
        const phase = indices.reduce((sum, value, i) => sum + value * translation[i], 0);
        return !invariant || Math.abs(phase - Math.round(phase)) < 1e-7;
      });
    };
  }

  function createModel(crystal, sourceType) {
    if (!["xray", "neutron"].includes(sourceType)) throw new Error("Choose X-ray or neutron Laue.");
    const factors = global.ScatteringFactors;
    if (!factors) throw new Error("Scattering factors failed to load. Please refresh the page.");
    if (crystal.incompleteAtomSites?.length) throw new Error("CIF atom positions or occupancies are incomplete; expected intensities require a complete atomic basis.");
    if (!Array.isArray(crystal.atoms) || !crystal.atoms.length) throw new Error("Load a CIF with fractional atom positions to estimate intensities.");
    for (const atom of crystal.atoms) {
      if (![atom.fractX, atom.fractY, atom.fractZ].every(Number.isFinite) ||
          (atom.occupancy != null && (!Number.isFinite(atom.occupancy) || atom.occupancy < 0 || atom.occupancy > 1))) {
        throw new Error("CIF atom coordinates and occupancies must be valid (occupancy 0–1).");
      }
    }
    const operations = symmetryOperations(crystal);
    // Explicit CIF operations define the coordinate setting, even when the
    // H-M label is missing or P1. The shared expander otherwise special-cases P1.
    const atoms = factors.expandAtomSites({ ...crystal, spaceGroup: "", symmetryOperations: operations.map(operation => operation.text) });
    const cache = new Map();
    return {
      sourceType,
      reflectionIntensity(peak) {
        if (!(peak.q > 0) || !(peak.lambda > 0) || !Number.isFinite(peak.q + peak.lambda)) {
          throw new Error("Reflection Q and wavelength must be positive and finite.");
        }
        const sinTheta = peak.q * peak.lambda / (4 * Math.PI);
        if (!(sinTheta > 0 && sinTheta <= 1 + 1e-10)) throw new Error("Reflection does not satisfy Bragg's law.");
        const key = [peak.h, peak.k, peak.l, peak.q].join(",");
        let factor = cache.get(key);
        if (!factor) {
          // Laue Q is 2π/d; Cromer–Mann uses s = sinθ/λ = 1/(2d).
          factor = factors.structureFactor(peak.h, peak.k, peak.l, atoms, { sourceType, s: peak.q / (4 * Math.PI) });
          // Suppress roundoff remnants of exact basis cancellations, without
          // discarding physically weak reflections by a relative display cutoff.
          const amplitudeBound = atoms.reduce((sum, atom) => {
            const f = factors.atomicScatteringFactor(atom.element, { sourceType, s: peak.q / (4 * Math.PI) });
            return sum + (atom.occupancy ?? 1) * Math.hypot(f.re, f.im);
          }, 0);
          if (factor.magnitude <= 1e-12 * amplitudeBound) factor = { ...factor, intensity: 0 };
          cache.set(key, factor);
        }
        if (factor.missingElements.length) return { intensity: null, missingElements: factor.missingElements };
        const cosTwoTheta = 1 - 2 * Math.min(1, sinTheta) ** 2;
        const polarization = sourceType === "xray" ? (1 + cosTwoTheta ** 2) / 2 : 1;
        // Stationary white-beam Laue integrated counts for flat particle flux
        // per unit wavelength. Do not use the monochromatic rocking factor.
        // https://single-crystal.ornl.gov/more/integration/index.html
        const intensity = factor.intensity * peak.lambda ** 4 / (2 * sinTheta ** 2) * polarization;
        if (!Number.isFinite(intensity)) throw new Error("Intensity is outside the numeric range.");
        return { intensity, missingElements: [] };
      }
    };
  }

  function calculateSpots(peaks, model, wavelengthMin, wavelengthMax, spectrum) {
    if (!Number.isFinite(wavelengthMin) || !Number.isFinite(wavelengthMax) ||
        !(wavelengthMin > 0 && wavelengthMax > wavelengthMin)) {
      throw new Error("Wavelength limits must satisfy 0 < minimum < maximum.");
    }
    const groups = new Map();
    const missing = new Set();
    for (const peak of peaks) {
      if (peak.lambda < wavelengthMin || peak.lambda > wavelengthMax) continue;
      const spectralDensity = spectrum ? spectrum.density(peak.lambda) : 1;
      if (!Number.isFinite(spectralDensity) || spectralDensity < 0) throw new Error("Incident spectral flux must be finite and nonnegative.");
      if (spectralDensity === 0) continue;
      const key = directionKey(peak);
      let spot = groups.get(key);
      if (!spot) {
        spot = { ...peak, intensity: 0, reflections: [], available: true };
        groups.set(key, spot);
      }
      const result = model.reflectionIntensity(peak);
      const intensity = result.intensity == null ? null : result.intensity * spectralDensity;
      if (intensity != null && !Number.isFinite(intensity)) throw new Error("Intensity is outside the numeric range.");
      spot.reflections.push({ ...peak, intensity });
      if (result.intensity == null) spot.available = false;
      else spot.intensity += intensity;
      for (const element of result.missingElements) missing.add(element);
    }
    const spots = [...groups.values()];
    for (const spot of spots) {
      // Use an actually contributing reflection for the label, rather than an
      // extinct fundamental whose higher harmonic alone lights up the spot.
      const contributing = spot.reflections.filter(peak => peak.intensity > 0);
      const representative = (contributing.length ? contributing : spot.reflections)
        .reduce((a, b) => a.hklSq <= b.hklSq ? a : b);
      const { intensity, reflections, available } = spot;
      Object.assign(spot, representative, { intensity, reflections, available });
    }
    const maxIntensity = spots.reduce((max, spot) => spot.onImage && spot.available ? Math.max(max, spot.intensity) : max, 0);
    for (const spot of spots) {
      // Never present a partial harmonic sum as a complete expected intensity.
      if (!spot.available) spot.intensity = null;
      spot.relativeIntensity = spot.available && maxIntensity > 0 ? spot.intensity / maxIntensity : 0;
    }
    return { spots, maxIntensity, missingElements: [...missing].sort(), unavailableSpots: spots.filter(spot => spot.onImage && !spot.available).length };
  }

  function markerRadius(relativeIntensity, minimumRadius, maximumRadius) {
    if (![relativeIntensity, minimumRadius, maximumRadius].every(Number.isFinite) || relativeIntensity < 0 ||
        minimumRadius < 0 || maximumRadius <= 0 || minimumRadius > maximumRadius) {
      throw new Error("Peak radii must satisfy 0 ≤ minimum ≤ maximum, with a positive maximum.");
    }
    // A constant AREA offset keeps weak peaks visible while the area above
    // that offset remains proportional to I/Imax. Adding a radius instead
    // would introduce a sqrt(I) cross-term into the displayed area.
    return Math.sqrt(minimumRadius ** 2 + (maximumRadius ** 2 - minimumRadius ** 2) * Math.min(1, relativeIntensity));
  }

  global.LaueIntensity = { createModel, calculateSpots, allowedPredicate, markerRadius };
})(typeof window !== "undefined" ? window : globalThis);
