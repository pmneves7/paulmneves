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
    if (![a,b,c].every(v => Number.isFinite(v) && v > 0) ||
      ![alpha,beta,gamma].every(v => Number.isFinite(v) && v > 0 && v < 180)) {
      throw new Error("Cell lengths must be positive and angles must lie between 0 and 180°.");
    }
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

  const HKL_CACHE = new Map();

  function enumerateHKL(maxHklSq) {
    const key = Math.max(0, Math.floor(maxHklSq || 0));
    if (HKL_CACHE.has(key)) return HKL_CACHE.get(key);
    const limit = hklIndexLimit(key);
    const list = [];
    for (let h = -limit; h <= limit; h += 1) {
      for (let k = -limit; k <= limit; k += 1) {
        for (let l = -limit; l <= limit; l += 1) {
          if (h === 0 && k === 0 && l === 0) continue;
          const sq = h * h + k * k + l * l;
          if (sq <= key) list.push([h, k, l, sq]);
        }
      }
    }
    HKL_CACHE.set(key, list);
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
  function projectionGeometry(config, imageSize) {
    const n = detectorNormal(config.detOmega, config.detChi, config.laueMode);
    const basis = detectorBasis(n);
    const detWidth = Math.max(config.detWidth, 1e-6);
    const detHeight = Math.max(config.detHeight, 1e-6);
    return {
      basis,
      planePoint: scale(basis.normal, config.detDistance),
      pxPerMmX: imageSize.width / detWidth,
      pxPerMmY: imageSize.height / detHeight,
      beamX: config.beamX,
      beamY: config.beamY
    };
  }

  function projectReflectionWithGeometry(gLab, config, imageSize, geom) {
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

    const geomData = geom || projectionGeometry(config, imageSize);

    const denom = dot(direction, geomData.basis.normal);
    if (Math.abs(denom) < 1e-10) return null;
    const t = dot(subtract(geomData.planePoint, [0, 0, 0]), geomData.basis.normal) / denom;
    if (t <= 0) return null;

    const hit = scale(direction, t);
    const rel = subtract(hit, geomData.planePoint);
    const xLab = dot(rel, geomData.basis.u);
    const yLab = dot(rel, geomData.basis.v);

    const cx = geomData.beamX + xLab * geomData.pxPerMmX;
    const cy = geomData.beamY + yLab * geomData.pxPerMmY;

    return { x: cx, y: cy, q: qMag, lambda, xLab, yLab };
  }

  function projectReflection(gLab, config, imageSize) {
    return projectReflectionWithGeometry(gLab, config, imageSize, null);
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
    const geom = projectionGeometry(config, imageSize);
    const peaks = [];

    for (const [h, k, l, sq] of hkls) {
      if (isAllowed && !isAllowed(h, k, l)) continue;
      const g = reciprocalVector([h, k, l], ub);
      const proj = projectReflectionWithGeometry(g, config, imageSize, geom);
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

  function copyConfig(cfg) {
    return { ...cfg, sampleSigns: cfg.sampleSigns ? { ...cfg.sampleSigns } : undefined };
  }

  function refinementSteps(flags, cfg) {
    const steps = [];
    if (flags.sampleOmega && flags.sampleChi && flags.samplePhi) {
      // Refine a local rotation, then convert back to display Euler angles. The
      // tangent coordinates remain independent at Euler gimbal lock.
      for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) steps.push({ kind: "sample", axis, scale: 2 });
    } else {
      for (const key of ["sampleOmega", "sampleChi", "samplePhi"]) {
        if (flags[key]) steps.push({ key, scale: 2 });
      }
    }
    if (flags.detDistance) steps.push({ key: "detDistance", scale: Math.max(1, cfg.detDistance * 0.1) });
    for (const key of ["detOffsetX", "detOffsetY"]) if (flags[key]) steps.push({ key, scale: 8 });
    if (flags.detOmega && flags.detChi) {
      // Detector azimuth alone is undefined at zero tilt. Two tangent rotations
      // of its normal avoid the polar-coordinate singularity there.
      const basis = detectorBasis(detectorNormal(cfg.detOmega, cfg.detChi, cfg.laueMode));
      steps.push({ kind: "detector", axis: basis.u, scale: 2 }, { kind: "detector", axis: basis.v, scale: 2 });
    } else {
      for (const key of ["detOmega", "detChi"]) if (flags[key]) steps.push({ key, scale: 2 });
    }
    return steps;
  }

  function applyRefinementStep(cfg, steps, delta, imageSize) {
    const out = copyConfig(cfg);
    let sampleRotation = [0, 0, 0];
    let detectorRotation = [0, 0, 0];
    steps.forEach((step, i) => {
      const value = delta[i] * step.scale;
      if (step.kind === "sample") sampleRotation = add(sampleRotation, scale(step.axis, value));
      else if (step.kind === "detector") detectorRotation = add(detectorRotation, scale(step.axis, value));
      else out[step.key] += value;
    });
    if (norm(sampleRotation) > 0) {
      const rotated = mat3Mul(rotAxis(sampleRotation, degToRad(norm(sampleRotation))),
        uMatrix(cfg.sampleOmega, cfg.sampleChi, cfg.samplePhi, cfg.sampleSigns));
      const angles = sampleEulerFromUMatrix(rotated, cfg.sampleSigns);
      out.sampleOmega = wrapAngleNear(angles.omega, cfg.sampleOmega);
      out.sampleChi = wrapAngleNear(angles.chi, cfg.sampleChi);
      out.samplePhi = wrapAngleNear(angles.phi, cfg.samplePhi);
    }
    if (norm(detectorRotation) > 0) {
      const normal = mat3Vec(rotAxis(detectorRotation, degToRad(norm(detectorRotation))),
        detectorNormal(cfg.detOmega, cfg.detChi, cfg.laueMode));
      const angles = detectorAnglesFromNormal(normal, cfg.laueMode);
      out.detOmega = wrapAngleNear(angles.detOmega, cfg.detOmega);
      out.detChi = angles.detChi;
    }
    syncBeamFromOffsets(out, imageSize);
    return out;
  }

  function refinementRank(jacobian, nParams) {
    // Column-pivoted Gram–Schmidt on normalized columns: rank is independent
    // of the different degree/mm/pixel units used by the controls.
    const columns = Array.from({ length: nParams }, (_, j) => jacobian.map(row => row[j]));
    const length = v => Math.sqrt(v.reduce((sum, x) => sum + x*x, 0));
    for (const column of columns) {
      const n = length(column);
      if (n > 0) for (let i = 0; i < column.length; i++) column[i] /= n;
    }
    let rank = 0;
    let smallest = 1;
    for (let j = 0; j < nParams; j++) {
      let pivot = j;
      for (let k = j + 1; k < nParams; k++) if (length(columns[k]) > length(columns[pivot])) pivot = k;
      [columns[j], columns[pivot]] = [columns[pivot], columns[j]];
      const n = length(columns[j]);
      if (n < 1e-6) break;
      smallest = Math.min(smallest, n);
      rank++;
      for (let i = 0; i < columns[j].length; i++) columns[j][i] /= n;
      for (let k = j + 1; k < nParams; k++) {
        // Reorthogonalize to distinguish small true directions from roundoff.
        for (let pass = 0; pass < 2; pass++) {
          let projection = 0;
          for (let i = 0; i < columns[j].length; i++) projection += columns[j][i] * columns[k][i];
          for (let i = 0; i < columns[j].length; i++) columns[k][i] -= projection * columns[j][i];
        }
      }
    }
    return { rank, coupled: smallest < 1e-3 };
  }

  /** Local, robust spot refinement. Index assignments stay fixed during a fit. */
  async function refineOrientation(params, config, imageSize, observedPeaks, refineFlags, isAllowed, maxIter, options) {
    const opts = options || {};
    const flags = refineFlags || { sampleOmega: true, sampleChi: true, samplePhi: true };
    const cfg0 = copyConfig(config);
    const limit = Number.isFinite(maxIter) ? Math.max(1, Math.floor(maxIter)) : 80;
    const robust = opts.robust !== false;
    const lossScale = Number.isFinite(opts.outlierScalePx) && opts.outlierScalePx > 0 ? opts.outlierScalePx : 2;
    const result = { config: cfg0, rms: null, initialRms: null, iterations: 0, improved: false, converged: false,
      status: "invalid_input", message: "Check the crystal, detector dimensions, distance and angles.", excluded: 0 };
    if (!imageSize || ![imageSize.width, imageSize.height, config.detWidth, config.detHeight, config.detDistance]
      .every(v => Number.isFinite(v) && v > 0) ||
      ![config.sampleOmega, config.sampleChi, config.samplePhi, config.detOmega, config.detChi,
        config.detOffsetX ?? 0, config.detOffsetY ?? 0].every(Number.isFinite)) return result;
    cfg0.detOffsetX = config.detOffsetX ?? 0;
    cfg0.detOffsetY = config.detOffsetY ?? 0;
    syncBeamFromOffsets(cfg0, imageSize);
    let basis;
    try { basis = bMatrix(params); } catch (error) { result.message = error.message; return result; }
    const initialSteps = refinementSteps(flags, cfg0);
    const nParams = initialSteps.length;
    if (!nParams) return { ...result, status: "no_parameters", message: "Select at least one parameter to refine." };
    const observations = [];
    const directions = new Set();
    for (const peak of observedPeaks || []) {
      const hkl = [peak.matchedH, peak.matchedK, peak.matchedL];
      if (![peak.x, peak.y, ...hkl].every(Number.isFinite) || !hkl.every(Number.isInteger) || hkl.every(v => v === 0) ||
        (isAllowed && !isAllowed(...hkl))) { result.excluded++; continue; }
      const g = mat3Vec(basis, hkl);
      const direction = normalize(g).map(v => Math.round(v * 1e9)).join(",");
      if (directions.has(direction)) { result.excluded++; continue; }
      directions.add(direction);
      observations.push({ ...peak, g });
    }
    const initialU = uMatrix(cfg0.sampleOmega, cfg0.sampleChi, cfg0.samplePhi, cfg0.sampleSigns);
    const active = observations.filter(peak => {
      const visible = projectReflection(mat3Vec(initialU, peak.g), cfg0, imageSize);
      if (!visible) result.excluded++;
      return visible;
    });
    const minPeaks = Math.floor(nParams / 2) + 1;
    result.used = active.length;
    if (active.length < minPeaks) return { ...result, status: "insufficient_matches",
      message: `Need at least ${minPeaks} valid matched spots for ${nParams} selected parameters.` };

    function evaluate(cfg) {
      if (!(cfg.detDistance > 0) || !Number.isFinite(cfg.detDistance)) return null;
      const rotation = uMatrix(cfg.sampleOmega, cfg.sampleChi, cfg.samplePhi, cfg.sampleSigns);
      const geometry = projectionGeometry(cfg, imageSize);
      const residuals = [];
      const weights = [];
      const distances = [];
      let cost = 0;
      for (const peak of active) {
        const pred = projectReflectionWithGeometry(mat3Vec(rotation, peak.g), cfg, imageSize, geometry);
        // Never improve the score by dropping a reflection from the detector.
        if (!pred || !Number.isFinite(pred.x) || !Number.isFinite(pred.y)) return null;
        const dx = pred.x - peak.x, dy = pred.y - peak.y;
        const distance = Math.hypot(dx, dy);
        residuals.push(dx, dy);
        distances.push(distance);
        // Huber loss on each 2D spot distance; x/y receive the same weight.
        const weight = robust && distance > lossScale ? lossScale / distance : 1;
        weights.push(weight, weight);
        cost += robust && distance > lossScale ? 2 * lossScale * distance - lossScale ** 2 : distance ** 2;
      }
      return { residuals, weights, distances, cost,
        rms: Math.sqrt(distances.reduce((sum, d) => sum + d * d, 0) / active.length) };
    }
    function jacobianAt(cfg, steps, current) {
      const jacobian = current.residuals.map(() => []);
      for (let j = 0; j < nParams; j++) {
        const step = Array(nParams).fill(0);
        const h = 1e-4;
        step[j] = h;
        const plus = evaluate(applyRefinementStep(cfg, steps, step, imageSize));
        step[j] = -h;
        const minus = evaluate(applyRefinementStep(cfg, steps, step, imageSize));
        for (let i = 0; i < jacobian.length; i++) {
          jacobian[i][j] = plus && minus ? (plus.residuals[i] - minus.residuals[i]) / (2 * h)
            : plus ? (plus.residuals[i] - current.residuals[i]) / h
              : minus ? (current.residuals[i] - minus.residuals[i]) / h : 0;
        }
      }
      return jacobian;
    }
    let cfg = copyConfig(cfg0);
    let current = evaluate(cfg);
    if (!current) return result;
    const initialCost = current.cost;
    result.initialRms = current.rms;
    result.status = "max_iterations";
    let lambda = 1e-3;
    let rankInfo;
    for (let iteration = 0; iteration < limit; iteration++) {
      result.iterations = iteration + 1;
      if (opts.shouldCancel?.()) return { ...result, status: "cancelled", message: "Refinement cancelled; parameters were not changed." };
      opts.onProgress?.({ iteration: iteration + 1, maxIterations: limit, rms: current.rms,
        bestRms: current.rms, matched: active.length, missing: 0 });
      if (opts.yieldToBrowser) await opts.yieldToBrowser();
      if (opts.shouldCancel?.()) return { ...result, status: "cancelled", message: "Refinement cancelled; parameters were not changed." };
      const steps = refinementSteps(flags, cfg);
      const jacobian = jacobianAt(cfg, steps, current);
      rankInfo = refinementRank(jacobian, nParams);
      if (rankInfo.rank < nParams) {
        let message = `Only ${rankInfo.rank} of ${nParams} parameter directions are constrained. Add well-separated spots or select fewer parameters.`;
        if (flags.detOmega && !flags.detChi && Math.abs(Math.sin(degToRad(cfg.detChi))) < 1e-8) {
          message = "Detector Ω is undefined at zero tilt. Select Detector χ as well, or keep Detector Ω fixed.";
        }
        return { ...result, status: "underconstrained", rank: rankInfo.rank, message };
      }
      if (current.cost < 1e-16) { result.status = "converged"; break; }
      const normal = Array.from({ length: nParams }, () => Array(nParams).fill(0));
      const gradient = Array(nParams).fill(0);
      for (let i = 0; i < jacobian.length; i++) for (let j = 0; j < nParams; j++) {
        gradient[j] += current.weights[i] * jacobian[i][j] * current.residuals[i];
        for (let k = 0; k < nParams; k++) normal[j][k] += current.weights[i] * jacobian[i][j] * jacobian[i][k];
      }
      const scales = normal.map((row, i) => Math.sqrt(Math.max(row[i], 1e-24)));
      const system = normal.map((row, i) => row.map((v, j) => v / (scales[i] * scales[j]) + (i === j ? lambda : 0)));
      const rhs = gradient.map((v, i) => -v / scales[i]);
      if (Math.max(...rhs.map(Math.abs)) < 1e-8) { result.status = "converged"; break; }
      const solution = solveSymmetric(system, rhs);
      if (!solution) { result.status = "no_progress"; break; }
      const delta = solution.map((v, i) => v / scales[i]);
      // Limit the whole vector, preserving its descent direction.
      const trustScale = 1 / Math.max(1, ...delta.map(Math.abs));
      let accepted = false;
      for (let line = 0; line < 12; line++) {
        const factor = trustScale * 2 ** -line;
        const trial = applyRefinementStep(cfg, steps, delta.map(v => v * factor), imageSize);
        const next = evaluate(trial);
        if (next && next.cost < current.cost) {
          const reduction = current.cost - next.cost;
          cfg = trial; current = next; accepted = true;
          lambda = Math.max(1e-9, lambda * .3);
          if (reduction < 1e-10 * Math.max(1, current.cost) || Math.max(...delta.map(v => Math.abs(v * factor))) < 1e-7) result.status = "converged";
          break;
        }
      }
      if (result.status === "converged") break;
      if (!accepted) {
        lambda *= 10;
        if (lambda > 1e8) { result.status = "no_progress"; break; }
      }
    }
    const inliers = current.distances.map(d => !robust || d <= 3 * lossScale);
    const inlierCount = inliers.filter(Boolean).length;
    const finalJacobian = jacobianAt(cfg, refinementSteps(flags, cfg), current);
    const inlierJacobian = finalJacobian.filter((_, i) => inliers[Math.floor(i / 2)]);
    if (inlierCount < minPeaks || refinementRank(inlierJacobian, nParams).rank < nParams) return {
      ...result, status: "underconstrained", message: "Too few independent inlier spots support this fit. Add spots or refine fewer parameters." };
    const improved = current.cost < initialCost - Math.max(1e-12, initialCost * 1e-10);
    const messages = {
      converged: improved ? "Fit converged." : "Already converged; parameters were not changed.",
      max_iterations: "Iteration limit reached; the best fit is available but may need another run.",
      no_progress: "No further improvement; check the indexing and selected parameters."
    };
    return { ...result, config: improved ? cfg : cfg0, rms: current.rms, improved,
      converged: result.status === "converged", message: messages[result.status],
      inliers: inlierCount, outliers: active.length - inlierCount,
      inlierRms: Math.sqrt(current.distances.reduce((sum, d, i) => sum + (inliers[i] ? d * d : 0), 0) / inlierCount),
      coupled: rankInfo?.coupled || refinementRank(finalJacobian, nParams).coupled };
  }

  function solveSymmetric(a, b) {
    const n = b.length;
    const m = a.map((row, i) => [...row, b[i]]);
    for (let i = 0; i < n; i++) {
      let pivot = i;
      for (let j = i + 1; j < n; j++) if (Math.abs(m[j][i]) > Math.abs(m[pivot][i])) pivot = j;
      if (!Number.isFinite(m[pivot][i]) || Math.abs(m[pivot][i]) < 1e-14) return null;
      [m[i], m[pivot]] = [m[pivot], m[i]];
      const divisor = m[i][i];
      for (let j = i; j <= n; j++) m[i][j] /= divisor;
      for (let k = 0; k < n; k++) {
        if (k === i) continue;
        const factor = m[k][i];
        for (let j = i; j <= n; j++) m[k][j] -= factor * m[i][j];
      }
    }
    return m.map(row => row[n]);
  }

  /** Align the first reciprocal direction to +x and the second to the horizontal xy scattering plane. */
  function idealOrientationDeviation(params, currentAngles, targetBeamHKL, targetHorizHKL, signs) {
    if (![...targetBeamHKL, ...targetHorizHKL, currentAngles.omega, currentAngles.chi, currentAngles.phi].every(Number.isFinite)) {
      throw new Error("Enter finite angles and HKL triples.");
    }
    const ub = ubMatrix(params, currentAngles.omega, currentAngles.chi, currentAngles.phi, signs);
    const beam = reciprocalVector(targetBeamHKL, ub), horizontal = reciprocalVector(targetHorizHKL, ub);
    if (norm(beam) < 1e-12 || norm(horizontal) < 1e-12) throw new Error("An HKL direction cannot be 0 0 0.");
    const beamVec = normalize(beam), horizVec = normalize(horizontal);
    const intrinsicDot = clamp(dot(beamVec, horizVec), -1, 1);
    if (norm(cross(beamVec, horizVec)) < 1e-8) throw new Error("The two HKL directions must not be parallel; a parallel direction cannot define the scattering plane.");
    // Build an orthonormal CURRENT frame. The second HKL need not be
    // perpendicular to the first: its beam-parallel component is preserved.
    const currentHorizontal = normalize(subtract(horizVec, scale(beamVec, intrinsicDot)));
    const currentNormal = normalize(cross(beamVec, currentHorizontal));
    const currentBasis = matrixFromColumns(beamVec, currentHorizontal, currentNormal);
    const positive = transpose3(currentBasis);
    // Either side of the horizontal plane is ideal. Choose the proper rotation
    // with the greater trace (smaller rotation angle), avoiding a needless 180°.
    const side = positive[1][1] + positive[2][2] >= 0 ? 1 : -1;
    const correction = positive.map((row, i) => row.map(v => v * (i === 0 ? 1 : side)));
    const rotations = decomposeBeamAlignmentRotation(correction);
    const beamDot = clamp(beamVec[0], -1, 1);
    const trace = correction[0][0] + correction[1][1] + correction[2][2];
    return {
      beamMisalignmentDeg: radToDeg(Math.atan2(Math.hypot(beamVec[1], beamVec[2]), beamDot)),
      horizontalMisalignmentDeg: radToDeg(Math.asin(clamp(Math.abs(horizVec[2]), 0, 1))),
      inPlaneAzimuthDeg: Math.hypot(horizVec[0], horizVec[1]) > 1e-10 ? radToDeg(Math.atan2(horizVec[1], horizVec[0])) : null,
      verticalAxisRotationDeg: rotations.vertical,
      horizontalAxisRotationDeg: rotations.horizontal,
      beamNormalRotationDeg: rotations.beamNormal,
      totalCorrectionDeg: radToDeg(Math.acos(clamp((trace - 1) / 2, -1, 1))),
      correctionMatrix: correction,
      horizontalSide: side,
      currentBeamDot: beamDot,
      currentHorizOutOfPlane: Math.abs(horizVec[2])
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
    const matched = observed.map(obs => {
      const clean = { ...obs };
      for (const key of ["matchedH", "matchedK", "matchedL", "matchDist"]) delete clean[key];
      return clean;
    });
    if (!(Number.isFinite(maxDistPx) && maxDistPx > 0)) return matched;
    // Harmonic reflections land on the same spot in a polychromatic pattern.
    // They must share one assignment slot, rather than consuming several peaks.
    const spots = [];
    const coincident = new Map();
    const bucket = (x, y, size) => `${Math.floor(x / size)},${Math.floor(y / size)}`;
    const representatives = predicted.filter(p => [p.x, p.y, p.h, p.k, p.l].every(Number.isFinite))
      .slice().sort((a, b) => (a.h*a.h+a.k*a.k+a.l*a.l) - (b.h*b.h+b.k*b.k+b.l*b.l) || a.h-b.h || a.k-b.k || a.l-b.l);
    for (const peak of representatives) {
      const x = Math.floor(peak.x / 1e-4), y = Math.floor(peak.y / 1e-4);
      let duplicate = false;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const i of coincident.get(`${x+dx},${y+dy}`) || []) {
          if (Math.hypot(peak.x-spots[i].x, peak.y-spots[i].y) < 1e-5) duplicate = true;
        }
      }
      if (duplicate) continue;
      const key = `${x},${y}`;
      if (!coincident.has(key)) coincident.set(key, []);
      coincident.get(key).push(spots.length);
      spots.push(peak);
    }
    const grid = new Map();
    spots.forEach((p, i) => {
      const key = bucket(p.x, p.y, maxDistPx);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    });
    const candidates = matched.map(obs => {
      if (![obs.x, obs.y].every(Number.isFinite)) return [];
      const x = Math.floor(obs.x / maxDistPx), y = Math.floor(obs.y / maxDistPx);
      const edges = [];
      for (let dx=-1; dx<=1; dx++) for (let dy=-1; dy<=1; dy++) {
        for (const i of grid.get(`${x+dx},${y+dy}`) || []) {
          const cost = (obs.x-spots[i].x)**2 + (obs.y-spots[i].y)**2;
          if (cost <= maxDistPx**2) edges.push({ spot: i, cost });
        }
      }
      return edges;
    });
    // Sparse minimum-cost maximum matching. Reversible edges allow an earlier
    // assignment to move when that makes room for another observed spot.
    const activeSpots = [...new Set(candidates.flatMap(edges => edges.map(e => e.spot)))];
    const spotNode = new Map(activeSpots.map((i, j) => [i, matched.length + j + 1]));
    const sink = matched.length + activeSpots.length + 1;
    const graph = Array.from({ length: sink + 1 }, () => []);
    function edge(from, to, cost, assignment) {
      const forward = { to, cost, capacity: 1, reverse: graph[to].length, assignment };
      graph[from].push(forward);
      graph[to].push({ to: from, cost: -cost, capacity: 0, reverse: graph[from].length - 1 });
    }
    const order = matched.map((_, i) => i).sort((a,b) => matched[a].x-matched[b].x || matched[a].y-matched[b].y || a-b);
    for (const i of order) {
      edge(0, i+1, 0);
      for (const candidate of candidates[i]) edge(i+1, spotNode.get(candidate.spot), candidate.cost, candidate.spot);
    }
    for (const node of spotNode.values()) edge(node, sink, 0);
    while (true) {
      const distance = Array(graph.length).fill(Infinity);
      const previous = Array(graph.length);
      const queued = Array(graph.length).fill(false);
      const queue = [0]; distance[0] = 0; queued[0] = true;
      for (let head=0; head<queue.length; head++) {
        const from = queue[head]; queued[from] = false;
        graph[from].forEach((e, index) => {
          if (e.capacity && distance[from] + e.cost < distance[e.to] - 1e-12) {
            distance[e.to] = distance[from] + e.cost;
            previous[e.to] = { from, index };
            if (!queued[e.to]) { queue.push(e.to); queued[e.to] = true; }
          }
        });
      }
      if (!Number.isFinite(distance[sink])) break;
      for (let node=sink; node!==0;) {
        const { from, index } = previous[node], e = graph[from][index];
        e.capacity = 0; graph[node][e.reverse].capacity = 1; node = from;
      }
    }
    matched.forEach((obs, i) => {
      const e = graph[i+1].find(e => e.assignment != null && e.capacity === 0);
      if (!e) return;
      const peak = spots[e.assignment];
      obs.matchedH = peak.h; obs.matchedK = peak.k; obs.matchedL = peak.l;
      obs.matchDist = Math.hypot(obs.x-peak.x, obs.y-peak.y);
    });
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
