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

  function reciprocalBasis(params) {
    const { va, vb, vc } = directLatticeVectors(params);
    const volume = dot(va, cross(vb, vc));
    if (Math.abs(volume) < 1e-12) throw new Error("Degenerate unit cell.");
    return {
      aStar: scale(cross(vb, vc), 1 / volume),
      bStar: scale(cross(vc, va), 1 / volume),
      cStar: scale(cross(va, vb), 1 / volume)
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
   * Detector plane normal from spherical angles Ω (azimuth about z) and χ (polar from +z).
   * ω=0, χ=90° → normal along +x (transmission, downstream detector).
   * ω=180°, χ=90° → normal along −x (backscatter).
   */
  function detectorNormal(detOmega, detChi, laueMode) {
    if (laueMode === "backscatter") {
      detOmega = detOmega + 180;
    }
    const o = degToRad(detOmega);
    const c = degToRad(detChi);
    const sinC = Math.sin(c);
    return normalize([
      sinC * Math.cos(o),
      sinC * Math.sin(o),
      Math.cos(c)
    ]);
  }

  function detectorBasis(normal, detOmegaMisalign, detChiMisalign) {
    let n = normalize(normal);
    if (Math.abs(detOmegaMisalign) > 1e-9 || Math.abs(detChiMisalign) > 1e-9) {
      const mis = mat3Mul(rotX(degToRad(detChiMisalign)), rotZ(degToRad(detOmegaMisalign)));
      n = mat3Vec(mis, n);
    }
    const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
    const u = normalize(cross(ref, n));
    const v = normalize(cross(n, u));
    return { normal: n, u, v };
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

    const lambda = -2 * gDot / gSq;
    if (!Number.isFinite(lambda) || lambda <= 0) return null;

    const qMag = norm(gLab);
    if (qMag < config.qMin || qMag > config.qMax) return null;

    const kOut = add(scale(beam, 1 / lambda), gLab);
    const kNorm = norm(kOut);
    if (kNorm < 1e-14) return null;
    const direction = scale(kOut, 1 / kNorm);

    const n = detectorNormal(config.detOmega, config.detChi, config.laueMode);
    const basis = detectorBasis(n, config.detOmegaMisalign || 0, config.detChiMisalign || 0);
    const planePoint = scale(basis.normal, config.detDistance);

    const denom = dot(direction, basis.normal);
    if (Math.abs(denom) < 1e-10) return null;
    const t = dot(subtract(planePoint, [0, 0, 0]), basis.normal) / denom;
    if (t <= 0) return null;

    const hit = scale(direction, t);
    const rel = subtract(hit, planePoint);
    const xLab = dot(rel, basis.u);
    const yLab = dot(rel, basis.v);

    const pxPerMmX = imageSize.width / config.detWidth;
    const pxPerMmY = imageSize.height / config.detHeight;
    const cx = config.beamX + config.detOffsetX + xLab * pxPerMmX;
    const cy = config.beamY + config.detOffsetY + yLab * pxPerMmY;

    if (config.patternRotation) {
      const rad = degToRad(config.patternRotation);
      const dx = cx - config.beamX;
      const dy = cy - config.beamY;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      return {
        x: config.beamX + dx * cosR - dy * sinR,
        y: config.beamY + dx * sinR + dy * cosR,
        q: qMag,
        lambda
      };
    }

    return { x: cx, y: cy, q: qMag, lambda };
  }

  function computePredictedPeaks(params, config, imageSize, isAllowed) {
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
        y: proj.y
      });
    }
    return peaks;
  }

  /**
   * Simple Gauss-Newton refinement of orientation / instrument parameters.
   */
  function refineOrientation(params, config, imageSize, observedPeaks, refineFlags, isAllowed, maxIter) {
    const flags = refineFlags || { sampleOmega: true, sampleChi: true, samplePhi: true };
    const paramKeys = [
      "sampleOmega", "sampleChi", "samplePhi",
      "detDistance", "detOffsetX", "detOffsetY",
      "detOmegaMisalign", "detChiMisalign"
    ].filter((key) => flags[key]);

    if (!paramKeys.length || !observedPeaks.length) {
      return { config: { ...config }, rms: null, iterations: 0 };
    }

    const cfg = { ...config };
    const obs = observedPeaks.filter((p) => p.matchedH !== undefined);
    if (!obs.length) {
      return { config: cfg, rms: null, iterations: 0 };
    }

    const eps = 0.05;
    let rms = Infinity;

    for (let iter = 0; iter < (maxIter || 40); iter += 1) {
      const predicted = computePredictedPeaks(params, cfg, imageSize, isAllowed);
      const predMap = new Map(predicted.map((p) => [`${p.h},${p.k},${p.l}`, p]));

      const residuals = [];
      const jacobian = [];

      for (const obsPeak of obs) {
        const key = `${obsPeak.matchedH},${obsPeak.matchedK},${obsPeak.matchedL}`;
        const pred = predMap.get(key);
        if (!pred) continue;
        residuals.push(pred.x - obsPeak.x, pred.y - obsPeak.y);

        const rowX = [];
        const rowY = [];
        for (const pk of paramKeys) {
          const saved = cfg[pk];
          cfg[pk] = saved + eps;
          const pert = computePredictedPeaks(params, cfg, imageSize, isAllowed);
          cfg[pk] = saved;
          const pp = pert.find((p) => p.h === obsPeak.matchedH && p.k === obsPeak.matchedK && p.l === obsPeak.matchedL);
          if (pp) {
            rowX.push((pp.x - pred.x) / eps);
            rowY.push((pp.y - pred.y) / eps);
          } else {
            rowX.push(0);
            rowY.push(0);
          }
        }
        jacobian.push(rowX, rowY);
      }

      if (residuals.length < paramKeys.length) break;

      let sumSq = 0;
      for (const r of residuals) sumSq += r * r;
      rms = Math.sqrt(sumSq / residuals.length);

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
        jtj[d][d] += 1e-6;
      }

      const delta = solveSymmetric(jtj, jtr.map((v) => -v));
      if (!delta) break;

      let maxStep = 0;
      for (let i = 0; i < nParams; i += 1) {
        cfg[paramKeys[i]] -= delta[i];
        maxStep = Math.max(maxStep, Math.abs(delta[i]));
      }
      if (maxStep < 1e-4) break;
    }

    return { config: cfg, rms, iterations: maxIter || 40 };
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
   * Compute sample-angle corrections to align a crystal direction with the beam
   * and another direction with the horizontal plane.
   */
  function idealOrientationDeviation(params, currentAngles, targetBeamHKL, targetHorizHKL, signs) {
    const ub = ubMatrix(params, currentAngles.omega, currentAngles.chi, currentAngles.phi, signs);
    const beamVec = normalize(reciprocalVector(targetBeamHKL, ub));
    const horizVec = normalize(reciprocalVector(targetHorizHKL, ub));
    const desiredBeam = [1, 0, 0];
    const desiredHoriz = normalize([0, 1, 0]);

    const beamAngle = radToDeg(Math.acos(clamp(dot(beamVec, desiredBeam), -1, 1)));
    const horizProj = subtract(horizVec, scale(desiredBeam, dot(horizVec, desiredBeam)));
    const horizNorm = norm(horizProj);
    const horizAngle = horizNorm < 1e-10
      ? 0
      : radToDeg(Math.acos(clamp(dot(normalize(horizProj), desiredHoriz), -1, 1)));

    const crossBeam = cross(desiredBeam, beamVec);
    const omegaCorr = norm(crossBeam) < 1e-10 ? 0 : radToDeg(Math.atan2(crossBeam[2], crossBeam[1]));

    return {
      beamMisalignmentDeg: beamAngle,
      horizontalMisalignmentDeg: horizAngle,
      suggestedOmegaCorrection: omegaCorr,
      currentBeamDot: dot(beamVec, desiredBeam),
      currentHorizDot: horizNorm < 1e-10 ? 0 : dot(normalize(horizProj), desiredHoriz)
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

  function autoDetectPeaks(intensities, width, height, threshold, minRadius) {
    const peaks = [];
    const r = Math.max(1, Math.round(minRadius));
    const rSq = r * r;

    for (let y = r; y < height - r; y += 1) {
      for (let x = r; x < width - r; x += 1) {
        const idx = y * width + x;
        const val = intensities[idx];
        if (val < threshold) continue;

        let isMax = true;
        for (let dy = -r; dy <= r && isMax; dy += 1) {
          for (let dx = -r; dx <= r; dx += 1) {
            if (dx * dx + dy * dy > rSq) continue;
            if (dx === 0 && dy === 0) continue;
            const nIdx = (y + dy) * width + (x + dx);
            if (intensities[nIdx] > val) {
              isMax = false;
              break;
            }
          }
        }
        if (isMax) peaks.push({ x, y, intensity: val, id: peaks.length });
      }
    }

    peaks.sort((a, b) => b.intensity - a.intensity);
    const minSep = r * 2;
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
      if (!tooClose) filtered.push(peak);
    }
    return filtered;
  }

  function matchObservedToPredicted(observed, predicted, maxDistPx) {
    const maxDistSq = maxDistPx * maxDistPx;
    const used = new Set();
    const matched = observed.map((obs) => ({ ...obs }));

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
    ubMatrix,
    reciprocalVector,
    enumerateHKL,
    detectorNormal,
    projectReflection,
    computePredictedPeaks,
    refineOrientation,
    idealOrientationDeviation,
    alignHKLToBeam,
    autoDetectPeaks,
    matchObservedToPredicted
  };
})(window);
