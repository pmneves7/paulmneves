/**
 * SANS experiment geometry and instrument resolution.
 * Resolution estimates follow Pedersen et al., J. Appl. Cryst. 23 (1990) 321–333 (q_x, q_y)
 * and Harris et al., J. Appl. Cryst. 28 (1995) 209–222 (q_z).
 */
(function (global) {
  "use strict";

  const FWHM_TO_SIGMA = 2 * Math.sqrt(2 * Math.log(2));
  const UNIFORM_STD = Math.sqrt(12);

  function waveNumber(lambdaAngstrom) {
    return (2 * Math.PI) / lambdaAngstrom;
  }

  /** Half scattering angle θ (rad) from |Q| (Å⁻¹) and wavelength (Å). */
  function thetaFromQ(q, lambdaAngstrom) {
    const k = waveNumber(lambdaAngstrom);
    const s = q / (2 * k);
    if (s < 0 || s > 1) return null;
    return Math.asin(s);
  }

  /** |Q| (Å⁻¹) from half-angle θ (rad). */
  function qFromTheta(theta, lambdaAngstrom) {
    const k = waveNumber(lambdaAngstrom);
    return 2 * k * Math.sin(theta);
  }

  /** Full scattering angle 2θ (deg) from |Q|. */
  function twoThetaDegFromQ(q, lambdaAngstrom) {
    const theta = thetaFromQ(q, lambdaAngstrom);
    if (theta == null) return null;
    return (2 * theta * 180) / Math.PI;
  }

  /** In-plane momentum transfer q_⊥ (Å⁻¹) from radius r (m): q = k sin(2θ), tan(2θ) = r/L. */
  function qPerpFromRadius(rMeters, sampleDistanceM, lambdaAngstrom) {
    const k = waveNumber(lambdaAngstrom);
    return k * Math.sin(Math.atan(rMeters / sampleDistanceM));
  }

  /** |Q| (Å⁻¹) from in-plane q_⊥: |Q| = 2k sin(θ) with q_⊥ = k sin(2θ). */
  function qMagFromQPerp(qPerp, lambdaAngstrom) {
    const k = waveNumber(lambdaAngstrom);
    if (qPerp < 0 || qPerp > k) return null;
    const twoTheta = Math.asin(qPerp / k);
    return 2 * k * Math.sin(twoTheta / 2);
  }

  /** Full scattering angle 2θ (deg) from in-plane q_⊥. */
  function twoThetaDegFromQPerp(qPerp, lambdaAngstrom) {
    const k = waveNumber(lambdaAngstrom);
    if (qPerp < 0 || qPerp > k) return null;
    return (Math.asin(qPerp / k) * 180) / Math.PI;
  }

  /** |Q| from radial distance r (m) on detector and sample–detector distance L (m). */
  function qFromRadius(rMeters, sampleDistanceM, lambdaAngstrom) {
    const qPerp = qPerpFromRadius(rMeters, sampleDistanceM, lambdaAngstrom);
    return qMagFromQPerp(qPerp, lambdaAngstrom);
  }

  /** Radial distance r (m) on detector from in-plane q_⊥. */
  function radiusFromQPerp(qPerp, sampleDistanceM, lambdaAngstrom) {
    const k = waveNumber(lambdaAngstrom);
    if (qPerp < 0 || qPerp > k) return null;
    const twoTheta = Math.asin(qPerp / k);
    return sampleDistanceM * Math.tan(twoTheta);
  }

  /** Radial distance r (m) on detector from |Q|. */
  function radiusFromQ(q, sampleDistanceM, lambdaAngstrom) {
    const theta = thetaFromQ(q, lambdaAngstrom);
    if (theta == null || 2 * theta >= Math.PI / 2) return null;
    return sampleDistanceM * Math.tan(2 * theta);
  }

  /** Longitudinal q_z (Å⁻¹) along the direct beam. */
  function qzFromQ(q, lambdaAngstrom) {
    const theta = thetaFromQ(q, lambdaAngstrom);
    if (theta == null) return null;
    const k = waveNumber(lambdaAngstrom);
    return 2 * k * Math.sin(theta) ** 2;
  }

  /** In-plane magnitude sqrt(q_x² + q_y²) (Å⁻¹). */
  function qPerpFromQ(q, lambdaAngstrom) {
    const theta = thetaFromQ(q, lambdaAngstrom);
    if (theta == null) return null;
    const k = waveNumber(lambdaAngstrom);
    return k * Math.sin(2 * theta);
  }

  /** Real-space distance d = 2π / |Q| (Å). */
  function distanceFromQ(q) {
    if (!Number.isFinite(q) || q <= 0) return null;
    return (2 * Math.PI) / q;
  }

  /**
   * Maximum radial distance (m) from beam center to a point on the detector rectangle
   * that lies outside the beamstop disc.
   */
  function maxVisibleRadiusM(params) {
    const halfW = params.detWidthMm / 2000;
    const halfH = params.detHeightMm / 2000;
    const bx = params.beamOffsetXMm / 1000;
    const by = params.beamOffsetYMm / 1000;
    const rStop = params.beamstopRadiusMm / 1000;

    let rMax = 0;
    const corners = [
      [-halfW, -halfH],
      [halfW, -halfH],
      [halfW, halfH],
      [-halfW, halfH]
    ];
    for (const [cx, cy] of corners) {
      const dx = cx - bx;
      const dy = cy - by;
      const r = Math.hypot(dx, dy);
      if (r > rStop && r > rMax) rMax = r;
    }

    return rMax;
  }

  function minVisibleRadiusM(params) {
    const dx = Math.max(0, Math.abs(params.beamOffsetXMm) - params.detWidthMm / 2);
    const dy = Math.max(0, Math.abs(params.beamOffsetYMm) - params.detHeightMm / 2);
    return Math.max(params.beamstopRadiusMm, Math.hypot(dx, dy)) / 1000;
  }

  function visibleQRange(params) {
    const rMin = minVisibleRadiusM(params);
    const rMax = maxVisibleRadiusM(params);
    const qMin = qFromRadius(rMin, params.sampleDistanceM, params.lambdaAngstrom);
    const qMax = qFromRadius(rMax, params.sampleDistanceM, params.lambdaAngstrom);
    return { qMin, qMax, rMin, rMax };
  }

  /**
   * Instrument resolution σ_x, σ_y, σ_z (Å⁻¹, std dev) at |Q| = q0.
   * @param {object} p - geometry and resolution inputs (SI where noted)
   */
  function instrumentResolution(q0, p) {
    const lambda = p.lambdaAngstrom;
    const k = waveNumber(lambda);
    const theta = thetaFromQ(q0, lambda);
    if (theta == null) return null;

    const dllFwhm = p.deltaLambdaOverLambda;
    const wx1 = p.pinhole1Mm / 1000;
    const wx2 = p.pinhole2Mm / 1000;
    const L = p.aperture1ToSampleM - p.aperture2ToSampleM;
    const l = p.sampleDistanceM;
    const xD = p.pixelWidthMm / 1000;
    const yD = p.pixelHeightMm / 1000;

    if (!Number.isFinite(L) || L <= 0) return null;

    const sigmaXI_dll = (dllFwhm * q0) / FWHM_TO_SIGMA;

    const r1 = wx1 / 2;
    const r2 = wx2 / 2;
    const c2t = Math.cos(2 * theta);
    let dbeta1;
    let dbeta2;

    if (c2t <= 1e-12) return null;
    // Pedersen et al. (1990), eqs. 16–17. Choose the larger effective
    // aperture independently in each direction; the overlap correction is
    // dimensionless and remains invariant when all instrument lengths scale.
    function angularWidth(c) {
      if (r1 === 0 || r2 === 0) return 0;
      const extent1 = r1 / (L + l / c);
      const extent2 = r2 * c / l;
      const large = Math.max(extent1, extent2);
      const small = Math.min(extent1, extent2);
      return (L + l / c) / L * (2 * large - 0.5 * small ** 2 / large);
    }
    dbeta1 = angularWidth(c2t ** 2);
    dbeta2 = angularWidth(c2t);

    const sigmaXI_coll = (k * Math.cos(theta) * dbeta1) / FWHM_TO_SIGMA;
    const sigmaYI_coll = (k * dbeta2) / FWHM_TO_SIGMA;

    const sigmaZI_coll = Math.min(wx2 / l * q0, wx1 / (L + l) * q0) / UNIFORM_STD;

    const xD_std = xD / UNIFORM_STD;
    const yD_std = yD / UNIFORM_STD;
    const sigmaXI_det_rec = (xD_std * c2t ** 2 / l) * k;
    const sigmaXI_det = sigmaXI_det_rec * Math.cos(theta);
    const sigmaYI_det = (yD_std * c2t / l) * k;
    const sigmaZI_det = sigmaXI_det_rec * Math.sin(theta);

    const sigmaX = Math.sqrt(sigmaXI_dll ** 2 + sigmaXI_coll ** 2 + sigmaXI_det ** 2);
    const sigmaY = Math.sqrt(sigmaYI_coll ** 2 + sigmaYI_det ** 2);
    const sigmaZ = Math.sqrt(sigmaZI_coll ** 2 + sigmaZI_det ** 2);

    const sigmaYDeg = (sigmaY * 180) / (Math.PI * q0);
    const sigmaZDeg = (sigmaZ * 180) / (Math.PI * q0);
    const cosTheta = Math.cos(theta);
    const sigmaXTwoThetaDeg = cosTheta > 0 ? (sigmaX * 180) / (Math.PI * k * cosTheta) : null;
    const sigmaXTwoThetaDegFwhm = sigmaXTwoThetaDeg != null ? sigmaXTwoThetaDeg * FWHM_TO_SIGMA : null;

    return {
      q0,
      theta,
      twoThetaDeg: (2 * theta * 180) / Math.PI,
      qz: qzFromQ(q0, lambda),
      qPerp: qPerpFromQ(q0, lambda),
      sigmaX,
      sigmaY,
      sigmaZ,
      sigmaXFwhm: sigmaX * FWHM_TO_SIGMA,
      sigmaYFwhm: sigmaY * FWHM_TO_SIGMA,
      sigmaZFwhm: sigmaZ * FWHM_TO_SIGMA,
      sigmaXTwoThetaDeg,
      sigmaXTwoThetaDegFwhm,
      sigmaYDeg,
      sigmaZDeg,
      sigmaYDegFwhm: sigmaYDeg * FWHM_TO_SIGMA,
      sigmaZDegFwhm: sigmaZDeg * FWHM_TO_SIGMA,
      components: {
        sigmaXI_dll: sigmaXI_dll,
        sigmaXI_coll: sigmaXI_coll,
        sigmaXI_det: sigmaXI_det,
        sigmaYI_coll: sigmaYI_coll,
        sigmaYI_det: sigmaYI_det,
        sigmaZI_coll: sigmaZI_coll,
        sigmaZI_det: sigmaZI_det
      }
    };
  }

  function resolutionCurve(params, nPoints = 120) {
    const { qMin, qMax } = visibleQRange(params);
    if (!Number.isFinite(qMin) || !Number.isFinite(qMax) || qMax <= qMin) return [];

    const points = [];
    for (let i = 0; i <= nPoints; i += 1) {
      const qMag = qMin + (i / nPoints) * (qMax - qMin);
      const qPerp = qPerpFromQ(qMag, params.lambdaAngstrom);
      if (qMag == null) continue;
      const res = instrumentResolution(qMag, params);
      if (res) points.push({ ...res, qPerp, qMag });
    }
    return points;
  }

  function geometryCurve(params, nPoints = 120) {
    const { qMin, qMax } = visibleQRange(params);
    if (!Number.isFinite(qMin) || !Number.isFinite(qMax) || qMax <= qMin) return [];

    const points = [];
    for (let i = 0; i <= nPoints; i += 1) {
      const qMag = qMin + (i / nPoints) * (qMax - qMin);
      const qPerp = qPerpFromQ(qMag, params.lambdaAngstrom);
      points.push({
        q: qMag,
        qMag,
        twoThetaDeg: twoThetaDegFromQ(qMag, params.lambdaAngstrom),
        qz: qMag != null ? qzFromQ(qMag, params.lambdaAngstrom) : null,
        qPerp,
        distanceAngstrom: qMag != null ? distanceFromQ(qMag) : null
      });
    }
    return points;
  }

  global.SansPlannerMath = {
    FWHM_TO_SIGMA,
    waveNumber,
    thetaFromQ,
    qFromTheta,
    twoThetaDegFromQ,
    qPerpFromRadius,
    qMagFromQPerp,
    twoThetaDegFromQPerp,
    qFromRadius,
    radiusFromQPerp,
    radiusFromQ,
    qzFromQ,
    qPerpFromQ,
    distanceFromQ,
    maxVisibleRadiusM,
    minVisibleRadiusM,
    visibleQRange,
    instrumentResolution,
    resolutionCurve,
    geometryCurve
  };
})(typeof window !== "undefined" ? window : globalThis);
