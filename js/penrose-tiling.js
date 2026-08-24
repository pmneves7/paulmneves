/**
 * Rhombic (P3) Penrose tiling generation via de Bruijn's pentagrid.
 *
 * Five families of equally spaced parallel lines are laid over the plane; each
 * intersection of a line from family r with a line from family s maps to one
 * rhombus of the dual tiling. See N. G. de Bruijn, Indagationes Mathematicae 43
 * (1981) 39-66. The offsets gamma_j sum to an integer, which is the condition
 * for the dual to be a genuine Penrose tiling rather than a generalised one.
 */
(function (global) {
  "use strict";

  const FAMILIES = 5;
  const TAU = Math.PI * 2;

  // Unit normals of the five line families.
  const BASIS = [];
  for (let j = 0; j < FAMILIES; j += 1) {
    BASIS.push([Math.cos((TAU * j) / FAMILIES), Math.sin((TAU * j) / FAMILIES)]);
  }

  // Generic offsets summing to 1. Avoiding a symmetric choice keeps three or
  // more grid lines from ever meeting at a point, which would break the dual.
  const DEFAULT_OFFSETS = [0.3, 0.2, 0.15, 0.25, 0.1];

  // Empirical: a pentagrid disc of radius R yields about this many rhombi.
  const TILES_PER_GRID_AREA = 24.2;

  function vertexPosition(indices) {
    let x = 0;
    let y = 0;
    for (let j = 0; j < FAMILIES; j += 1) {
      x += indices[j] * BASIS[j][0];
      y += indices[j] * BASIS[j][1];
    }
    return [x, y];
  }

  /**
   * Because the five basis vectors sum to zero, adding a constant to every
   * index names the same point. Subtracting the first index canonicalises it,
   * so shared corners get identical keys with no floating-point comparison.
   */
  function vertexKey(indices) {
    const base = indices[0];
    return (
      (indices[1] - base) +
      "," +
      (indices[2] - base) +
      "," +
      (indices[3] - base) +
      "," +
      (indices[4] - base)
    );
  }

  function collectRhombi(gridRadius, offsets) {
    const rhombi = [];
    const kLimit = Math.ceil(gridRadius) + 1;
    const radiusSq = gridRadius * gridRadius;

    for (let r = 0; r < FAMILIES; r += 1) {
      for (let s = r + 1; s < FAMILIES; s += 1) {
        const [ar, br] = BASIS[r];
        const [as, bs] = BASIS[s];
        const det = ar * bs - br * as;

        for (let kr = -kLimit; kr <= kLimit; kr += 1) {
          const cr = kr - offsets[r];
          for (let ks = -kLimit; ks <= kLimit; ks += 1) {
            const cs = ks - offsets[s];
            const px = (cr * bs - br * cs) / det;
            const py = (ar * cs - cr * as) / det;
            if (px * px + py * py > radiusSq) continue;

            const indices = new Array(FAMILIES);
            for (let j = 0; j < FAMILIES; j += 1) {
              if (j === r) {
                indices[j] = kr;
              } else if (j === s) {
                indices[j] = ks;
              } else {
                indices[j] = Math.ceil(px * BASIS[j][0] + py * BASIS[j][1] + offsets[j]);
              }
            }

            // The four grid regions meeting at this intersection become the
            // four corners of one rhombus.
            const corners = [indices.slice(), indices.slice(), indices.slice(), indices.slice()];
            corners[1][r] += 1;
            corners[2][r] += 1;
            corners[2][s] += 1;
            corners[3][s] += 1;

            const separation = Math.min(s - r, FAMILIES - (s - r));
            const points = corners.map(vertexPosition);
            rhombi.push({
              fat: separation === 1,
              corners,
              points,
              cx: (points[0][0] + points[2][0]) / 2,
              cy: (points[0][1] + points[2][1]) / 2
            });
          }
        }
      }
    }
    return rhombi;
  }

  /**
   * Build a roughly circular patch of exactly `tileCount` rhombi with unit edge
   * length, centred on the origin, together with an adjacency list. Two tiles
   * are neighbours when they share at least one corner, which mirrors the
   * eight-way adjacency of a square minesweeper grid (Penrose tiles average
   * about eight such neighbours too).
   */
  function buildPenroseTiling(tileCount, options) {
    const settings = options || {};
    const offsets = settings.offsets || DEFAULT_OFFSETS;
    const wanted = Math.max(1, Math.floor(tileCount));

    // Over-generate, then keep the innermost tiles so the patch edge is clean.
    let gridRadius = 1.35 * Math.sqrt(wanted / TILES_PER_GRID_AREA) + 2;
    let rhombi = collectRhombi(gridRadius, offsets);
    let guard = 0;
    while (rhombi.length < wanted && guard < 8) {
      gridRadius *= 1.4;
      rhombi = collectRhombi(gridRadius, offsets);
      guard += 1;
    }

    rhombi.sort((a, b) => a.cx * a.cx + a.cy * a.cy - (b.cx * b.cx + b.cy * b.cy));
    const kept = rhombi.slice(0, Math.min(wanted, rhombi.length));

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

    const vertexTiles = new Map();
    const tiles = kept.map((tile, index) => {
      const points = tile.points.map(([x, y]) => [x - shiftX, y - shiftY]);
      for (const corner of tile.corners) {
        const key = vertexKey(corner);
        const list = vertexTiles.get(key);
        if (list) {
          list.push(index);
        } else {
          vertexTiles.set(key, [index]);
        }
      }
      return {
        id: index,
        fat: tile.fat,
        points,
        cx: tile.cx - shiftX,
        cy: tile.cy - shiftY
      };
    });

    const neighborSets = tiles.map(() => new Set());
    for (const list of vertexTiles.values()) {
      for (let i = 0; i < list.length; i += 1) {
        for (let k = i + 1; k < list.length; k += 1) {
          neighborSets[list[i]].add(list[k]);
          neighborSets[list[k]].add(list[i]);
        }
      }
    }
    const neighbors = neighborSets.map((set) => Array.from(set));

    return {
      tiles,
      neighbors,
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

  global.PenroseTiling = {
    buildPenroseTiling,
    BASIS,
    DEFAULT_OFFSETS
  };
})(typeof window !== "undefined" ? window : globalThis);
