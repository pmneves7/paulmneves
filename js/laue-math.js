/**
 * Laue diffraction geometry: reciprocal lattice, UB matrix, detector projection,
 * orientation refinement, and ideal-orientation calculator.
 */
(function (global) {
  "use strict";

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

  function add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function scale(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
  }

  function norm(v) {
    return Math.sqrt(dot(v, v));
  }

  function normalize(v) {
    const n = norm(v);
    return n > 0 ? scale(v, 1 / n) : [0, 0, 0];
  }

  function clamp(value, lo, hi) {
    return Math.min(hi, Math.max(lo, value));
  }

  function degToRad(d) {
    return d * Math.PI / 180;
  }

  function radToDeg(r) {
    return r * 180 / Math.PI;
  }

  function mat3Mul(a, b) {
    const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
      }
    }
    return out;
  }

  function mat3Vec(m, v) {
    return [
      m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
    ];
  }

  function rotX(angleRad) {
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    return [[1, 0, 0], [0, c, -s], [0, s, c]];
  }

  function rotY(angleRad) {
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
  }

  function rotZ(angleRad) {
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  }

  /** Rotation matrix from axis-angle (Rodrigues), axis in lab frame. */
  function rotAxis(axis, angleRad) {
    const a = normalize(axis);
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    const x = a[0];
    const y = a[1];
    const z = a[2];
    const oc = 1 - c;
    return [
      [c + x * x * oc, x * y * oc - z * s, x * z * oc + y * s],
      [y * x * oc + z * s, c + y * y * oc, y * z * oc - x * s],
      [z * x * oc - y * s, z * y * oc + x * s, c + z * z * oc]
    ];
  }

  function matrixFromColumns(c0, c1, c2) {
    return [
      [c0[0], c1[0], c2[0]],
      [c0[1], c1[1], c2[1]],
      [c0[2], c1[2], c2[2]]
    ];
  }

  function directLatticeVectors(params) {
    const { a, b, c, alpha, beta, gamma } = params;
    const alphaRad = degToRad(alpha);
    const betaRad = degToRad(beta);
    const gammaRad = degToRad(gamma);
    const sinGamma = Math.sin(gammaRad);
    if (Math.abs(sinGamma) < 1e-12) throw new Error("γ must not be 0 or 180°.");

    const va = [a, 0, 0];
    const vb = [b * Math.cos(gammaRad), b * sinGamma, 0];
    const cx = c * Math.cos(betaRad);
    const cy = c * (Math.cos(alphaRad) - Math.cos(betaRad) * Math.cos(gammaRad)) / sinGamma;
    const czSq = c * c - cx * cx - cy * cy;
    if (czSq <= 0) throw new Error("Invalid unit cell.");
    const vc = [cx, cy, Math.sqrt(czSq)];
    return { va, vb, vc };
  }

  /** Physicist convention: |Q(hkl)| = 2π/d (Å⁻¹), matching the lattice converter and Q filters in the UI. */
  function reciprocalBasis(params) {
    const { va, vb, vc } = directLatticeVectors(params);
    const volume = dot(va, cross(vb, vc));
    if (Math.abs(volume) < 1e-12) throw new Error("Degenerate unit cell.");
    const twoPi = 2 * Math.PI;
    return {
      aStar: scale(cross(vb, vc), twoPi / volume),
      bStar: scale(cross(vc, va), twoPi / volume),
      cStar: scale(cross(va, vb), twoPi / volume)
    };
  }

  function bMatrix(params) {
    const basis = reciprocalBasis(params);
    return matrixFromColumns(basis.aStar, basis.bStar, basis.cStar);
  }

  /**
   * Sample orientation U from Euler angles Ω (z), χ (x), Φ (y).
   * Signs are applied as multipliers on each angle in degrees.
   */
  function uMatrix(sampleOmega, sampleChi, samplePhi, signs) {
    const s = signs || { omega: 1, chi: 1, phi: 1 };
    const rz = rotZ(degToRad(sampleOmega * (s.omega || 1)));
    const rx = rotX(degToRad(sampleChi * (s.chi || 1)));
    const ry = rotY(degToRad(samplePhi * (s.phi || 1)));
    return mat3Mul(ry, mat3Mul(rx, rz));
  }

  /**
   * Invert U = Ry(Φ) Rx(χ) Rz(Ω) to display angles (degrees), undoing per-axis sign multipliers.
   */
  function sampleEulerFromUMatrix(m, signs) {
    const s = signs || { omega: 1, chi: 1, phi: 1 };
    // rotX stores -sin(χ) in R[1][2] for U = Ry(Φ) Rx(χ) Rz(Ω)
    const chiRad = Math.asin(clamp(-m[1][2], -1, 1));
    const cosChi = Math.cos(chiRad);
    let omegaRad;
    let phiRad;
    if (Math.abs(cosChi) > 1e-6) {
      omegaRad = Math.atan2(m[1][0], m[1][1]);
      phiRad = Math.atan2(m[0][2], m[2][2]);
    } else {
      omegaRad = 0;
      phiRad = Math.atan2(-m[2][0], m[0][0]);
    }
    return {
      omega: radToDeg(omegaRad) / (s.omega || 1),
      chi: radToDeg(chiRad) / (s.chi || 1),
      phi: radToDeg(phiRad) / (s.phi || 1)
    };
  }

  function wrapAngleNear(angleDeg, referenceDeg) {
    let a = angleDeg;
    const ref = referenceDeg;
    while (a - ref > 180) a -= 360;
    while (a - ref < -180) a += 360;
    return a;
  }

  /**
   * Rotate sample orientation so reflection hkl moves to (targetX, targetY) on the image.
   * Uses detector in-plane axes (2 DOF) with Gauss–Newton steps; stable vs Euler increments.
   *
   * @param {object} detector - detOmega, detChi, laueMode
   */
  function panSampleOrientationTrackPoint(
    params,
    startAngles,
    signs,
    detector,
    hkl,
    targetX,
    targetY,
    projConfig,
    imageSize
  ) {
    const hint = { ...startAngles };
    let angles = { ...startAngles };
    const bVec = mat3Vec(bMatrix(params), hkl);
    const n = detectorNormal(
      detector.detOmega,
      detector.detChi,
      detector.laueMode
    );
    const basis = detectorBasis(n);

    for (let iter = 0; iter < 12; iter += 1) {
      const m = uMatrix(angles.omega, angles.chi, angles.phi, signs);
      const g = mat3Vec(m, bVec);
      const proj = projectReflection(g, projConfig, imageSize);
      if (!proj) return angles;

      const errX = targetX - proj.x;
      const errY = targetY - proj.y;
      if (errX * errX + errY * errY < 0.01) break;

      const step = 1e-4;
      const mU = mat3Mul(rotAxis(basis.u, step), m);
      const mV = mat3Mul(rotAxis(basis.v, step), m);
      const pU = projectReflection(mat3Vec(mU, bVec), projConfig, imageSize);
      const pV = projectReflection(mat3Vec(mV, bVec), projConfig, imageSize);
      if (!pU || !pV) break;

      const j11 = (pU.x - proj.x) / step;
      const j12 = (pV.x - proj.x) / step;
      const j21 = (pU.y - proj.y) / step;
      const j22 = (pV.y - proj.y) / step;
      const det = j11 * j22 - j12 * j21;
      if (Math.abs(det) < 1e-14) break;

      const du = (errX * j22 - errY * j12) / det;
      const dv = (errY * j11 - errX * j21) / det;
      const mNew = mat3Mul(rotAxis(basis.u, du), mat3Mul(rotAxis(basis.v, dv), m));
      const raw = sampleEulerFromUMatrix(mNew, signs);
      angles = {
        omega: wrapAngleNear(raw.omega, hint.omega),
        chi: wrapAngleNear(raw.chi, hint.chi),
        phi: wrapAngleNear(raw.phi, hint.phi)
      };
    }
    return angles;
  }

  function rotateSampleOrientationAboutBeam(startAngles, signs, deltaDeg) {
    const hint = { ...startAngles };
    const m = uMatrix(startAngles.omega, startAngles.chi, startAngles.phi, signs);
    const mNew = mat3Mul(rotAxis([1, 0, 0], degToRad(deltaDeg)), m);
    const raw = sampleEulerFromUMatrix(mNew, signs);
    return {
      omega: wrapAngleNear(raw.omega, hint.omega),
      chi: wrapAngleNear(raw.chi, hint.chi),
      phi: wrapAngleNear(raw.phi, hint.phi)
    };
  }

  function ubMatrix(params, sampleOmega, sampleChi, samplePhi, signs) {
    return mat3Mul(uMatrix(sampleOmega, sampleChi, samplePhi, signs), bMatrix(params));
  }

  function reciprocalVector(hkl, ub) {
    return mat3Vec(ub, hkl);
  }

  function hklIndexLimit(maxHklSq) {
    const limit = Math.ceil(Math.sqrt(Math.max(maxHklSq, 0)));
    return limit;
  }

  function enumerateHKL(maxHklSq) {
    const limit = hklIndexLimit(maxHklSq);
    const list = [];
    for (let h = -limit; h <= limit; h += 1) {
      for (let k = -limit; k <= limit; k += 1) {
        for (let l = -limit; l <= limit; l += 1) {
          if (h === 0 && k === 0 && l === 0) continue;
          const sq = h * h + k * k + l * l;
          if (sq <= maxHklSq) list.push([h, k, l, sq]);
        }
      }
    }
    return list;
  }

  /**
   * Detector plane normal. χ is the tilt away from the beam-axis normal:
   * transmission χ=0 → +x, backscatter χ=0 → −x. Ω is the azimuth of that tilt
   * in the lab yz plane.
   */
  function detectorNormal(detOmega, detChi, laueMode) {
    const o = degToRad(detOmega);
    const c = degToRad(detChi);
    const sinC = Math.sin(c);
    const beamSign = laueMode === "backscatter" ? -1 : 1;
    return normalize([
      beamSign * Math.cos(c),
      sinC * Math.sin(o),
      sinC * Math.cos(o)
    ]);
  }

  function legacyDetectorNormal(detOmega, detChi, laueMode, detOmegaMisalign, detChiMisalign) {
    let omega = detOmega;
    if (laueMode === "backscatter") omega += 180;
    const o = degToRad(omega);
    const c = degToRad(detChi);
    const sinC = Math.sin(c);
    let n = normalize([
      sinC * Math.cos(o),
      sinC * Math.sin(o),
      Math.cos(c)
    ]);
    if (Math.abs(detOmegaMisalign || 0) > 1e-9 || Math.abs(detChiMisalign || 0) > 1e-9) {
      const mis = mat3Mul(rotX(degToRad(detChiMisalign || 0)), rotZ(degToRad(detOmegaMisalign || 0)));
      n = normalize(mat3Vec(mis, n));
    }
    return n;
  }

  function detectorAnglesFromNormal(normal, laueMode) {
    const n = normalize(normal);
    const beamSign = laueMode === "backscatter" ? -1 : 1;
    const chi = radToDeg(Math.acos(clamp(beamSign * n[0], -1, 1)));
    if (Math.abs(Math.sin(degToRad(chi))) < 1e-8) {
      return { detOmega: 0, detChi: chi };
    }
    const omega = radToDeg(Math.atan2(n[1], n[2]));
    return { detOmega: omega, detChi: chi };
  }

  function migrateLegacyDetectorAngles(detector) {
    const n = legacyDetectorNormal(
      detector.detOmega || 0,
      detector.detChi == null ? 90 : detector.detChi,
      detector.laueMode || "backscatter",
      detector.detOmegaMisalign || 0,
      detector.detChiMisalign || 0
    );
    return detectorAnglesFromNormal(n, detector.laueMode || "backscatter");
  }

  /**
   * In-plane detector axes: u → image +x, v → image +y (down).
   */
  function detectorBasis(normal) {
    const n = normalize(normal);
    let u = cross([0, 0, 1], n);
    if (norm(u) < 1e-6) u = cross([0, 1, 0], n);
    u = normalize(u);
    const v = normalize(cross(n, u));
    return { normal: n, u, v };
  }

  function peakOnImage(x, y, imageSize, margin) {
    const pad = margin || 0;
    return (
      x >= -pad && x <= imageSize.width + pad &&
      y >= -pad && y <= imageSize.height + pad
    );
  }

  /**
   * Project a diffracted ray onto the detector plane.
   * Returns pixel coordinates or null if not visible.
   */
  function projectReflection(gLab, config, imageSize) {
    const beam = [1, 0, 0];
    const gDot = dot(gLab, beam);
    const gSq = dot(gLab, gLab);
    if (gSq < 1e-14 || gDot >= 0) return null;

    const kMag = -gSq / (2 * gDot); // Å^-1, because G uses 2π/d
    if (!Number.isFinite(kMag) || kMag <= 0) return null;

    const qMag = norm(gLab);
    if (qMag < config.qMin || qMag > config.qMax) return null;

    const lambda = (2 * Math.PI) / kMag; // physical wavelength in Å
    const kOut = add(scale(beam, kMag), gLab);
    const kNorm = norm(kOut);
    if (kNorm < 1e-14) return null;
    const direction = normalize(kOut);

    const towardDetector = config.laueMode === "backscatter" ? direction[0] < 0 : direction[0] > 0;
    if (!towardDetector) return null;

    const n = detectorNormal(config.detOmega, config.detChi, config.laueMode);
    const basis = detectorBasis(n);
    const planePoint = scale(basis.normal, config.detDistance);

    const denom = dot(direction, basis.normal);
    if (Math.abs(denom) < 1e-10) return null;
    const t = dot(subtract(planePoint, [0, 0, 0]), basis.normal) / denom;
    if (t <= 0) return null;

    const hit = scale(direction, t);
    const rel = subtract(hit, planePoint);
    const xLab = dot(rel, basis.u);
    const yLab = dot(rel, basis.v);

    const detWidth = Math.max(config.detWidth, 1e-6);
    const detHeight = Math.max(config.detHeight, 1e-6);
    const pxPerMmX = imageSize.width / detWidth;
    const pxPerMmY = imageSize.height / detHeight;
    const beamCx = config.beamX;
    const beamCy = config.beamY;

    const cx = beamCx + xLab * pxPerMmX;
    const cy = beamCy + yLab * pxPerMmY;

    return { x: cx, y: cy, q: qMag, lambda, xLab, yLab };
  }

  function projectHKL(params, hkl, config, imageSize) {
    if (imageSize) syncBeamFromOffsets(config, imageSize);
    const ub = ubMatrix(
      params,
      config.sampleOmega,
      config.sampleChi,
      config.samplePhi,
      config.sampleSigns
    );
    return projectReflection(reciprocalVector(hkl, ub), config, imageSize);
  }

  function computePredictedPeaks(params, config, imageSize, isAllowed) {
    if (imageSize) syncBeamFromOffsets(config, imageSize);
    const imageMargin = imageSize
      ? Math.max(8, 0.02 * Math.min(imageSize.width, imageSize.height))
      : 0;
    const ub = ubMatrix(
      params,
      config.sampleOmega,
      config.sampleChi,
      config.samplePhi,
      config.sampleSigns
    );
    const hkls = enumerateHKL(config.maxHklSq);
    const peaks = [];

    for (const [h, k, l, sq] of hkls) {
      if (isAllowed && !isAllowed(h, k, l)) continue;
      const g = reciprocalVector([h, k, l], ub);
      const proj = projectReflection(g, config, imageSize);
      if (!proj) continue;
      peaks.push({
        h, k, l,
        hklSq: sq,
        g,
        q: proj.q,
        lambda: proj.lambda,
        x: proj.x,
        y: proj.y,
        xLab: proj.xLab,
        yLab: proj.yLab,
        onImage: peakOnImage(proj.x, proj.y, imageSize, imageMargin)
      });
    }
    return peaks;
  }

  function syncBeamFromOffsets(cfg, imageSize) {
    if (!imageSize) return;
    cfg.beamX = imageSize.width / 2 + (cfg.detOffsetX || 0);
    cfg.beamY = imageSize.height / 2 + (cfg.detOffsetY || 0);
  }

  function refinementParamMeta(key, cfg) {
    const dist = Math.abs(cfg.detDistance) || 150;
    switch (key) {
      case "sampleOmega":
      case "sampleChi":
      case "samplePhi":
        return { eps: 0.05, stepMax: 2, min: -360, max: 360 };
      case "detDistance":
        return {
          eps: Math.max(0.5, dist * 0.005),
          stepMax: Math.max(5, dist * 0.1),
          min: Math.max(5, dist * 0.25),
          max: Math.min(5000, dist * 4)
        };
      case "detOffsetX":
      case "detOffsetY":
        return { eps: 0.25, stepMax: 8, min: -5000, max: 5000 };
      case "detOmega":
        return { eps: 0.05, stepMax: 1, min: -360, max: 360 };
      case "detChi":
        return { eps: 0.05, stepMax: 1, min: -90, max: 90 };
      default:
        return { eps: 0.05, stepMax: 1, min: -1e6, max: 1e6 };
    }
  }

  function clampRefinementConfig(cfg, paramKeys, imageSize) {
    syncBeamFromOffsets(cfg, imageSize);
    for (const key of paramKeys) {
      const meta = refinementParamMeta(key, cfg);
      cfg[key] = clamp(cfg[key], meta.min, meta.max);
    }
    syncBeamFromOffsets(cfg, imageSize);
    return cfg;
  }

  const MISSING_REFLECTION_PENALTY_PX = 1000;

  function matchResidualStats(params, cfg, imageSize, obs, isAllowed) {
    const penaltySq = MISSING_REFLECTION_PENALTY_PX * MISSING_REFLECTION_PENALTY_PX;
    let sumSq = 0;
    let count = 0;
    let missing = 0;

    for (const obsPeak of obs) {
      const pred = projectHKL(params, [obsPeak.matchedH, obsPeak.matchedK, obsPeak.matchedL], cfg, imageSize);
      if (!pred) {
        missing += 1;
        sumSq += penaltySq;
        count += 2;
        continue;
      }
      const rx = pred.x - obsPeak.x;
      const ry = pred.y - obsPeak.y;
      sumSq += rx * rx + ry * ry;
      count += 2;
    }

    if (!count) return { rms: null, missing: obs.length };
    return { rms: Math.sqrt(sumSq / count), missing };
  }

  function matchResidualRms(params, cfg, imageSize, obs, isAllowed) {
    return matchResidualStats(params, cfg, imageSize, obs, isAllowed).rms;
  }

  function copyConfig(cfg) {
    return { ...cfg, sampleSigns: cfg.sampleSigns ? { ...cfg.sampleSigns } : undefined };
  }

  /**
   * Least-squares refinement with scaled steps, bounds, line search, and LM damping.
   */
  async function refineOrientation(params, config, imageSize, observedPeaks, refineFlags, isAllowed, maxIter, options) {
    const opts = options || {};
    const flags = refineFlags || { sampleOmega: true, sampleChi: true, samplePhi: true };
    const paramKeys = [
      "sampleOmega", "sampleChi", "samplePhi",
      "detDistance", "detOffsetX", "detOffsetY",
      "detOmega", "detChi"
    ].filter((key) => flags[key]);

    if (!paramKeys.length || !observedPeaks.length) {
      return { config: { ...config }, rms: null, iterations: 0, improved: false };
    }

    const cfg0 = clampRefinementConfig(copyConfig(config), paramKeys, imageSize);
    const obs = observedPeaks.filter((p) => p.matchedH !== undefined);
    if (!obs.length) {
      return { config: cfg0, rms: null, iterations: 0, improved: false };
    }

    const initialStats = matchResidualStats(params, cfg0, imageSize, obs, isAllowed);
    const initialRms = initialStats.rms;
    const initialMissing = initialStats.missing;
    if (initialRms == null) {
      return { config: cfg0, rms: null, iterations: 0, improved: false };
    }

    let cfg = copyConfig(cfg0);
    let bestCfg = copyConfig(cfg0);
    let bestRms = initialRms;
    let bestMissing = initialMissing;
    let rms = initialRms;
    let lambda = 0.01;
    let iterations = 0;

    for (let iter = 0; iter < (maxIter || 40); iter += 1) {
      iterations = iter + 1;
      syncBeamFromOffsets(cfg, imageSize);

      const residuals = [];
      const jacobian = [];

      for (const obsPeak of obs) {
        const hkl = [obsPeak.matchedH, obsPeak.matchedK, obsPeak.matchedL];
        const pred = projectHKL(params, hkl, cfg, imageSize);
        if (!pred) continue;
        residuals.push(pred.x - obsPeak.x, pred.y - obsPeak.y);

        const rowX = [];
        const rowY = [];
        for (const pk of paramKeys) {
          const meta = refinementParamMeta(pk, cfg);
          const saved = cfg[pk];
          const h = meta.eps;

          cfg[pk] = saved + h;
          syncBeamFromOffsets(cfg, imageSize);
          const pp = projectHKL(params, hkl, cfg, imageSize);
          cfg[pk] = saved - h;
          syncBeamFromOffsets(cfg, imageSize);
          const pm = projectHKL(params, hkl, cfg, imageSize);
          cfg[pk] = saved;
          syncBeamFromOffsets(cfg, imageSize);

          if (pp && pm) {
            rowX.push((pp.x - pm.x) / (2 * h));
            rowY.push((pp.y - pm.y) / (2 * h));
          } else if (pp) {
            rowX.push((pp.x - pred.x) / h);
            rowY.push((pp.y - pred.y) / h);
          } else {
            rowX.push(0);
            rowY.push(0);
          }
        }
        jacobian.push(rowX, rowY);
      }

      if (residuals.length < paramKeys.length) break;

      const iterStats = matchResidualStats(params, cfg, imageSize, obs, isAllowed);
      rms = iterStats.rms;
      if (typeof opts.onProgress === "function") {
        opts.onProgress({
          iteration: iterations,
          maxIterations: maxIter || 40,
          rms,
          bestRms,
          missing: iterStats.missing,
          matched: obs.length
        });
      }
      if (typeof opts.yieldToBrowser === "function") {
        await opts.yieldToBrowser();
      }

      const nParams = paramKeys.length;
      const nRes = residuals.length;
      const jtj = Array.from({ length: nParams }, () => Array(nParams).fill(0));
      const jtr = Array(nParams).fill(0);

      for (let i = 0; i < nRes; i += 1) {
        for (let a = 0; a < nParams; a += 1) {
          jtr[a] += jacobian[i][a] * residuals[i];
          for (let b = 0; b < nParams; b += 1) {
            jtj[a][b] += jacobian[i][a] * jacobian[i][b];
          }
        }
      }

      for (let d = 0; d < nParams; d += 1) {
        const diag = Math.max(jtj[d][d], 1e-8);
        jtj[d][d] = diag * (1 + lambda);
      }

      const delta = solveSymmetric(jtj, jtr.map((v) => -v));
      if (!delta) break;

      let accepted = false;
      for (let ls = 0; ls < 10; ls += 1) {
        const scale = Math.pow(0.5, ls);
        const trial = copyConfig(cfg);
        for (let i = 0; i < nParams; i += 1) {
          const key = paramKeys[i];
          const meta = refinementParamMeta(key, trial);
          const step = clamp(delta[i] * scale, -meta.stepMax, meta.stepMax);
          trial[key] += step;
        }
        clampRefinementConfig(trial, paramKeys, imageSize);
        const trialStats = matchResidualStats(params, trial, imageSize, obs, isAllowed);
        if (trialStats.rms != null
          && trialStats.missing <= iterStats.missing
          && trialStats.rms < rms) {
          cfg = trial;
          rms = trialStats.rms;
          accepted = true;
          lambda = Math.max(lambda * 0.3, 1e-4);
          if (rms < bestRms || (Math.abs(rms - bestRms) < 1e-6 && trialStats.missing < bestMissing)) {
            bestRms = rms;
            bestMissing = trialStats.missing;
            bestCfg = copyConfig(cfg);
          }
          break;
        }
      }

      if (!accepted) {
        lambda = Math.min(lambda * 5, 1e3);
        if (lambda > 100) break;
        continue;
      }

      let maxStep = 0;
      for (let i = 0; i < nParams; i += 1) {
        maxStep = Math.max(maxStep, Math.abs(delta[i]));
      }
      if (maxStep < 1e-4) break;
    }

    const improved = bestRms < initialRms - 1e-6 && bestMissing <= initialMissing;
    const stable = Number.isFinite(bestRms) && bestRms < initialRms * 5 && bestRms < 500;
    return {
      config: stable ? bestCfg : cfg0,
      rms: stable ? bestRms : initialRms,
      initialRms,
      iterations,
      improved: improved && stable
    };
  }

  function solveSymmetric(a, b) {
    const n = b.length;
    const m = a.map((row) => row.slice());
    const x = b.slice();
    for (let i = 0; i < n; i += 1) {
      let pivot = m[i][i];
      if (Math.abs(pivot) < 1e-12) return null;
      for (let j = i; j < n; j += 1) m[i][j] /= pivot;
      x[i] /= pivot;
      for (let k = 0; k < n; k += 1) {
        if (k === i) continue;
        const factor = m[k][i];
        for (let j = i; j < n; j += 1) m[k][j] -= factor * m[i][j];
        x[k] -= factor * x[i];
      }
    }
    return x;
  }

  /**
   * Compare how close two reciprocal directions are to the lab-frame targets used in
   * projection: direct beam along +x; “horizontal” = plane perpendicular to the beam.
   */
  function idealOrientationDeviation(params, currentAngles, targetBeamHKL, targetHorizHKL, signs) {
    const ub = ubMatrix(params, currentAngles.omega, currentAngles.chi, currentAngles.phi, signs);
    const beamVec = normalize(reciprocalVector(targetBeamHKL, ub));
    const horizVec = normalize(reciprocalVector(targetHorizHKL, ub));
    const beamDir = [1, 0, 0];
    const refHorizInPlane = normalize([0, 1, 0]);

    const beamDot = dot(beamVec, beamDir);
    const beamMisalignmentDeg = radToDeg(Math.acos(clamp(beamDot, -1, 1)));

    const horizOutOfPlane = Math.abs(dot(horizVec, beamDir));
    const horizontalMisalignmentDeg = radToDeg(Math.asin(clamp(horizOutOfPlane, 0, 1)));

    const horizProj = subtract(horizVec, scale(beamDir, dot(horizVec, beamDir)));
    const horizNorm = norm(horizProj);
    let inPlaneAzimuthDeg = 0;
    if (horizNorm > 1e-10) {
      const refProj = subtract(refHorizInPlane, scale(beamDir, dot(refHorizInPlane, beamDir)));
      const refNorm = norm(refProj);
      if (refNorm > 1e-10) {
        inPlaneAzimuthDeg = radToDeg(Math.acos(clamp(
          Math.abs(dot(normalize(horizProj), normalize(refProj))),
          0,
          1
        )));
      }
    }

    const idealHoriz = horizNorm > 1e-10
      ? normalize(horizProj)
      : refHorizInPlane;
    const idealNormal = normalize(cross(beamVec, idealHoriz));
    const currentBasis = matrixFromColumns(beamVec, idealHoriz, idealNormal);
    const targetBasis = matrixFromColumns(beamDir, refHorizInPlane, [0, 0, 1]);
    const correction = mat3Mul(targetBasis, transpose3(currentBasis));
    const rotations = decomposeBeamAlignmentRotation(correction);

    return {
      beamMisalignmentDeg,
      horizontalMisalignmentDeg,
      inPlaneAzimuthDeg,
      verticalAxisRotationDeg: rotations.vertical,
      horizontalAxisRotationDeg: rotations.horizontal,
      beamNormalRotationDeg: rotations.beamNormal,
      currentBeamDot: beamDot,
      currentHorizOutOfPlane: horizOutOfPlane
    };
  }

  function transpose3(m) {
    return [
      [m[0][0], m[1][0], m[2][0]],
      [m[0][1], m[1][1], m[2][1]],
      [m[0][2], m[1][2], m[2][2]]
    ];
  }

  function decomposeBeamAlignmentRotation(r) {
    const beta = Math.asin(clamp(r[0][2], -1, 1));
    const cb = Math.cos(beta);
    let alpha = 0;
    let gamma = 0;
    if (Math.abs(cb) > 1e-8) {
      alpha = Math.atan2(-r[0][1], r[0][0]);
      gamma = Math.atan2(-r[1][2], r[2][2]);
    } else {
      alpha = Math.atan2(r[1][0], r[1][1]);
    }
    return {
      vertical: radToDeg(alpha),
      horizontal: radToDeg(beta),
      beamNormal: radToDeg(gamma)
    };
  }

  function alignHKLToBeam(params, hkl, angles, signs, maxIter) {
    let omega = angles.omega;
    let chi = angles.chi;
    let phi = angles.phi;
    const target = [1, 0, 0];

    function beamAlignment(o, c, p) {
      const ub = ubMatrix(params, o, c, p, signs);
      const g = reciprocalVector(hkl, ub);
      const n = norm(g);
      if (n < 1e-14) return -1;
      return dot(scale(g, 1 / n), target);
    }

    let step = 2.5;
    for (let iter = 0; iter < (maxIter || 100); iter += 1) {
      const current = beamAlignment(omega, chi, phi);
      if (current > 0.99999) break;

      let best = current;
      let bestO = omega;
      let bestC = chi;
      let bestP = phi;
      const trials = [
        [step, 0, 0], [-step, 0, 0],
        [0, step, 0], [0, -step, 0],
        [0, 0, step], [0, 0, -step]
      ];
      for (const [dO, dC, dP] of trials) {
        const score = beamAlignment(omega + dO, chi + dC, phi + dP);
        if (score > best) {
          best = score;
          bestO = omega + dO;
          bestC = chi + dC;
          bestP = phi + dP;
        }
      }

      if (best <= current + 1e-9) step *= 0.5;
      else {
        omega = bestO;
        chi = bestC;
        phi = bestP;
      }
      if (step < 1e-4) break;
    }

    return {
      omega,
      chi,
      phi,
      alignment: beamAlignment(omega, chi, phi)
    };
  }

  function autoDetectPeaks(intensities, width, height, threshold, minRadius, options) {
    const opts = {
      minPixels: Math.max(4, Math.round(Math.PI * Math.max(1, minRadius) ** 2 * 0.35)),
      minSigmaPx: Math.max(0.6, minRadius * 0.25),
      maxSigmaPx: Math.max(3, minRadius * 4),
      minIntegratedSignal: 0,
      beamX: width / 2,
      beamY: height / 2,
      ...options
    };

    const visited = new Uint8Array(width * height);
    const peaks = [];
    const neighbors = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [1, 0],
      [-1, 1], [0, 1], [1, 1]
    ];

    function idx(x, y) {
      return y * width + x;
    }

    for (let y0 = 0; y0 < height; y0 += 1) {
      for (let x0 = 0; x0 < width; x0 += 1) {
        const start = idx(x0, y0);
        if (visited[start] || intensities[start] < threshold) continue;

        const stack = [[x0, y0]];
        visited[start] = 1;

        const pixels = [];
        let maxVal = -Infinity;
        let maxX = x0;
        let maxY = y0;

        while (stack.length) {
          const [x, y] = stack.pop();
          const i = idx(x, y);
          const val = intensities[i];

          pixels.push([x, y, val]);

          if (val > maxVal) {
            maxVal = val;
            maxX = x;
            maxY = y;
          }

          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

            const ni = idx(nx, ny);
            if (visited[ni]) continue;

            visited[ni] = 1;
            if (intensities[ni] >= threshold) {
              stack.push([nx, ny]);
            }
          }
        }

        if (pixels.length < opts.minPixels) continue;

        let wSum = 0;
        let xSum = 0;
        let ySum = 0;
        let signalSum = 0;

        for (const [x, y, val] of pixels) {
          const w = Math.max(0, val - threshold);
          wSum += w;
          xSum += w * x;
          ySum += w * y;
          signalSum += w;
        }

        if (wSum <= 0 || signalSum < opts.minIntegratedSignal) continue;

        const cx = xSum / wSum;
        const cy = ySum / wSum;

        let mxx = 0;
        let myy = 0;
        let mxy = 0;

        for (const [x, y, val] of pixels) {
          const w = Math.max(0, val - threshold);
          const dx = x - cx;
          const dy = y - cy;
          mxx += w * dx * dx;
          myy += w * dy * dy;
          mxy += w * dx * dy;
        }

        mxx /= wSum;
        myy /= wSum;
        mxy /= wSum;

        const trace = mxx + myy;
        const detTerm = Math.sqrt(Math.max(0, (mxx - myy) ** 2 + 4 * mxy * mxy));
        const lambda1 = Math.max(0, 0.5 * (trace + detTerm));
        const lambda2 = Math.max(0, 0.5 * (trace - detTerm));

        const sigmaMajor = Math.sqrt(lambda1);
        const sigmaMinor = Math.sqrt(lambda2);

        if (sigmaMajor < opts.minSigmaPx || sigmaMinor < opts.minSigmaPx * 0.35) continue;
        if (sigmaMajor > opts.maxSigmaPx) continue;

        const bx = opts.beamX;
        const by = opts.beamY;
        const rx = cx - bx;
        const ry = cy - by;
        const rr = Math.hypot(rx, ry);

        let sigmaRadial = sigmaMajor;
        let sigmaTransverse = sigmaMinor;

        if (rr > 1e-6) {
          const erx = rx / rr;
          const ery = ry / rr;
          const etx = -ery;
          const ety = erx;

          const varRadial = erx * erx * mxx + 2 * erx * ery * mxy + ery * ery * myy;
          const varTransverse = etx * etx * mxx + 2 * etx * ety * mxy + ety * ety * myy;

          sigmaRadial = Math.sqrt(Math.max(0, varRadial));
          sigmaTransverse = Math.sqrt(Math.max(0, varTransverse));
        }

        peaks.push({
          x: cx,
          y: cy,
          maxX,
          maxY,
          intensity: maxVal,
          integratedIntensity: signalSum,
          areaPixels: pixels.length,
          sigmaMajor,
          sigmaMinor,
          sigmaRadial,
          sigmaTransverse,
          id: peaks.length
        });
      }
    }

    peaks.sort((a, b) => b.integratedIntensity - a.integratedIntensity);

    const minSep = Math.max(2, minRadius * 1.5);
    const minSepSq = minSep * minSep;
    const filtered = [];

    for (const peak of peaks) {
      let tooClose = false;
      for (const kept of filtered) {
        const dx = peak.x - kept.x;
        const dy = peak.y - kept.y;
        if (dx * dx + dy * dy < minSepSq) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        peak.id = filtered.length;
        filtered.push(peak);
      }
    }

    return filtered;
  }

  function matchObservedToPredicted(observed, predicted, maxDistPx) {
    const maxDistSq = maxDistPx * maxDistPx;
    const used = new Set();

    const matched = observed.map((obs) => {
      const clean = { ...obs };
      delete clean.matchedH;
      delete clean.matchedK;
      delete clean.matchedL;
      delete clean.matchDist;
      return clean;
    });

    for (const obs of matched) {
      let best = null;
      let bestDist = maxDistSq;
      for (let i = 0; i < predicted.length; i += 1) {
        if (used.has(i)) continue;
        const dx = obs.x - predicted[i].x;
        const dy = obs.y - predicted[i].y;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDist) {
          bestDist = dSq;
          best = { index: i, peak: predicted[i] };
        }
      }
      if (best) {
        used.add(best.index);
        obs.matchedH = best.peak.h;
        obs.matchedK = best.peak.k;
        obs.matchedL = best.peak.l;
        obs.matchDist = Math.sqrt(bestDist);
      }
    }
    return matched;
  }

  global.LaueMath = {
    dot,
    cross,
    add,
    subtract,
    scale,
    norm,
    normalize,
    degToRad,
    radToDeg,
    directLatticeVectors,
    reciprocalBasis,
    bMatrix,
    uMatrix,
    sampleEulerFromUMatrix,
    panSampleOrientationTrackPoint,
    rotateSampleOrientationAboutBeam,
    ubMatrix,
    reciprocalVector,
    enumerateHKL,
    detectorNormal,
    detectorAnglesFromNormal,
    migrateLegacyDetectorAngles,
    detectorBasis,
    peakOnImage,
    projectReflection,
    projectHKL,
    computePredictedPeaks,
    refineOrientation,
    idealOrientationDeviation,
    alignHKLToBeam,
    autoDetectPeaks,
    matchObservedToPredicted
  };
})(window);
