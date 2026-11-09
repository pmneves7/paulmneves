const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {}; context.window = context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'laue-math.js'), 'utf8'), context);
const M = context.LaueMath;
const cell = { a: 4.2, b: 5.1, c: 6.3, alpha: 83, beta: 96, gamma: 104 };
const size = { width: 1024, height: 768 };
const base = { sampleOmega: 13, sampleChi: 27, samplePhi: 42,
  sampleSigns: { omega: 1, chi: 1, phi: 1 }, detDistance: 150,
  detWidth: 300, detHeight: 210, detOffsetX: 31, detOffsetY: -17,
  detOmega: 0, detChi: 0, laueMode: 'backscatter', qMin: 0, qMax: 12, maxHklSq: 120 };
function close(a, b, tolerance = 1e-7) { assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`); }
function angles(cfg) { return { omega: cfg.sampleOmega, chi: cfg.sampleChi, phi: cfg.samplePhi }; }
function withAngles(cfg, a) { return { ...cfg, sampleOmega: a.omega, sampleChi: a.chi, samplePhi: a.phi }; }

test('rotation about a Bragg peak fixes its position, G and wavelength while other peaks move', () => {
  for (const laueMode of ['backscatter', 'transmission']) {
    for (const detChi of [0, 14]) {
      for (const sampleSigns of [{ omega: 1, chi: 1, phi: 1 }, { omega: -1, chi: 1, phi: -1 }]) {
        const cfg = { ...base, laueMode, detChi, detOmega: 37, sampleSigns };
        const peaks = M.computePredictedPeaks(cell, cfg, size).filter(p => p.onImage);
        const pivot = peaks.find(p => Math.hypot(p.x - cfg.beamX, p.y - cfg.beamY) > 100);
        assert.ok(pivot, 'fixture contains an off-center Bragg peak');
        const before = JSON.stringify(cfg);
        const a = M.rotateSampleOrientationAboutPoint(angles(cfg), sampleSigns, 23, pivot, cfg, size);
        assert.equal(JSON.stringify(cfg), before, 'rotation does not modify detector configuration');
        const rotated = withAngles(cfg, a);
        const point = M.projectHKL(cell, [pivot.h, pivot.k, pivot.l], rotated, size);
        assert.ok(point);
        close(point.x, pivot.x); close(point.y, pivot.y); close(point.lambda, pivot.lambda);
        const g = M.reciprocalVector([pivot.h, pivot.k, pivot.l], M.ubMatrix(cell, a.omega, a.chi, a.phi, sampleSigns));
        g.forEach((v, i) => close(v, pivot.g[i]));
        assert.ok(peaks.some(p => {
          const moved = M.projectHKL(cell, [p.h, p.k, p.l], rotated, size);
          return moved && Math.hypot(moved.x - p.x, moved.y - p.y) > 10;
        }), 'the pattern changes around the fixed peak');
      }
    }
  }
});

test('an unsnapped image point is a reversible rotation pivot, including at Euler gimbal lock', () => {
  for (const sampleChi of [27, 90, -90]) {
    const cfg = { ...base, sampleChi, detOmega: 28, detChi: 11 };
    const start = angles(cfg), pivot = { x: 789, y: 203 };
    const forward = M.rotateSampleOrientationAboutPoint(start, cfg.sampleSigns, 31, pivot, cfg, size);
    const reverse = M.rotateSampleOrientationAboutPoint(forward, cfg.sampleSigns, -31, pivot, cfg, size);
    const original = M.uMatrix(start.omega, start.chi, start.phi, cfg.sampleSigns);
    const restored = M.uMatrix(reverse.omega, reverse.chi, reverse.phi, cfg.sampleSigns);
    original.forEach((row, i) => row.forEach((v, j) => close(v, restored[i][j])));
  }
});

test('beam-center point rotation preserves the existing beam convention and handles the forward beam', () => {
  for (const laueMode of ['backscatter', 'transmission']) {
    const cfg = { ...base, laueMode };
    const point = { x: size.width / 2 + cfg.detOffsetX, y: size.height / 2 + cfg.detOffsetY };
    const expected = M.rotateSampleOrientationAboutBeam(angles(cfg), cfg.sampleSigns, -19);
    const actual = M.rotateSampleOrientationAboutPoint(angles(cfg), cfg.sampleSigns, -19, point, cfg, size);
    for (const key of ['omega', 'chi', 'phi']) close(actual[key], expected[key]);
  }
});
