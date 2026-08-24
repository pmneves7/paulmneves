/**
 * Lattices that are neither periodic nor built from a dual grid.
 *
 *   Pinwheel   — Conway and Radin's substitution tiling, in which one right
 *                triangle recurs in infinitely many orientations.
 *   Voronoi    — cells of a random point set, so no two boards are alike.
 *
 * They register themselves with Lattices, so the game sees a single list.
 */
(function (global) {
  "use strict";

  const L = global.Lattices;

  /* ------------------------------------------------------------- pinwheel */

  // A 1-2-sqrt(5) right triangle splits into five copies of itself, each scaled
  // by 1/sqrt(5). Written in the coordinates of the reference triangle
  // (0,0)-(2,0)-(0,1) and listed as (right-angle corner, far end of the long
  // leg, end of the short leg), so placing them is a plain affine map.
  //
  // Three different dissections of this triangle into five similar copies
  // exist. Only those with mixed handedness are the Conway-Radin pinwheel: the
  // all-reflection one turns out to have its tiles in just four orientations,
  // whereas the pinwheel's defining property is that orientations never stop
  // accumulating, since atan(1/2) is an irrational multiple of pi.
  const PINWHEEL_CHILDREN = [
    [[0.4, 0.8], [0.0, 0.0], [0.0, 1.0]],
    [[0.2, 0.4], [1.0, 0.0], [0.0, 0.0]],
    [[0.2, 0.4], [1.0, 0.0], [0.4, 0.8]],
    [[1.2, 0.4], [0.4, 0.8], [1.0, 0.0]],
    [[1.2, 0.4], [2.0, 0.0], [1.0, 0.0]]
  ];

  function pinwheelSubdivide(triangles) {
    const out = [];
    for (const [p0, p1, p2] of triangles) {
      // Local frame of the parent: u along the long leg, v along the short one.
      const ux = (p1[0] - p0[0]) / 2;
      const uy = (p1[1] - p0[1]) / 2;
      const vx = p2[0] - p0[0];
      const vy = p2[1] - p0[1];
      const map = ([a, b]) => [p0[0] + ux * a + vx * b, p0[1] + uy * a + vy * b];
      for (const child of PINWHEEL_CHILDREN) out.push([map(child[0]), map(child[1]), map(child[2])]);
    }
    return out;
  }

  function buildPinwheel(tileCount) {
    const wanted = Math.max(1, Math.floor(tileCount));
    // The incircle covers about 46% of the triangle, so over-generate to be
    // sure the kept disc sits well inside the patch.
    let levels = Math.ceil(Math.log(wanted / 0.4) / Math.log(5));
    levels = Math.max(1, Math.min(9, levels));

    let triangles = [[[0, 0], [2, 0], [0, 1]]];
    for (let i = 0; i < levels; i += 1) triangles = pinwheelSubdivide(triangles);

    // Normalise so the short leg is 1, and centre on the seed's incentre.
    // Centring on the seed's incentre keeps the kept disc inside the triangle
    // instead of running off a corner.
    const scale = Math.pow(Math.sqrt(5), levels);
    const cx = 2 / (Math.sqrt(5) + 3);
    const cy = 2 / (Math.sqrt(5) + 3);

    const candidates = triangles.map((t) => {
      const points = t.map(([x, y]) => [(x - cx) * scale, (y - cy) * scale]);
      return {
        shape: 0,
        points,
        cx: (points[0][0] + points[1][0] + points[2][0]) / 3,
        cy: (points[0][1] + points[1][1] + points[2][1]) / 3
      };
    });

    // Pinwheel tiles are not edge-to-edge: a corner routinely lands partway
    // along a neighbour's edge, so corner sharing alone would miss neighbours.
    return L.assemble(candidates, wanted, (tile) => tile.shape, {
      edgeContacts: true,
      contactTolerance: 1e-6
    });
  }

  /* -------------------------------------------------------------- Voronoi */

  /**
   * Bridson's Poisson-disc sampling: points at least `radius` apart, but
   * otherwise irregular. Gives rounder, more even Voronoi cells than uniform
   * random points, which throw up slivers.
   */
  function poissonDisc(regionRadius, radius, random) {
    const cell = radius / Math.SQRT2;
    const span = Math.ceil((2 * regionRadius) / cell) + 1;
    const grid = new Int32Array(span * span).fill(-1);
    const points = [];
    const active = [];

    const gridIndex = (x, y) =>
      Math.floor((y + regionRadius) / cell) * span + Math.floor((x + regionRadius) / cell);

    function fits(x, y) {
      if (Math.hypot(x, y) > regionRadius) return false;
      const gx = Math.floor((x + regionRadius) / cell);
      const gy = Math.floor((y + regionRadius) / cell);
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= span || ny >= span) continue;
          const id = grid[ny * span + nx];
          if (id === -1) continue;
          const p = points[id];
          if (Math.hypot(p[0] - x, p[1] - y) < radius) return false;
        }
      }
      return true;
    }

    function push(x, y) {
      grid[gridIndex(x, y)] = points.length;
      points.push([x, y]);
      active.push(points.length - 1);
    }

    push(0, 0);
    while (active.length) {
      const pick = Math.floor(random() * active.length);
      const from = points[active[pick]];
      let placed = false;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const angle = random() * Math.PI * 2;
        const distance = radius * (1 + random());
        const x = from[0] + Math.cos(angle) * distance;
        const y = from[1] + Math.sin(angle) * distance;
        if (!fits(x, y)) continue;
        push(x, y);
        placed = true;
        break;
      }
      if (!placed) active.splice(pick, 1);
    }
    return points;
  }

  function clipHalfPlane(polygon, ax, ay, bx, by) {
    // Keep the side of the perpendicular bisector of ab that contains a.
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const nx = bx - ax;
    const ny = by - ay;
    const limit = nx * mx + ny * my;
    const out = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const p = polygon[i];
      const q = polygon[(i + 1) % polygon.length];
      const dp = nx * p[0] + ny * p[1] - limit;
      const dq = nx * q[0] + ny * q[1] - limit;
      if (dp <= 0) out.push(p);
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
        const t = dp / (dp - dq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return out;
  }

  function buildVoronoi(tileCount) {
    const wanted = Math.max(1, Math.floor(tileCount));
    const random = Math.random;
    // Unit spacing keeps cells about the size of a unit-edge polygon.
    const spacing = 1.05;
    const regionRadius = spacing * Math.sqrt(wanted / 2.2) + 4 * spacing;
    const sites = poissonDisc(regionRadius, spacing, random);

    // Bucket the sites so each cell is clipped only against nearby ones.
    const cell = spacing * 2;
    const buckets = new Map();
    sites.forEach((p, i) => {
      const key = Math.round(p[0] / cell) + ":" + Math.round(p[1] / cell);
      let list = buckets.get(key);
      if (!list) {
        list = [];
        buckets.set(key, list);
      }
      list.push(i);
    });

    const far = regionRadius * 3;
    const candidates = [];
    for (let i = 0; i < sites.length; i += 1) {
      const [sx, sy] = sites[i];
      let polygon = [
        [sx - far, sy - far],
        [sx + far, sy - far],
        [sx + far, sy + far],
        [sx - far, sy + far]
      ];
      const bi = Math.round(sx / cell);
      const bj = Math.round(sy / cell);
      let clipped = 0;
      for (let di = -2; di <= 2 && polygon.length; di += 1) {
        for (let dj = -2; dj <= 2 && polygon.length; dj += 1) {
          const list = buckets.get(bi + di + ":" + (bj + dj));
          if (!list) continue;
          for (const j of list) {
            if (j === i) continue;
            polygon = clipHalfPlane(polygon, sx, sy, sites[j][0], sites[j][1]);
            clipped += 1;
            if (!polygon.length) break;
          }
        }
      }
      // A cell that never met enough neighbours is on the outside and would be
      // clipped by the bounding box rather than by real neighbours.
      if (polygon.length < 3 || clipped < 6) continue;
      let maxR = 0;
      for (const [x, y] of polygon) maxR = Math.max(maxR, Math.hypot(x - sx, y - sy));
      if (maxR > spacing * 3) continue;

      const sides = polygon.length;
      candidates.push({
        shape: sides < 6 ? 1 : sides > 6 ? 2 : 0,
        points: polygon,
        cx: sx,
        cy: sy
      });
    }

    return L.assemble(candidates, wanted, (tile) => tile.shape);
  }

  /* ------------------------------------------------- Penrose P2 kite/dart */

  const PHI = (1 + Math.sqrt(5)) / 2;

  /**
   * Penrose's original tiling, by kites and darts. Both are two Robinson
   * triangles joined along a leg, and unlike the P3 rhombi — which join along
   * their unequal base — a triangle's two legs are the same length, so which
   * one is the join cannot be read off the geometry. Each half-tile therefore
   * carries its join explicitly, as (apex, axisEnd, freeEnd), and the halves
   * are paired on that edge once the subdivision is finished.
   *
   * Deflation: a half-kite becomes two half-kites and a half-dart, a half-dart
   * becomes one of each; both shrink by phi. A tile's children are not
   * contained in it — halves regroup across tile boundaries — which is why the
   * pairing happens globally at the end.
   *
   * The triangle can be cut four ways for a half-kite and two for a half-dart,
   * and each child can take either leg as its join. Only one of the resulting
   * 256 combinations leaves no half-tile unpaired in the interior; that is the
   * one below, and it reproduces the golden ratio of kites to darts.
   */
  function p2Subdivide(halves) {
    const out = [];
    const along = (from, to, t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    for (const [type, apex, axisEnd, freeEnd] of halves) {
      if (type === 0) {
        // Half-kite: two half-kites and a half-dart.
        const p = along(apex, freeEnd, 1 / (PHI * PHI));
        const m = along(apex, axisEnd, 1 / PHI);
        out.push([1, p, apex, m]);
        out.push([0, freeEnd, m, p]);
        out.push([0, freeEnd, m, axisEnd]);
      } else {
        // Half-dart: one of each.
        const r = along(axisEnd, freeEnd, 1 / PHI);
        out.push([1, r, freeEnd, apex]);
        out.push([0, axisEnd, apex, r]);
      }
    }
    return out;
  }

  function buildPenroseP2(tileCount) {
    const wanted = Math.max(1, Math.floor(tileCount));
    // Five kites meeting at their 72-degree tips: the "sun" vertex.
    const halves = [];
    for (let i = 0; i < 5; i += 1) {
      const base = (72 * i * Math.PI) / 180;
      const spread = (36 * Math.PI) / 180;
      const axisEnd = [PHI * Math.cos(base), PHI * Math.sin(base)];
      halves.push([0, [0, 0], axisEnd, [PHI * Math.cos(base + spread), PHI * Math.sin(base + spread)]]);
      halves.push([0, [0, 0], axisEnd, [PHI * Math.cos(base - spread), PHI * Math.sin(base - spread)]]);
    }

    let levels = Math.ceil(Math.log((wanted * 3) / 10) / Math.log(PHI * PHI));
    levels = Math.max(1, Math.min(12, levels));
    let current = halves;
    for (let i = 0; i < levels; i += 1) current = p2Subdivide(current);

    // Pair the halves on their marked join. What is left over is the ragged
    // edge of the patch and gets dropped.
    const scale = Math.pow(PHI, levels);
    const round = (v) => Math.round(v * 1e7) / 1e7;
    const byAxis = new Map();
    for (const half of current) {
      const a = half[1];
      const b = half[2];
      const ka = round(a[0]) + "," + round(a[1]);
      const kb = round(b[0]) + "," + round(b[1]);
      const key = half[0] + "|" + (ka < kb ? ka + "|" + kb : kb + "|" + ka);
      let list = byAxis.get(key);
      if (!list) {
        list = [];
        byAxis.set(key, list);
      }
      list.push(half);
    }

    const candidates = [];
    byAxis.forEach((list) => {
      if (list.length !== 2) return;
      const [type, apex, axisEnd, freeA] = list[0];
      const freeB = list[1][3];
      const points = [apex, freeA, axisEnd, freeB].map(([x, y]) => [x * scale, y * scale]);
      candidates.push({
        shape: type,
        points,
        cx: (points[0][0] + points[1][0] + points[2][0] + points[3][0]) / 4,
        cy: (points[0][1] + points[1][1] + points[2][1] + points[3][1]) / 4
      });
    });

    return L.assemble(candidates, wanted, (tile) => tile.shape);
  }

  /* ------------------------------------------------------------- register */

  L.register({
    id: "penrose-p2",
    name: "Penrose P2 (kites and darts)",
    vertexConfig: "aperiodic",
    shapeNames: ["Kite", "Dart"],
    avgNeighbors: 8.74,
    build: buildPenroseP2
  });


  L.register({
    id: "pinwheel",
    name: "Pinwheel (substitution tiling)",
    vertexConfig: "aperiodic",
    shapeNames: ["Right triangle"],
    avgNeighbors: 12.83,
    build: buildPinwheel
  });

  L.register({
    id: "voronoi",
    name: "Voronoi (random cells)",
    vertexConfig: "random",
    shapeNames: ["Hexagonal cell", "Fewer than 6 sides", "More than 6 sides"],
    avgNeighbors: 6.0,
    build: buildVoronoi
  });
})(typeof window !== "undefined" ? window : globalThis);
