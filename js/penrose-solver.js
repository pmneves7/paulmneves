/**
 * Logical solver for minesweeper on an arbitrary adjacency graph.
 *
 * It plays a board using only forced moves, in increasing order of cost:
 *   1. trivial clues (a clue is satisfied, or every unknown neighbour is mined),
 *   2. the subset rule between overlapping clues,
 *   3. exhaustive enumeration of each frontier component, combined across
 *      components with the global mine budget.
 *
 * Used at board-generation time to reject layouts that would force a guess.
 * Deductions are sound but not complete: components larger than the configured
 * limits are skipped, so a board may be rejected that a perfect solver could
 * finish. It never claims a board is solvable when it is not.
 */
(function (global) {
  "use strict";

  const DEFAULT_LIMITS = {
    // Bound the enumeration by search effort rather than by tile count: a wide
    // frontier that is heavily constrained is cheap, while a loosely
    // constrained narrow one is not, and it is the effort that matters.
    maxComponentTiles: 160,
    maxNodes: 500000,
    maxSolutions: 200000,
    maxSolutionWork: 3000000
  };

  /**
   * Cheaper limits used while repairing a board. Counter-intuitively this beats
   * full strength at generation: each round costs a fraction as much, and a
   * board the weaker solver can finish is by construction one the stronger one
   * can finish too, so the guarantee is unaffected.
   */
  const REPAIR_LIMITS = {
    maxComponentTiles: 60,
    maxNodes: 20000,
    maxSolutions: 200000,
    maxSolutionWork: 300000
  };

  function convolve(a, b, cap) {
    const out = new Uint8Array(cap + 1);
    for (let i = 0; i < a.length && i <= cap; i += 1) {
      if (!a[i]) continue;
      for (let j = 0; j < b.length && i + j <= cap; j += 1) {
        if (b[j]) out[i + j] = 1;
      }
    }
    return out;
  }

  /**
   * Enumerate every mine assignment consistent with one frontier component.
   * Returns, per possible mine total k, which tiles can be mined and which can
   * be clear, or null when the component is too large to enumerate.
   */
  function enumerateComponent(component, limits, scratch) {
    const tiles = component.tiles;
    const n = tiles.length;
    if (n > limits.maxComponentTiles) return null;


    // Assign tiles in an order that finishes small constraints first: the
    // pruning tests only fire once a constraint is fully assigned, so a poor
    // order can cost orders of magnitude on a wide frontier.
    const bySize = component.constraints.slice().sort((a, b) => a.tiles.length - b.tiles.length);
    const localIndex = scratch.slot;
    const ordered = [];
    for (const c of bySize) {
      for (const t of c.tiles) {
        if (localIndex[t] === -1) {
          localIndex[t] = ordered.length;
          ordered.push(t);
        }
      }
    }
    for (const t of tiles) {
      if (localIndex[t] === -1) {
        localIndex[t] = ordered.length;
        ordered.push(t);
      }
    }

    const constraints = component.constraints.map((c) => ({
      idx: c.tiles.map((t) => localIndex[t]),
      need: c.need,
      unassigned: c.tiles.length,
      placed: 0
    }));

    const memberOf = [];
    for (let i = 0; i < n; i += 1) memberOf.push([]);
    constraints.forEach((c, ci) => c.idx.forEach((i) => memberOf[i].push(ci)));

    const assignment = new Uint8Array(n);
    const achievable = new Uint8Array(n + 1);
    const mineAt = new Array(n + 1).fill(null);
    const clearAt = new Array(n + 1).fill(null);
    // Recording a solution costs O(n), so wide components get fewer of them.
    const solutionCap = Math.min(limits.maxSolutions, Math.ceil(limits.maxSolutionWork / n));
    let solutions = 0;
    let nodes = 0;
    let overflowed = false;

    function record(k) {
      achievable[k] = 1;
      if (!mineAt[k]) {
        mineAt[k] = new Uint8Array(n);
        clearAt[k] = new Uint8Array(n);
      }
      const mineRow = mineAt[k];
      const clearRow = clearAt[k];
      for (let i = 0; i < n; i += 1) {
        if (assignment[i]) mineRow[i] = 1;
        else clearRow[i] = 1;
      }
    }

    function search(i, k) {
      if (overflowed) return;
      nodes += 1;
      if (nodes > limits.maxNodes) {
        overflowed = true;
        return;
      }
      if (i === n) {
        solutions += 1;
        if (solutions > solutionCap) {
          overflowed = true;
          return;
        }
        record(k);
        return;
      }
      for (let value = 0; value <= 1; value += 1) {
        assignment[i] = value;
        let feasible = true;
        for (const ci of memberOf[i]) {
          const c = constraints[ci];
          c.unassigned -= 1;
          c.placed += value;
          if (c.placed > c.need || c.need - c.placed > c.unassigned) feasible = false;
        }
        if (feasible) search(i + 1, k + value);
        for (const ci of memberOf[i]) {
          const c = constraints[ci];
          c.unassigned += 1;
          c.placed -= value;
        }
        if (overflowed) return;
      }
    }

    search(0, 0);
    for (let i = 0; i < n; i += 1) localIndex[tiles[i]] = -1;
    if (overflowed || solutions === 0) return null;
    return { tiles: ordered, size: n, achievable, mineAt, clearAt };
  }

  function splitComponents(constraints, scratch) {
    const slot = scratch.slot;
    const tiles = [];
    for (const c of constraints) {
      for (const t of c.tiles) {
        if (slot[t] === -1) {
          slot[t] = tiles.length;
          tiles.push(t);
        }
      }
    }

    const parent = new Int32Array(tiles.length);
    for (let i = 0; i < parent.length; i += 1) parent[i] = i;
    function find(x) {
      let root = x;
      while (parent[root] !== root) root = parent[root];
      while (parent[x] !== root) {
        const next = parent[x];
        parent[x] = root;
        x = next;
      }
      return root;
    }
    for (const c of constraints) {
      const first = slot[c.tiles[0]];
      for (let i = 1; i < c.tiles.length; i += 1) {
        const a = find(first);
        const b = find(slot[c.tiles[i]]);
        if (a !== b) parent[a] = b;
      }
    }

    const groups = [];
    const groupOf = new Int32Array(tiles.length).fill(-1);
    for (let i = 0; i < tiles.length; i += 1) {
      const root = find(i);
      if (groupOf[root] === -1) {
        groupOf[root] = groups.length;
        groups.push({ tiles: [], constraints: [] });
      }
      groups[groupOf[root]].tiles.push(tiles[i]);
    }
    for (const c of constraints) groups[groupOf[find(slot[c.tiles[0]])]].constraints.push(c);

    for (const t of tiles) slot[t] = -1;
    return groups;
  }

  /**
   * Play the board with forced moves only. `board.mines` and `board.counts`
   * describe the true layout; the solver reads a tile's count only after it has
   * proved that tile safe.
   */
  function solve(board, options) {
    const limits = Object.assign({}, DEFAULT_LIMITS, options || {});
    const neighbors = board.neighbors;
    const counts = board.counts;
    const tileCount = board.tileCount;
    const mineCount = board.mineCount;

    const revealed = new Uint8Array(tileCount);
    const known = new Uint8Array(tileCount);
    // Reused across every deduction round; callees must leave it as they found it.
    const scratch = { slot: new Int32Array(tileCount).fill(-1), stamp: new Int32Array(tileCount).fill(-1) };
    let stampCounter = 0;
    let revealedCount = 0;
    let knownCount = 0;
    const target = tileCount - mineCount;

    // Clues that may still constrain something. Kept incrementally: rescanning
    // every tile each deduction round dominates the cost on large boards.
    let clues = [];

    function open(id) {
      if (revealed[id] || known[id]) return;
      const stack = [id];
      while (stack.length) {
        const current = stack.pop();
        if (revealed[current] || known[current]) continue;
        revealed[current] = 1;
        revealedCount += 1;
        if (counts[current] === 0) {
          for (const nb of neighbors[current]) if (!revealed[nb]) stack.push(nb);
        } else {
          clues.push(current);
        }
      }
    }

    function buildConstraints() {
      const list = [];
      let keep = 0;
      for (let i = 0; i < clues.length; i += 1) {
        const id = clues[i];
        let need = counts[id];
        const unknown = [];
        for (const nb of neighbors[id]) {
          if (known[nb]) need -= 1;
          else if (!revealed[nb]) unknown.push(nb);
        }
        // A clue with nothing unknown left can never constrain anything again.
        if (unknown.length === 0) continue;
        clues[keep] = id;
        keep += 1;
        list.push({ tiles: unknown, need });
      }
      clues.length = keep;
      return list;
    }

    function hiddenTiles() {
      const list = [];
      for (let id = 0; id < tileCount; id += 1) {
        if (!revealed[id] && !known[id]) list.push(id);
      }
      return list;
    }

    function simpleStep(constraints) {
      const safe = new Set();
      const mine = new Set();

      const remainingMines = mineCount - knownCount;
      const hidden = tileCount - revealedCount - knownCount;
      if (remainingMines === 0) {
        for (const id of hiddenTiles()) safe.add(id);
        return { safe, mine };
      }
      if (remainingMines === hidden) {
        for (const id of hiddenTiles()) mine.add(id);
        return { safe, mine };
      }

      for (const c of constraints) {
        if (c.need === 0) c.tiles.forEach((t) => safe.add(t));
        else if (c.need === c.tiles.length) c.tiles.forEach((t) => mine.add(t));
      }
      if (safe.size || mine.size) return { safe, mine };

      const byTile = new Map();
      constraints.forEach((c, i) => {
        for (const t of c.tiles) {
          let list = byTile.get(t);
          if (!list) {
            list = [];
            byTile.set(t, list);
          }
          list.push(i);
        }
      });

      const stamp = scratch.stamp;
      for (let i = 0; i < constraints.length; i += 1) {
        const a = constraints[i];
        stampCounter += 1;
        const aStamp = stampCounter;
        for (const t of a.tiles) stamp[t] = aStamp;

        const candidates = new Set();
        for (const t of a.tiles) for (const j of byTile.get(t)) if (j !== i) candidates.add(j);
        for (const j of candidates) {
          const b = constraints[j];
          if (b.tiles.length <= a.tiles.length) continue;
          // A is a subset of B when every tile of A carries A's stamp inside B.
          let shared = 0;
          const diff = [];
          for (const t of b.tiles) {
            if (stamp[t] === aStamp) shared += 1;
            else diff.push(t);
          }
          if (shared !== a.tiles.length) continue;
          const delta = b.need - a.need;
          if (delta === 0) for (const t of diff) safe.add(t);
          else if (delta === diff.length) for (const t of diff) mine.add(t);
        }
      }
      return { safe, mine };
    }

    function exhaustiveStep(constraints) {
      const safe = new Set();
      const mine = new Set();
      const components = splitComponents(constraints, scratch);
      const analyzed = components.map((c) => enumerateComponent(c, limits, scratch));
      const complete = analyzed.every((a) => a !== null);
      const budget = mineCount - knownCount;

      // Local deductions hold regardless of the global mine budget.
      for (const info of analyzed) {
        if (!info) continue;
        for (let i = 0; i < info.size; i += 1) {
          let canMine = false;
          let canClear = false;
          for (let k = 0; k <= info.size; k += 1) {
            if (!info.achievable[k]) continue;
            if (info.mineAt[k][i]) canMine = true;
            if (info.clearAt[k][i]) canClear = true;
          }
          if (!canMine) safe.add(info.tiles[i]);
          else if (!canClear) mine.add(info.tiles[i]);
        }
      }
      if (!complete || safe.size || mine.size) return { safe, mine };

      // Every component enumerated: fold in the global budget, which is what
      // resolves the endgame cases a purely local reading has to guess at.
      // Only now is the full sweep for off-frontier tiles worth paying for.
      const frontier = new Set();
      for (const c of components) for (const t of c.tiles) frontier.add(t);
      const outside = hiddenTiles().filter((id) => !frontier.has(id));
      const outsidePoly = new Uint8Array(outside.length + 1).fill(1);
      const prefix = [new Uint8Array([1])];
      for (let i = 0; i < analyzed.length; i += 1) {
        prefix.push(convolve(prefix[i], analyzed[i].achievable, budget));
      }
      const suffix = new Array(analyzed.length + 1);
      suffix[analyzed.length] = outsidePoly;
      for (let i = analyzed.length - 1; i >= 0; i -= 1) {
        suffix[i] = convolve(analyzed[i].achievable, suffix[i + 1], budget);
      }

      for (let ci = 0; ci < analyzed.length; ci += 1) {
        const info = analyzed[ci];
        const others = convolve(prefix[ci], suffix[ci + 1], budget);
        for (let i = 0; i < info.size; i += 1) {
          let canMine = false;
          let canClear = false;
          for (let k = 0; k <= info.size && k <= budget; k += 1) {
            if (!info.achievable[k] || !others[budget - k]) continue;
            if (info.mineAt[k][i]) canMine = true;
            if (info.clearAt[k][i]) canClear = true;
          }
          if (!canMine) safe.add(info.tiles[i]);
          else if (!canClear) mine.add(info.tiles[i]);
        }
      }

      if (outside.length > 0) {
        const allComponents = prefix[analyzed.length];
        let minOutside = Infinity;
        let maxOutside = -Infinity;
        for (let j = 0; j <= outside.length && j <= budget; j += 1) {
          if (!allComponents[budget - j]) continue;
          if (j < minOutside) minOutside = j;
          if (j > maxOutside) maxOutside = j;
        }
        if (maxOutside === 0) outside.forEach((t) => safe.add(t));
        else if (minOutside === outside.length) outside.forEach((t) => mine.add(t));
      }

      return { safe, mine };
    }

    open(board.firstId);

    let stalled = false;
    while (revealedCount < target && !stalled) {
      const constraints = buildConstraints();
      let step = simpleStep(constraints);
      if (step.safe.size === 0 && step.mine.size === 0) {
        step = exhaustiveStep(constraints);
      }
      if (step.safe.size === 0 && step.mine.size === 0) {
        stalled = true;
        break;
      }
      for (const id of step.mine) {
        if (!known[id]) {
          known[id] = 1;
          knownCount += 1;
        }
      }
      for (const id of step.safe) open(id);
    }

    const stuck = [];
    if (stalled) {
      for (let id = 0; id < tileCount; id += 1) {
        if (revealed[id] || known[id]) continue;
        for (const nb of neighbors[id]) {
          if (revealed[nb]) {
            stuck.push(id);
            break;
          }
        }
      }
    }

    return {
      solved: revealedCount === target,
      revealed: revealedCount,
      target,
      stuck,
      revealedMask: revealed,
      knownMask: known
    };
  }

  function isSolvable(board, options) {
    return solve(board, options).solved;
  }

  /**
   * Build a mine layout that the solver above can finish without guessing.
   *
   * Whole-board solvability is exponentially unlikely to occur by chance, so
   * re-rolling the board is hopeless past a hundred tiles or so. Instead the
   * layout is repaired: wherever the solver stalls, a mine is moved out of the
   * ambiguous frontier and into untouched ground, and the solve restarts. The
   * stuck region shrinks round by round until the board falls.
   *
   * Returns { mines, counts, guessFree, rounds }. `guessFree` is false when the
   * budget ran out, in which case the last layout is returned as-is.
   */
  function generate(spec) {
    const neighbors = spec.neighbors;
    const tileCount = spec.tileCount;
    const mineCount = spec.mineCount;
    const firstId = spec.firstId;
    const random = spec.random || Math.random;
    // Rounds are cheap when the solver stalls early, so time is the real
    // budget; the round cap is only a runaway guard.
    const maxRounds = spec.maxRounds === undefined ? 100000 : spec.maxRounds;
    const restartAfter = spec.restartAfter === undefined ? 120 : spec.restartAfter;
    const repairLimits = spec.limits || REPAIR_LIMITS;
    const budgetMs = spec.budgetMs === undefined ? 2500 : spec.budgetMs;

    const mines = new Uint8Array(tileCount);
    const counts = new Uint8Array(tileCount);

    // Keep the first click and its neighbours clear so the opening move always
    // expands, unless the board is too dense to afford the whole pocket.
    const safe = new Uint8Array(tileCount);
    safe[firstId] = 1;
    let safeSize = 1;
    for (const nb of neighbors[firstId]) {
      safe[nb] = 1;
      safeSize += 1;
    }
    if (tileCount - safeSize < mineCount) {
      safe.fill(0);
      safe[firstId] = 1;
    }

    const pool = [];
    for (let id = 0; id < tileCount; id += 1) if (!safe[id]) pool.push(id);
    const placeable = Math.min(mineCount, pool.length);

    function scatter() {
      mines.fill(0);
      for (let i = 0; i < placeable; i += 1) {
        const j = i + Math.floor(random() * (pool.length - i));
        const swap = pool[i];
        pool[i] = pool[j];
        pool[j] = swap;
        mines[pool[i]] = 1;
      }
      counts.fill(0);
      for (let id = 0; id < tileCount; id += 1) {
        let total = 0;
        for (const nb of neighbors[id]) if (mines[nb]) total += 1;
        counts[id] = total;
      }
    }

    function moveMine(from, to) {
      mines[from] = 0;
      mines[to] = 1;
      for (const nb of neighbors[from]) counts[nb] -= 1;
      for (const nb of neighbors[to]) counts[nb] += 1;
    }

    scatter();
    if (!spec.guessFree) return { mines, counts, guessFree: false, rounds: 0 };

    // Hill climb on how far the solver gets. A perturbation that loses ground
    // is rolled back, and the step size grows while progress is stalled.
    const bestMines = mines.slice();
    const bestCounts = counts.slice();
    let bestRevealed = -1;
    let bestStuck = null;
    let bestRevealedMask = null;
    let stagnation = 0;

    const started = Date.now();
    let rounds = 0;
    while (rounds < maxRounds && Date.now() - started < budgetMs) {
      rounds += 1;
      const result = solve({ neighbors, mines, counts, tileCount, mineCount: placeable, firstId }, repairLimits);
      if (result.solved) return { mines, counts, guessFree: true, rounds };

      if (result.revealed >= bestRevealed) {
        if (result.revealed > bestRevealed) stagnation = 0;
        else stagnation += 1;
        bestRevealed = result.revealed;
        bestMines.set(mines);
        bestCounts.set(counts);
        bestStuck = result.stuck;
        bestRevealedMask = result.revealedMask;
      } else {
        stagnation += 1;
        mines.set(bestMines);
        counts.set(bestCounts);
      }

      const revealed = bestRevealedMask;
      const stuckSet = new Uint8Array(tileCount);
      for (const id of bestStuck) stuckSet[id] = 1;

      // Take mines out of the ambiguous frontier...
      const donors = [];
      for (const id of bestStuck) if (mines[id]) donors.push(id);
      if (donors.length === 0) {
        for (let id = 0; id < tileCount; id += 1) {
          if (!mines[id] || revealed[id] || stuckSet[id]) continue;
          for (const nb of neighbors[id]) {
            if (stuckSet[nb]) {
              donors.push(id);
              break;
            }
          }
        }
      }
      // ...and put them back anywhere else still hidden, so the mines that are
      // left do not pile up into the shrinking unexplored region.
      const receivers = [];
      for (let id = 0; id < tileCount; id += 1) {
        if (mines[id] || safe[id] || revealed[id] || stuckSet[id]) continue;
        receivers.push(id);
      }

      // A hill climb can settle into a layout it cannot repair; start over
      // from a fresh scatter rather than burning the budget in place.
      if (donors.length === 0 || receivers.length === 0 || stagnation > restartAfter) {
        scatter();
        bestRevealed = -1;
        stagnation = 0;
        continue;
      }

      const moves = Math.min(donors.length, receivers.length, 1 + Math.floor(stagnation / 3));
      for (let m = 0; m < moves; m += 1) {
        const from = donors.splice(Math.floor(random() * donors.length), 1)[0];
        const to = receivers.splice(Math.floor(random() * receivers.length), 1)[0];
        moveMine(from, to);
      }
    }

    mines.set(bestMines);
    counts.set(bestCounts);
    return { mines, counts, guessFree: false, rounds };
  }

  global.PenroseSolver = { solve, isSolvable, generate, DEFAULT_LIMITS, REPAIR_LIMITS };
})(typeof window !== "undefined" ? window : globalThis);
