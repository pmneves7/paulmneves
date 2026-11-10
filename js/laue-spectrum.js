(function (global) {
  "use strict";

  const HC_KEV_ANGSTROM = 12.3984198433;
  // h²/(2 m_n k_B), in Å² K. A flux distribution has a λ^-5
  // Jacobian, rather than the λ^-4 neutron number-density distribution.
  const NEUTRON_AA2_K = 949.2984400934973;
  const CU_K_EDGE_KEV = 8.9789;
  // Energies (keV) and radiative rates: xraylib's Cu K-line tables,
  // from Bearden and Krause/ORNL-5399. Rates normalized below to Kα1.
  // https://github.com/tschoonj/xraylib/blob/master/data/fluor_lines.dat
  // https://github.com/tschoonj/xraylib/blob/master/data/radrate.dat
  const CU_LINES = [
    { energy: 8.0478, rate: 0.582830 },
    { energy: 8.0279, rate: 0.299130 },
    { energy: 8.9053, rate: 0.0781600 },
    { energy: 8.9053, rate: 0.0398900 }
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
    let density, description;
    const sourceType = settings.sourceType;
    if (sourceType === "xray") {
      const kind = settings.xraySpectrum || "flat";
      if (kind === "flat") {
        density = () => 1;
        description = "Flat incident photon flux per Å.";
      } else {
        if (!["cu-continuum", "cu-lines"].includes(kind)) throw new Error("Unknown X-ray spectrum model.");
        const voltage = positive(settings.tubeVoltageKv, "Tube voltage (kV)");
        const width = kind === "cu-lines" ? positive(settings.cuLineWidthEv, "Cu line FWHM (eV)") / 1000 : 0;
        const cutoff = HC_KEV_ANGSTROM / voltage;
        // Kramers photon density dN/dE ∝ Z(V/E−1). Convert to dN/dλ
        // using |dE/dλ|=hc/λ². This is not the energy-flux spectrum.
        // Empirical characteristic-line yield follows the McXtrace Source_lab
        // model (Honkimäki), with a linear K-shell overvoltage dependence.
        // https://mcxtrace.org/download/components/3.9.2/mcxtrace-components/Component_manualse17.html
        const lineYield = kind === "cu-lines" && voltage > CU_K_EDGE_KEV
          ? 4 * Math.PI * 1.2e-5 * CU_K_EDGE_KEV ** 1.67 * Math.exp(-0.077 * 29) * (voltage / CU_K_EDGE_KEV - 1)
          : 0;
        density = wavelength => {
          const energy = HC_KEV_ANGSTROM / wavelength;
          if (energy >= voltage) return 0;
          let perKev = 2e-6 * 29 * (voltage / energy - 1);
          if (lineYield) {
            const halfWidth = width / 2;
            for (const line of CU_LINES) {
              // Unit-area Lorentzian in ENERGY, then transform the combined
              // photon density to wavelength. The width is an effective input.
              perKev += lineYield * line.rate / CU_LINES[0].rate * halfWidth /
                (Math.PI * ((energy - line.energy) ** 2 + halfWidth ** 2));
            }
          }
          return perKev * HC_KEV_ANGSTROM / wavelength ** 2;
        };
        const lineNote = kind !== "cu-lines" ? " Characteristic lines are omitted." : lineYield > 0
          ? " Line strengths are empirical; the effective width controls how sharply they enhance nearby reflections."
          : ` Cu K emission is absent at or below the ${CU_K_EDGE_KEV.toFixed(3)} kV K-shell threshold.`;
        description = `Cu tube, ${voltage} kV: Kramers continuum${lineYield > 0 ? ` + Cu K lines (${settings.cuLineWidthEv} eV FWHM)` : ""}; short-wavelength cutoff ${cutoff.toFixed(3)} Å. Unfiltered source approximation; window, anode self-absorption and beamline transmission are omitted.${lineNote}`;
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
      description,
      density(wavelength) {
        positive(wavelength, "Wavelength (Å)");
        const value = density(wavelength);
        if (!Number.isFinite(value) || value < 0) throw new Error("Incident spectrum is outside the numeric range.");
        return value;
      }
    };
  }

  global.LaueSpectrum = { create, maxwellian, HC_KEV_ANGSTROM, NEUTRON_AA2_K };
})(typeof window !== "undefined" ? window : globalThis);
