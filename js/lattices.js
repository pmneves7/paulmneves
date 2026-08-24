/**
 * Tile lattices for the minesweeper board.
 *
 * Every lattice produces the same shape: a roughly circular patch of exactly N
 * tiles with unit edge length, plus a corner-sharing adjacency list. The
 * periodic lattices (the eleven Archimedean tilings) are all built by the same
 * routine from a unit cell, given as two translation vectors and the regular
 * polygons inside it. Penrose is aperiodic and comes from penrose-tiling.js.
 *
 * Each face is written as {n, c, rot}: a regular n-gon of edge length 1,
 * centred at c, with its first vertex at `rot` degrees. Placing polygons by
 * centre and rotation rather than by listing corners keeps the specs short and
 * makes them checkable — see the validator, which confirms every edge has unit
 * length, that the faces exactly fill the unit cell, that interior edges are
 * shared by exactly two faces, and that every vertex matches the declared
 * vertex configuration.
 */
(function (global) {
  "use strict";

  const DEG = Math.PI / 180;
  const SQRT3 = Math.sqrt(3);

  function circumradius(n) {
    return 1 / (2 * Math.sin(Math.PI / n));
  }

  function apothem(n) {
    return 1 / (2 * Math.tan(Math.PI / n));
  }

  function regularPolygon(n, cx, cy, rot) {
    const r = circumradius(n);
    const points = [];
    for (let k = 0; k < n; k += 1) {
      const angle = (rot + (360 * k) / n) * DEG;
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return points;
  }

  /* ------------------------------------------------- the eleven Archimedean */

  // Handy exact-ish constants that show up repeatedly below.
  const A3 = apothem(3);          // 0.288675
  const A6 = apothem(6);          // 0.866025
  const A12 = apothem(12);        // 1.866025

  // `count` faces of `n` sides spaced 60 degrees apart around the origin.
  function ring(n, radius, angleOffset, rotBase, rotStep, count) {
    const faces = [];
    for (let k = 0; k < count; k += 1) {
      const angle = (angleOffset + 60 * k) * DEG;
      faces.push({
        n,
        c: [radius * Math.cos(angle), radius * Math.sin(angle)],
        rot: rotBase + rotStep * k
      });
    }
    return faces;
  }

  const ARCHIMEDEAN = [
    {
      id: "triangular",
      name: "Triangular",
      vertexConfig: "3.3.3.3.3.3",
      t1: [1, 0],
      t2: [0.5, SQRT3 / 2],
      faces: [
        { n: 3, c: [0.5, SQRT3 / 6], rot: 90 },
        { n: 3, c: [1, SQRT3 / 3], rot: 270 }
      ]
    },
    {
      id: "square",
      name: "Square",
      vertexConfig: "4.4.4.4",
      t1: [1, 0],
      t2: [0, 1],
      faces: [{ n: 4, c: [0.5, 0.5], rot: 45 }]
    },
    {
      id: "hexagonal",
      name: "Hexagonal",
      vertexConfig: "6.6.6",
      t1: [SQRT3, 0],
      t2: [SQRT3 / 2, 1.5],
      faces: [{ n: 6, c: [0, 0], rot: 30 }]
    },
    {
      id: "trihexagonal",
      name: "Trihexagonal (kagome)",
      vertexConfig: "3.6.3.6",
      t1: [2, 0],
      t2: [1, SQRT3],
      faces: [
        { n: 6, c: [0, 0], rot: 0 },
        { n: 3, c: [1, SQRT3 / 3], rot: 270 },
        { n: 3, c: [0, (2 * SQRT3) / 3], rot: 90 }
      ]
    },
    {
      id: "snub-hexagonal",
      name: "Snub hexagonal",
      vertexConfig: "3.3.3.3.6",
      // Hexagon centres sit on a triangular lattice of side sqrt(7), turned
      // about 19.1 degrees from the hexagons' own axes. Every vertex of this
      // tiling belongs to exactly one hexagon, so the eight triangles per cell
      // were read off the hexagon corners rather than placed by hand.
      t1: [2.5, SQRT3 / 2],
      t2: [0.5, 1.5 * SQRT3],
      faces: [
        { n: 6, c: [0, 0], rot: 0 },
        { n: 3, c: [1.0, SQRT3 / 3], rot: 30 },
        { n: 3, c: [0.5, (5 * SQRT3) / 6], rot: 30 },
        { n: 3, c: [1.0, (2 * SQRT3) / 3], rot: 90 },
        { n: 3, c: [1.5, (5 * SQRT3) / 6], rot: 30 },
        { n: 3, c: [1.5, (7 * SQRT3) / 6], rot: 90 },
        { n: 3, c: [2.0, (4 * SQRT3) / 3], rot: 30 },
        { n: 3, c: [2.5, (7 * SQRT3) / 6], rot: 90 },
        { n: 3, c: [2.0, (5 * SQRT3) / 3], rot: 90 }
      ]
    },
    {
      id: "elongated-triangular",
      name: "Elongated triangular",
      vertexConfig: "3.3.3.4.4",
      t1: [1, 0],
      t2: [0.5, 1 + SQRT3 / 2],
      faces: [
        { n: 4, c: [0.5, 0.5], rot: 45 },
        { n: 3, c: [0.5, 1 + SQRT3 / 6], rot: 90 },
        { n: 3, c: [1, 1 + SQRT3 / 3], rot: 270 }
      ]
    },
    {
      id: "snub-square",
      name: "Snub square",
      vertexConfig: "3.3.4.3.4",
      t1: [1 + SQRT3 / 2, 0.5],
      t2: [-0.5, 1 + SQRT3 / 2],
      faces: [
        { n: 4, c: [0, 0], rot: 45 },
        { n: 4, c: [(1 + SQRT3) / 4, (3 + SQRT3) / 4], rot: 75 },
        { n: 3, c: [0, 0.5 + A3], rot: 90 },
        { n: 3, c: [0.5 + A3, 0], rot: 0 },
        { n: 3, c: [0, -(0.5 + A3)], rot: 270 },
        { n: 3, c: [-(0.5 + A3), 0], rot: 180 }
      ]
    },
    {
      id: "rhombitrihexagonal",
      name: "Rhombitrihexagonal",
      vertexConfig: "3.4.6.4",
      // Neighbouring hexagons meet across a square, which sits at 30 degrees,
      // so the lattice is rotated 30 degrees from the hexagon's own axes.
      t1: [((1 + SQRT3) * SQRT3) / 2, (1 + SQRT3) / 2],
      t2: [0, 1 + SQRT3],
      faces: [{ n: 6, c: [0, 0], rot: 0 }].concat(
        ring(4, A6 + 0.5, 30, 255, 60, 3),
        ring(3, 1 + circumradius(3), 0, 180, 60, 2)
      )
    },
    {
      id: "truncated-hexagonal",
      name: "Truncated hexagonal",
      vertexConfig: "3.12.12",
      t1: [2 + SQRT3, 0],
      t2: [(2 + SQRT3) / 2, ((2 + SQRT3) * SQRT3) / 2],
      faces: [{ n: 12, c: [0, 0], rot: 15 }].concat(ring(3, A12 + A3, 30, 30, 60, 2))
    },
    {
      id: "truncated-trihexagonal",
      name: "Truncated trihexagonal",
      vertexConfig: "4.6.12",
      t1: [3 + SQRT3, 0],
      t2: [(3 + SQRT3) / 2, ((3 + SQRT3) * SQRT3) / 2],
      faces: [{ n: 12, c: [0, 0], rot: 15 }].concat(
        ring(4, A12 + 0.5, 0, 135, 60, 3),
        ring(6, A12 + A6, 30, 240, 60, 2)
      )
    },
    {
      id: "truncated-square",
      name: "Truncated square",
      vertexConfig: "4.8.8",
      t1: [1 + Math.SQRT2, 0],
      t2: [0, 1 + Math.SQRT2],
      faces: [
        { n: 8, c: [0, 0], rot: 22.5 },
        { n: 4, c: [(1 + Math.SQRT2) / 2, (1 + Math.SQRT2) / 2], rot: 270 }
      ]
    }
  ];

  /* ------------------------------------------------------- shared machinery */

  /**
   * Merges points that coincide to within `tol`. Coordinates here are exact
   * sums of a handful of terms so the error is ~1e-15, but probing the
   * neighbouring buckets avoids the one real hazard: two copies of a point
   * landing either side of a bucket boundary.
   */
  function makeVertexIndex(tol) {
    const cell = tol * 4;
    const buckets = new Map();
    const points = [];

    function id(x, y) {
      const bi = Math.round(x / cell);
      const bj = Math.round(y / cell);
      for (let di = -1; di <= 1; di += 1) {
        for (let dj = -1; dj <= 1; dj += 1) {
          const list = buckets.get(bi + di + ":" + (bj + dj));
          if (!list) continue;
          for (const index of list) {
            const p = points[index];
            if (Math.abs(p[0] - x) <= tol && Math.abs(p[1] - y) <= tol) return index;
          }
        }
      }
      const index = points.length;
      points.push([x, y]);
      const key = bi + ":" + bj;
      let list = buckets.get(key);
      if (!list) {
        list = [];
        buckets.set(key, list);
      }
      list.push(index);
      return index;
    }

    return { id, points };
  }

  function polygonArea(points) {
    let total = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      total += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(total) / 2;
  }

  function pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function distanceToBoundary(x, y, points) {
    let best = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy;
      let t = lengthSq ? ((x - ax) * dx + (y - ay) * dy) / lengthSq : 0;
      t = Math.max(0, Math.min(1, t));
      const distance = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
      if (distance < best) best = distance;
    }
    return best;
  }

  /**
   * Where to draw a tile's number or glyph, and how big it can be: the point
   * furthest from the tile's boundary, found by a coarse grid then refined.
   * The centroid will not do — on a dart it sits near the concave notch, and on
   * a thin triangle it is far off the incentre.
   */
  function labelPoint(points) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    let bestX = (minX + maxX) / 2;
    let bestY = (minY + maxY) / 2;
    let best = pointInPolygon(bestX, bestY, points) ? distanceToBoundary(bestX, bestY, points) : -1;

    const steps = 7;
    for (let i = 1; i < steps; i += 1) {
      for (let j = 1; j < steps; j += 1) {
        const x = minX + ((maxX - minX) * i) / steps;
        const y = minY + ((maxY - minY) * j) / steps;
        if (!pointInPolygon(x, y, points)) continue;
        const distance = distanceToBoundary(x, y, points);
        if (distance > best) {
          best = distance;
          bestX = x;
          bestY = y;
        }
      }
    }

    let span = Math.max(maxX - minX, maxY - minY) / steps;
    for (let round = 0; round < 4; round += 1) {
      for (let i = -1; i <= 1; i += 1) {
        for (let j = -1; j <= 1; j += 1) {
          if (!i && !j) continue;
          const x = bestX + i * span;
          const y = bestY + j * span;
          if (!pointInPolygon(x, y, points)) continue;
          const distance = distanceToBoundary(x, y, points);
          if (distance > best) {
            best = distance;
            bestX = x;
            bestY = y;
          }
        }
      }
      span /= 2;
    }
    return { x: bestX, y: bestY, inradius: Math.max(best, 1e-6) };
  }

  function polygonPerimeter(points) {
    let total = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      total += Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
    return total;
  }

  /**
   * Turn a list of candidate polygons into the standard board structure: keep
   * the `tileCount` closest to the origin, index their corners, and read the
   * adjacency off shared corners.
   */
  /**
   * Link tiles whose corner falls partway along another tile's edge. Needed for
   * tilings that are not edge-to-edge — the pinwheel above all — where two tiles
   * can be plainly adjacent without sharing any corner.
   */
  function addEdgeContacts(tiles, sets, vertexAt, tolerance) {
    const cell = Math.max(tolerance * 20, 0.25);
    const buckets = new Map();
    vertexAt.forEach((owners, key) => {
      const [x, y] = key;
      const bk = Math.round(x / cell) + ":" + Math.round(y / cell);
      let list = buckets.get(bk);
      if (!list) {
        list = [];
        buckets.set(bk, list);
      }
      list.push({ x, y, owners });
    });

    for (const tile of tiles) {
      const points = tile.points;
      for (let i = 0; i < points.length; i += 1) {
        const [ax, ay] = points[i];
        const [bx, by] = points[(i + 1) % points.length];
        const dx = bx - ax;
        const dy = by - ay;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq === 0) continue;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / cell));
        const seen = new Set();
        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps;
          const bi = Math.round((ax + dx * t) / cell);
          const bj = Math.round((ay + dy * t) / cell);
          for (let di = -1; di <= 1; di += 1) {
            for (let dj = -1; dj <= 1; dj += 1) {
              const bk = bi + di + ":" + (bj + dj);
              if (seen.has(bk)) continue;
              seen.add(bk);
              const list = buckets.get(bk);
              if (!list) continue;
              for (const point of list) {
                // Distance from the corner to this edge, ignoring its own ends.
                const u = ((point.x - ax) * dx + (point.y - ay) * dy) / lengthSq;
                if (u <= 1e-9 || u >= 1 - 1e-9) continue;
                const px = ax + dx * u;
                const py = ay + dy * u;
                if (Math.hypot(point.x - px, point.y - py) > tolerance) continue;
                for (const other of point.owners) {
                  if (other === tile.id) continue;
                  sets[tile.id].add(other);
                  sets[other].add(tile.id);
                }
              }
            }
          }
        }
      }
    }
  }

  function assemble(candidates, tileCount, shapeOf, options) {
    const settings = options || {};
    candidates.sort((a, b) => a.cx * a.cx + a.cy * a.cy - (b.cx * b.cx + b.cy * b.cy));
    const kept = candidates.slice(0, Math.min(tileCount, candidates.length));

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const tile of kept) {
      for (const [x, y] of tile.points) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const shiftX = (minX + maxX) / 2;
    const shiftY = (minY + maxY) / 2;

    const index = makeVertexIndex(1e-6);
    const vertexTiles = new Map();
    const tiles = kept.map((tile, i) => {
      for (const [x, y] of tile.points) {
        const vid = index.id(x, y);
        let list = vertexTiles.get(vid);
        if (!list) {
          list = [];
          vertexTiles.set(vid, list);
        }
        list.push(i);
      }
      const points = tile.points.map(([x, y]) => [x - shiftX, y - shiftY]);
      const label = labelPoint(points);
      return {
        id: i,
        shape: shapeOf(tile),
        points,
        cx: tile.cx - shiftX,
        cy: tile.cy - shiftY,
        labelX: label.x,
        labelY: label.y,
        inradius: label.inradius
      };
    });

    const sets = tiles.map(() => new Set());
    for (const list of vertexTiles.values()) {
      for (let i = 0; i < list.length; i += 1) {
        for (let k = i + 1; k < list.length; k += 1) {
          sets[list[i]].add(list[k]);
          sets[list[k]].add(list[i]);
        }
      }
    }

    if (settings.edgeContacts) {
      const vertexAt = new Map();
      vertexTiles.forEach((owners, vid) => {
        const p = index.points[vid];
        vertexAt.set([p[0] - shiftX, p[1] - shiftY], owners);
      });
      addEdgeContacts(tiles, sets, vertexAt, settings.contactTolerance || 1e-6);
    }

    return {
      tiles,
      neighbors: sets.map((set) => Array.from(set)),
      bounds: {
        minX: minX - shiftX,
        minY: minY - shiftY,
        maxX: maxX - shiftX,
        maxY: maxY - shiftY,
        width: maxX - minX,
        height: maxY - minY
      }
    };
  }

  function shapeOrder(spec) {
    const sides = Array.from(new Set(spec.faces.map((f) => f.n)));
    // Largest polygon first, so the dominant tile keeps the primary colour.
    sides.sort((a, b) => b - a);
    return sides;
  }

  function buildPeriodic(spec, tileCount) {
    const cellArea = Math.abs(spec.t1[0] * spec.t2[1] - spec.t1[1] * spec.t2[0]);
    const perCell = spec.faces.length;
    const wanted = Math.max(1, Math.floor(tileCount));
    const radius = Math.sqrt((wanted * cellArea) / (Math.PI * perCell)) * 1.4 + 4;

    const len1 = Math.hypot(spec.t1[0], spec.t1[1]);
    const len2 = Math.hypot(spec.t2[0], spec.t2[1]);
    const margin = len1 + len2 + 4;
    const steps = Math.ceil((radius + margin) / Math.min(len1, len2)) + 2;

    const sides = shapeOrder(spec);
    const candidates = [];
    for (let i = -steps; i <= steps; i += 1) {
      for (let j = -steps; j <= steps; j += 1) {
        const ox = i * spec.t1[0] + j * spec.t2[0];
        const oy = i * spec.t1[1] + j * spec.t2[1];
        if (Math.hypot(ox, oy) > radius + margin) continue;
        for (const face of spec.faces) {
          const cx = ox + face.c[0];
          const cy = oy + face.c[1];
          if (Math.hypot(cx, cy) > radius) continue;
          candidates.push({ n: face.n, cx, cy, points: regularPolygon(face.n, cx, cy, face.rot) });
        }
      }
    }

    return assemble(candidates, wanted, (tile) => sides.indexOf(tile.n));
  }

  /* --------------------------------------- de Bruijn grid quasicrystals */

  /**
   * De Bruijn's dual-grid construction, generalised from the pentagrid that
   * produces Penrose P3 to any number of line families. N families of equally
   * spaced parallel lines, at pi/N to one another, dualise to a rhombic tiling
   * with 2N-fold orientational order: N=4 gives Ammann-Beenker (squares and
   * 45-degree rhombs, 8-fold), N=6 gives the dodecagonal rhombic tiling
   * (squares, 60- and 30-degree rhombs, 12-fold).
   *
   * Each intersection of a line from family r with one from family s becomes a
   * rhombus whose corners are the four grid regions meeting there, so tile
   * corners come out as exact integer combinations of the basis vectors.
   */
  const GRID_TILINGS = [
    {
      id: "ammann-beenker",
      name: "Ammann–Beenker",
      note: "8-fold quasicrystal",
      families: 4,
      // Generic offsets: the construction needs no three lines concurrent.
      offsets: [0.11, 0.29, -0.17, 0.23]
    },
    {
      id: "dodecagonal",
      name: "Dodecagonal",
      note: "12-fold quasicrystal",
      families: 6,
      offsets: [0.13, -0.07, 0.29, 0.19, -0.23, 0.09]
    }
  ];

  function gridBasis(n) {
    const basis = [];
    for (let j = 0; j < n; j += 1) {
      basis.push([Math.cos((Math.PI * j) / n), Math.sin((Math.PI * j) / n)]);
    }
    return basis;
  }

  // Rhombi from families r and s have acute angle min(d, N-d) * pi/N, so their
  // area is sin(m*pi/N). Shape 0 is the largest, matching the periodic tilings.
  function rhombShape(n, d) {
    return Math.floor(n / 2) - Math.min(d, n - d);
  }

  function gridShapeNames(n) {
    const names = [];
    for (let m = Math.floor(n / 2); m >= 1; m -= 1) {
      const degrees = Math.round((180 * m) / n);
      names.push(degrees === 90 ? "Square" : degrees + "° rhomb");
    }
    return names;
  }

  function collectGridRhombi(spec, basis, gridRadius) {
    const n = spec.families;
    const offsets = spec.offsets;
    const candidates = [];
    const kLimit = Math.ceil(gridRadius) + 1;
    const radiusSq = gridRadius * gridRadius;

    for (let r = 0; r < n; r += 1) {
      for (let s = r + 1; s < n; s += 1) {
        const [ar, br] = basis[r];
        const [as, bs] = basis[s];
        const det = ar * bs - br * as;
        const shape = rhombShape(n, s - r);

        for (let kr = -kLimit; kr <= kLimit; kr += 1) {
          const cr = kr - offsets[r];
          for (let ks = -kLimit; ks <= kLimit; ks += 1) {
            const cs = ks - offsets[s];
            const px = (cr * bs - br * cs) / det;
            const py = (ar * cs - cr * as) / det;
            if (px * px + py * py > radiusSq) continue;

            const indices = new Array(n);
            for (let j = 0; j < n; j += 1) {
              if (j === r) indices[j] = kr;
              else if (j === s) indices[j] = ks;
              else indices[j] = Math.ceil(px * basis[j][0] + py * basis[j][1] + offsets[j]);
            }

            let bx = 0;
            let by = 0;
            for (let j = 0; j < n; j += 1) {
              bx += indices[j] * basis[j][0];
              by += indices[j] * basis[j][1];
            }
            const points = [
              [bx, by],
              [bx + basis[r][0], by + basis[r][1]],
              [bx + basis[r][0] + basis[s][0], by + basis[r][1] + basis[s][1]],
              [bx + basis[s][0], by + basis[s][1]]
            ];
            candidates.push({
              shape,
              points,
              cx: (points[0][0] + points[2][0]) / 2,
              cy: (points[0][1] + points[2][1]) / 2
            });
          }
        }
      }
    }
    return candidates;
  }

  function buildGridTiling(spec, tileCount) {
    const n = spec.families;
    const basis = gridBasis(n);
    const wanted = Math.max(1, Math.floor(tileCount));

    // Intersections per unit area for a pair of families is sin of the angle
    // between them, and each intersection yields one tile.
    let density = 0;
    for (let r = 0; r < n; r += 1) {
      for (let s = r + 1; s < n; s += 1) density += Math.sin(((s - r) * Math.PI) / n);
    }

    let gridRadius = 1.35 * Math.sqrt(wanted / (Math.PI * density)) + 2;
    let candidates = collectGridRhombi(spec, basis, gridRadius);
    let guard = 0;
    while (candidates.length < wanted && guard < 8) {
      gridRadius *= 1.4;
      candidates = collectGridRhombi(spec, basis, gridRadius);
      guard += 1;
    }

    return assemble(candidates, wanted, (tile) => tile.shape);
  }

  /* ---------------------------------------------------------------- registry */

  /**
   * Mean corner-sharing neighbours for an interior tile, measured on an
   * 800-tile board (see the lattice validator, which re-measures and checks
   * these). Mine counts are derived from them so that every lattice presents
   * the same number of mines per clue at a given difficulty.
   */
  const AVG_NEIGHBORS = {
    penrose: 9.47,
    triangular: 12.0,
    square: 8.0,
    hexagonal: 6.0,
    trihexagonal: 7.93,
    "snub-hexagonal": 10.01,
    "elongated-triangular": 10.01,
    "snub-square": 10.02,
    rhombitrihexagonal: 8.09,
    "truncated-hexagonal": 5.89,
    "truncated-trihexagonal": 6.14,
    "truncated-square": 5.98,
    "ammann-beenker": 9.38,
    dodecagonal: 9.17
  };

  const LATTICES = [
    {
      id: "penrose",
      name: "Penrose (P3 rhombs)",
      vertexConfig: "aperiodic",
      shapeNames: ["Fat rhomb", "Thin rhomb"],
      build(tileCount) {
        const tiling = global.PenroseTiling.buildPenroseTiling(tileCount);
        for (const tile of tiling.tiles) {
          tile.shape = tile.fat ? 0 : 1;
          const label = labelPoint(tile.points);
          tile.labelX = label.x;
          tile.labelY = label.y;
          tile.inradius = label.inradius;
        }
        return tiling;
      }
    }
  ];

  const SHAPE_NAMES = { 3: "Triangle", 4: "Square", 6: "Hexagon", 8: "Octagon", 12: "Dodecagon" };

  for (const spec of GRID_TILINGS) {
    LATTICES.push({
      id: spec.id,
      name: spec.name + " (" + spec.note + ")",
      vertexConfig: spec.note,
      shapeNames: gridShapeNames(spec.families),
      spec,
      build(tileCount) {
        return buildGridTiling(spec, tileCount);
      }
    });
  }

  for (const spec of ARCHIMEDEAN) {
    LATTICES.push({
      id: spec.id,
      name: spec.name + " (" + spec.vertexConfig + ")",
      vertexConfig: spec.vertexConfig,
      shapeNames: shapeOrder(spec).map((n) => SHAPE_NAMES[n] || n + "-gon"),
      spec,
      build(tileCount) {
        return buildPeriodic(spec, tileCount);
      }
    });
  }

  for (const lattice of LATTICES) lattice.avgNeighbors = AVG_NEIGHBORS[lattice.id];

  const byId = new Map(LATTICES.map((lattice) => [lattice.id, lattice]));

  /**
   * Add a lattice defined in another file. Constructions that are neither
   * periodic nor dual-grid (substitution tilings, Voronoi) live separately but
   * register here so the game sees one list.
   */
  function register(lattice) {
    if (byId.has(lattice.id)) return;
    if (lattice.avgNeighbors === undefined) lattice.avgNeighbors = AVG_NEIGHBORS[lattice.id];
    LATTICES.push(lattice);
    byId.set(lattice.id, lattice);
  }

  global.Lattices = {
    LATTICES,
    ARCHIMEDEAN,
    AVG_NEIGHBORS,
    get: (id) => byId.get(id) || byId.get("penrose"),
    register,
    assemble,
    makeVertexIndex,
    buildPeriodic,
    buildGridTiling,
    GRID_TILINGS,
    regularPolygon,
    circumradius,
    apothem,
    polygonArea,
    polygonPerimeter,
    labelPoint
  };
})(typeof window !== "undefined" ? window : globalThis);
