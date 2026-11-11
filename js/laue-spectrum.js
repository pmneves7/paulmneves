(function (global) {
  "use strict";

  const HC_KEV_ANGSTROM = 12.3984198433;
  // h²/(2 m_n k_B), in Å² K. A flux distribution has a λ^-5
  // Jacobian, rather than the λ^-4 neutron number-density distribution.
  const NEUTRON_AA2_K = 949.2984400934973;
  // Tungsten K data from the same xraylib tables. The excitation edge is
  // 69.525 keV (NIST), so a normal 40 kV W tube has NO K emission.
  // https://physics.nist.gov/PhysRefData/XrayMassCoef/ElemTab/z74.html
  // Natural line FWHM = K-level width + final-level width, in eV:
  // https://github.com/tschoonj/xraylib/blob/master/data/atomiclevelswidth.dat
  const W_K_EDGE_KEV = 69.525;
  const W_LINES = [
    { energy: 59.3182, rate: 0.502430, widthEv: 44.91 }, // Kα1: 40.1 + 4.81
    { energy: 57.9810, rate: 0.289170, widthEv: 44.92 }, // Kα2: 40.1 + 4.82
    { energy: 67.2440, rate: 0.108080, widthEv: 46.5 },  // Kβ1: 40.1 + 6.4
    { energy: 66.9501, rate: 0.0558800, widthEv: 48.2 }  // Kβ3: 40.1 + 8.1
  ];
  // Effective multi-Maxwellian fits; weights are integrated component fluxes.
  // These describe the moderator, before beamline optics, not a calibrated
  // spectrum at the sample. Overall source power cancels in relative intensity.
  // https://www.mcstas.org/download/components/3.9.2/mcstas-components/Component_manualse17.html
  const MODERATORS = {
    cold: { label: "Cold moderator, 25 K Maxwellian", components: [[25, 1]] },
    thermal: { label: "Thermal moderator, 300 K Maxwellian", components: [[300, 1]] },
    hot: { label: "Hot moderator, 1200 K Maxwellian", components: [[1200, 1]] },
    "ill-cold": { label: "ILL H1 cold moderator fit", components: [[216.8, 1.24], [33.9, 1.02], [16.7, 0.30423]] },
    "ill-thermal": { label: "ILL H2 thermal moderator fit", components: [[683.7, 0.5874], [257.7, 2.51], [16.7, 0.1034]] },
    "ill-hot": { label: "ILL hot moderator fit", components: [[1695, 1.74], [708, 0.39]] }
  };

  function positive(value, label) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive and finite.`);
    return value;
  }

  function maxwellian(wavelength, temperature) {
    positive(wavelength, "Wavelength (Å)");
    positive(temperature, "Neutron temperature (K)");
    const a = NEUTRON_AA2_K / temperature;
    // Evaluate in log space so a cold source's short-wavelength tail safely
    // tends to zero instead of producing Infinity * 0.
    return Math.exp(Math.log(2) + 2 * Math.log(a) - 5 * Math.log(wavelength) - a / wavelength ** 2);
  }

  function create(settings) {
    let density, description, wavelengthCutoff;
    const sourceType = settings.sourceType;
    if (sourceType === "xray") {
      const kind = settings.xraySpectrum || "flat";
      if (kind === "flat") {
        density = () => 1;
        description = "Flat incident photon flux per Å.";
      } else {
        if (!["w-continuum", "w-lines"].includes(kind)) throw new Error("Unknown X-ray spectrum model.");
        const voltage = positive(settings.tubeVoltageKv, "Tube voltage (kV)");
        wavelengthCutoff = HC_KEV_ANGSTROM / voltage;
        // Kramers photon density dN/dE ∝ Z(V/E−1), converted to dN/dλ.
        // Optional empirical K-shell yield follows McXtrace Source_lab.
        // https://mcxtrace.org/download/components/3.9.2/mcxtrace-components/Component_manualse17.html
        // The K-shell yield is inapplicable to tungsten L lines.
        const lineYield = kind === "w-lines" && voltage > W_K_EDGE_KEV
          ? 4 * Math.PI * 1.2e-5 * W_K_EDGE_KEV ** 1.67 * Math.exp(-0.077 * 74) * (voltage / W_K_EDGE_KEV - 1)
          : 0;
        density = wavelength => {
          const energy = HC_KEV_ANGSTROM / wavelength;
          if (energy >= voltage) return 0;
          let perKev = 2e-6 * 74 * (voltage / energy - 1);
          if (lineYield) {
            for (const line of W_LINES) {
              const halfWidth = line.widthEv / 2000;
              perKev += lineYield * line.rate / W_LINES[0].rate * halfWidth /
                (Math.PI * ((energy - line.energy) ** 2 + halfWidth ** 2));
            }
          }
          return perKev * HC_KEV_ANGSTROM / wavelength ** 2;
        };
        let lineNote = "Characteristic lines are omitted.";
        if (kind === "w-lines") {
          lineNote = lineYield ? "K-line strengths are empirical; natural widths are used."
            : `W K emission is absent at or below ${W_K_EDGE_KEV} kV.`;
          lineNote += " W L emission is omitted.";
        }
        description = `W tube, ${voltage} kV: Kramers continuum${lineYield > 0 ? " + W K lines" : ""}; short-wavelength cutoff ${wavelengthCutoff.toFixed(3)} Å. ${lineNote}`;
      }
    } else if (sourceType === "neutron") {
      const kind = settings.neutronSpectrum || "flat";
      if (kind === "flat") {
        density = () => 1;
        description = "Flat incident neutron flux per Å.";
      } else if (kind === "polyethylene") {
        // Mildner et al. ambient polyethylene fit, as documented by Mantid.
        // https://docs.mantidproject.org/nightly/algorithms/CalculateEfficiencyCorrection-v1.html
        density = wavelength => {
          const thermal = 6324 * 1.58 ** 4 / wavelength ** 5 * Math.exp(-((1.58 / wavelength) ** 2));
          const tail = 786 / (1 + Math.exp((wavelength - 0.67143) / 0.06075)) / wavelength ** 1.198;
          return thermal + tail;
        };
        description = "Polyethylene at 300 K: published thermal + epithermal moderator fit. Beamline transmission is omitted.";
      } else {
        const moderator = kind === "maxwell"
          ? { label: `Custom ${positive(settings.neutronTemperatureK, "Effective neutron temperature (K)")} K Maxwellian`, components: [[settings.neutronTemperatureK, 1]] }
          : MODERATORS[kind];
        if (!moderator) throw new Error("Unknown neutron moderator model.");
        const total = moderator.components.reduce((sum, component) => sum + component[1], 0);
        density = wavelength => moderator.components.reduce((sum, [temperature, weight]) => sum + weight / total * maxwellian(wavelength, temperature), 0);
        description = `${moderator.label}: incident neutron flux per Å. Effective source spectrum; guides, filters and detector response are omitted.`;
      }
    } else throw new Error("Choose X-ray or neutron Laue.");
    return {
      description, wavelengthCutoff,
      density(wavelength) {
        positive(wavelength, "Wavelength (Å)");
        const value = density(wavelength);
        if (!Number.isFinite(value) || value < 0) throw new Error("Incident spectrum is outside the numeric range.");
        return value;
      }
    };
  }

  function wavelengthBand(settings, spectrum) {
    const neutron = settings.sourceType === "neutron";
    const defaultMin = neutron ? 0.5 : spectrum.wavelengthCutoff ?? 0.31;
    const defaultMax = neutron ? 8 : 6.2;
    const min = positive(settings.wavelengthMin ?? defaultMin, "Minimum wavelength (Å)");
    const max = positive(settings.wavelengthMax ?? defaultMax, "Maximum wavelength (Å)");
    const effectiveMin = Math.max(min, spectrum.wavelengthCutoff ?? 0);
    if (max <= effectiveMin) {
      if (spectrum.wavelengthCutoff >= max && (settings.wavelengthMin == null || min < max)) {
        throw new Error("The tube voltage is too low for this wavelength band.");
      }
      throw new Error("Wavelength limits must satisfy 0 < minimum < maximum.");
    }
    return { min: effectiveMin, max };
  }

  global.LaueSpectrum = { create, wavelengthBand, maxwellian, HC_KEV_ANGSTROM, NEUTRON_AA2_K };
})(typeof window !== "undefined" ? window : globalThis);
