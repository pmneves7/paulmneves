/**
 * Rhombic (P3) Penrose tiling generation via de Bruijn's pentagrid.
 *
 * Five families of equally spaced parallel lines are laid over the plane; each
 * intersection of a line from family r with a line from family s maps to one
 * rhombus of the dual tiling. See N. G. de Bruijn, Indagationes Mathematicae 43
 * (1981) 39-66.
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

  /**
   * Equal offsets make the whole construction commute with a 72-degree
   * rotation, so the patch comes out with exact five-fold symmetry and five
   * mirror lines. The value matters: when the offsets sum to a whole number the
   * grid is singular — three lines meet at a point, `ceil` lands on an exact
   * integer and the dual breaks — which is why 0 leaves gaps and overlaps and
   * 0.2 loses the symmetry. Summing to 2.5 avoids that. It does mean this is a
   * generalised Penrose tiling in de Bruijn's sense rather than one satisfying
   * the matching rules, but it is the same two rhombi in the same golden ratio.
   */
  const DEFAULT_OFFSETS = [0.5, 0.5, 0.5, 0.5, 0.5];

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
   * Every rhombus of a patch big enough to cut a board of `tileCount` from,
   * as raw candidates. Selecting which ones make up the board — and the
   * adjacency — is left to the shared assembler in lattices.js, so Penrose gets
   * the same clean, symmetric edge treatment as every other lattice.
   */
  function collectPenroseCandidates(tileCount, options) {
    const settings = options || {};
    const offsets = settings.offsets || DEFAULT_OFFSETS;
    const wanted = Math.max(1, Math.floor(tileCount));
    const rotation = (settings.rotation || 0) * (Math.PI / 180);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    // Generous margin: rhombi right at the edge of the generated disc are
    // clipped by floating-point luck rather than symmetrically, so keep that
    // edge well outside the part of the patch the board is cut from.
    let gridRadius = 1.7 * Math.sqrt(wanted / TILES_PER_GRID_AREA) + 3;
    let rhombi = collectRhombi(gridRadius, offsets);
    let guard = 0;
    while (rhombi.length < wanted * 1.5 && guard < 8) {
      gridRadius *= 1.4;
      rhombi = collectRhombi(gridRadius, offsets);
      guard += 1;
    }

    for (const tile of rhombi) {
      if (rotation) {
        tile.points = tile.points.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
      }
      tile.cx = (tile.points[0][0] + tile.points[2][0]) / 2;
      tile.cy = (tile.points[0][1] + tile.points[2][1]) / 2;
      tile.shape = tile.fat ? 0 : 1;
    }
    return rhombi;
  }

  function buildPenroseTiling(tileCount, options) {
    const candidates = collectPenroseCandidates(tileCount, options);
    return global.Lattices.assemble(candidates, Math.max(1, Math.floor(tileCount)), (tile) => tile.shape);
  }

  global.PenroseTiling = {
    buildPenroseTiling,
    collectPenroseCandidates,
    BASIS,
    DEFAULT_OFFSETS
  };
})(typeof window !== "undefined" ? window : globalThis);
