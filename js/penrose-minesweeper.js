/**
 * Minesweeper played on an aperiodic Penrose rhombus tiling.
 * Tiles are neighbours when they share at least one corner.
 */
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  /**
   * Difficulty is set by mines *per clue* rather than by mine density, because
   * that is what governs how much each revealed number tells you. Lattices
   * differ a lot in how many neighbours a tile has (6 on the hexagonal tiling,
   * 12 on the triangular one), so a fixed density would make them wildly
   * different games. Normalising this way happens to reproduce classic
   * minesweeper's own densities on the square lattice.
   */
  const DIFFICULTIES = {
    beginner: { label: "Beginner", tiles: 120, minesPerClue: 0.95 },
    medium: { label: "Medium", tiles: 350, minesPerClue: 1.24 },
    hard: { label: "Hard", tiles: 800, minesPerClue: 1.45 },
    expert: { label: "Expert", tiles: 1000, minesPerClue: 1.65 }
  };

  const MIN_DENSITY = 0.06;
  const MAX_DENSITY = 0.26;

  function minesForPreset(preset, lattice) {
    const density = Math.min(MAX_DENSITY, Math.max(MIN_DENSITY, preset.minesPerClue / lattice.avgNeighbors));
    return Math.max(1, Math.round(preset.tiles * density));
  }

  const MIN_TILES = 20;
  const MAX_TILES = 5000;
  const VIEW_PADDING = 1.04;
  const MAX_ZOOM = 14;
  const DRAG_THRESHOLD = 5;
  const LONG_PRESS_MS = 450;
  const GENERATE_BUDGET_MS = 6000;
  const GENERATE_MAX_ROUNDS = 100000;

  const latticeSelect = document.getElementById("ms-lattice");
  const difficultySelect = document.getElementById("ms-difficulty");
  const customFields = document.getElementById("ms-custom-fields");
  const customTilesInput = document.getElementById("ms-custom-tiles");
  const customMinesInput = document.getElementById("ms-custom-mines");
  const customDensityOutput = document.getElementById("ms-custom-density");
  const newGameButton = document.getElementById("ms-new");
  const faceButton = document.getElementById("ms-face");
  const mineReadout = document.getElementById("ms-mines");
  const timerReadout = document.getElementById("ms-timer");
  const boardSvg = document.getElementById("ms-board");
  const boardWrap = document.getElementById("ms-board-wrap");
  const boardLayer = document.getElementById("ms-layer");
  const highlightLayer = document.getElementById("ms-highlight");
  const marksLayer = document.getElementById("ms-marks");
  const overlay = document.getElementById("ms-overlay");
  const overlayTitle = document.getElementById("ms-overlay-title");
  const overlayBody = document.getElementById("ms-overlay-body");
  const overlayButton = document.getElementById("ms-overlay-new");
  const overlayFace = document.getElementById("ms-overlay-face");
  const overlayClose = document.getElementById("ms-overlay-close");
  const flagModeInput = document.getElementById("ms-flag-mode");
  const noGuessInput = document.getElementById("ms-no-guess");
  const generatingBanner = document.getElementById("ms-generating");
  const statusLine = document.getElementById("ms-status-line");

  const FACES = {
    idle: "🙂",
    pressed: "😮",
    won: "😎",
    lost: "😵"
  };

  let tiles = [];
  let neighbors = [];
  let tileEls = [];
  let tileMarks = [];
  let tileCount = 0;
  let mineCount = 0;

  let mines = null;
  let counts = null;
  let revealed = null;
  let flagged = null;

  let minesPlaced = false;
  let gameOver = false;
  let gameWon = false;
  let revealedCount = 0;
  let flagCount = 0;
  let hitId = -1;
  let generating = false;

  let startTime = 0;
  let elapsedMs = 0;
  let timerId = 0;

  const view = { cx: 0, cy: 0, upp: 1 };
  let bounds = null;
  let fitUpp = 1;

  /* ---------------------------------------------------------------- board */

  function pointsAttr(tile) {
    let out = "";
    for (let i = 0; i < tile.points.length; i += 1) {
      if (i > 0) out += " ";
      out += tile.points[i][0].toFixed(4) + "," + tile.points[i][1].toFixed(4);
    }
    return out;
  }

  function currentLattice() {
    return window.Lattices.get(latticeSelect.value);
  }

  function buildBoard(requestedTiles) {
    const tiling = currentLattice().build(requestedTiles);
    tiles = tiling.tiles;
    neighbors = tiling.neighbors;
    bounds = tiling.bounds;
    tileCount = tiles.length;

    hoveredId = -1;
    while (highlightLayer.firstChild) highlightLayer.removeChild(highlightLayer.firstChild);
    while (marksLayer.firstChild) marksLayer.removeChild(marksLayer.firstChild);
    while (boardLayer.firstChild) boardLayer.removeChild(boardLayer.firstChild);
    tileEls = new Array(tileCount);
    tileMarks = [];
    for (let i = 0; i < tileCount; i += 1) tileMarks.push([]);
    const fragment = document.createDocumentFragment();
    for (const tile of tiles) {
      const group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("class", "ms-tile ms-s" + tile.shape);
      group.setAttribute("data-id", String(tile.id));
      const polygon = document.createElementNS(SVG_NS, "polygon");
      polygon.setAttribute("points", pointsAttr(tile));
      group.appendChild(polygon);
      fragment.appendChild(group);
      tileEls[tile.id] = group;
    }
    boardLayer.appendChild(fragment);
  }

  // Numbers, flags and mines are drawn in a layer above the hover highlight, so
  // the highlight can be as strong as it likes without washing them out.
  function clearMarks(id) {
    const marks = tileMarks[id];
    for (const node of marks) marksLayer.removeChild(node);
    marks.length = 0;
  }

  function addMark(id, node) {
    node.setAttribute("data-id", String(id));
    tileMarks[id].push(node);
    marksLayer.appendChild(node);
  }

  function addNumber(id, tile, value) {
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("class", "ms-number ms-number-" + value);
    text.setAttribute("x", tile.labelX.toFixed(4));
    text.setAttribute("y", tile.labelY.toFixed(4));
    text.setAttribute("font-size", (tile.inradius * 1.15).toFixed(4));
    text.textContent = String(value);
    addMark(id, text);
  }

  function addFlag(id, tile, wrong) {
    const s = tile.inradius * 1.12;
    const flag = document.createElementNS(SVG_NS, "g");
    flag.setAttribute("class", "ms-flag" + (wrong ? " is-wrong" : ""));
    flag.setAttribute("transform", "translate(" + tile.labelX.toFixed(4) + " " + tile.labelY.toFixed(4) + ") scale(" + s.toFixed(4) + ")");

    const pole = document.createElementNS(SVG_NS, "path");
    pole.setAttribute("class", "ms-flag-pole");
    pole.setAttribute("d", "M0.06 -0.66 L0.06 0.5 M-0.42 0.6 L0.46 0.6");
    flag.appendChild(pole);

    const banner = document.createElementNS(SVG_NS, "path");
    banner.setAttribute("class", "ms-flag-banner");
    banner.setAttribute("d", "M0.02 -0.66 L-0.6 -0.3 L0.02 0.04 Z");
    flag.appendChild(banner);

    if (wrong) {
      const cross = document.createElementNS(SVG_NS, "path");
      cross.setAttribute("class", "ms-flag-cross");
      cross.setAttribute("d", "M-0.62 -0.62 L0.62 0.62 M0.62 -0.62 L-0.62 0.62");
      flag.appendChild(cross);
    }
    addMark(id, flag);
  }

  function addMine(id, tile, hit) {
    const s = tile.inradius;
    const mine = document.createElementNS(SVG_NS, "g");
    mine.setAttribute("class", "ms-mine" + (hit ? " is-hit" : ""));
    mine.setAttribute("transform", "translate(" + tile.labelX.toFixed(4) + " " + tile.labelY.toFixed(4) + ") scale(" + s.toFixed(4) + ")");

    const spikes = document.createElementNS(SVG_NS, "path");
    spikes.setAttribute("class", "ms-mine-spikes");
    spikes.setAttribute("d", "M-0.78 0 L0.78 0 M0 -0.78 L0 0.78 M-0.55 -0.55 L0.55 0.55 M0.55 -0.55 L-0.55 0.55");
    mine.appendChild(spikes);

    const body = document.createElementNS(SVG_NS, "circle");
    body.setAttribute("class", "ms-mine-body");
    body.setAttribute("r", "0.5");
    mine.appendChild(body);

    const glint = document.createElementNS(SVG_NS, "circle");
    glint.setAttribute("class", "ms-mine-glint");
    glint.setAttribute("cx", "-0.17");
    glint.setAttribute("cy", "-0.17");
    glint.setAttribute("r", "0.12");
    mine.appendChild(glint);

    addMark(id, mine);
  }

  function paintTile(id) {
    const group = tileEls[id];
    const tile = tiles[id];
    clearMarks(id);

    let cls = "ms-tile ms-s" + tile.shape;
    if (revealed[id]) {
      cls += " is-revealed";
      if (mines[id]) {
        cls += " is-mine";
        if (id === hitId) cls += " is-hit";
        addMine(id, tile, id === hitId);
      } else if (counts[id] > 0) {
        addNumber(id, tile, counts[id]);
      }
    } else if (flagged[id]) {
      const wrong = gameOver && !gameWon && !mines[id];
      cls += wrong ? " is-flag-wrong" : " is-flagged";
      addFlag(id, tile, wrong);
    }
    group.setAttribute("class", cls);
  }

  function paintAll() {
    for (let id = 0; id < tileCount; id += 1) paintTile(id);
  }

  /* ----------------------------------------------------------- highlight */

  let hoveredId = -1;

  function outlineFor(id, className) {
    const polygon = document.createElementNS(SVG_NS, "polygon");
    polygon.setAttribute("class", className);
    polygon.setAttribute("points", pointsAttr(tiles[id]));
    return polygon;
  }

  // Corner-sharing adjacency is hard to read off the tiling by eye, so hovering
  // a tile draws its whole neighbourhood.
  function setHover(id) {
    if (id === hoveredId) return;
    hoveredId = id;
    while (highlightLayer.firstChild) highlightLayer.removeChild(highlightLayer.firstChild);
    if (id < 0 || id >= tileCount) return;
    const fragment = document.createDocumentFragment();
    for (const other of neighbors[id]) fragment.appendChild(outlineFor(other, "ms-highlight-neighbor"));
    fragment.appendChild(outlineFor(id, "ms-highlight-self"));
    highlightLayer.appendChild(fragment);
  }

  /* ------------------------------------------------------------ view/zoom */

  function containerSize() {
    const rect = boardSvg.getBoundingClientRect();
    return {
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height)
    };
  }

  function applyView() {
    const size = containerSize();
    const w = size.width * view.upp;
    const h = size.height * view.upp;
    boardSvg.setAttribute(
      "viewBox",
      (view.cx - w / 2).toFixed(4) + " " + (view.cy - h / 2).toFixed(4) + " " + w.toFixed(4) + " " + h.toFixed(4)
    );
  }

  function computeFitUpp() {
    const size = containerSize();
    const w = (bounds.width || 1) * VIEW_PADDING;
    const h = (bounds.height || 1) * VIEW_PADDING;
    return Math.max(w / size.width, h / size.height);
  }

  function fitView() {
    fitUpp = computeFitUpp();
    view.upp = fitUpp;
    view.cx = (bounds.minX + bounds.maxX) / 2;
    view.cy = (bounds.minY + bounds.maxY) / 2;
    applyView();
  }

  function clampCenter() {
    const margin = Math.max(bounds.width, bounds.height) * 0.35;
    view.cx = Math.min(bounds.maxX + margin, Math.max(bounds.minX - margin, view.cx));
    view.cy = Math.min(bounds.maxY + margin, Math.max(bounds.minY - margin, view.cy));
  }

  function zoomAbout(userX, userY, factor) {
    const target = Math.min(fitUpp * 1.05, Math.max(fitUpp / MAX_ZOOM, view.upp / factor));
    const k = target / view.upp;
    view.cx = userX + (view.cx - userX) * k;
    view.cy = userY + (view.cy - userY) * k;
    view.upp = target;
    clampCenter();
    applyView();
  }

  function clientToUser(clientX, clientY) {
    const rect = boardSvg.getBoundingClientRect();
    const size = containerSize();
    const w = size.width * view.upp;
    const h = size.height * view.upp;
    return {
      x: view.cx - w / 2 + ((clientX - rect.left) / rect.width) * w,
      y: view.cy - h / 2 + ((clientY - rect.top) / rect.height) * h
    };
  }

  /* ---------------------------------------------------------- game state */

  function setFace(name) {
    faceButton.textContent = FACES[name];
  }

  function formatClock(ms) {
    const total = Math.floor(ms / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes + ":" + String(seconds).padStart(2, "0");
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.round(ms / 100) / 10);
    if (total < 60) return total.toFixed(1) + " s";
    const minutes = Math.floor(total / 60);
    const seconds = Math.round(total - minutes * 60);
    return minutes + " min " + String(seconds).padStart(2, "0") + " s";
  }

  function updateReadouts() {
    mineReadout.textContent = String(mineCount - flagCount);
    timerReadout.textContent = formatClock(elapsedMs);
  }

  function tick() {
    elapsedMs = Date.now() - startTime;
    timerReadout.textContent = formatClock(elapsedMs);
  }

  function startTimer() {
    if (timerId) return;
    startTime = Date.now() - elapsedMs;
    timerId = window.setInterval(tick, 200);
  }

  function stopTimer() {
    if (!timerId) return;
    window.clearInterval(timerId);
    timerId = 0;
  }

  function announce(message) {
    statusLine.textContent = message;
  }

  function placeMines(firstId) {
    const result = window.PenroseSolver.generate({
      neighbors,
      tileCount,
      mineCount,
      firstId,
      guessFree: noGuessInput.checked,
      budgetMs: GENERATE_BUDGET_MS,
      maxRounds: GENERATE_MAX_ROUNDS
    });
    mines = result.mines;
    counts = result.counts;
    minesPlaced = true;
    return result;
  }

  /**
   * Deal the board around the first click. Searching for a guess-free layout
   * takes long enough on the bigger boards to be worth a visible wait, so the
   * work is deferred one frame to let the banner paint first.
   */
  function dealBoard(firstId, done) {
    if (!noGuessInput.checked) {
      placeMines(firstId);
      done();
      return;
    }
    generating = true;
    generatingBanner.hidden = false;
    boardWrap.classList.add("is-generating");
    window.setTimeout(() => {
      const result = placeMines(firstId);
      generating = false;
      generatingBanner.hidden = true;
      boardWrap.classList.remove("is-generating");
      if (!result.guessFree) {
        announce("No guess-free layout found in time — this board may need a guess. Try a new game for another.");
      } else {
        announce(tileCount + " tiles, " + mineCount + " mines. This board needs no guessing.");
      }
      done();
    }, 30);
  }

  function revealFrom(id) {
    const stack = [id];
    const touched = [];
    while (stack.length) {
      const current = stack.pop();
      if (revealed[current] || flagged[current]) continue;
      revealed[current] = 1;
      revealedCount += 1;
      touched.push(current);
      if (counts[current] === 0 && !mines[current]) {
        for (const other of neighbors[current]) {
          if (!revealed[other] && !flagged[other]) stack.push(other);
        }
      }
    }
    for (const current of touched) paintTile(current);
  }

  function loseGame(explodedId) {
    gameOver = true;
    gameWon = false;
    hitId = explodedId;
    stopTimer();
    for (let id = 0; id < tileCount; id += 1) {
      if (mines[id] && !flagged[id]) revealed[id] = 1;
    }
    paintAll();
    setFace("lost");
    boardWrap.classList.add("is-over");
    showOverlay(FACES.lost, "Boom.", "Mine hit after " + formatDuration(elapsedMs) + ". Every remaining mine is shown.");
    announce("Game over. You hit a mine.");
  }

  function winGame() {
    gameOver = true;
    gameWon = true;
    stopTimer();
    for (let id = 0; id < tileCount; id += 1) {
      if (mines[id] && !flagged[id]) {
        flagged[id] = 1;
        flagCount += 1;
      }
    }
    paintAll();
    updateReadouts();
    setFace("won");
    boardWrap.classList.add("is-over");
    showOverlay(
      FACES.won,
      "Cleared in " + formatDuration(elapsedMs) + "!",
      (tileCount - mineCount) + " tiles swept, all " + mineCount + " mines found."
    );
    announce("You cleared the board in " + formatDuration(elapsedMs) + ".");
  }

  function checkWin() {
    if (!gameOver && revealedCount === tileCount - mineCount) winGame();
  }

  function revealNow(id) {
    if (mines[id]) {
      revealed[id] = 1;
      loseGame(id);
      return;
    }
    revealFrom(id);
    updateReadouts();
    checkWin();
  }

  function reveal(id) {
    if (gameOver || generating || revealed[id] || flagged[id]) return;
    if (!minesPlaced) {
      dealBoard(id, () => {
        startTimer();
        revealNow(id);
      });
      return;
    }
    revealNow(id);
  }

  function toggleFlag(id) {
    if (gameOver || generating || revealed[id]) return;
    if (flagged[id]) {
      flagged[id] = 0;
      flagCount -= 1;
    } else {
      flagged[id] = 1;
      flagCount += 1;
    }
    paintTile(id);
    updateReadouts();
  }

  function chord(id) {
    if (gameOver || generating || !revealed[id] || mines[id] || counts[id] === 0) return;
    let flags = 0;
    for (const other of neighbors[id]) {
      if (flagged[other]) flags += 1;
    }
    if (flags !== counts[id]) {
      flashTile(id);
      return;
    }
    const targets = [];
    for (const other of neighbors[id]) {
      if (!flagged[other] && !revealed[other]) targets.push(other);
    }
    for (const other of targets) {
      if (gameOver) return;
      if (mines[other]) {
        revealed[other] = 1;
        loseGame(other);
        return;
      }
      revealFrom(other);
    }
    updateReadouts();
    checkWin();
  }

  function flashTile(id) {
    const group = tileEls[id];
    group.classList.remove("is-nudge");
    // Force a reflow so the animation restarts on repeated clicks.
    void group.getBoundingClientRect().width;
    group.classList.add("is-nudge");
    window.setTimeout(() => group.classList.remove("is-nudge"), 260);
  }

  /* ------------------------------------------------------------- overlay */

  function showOverlay(face, title, body) {
    overlayFace.textContent = face;
    overlayTitle.textContent = title;
    overlayBody.textContent = body;
    overlay.hidden = false;
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  /* -------------------------------------------------------------- inputs */

  function tileIdOf(element) {
    if (!element || typeof element.closest !== "function") return -1;
    const group = element.closest("g.ms-tile");
    if (!group) return -1;
    const id = Number(group.getAttribute("data-id"));
    return Number.isInteger(id) ? id : -1;
  }

  function tileIdFromEvent(event) {
    const direct = tileIdOf(event.target);
    if (direct >= 0) return direct;
    return tileIdOf(document.elementFromPoint(event.clientX, event.clientY));
  }

  // Mouse and touch are tracked separately: only touches can pinch, and mixing
  // them in one pointer map lets a single missed pointerup wedge the board.
  const touchPoints = new Map();
  let mouseDrag = null;
  let touchDrag = null;
  let dragMoved = false;
  let pinchDistance = 0;
  let chordArmed = false;
  let longPressTimer = 0;
  let longPressFired = false;

  function cancelLongPress() {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = 0;
    }
  }

  function endDrag() {
    mouseDrag = null;
    touchDrag = null;
    dragMoved = false;
    boardWrap.classList.remove("is-panning");
    if (!gameOver) setFace("idle");
  }

  function resetPointerState() {
    touchPoints.clear();
    pinchDistance = 0;
    chordArmed = false;
    cancelLongPress();
    longPressFired = false;
    endDrag();
  }

  function beginPan(drag, event) {
    const totalX = event.clientX - drag.startX;
    const totalY = event.clientY - drag.startY;
    if (Math.hypot(totalX, totalY) <= DRAG_THRESHOLD) return false;
    dragMoved = true;
    cancelLongPress();
    boardWrap.classList.add("is-panning");
    if (!gameOver) setFace("idle");
    return true;
  }

  function panBy(drag, event) {
    view.cx -= (event.clientX - drag.x) * view.upp;
    view.cy -= (event.clientY - drag.y) * view.upp;
    clampCenter();
    applyView();
    drag.x = event.clientX;
    drag.y = event.clientY;
  }

  function pinch(event) {
    const list = Array.from(touchPoints.values());
    const distance = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
    if (pinchDistance > 0 && distance > 0) {
      const anchor = clientToUser((list[0].x + list[1].x) / 2, (list[0].y + list[1].y) / 2);
      zoomAbout(anchor.x, anchor.y, distance / pinchDistance);
    }
    pinchDistance = distance;
  }

  function onPointerDown(event) {
    const id = tileIdFromEvent(event);

    if (event.pointerType === "mouse") {
      if (event.button === 2) event.preventDefault();
      const bothButtons = (event.buttons & 1) === 1 && (event.buttons & 2) === 2;
      if (bothButtons || event.button === 1) {
        chordArmed = true;
        mouseDrag = null;
        dragMoved = false;
        if (id >= 0) chord(id);
        return;
      }
      if (event.button === 2) {
        if (id >= 0) toggleFlag(id);
        return;
      }
      if (event.button === 0) {
        mouseDrag = { startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, id };
        dragMoved = false;
        if (id >= 0 && !gameOver && !revealed[id] && !flagged[id]) setFace("pressed");
      }
      return;
    }

    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.size === 2) {
      const list = Array.from(touchPoints.values());
      pinchDistance = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
      touchDrag = null;
      cancelLongPress();
      return;
    }
    if (touchPoints.size > 2) return;

    touchDrag = { startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, id };
    dragMoved = false;
    longPressFired = false;
    if (id >= 0 && !gameOver) {
      longPressTimer = window.setTimeout(() => {
        longPressTimer = 0;
        longPressFired = true;
        if (!dragMoved && !revealed[id]) {
          toggleFlag(id);
          if (window.navigator.vibrate) window.navigator.vibrate(15);
        }
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMove(event) {
    if (event.pointerType === "mouse") {
      if (!mouseDrag) return;
      if (!dragMoved && !beginPan(mouseDrag, event)) return;
      panBy(mouseDrag, event);
      return;
    }

    if (!touchPoints.has(event.pointerId)) return;
    touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPoints.size === 2) {
      cancelLongPress();
      pinch(event);
      return;
    }
    if (!touchDrag) return;
    if (!dragMoved && !beginPan(touchDrag, event)) return;
    panBy(touchDrag, event);
  }

  function onPointerUp(event) {
    if (event.pointerType === "mouse") {
      if (chordArmed) {
        if (event.buttons === 0) chordArmed = false;
        endDrag();
        return;
      }
      const drag = mouseDrag;
      const moved = dragMoved;
      endDrag();
      if (event.button !== 0 || !drag || moved) return;
      const id = tileIdFromEvent(event);
      if (id < 0 || id !== drag.id || revealed[id]) return;
      if (flagModeInput.checked) {
        toggleFlag(id);
      } else {
        reveal(id);
      }
      return;
    }

    touchPoints.delete(event.pointerId);
    if (touchPoints.size < 2) pinchDistance = 0;
    cancelLongPress();
    const drag = touchDrag;
    const moved = dragMoved;
    endDrag();
    if (!drag || moved || longPressFired) return;
    const id = tileIdFromEvent(event);
    if (id < 0 || id !== drag.id) return;

    // Tapping a revealed number chords, since touch has no middle click.
    if (revealed[id]) {
      chord(id);
    } else if (flagModeInput.checked) {
      toggleFlag(id);
    } else {
      reveal(id);
    }
  }

  function onPointerCancel(event) {
    if (event.pointerType !== "mouse") {
      touchPoints.delete(event.pointerId);
      if (touchPoints.size < 2) pinchDistance = 0;
    }
    cancelLongPress();
    endDrag();
  }

  function onHoverMove(event) {
    if (event.pointerType !== "mouse") return;
    if (dragMoved) {
      setHover(-1);
      return;
    }
    setHover(tileIdFromEvent(event));
  }

  function onWheel(event) {
    event.preventDefault();
    const anchor = clientToUser(event.clientX, event.clientY);
    zoomAbout(anchor.x, anchor.y, Math.exp(-event.deltaY * 0.0016));
  }

  function onDoubleClick(event) {
    const id = tileIdFromEvent(event);
    if (id >= 0 && revealed[id]) chord(id);
  }

  /* --------------------------------------------------------------- setup */

  function populateLattices() {
    for (const lattice of window.Lattices.LATTICES) {
      const option = document.createElement("option");
      option.value = lattice.id;
      option.textContent = lattice.name;
      latticeSelect.appendChild(option);
    }
    latticeSelect.value = "penrose";
  }

  function refreshDifficultyLabels() {
    const lattice = currentLattice();
    for (const option of difficultySelect.options) {
      const preset = DIFFICULTIES[option.value];
      if (!preset) continue;
      option.textContent =
        preset.label + " — " + preset.tiles + " tiles, " + minesForPreset(preset, lattice) + " mines";
    }
  }

  function readDifficulty() {
    const key = difficultySelect.value;
    if (key !== "custom") {
      const preset = DIFFICULTIES[key];
      return { tiles: preset.tiles, mines: minesForPreset(preset, currentLattice()) };
    }
    let wantTiles = Math.round(Number(customTilesInput.value));
    if (!Number.isFinite(wantTiles)) wantTiles = 400;
    wantTiles = Math.min(MAX_TILES, Math.max(MIN_TILES, wantTiles));
    let wantMines = Math.round(Number(customMinesInput.value));
    if (!Number.isFinite(wantMines)) {
      wantMines = minesForPreset({ tiles: wantTiles, minesPerClue: 1.24 }, currentLattice());
    }
    wantMines = Math.min(wantTiles - 1, Math.max(1, wantMines));
    customTilesInput.value = String(wantTiles);
    customMinesInput.value = String(wantMines);
    return { tiles: wantTiles, mines: wantMines };
  }

  function updateCustomDensity() {
    const wantTiles = Math.max(1, Math.round(Number(customTilesInput.value) || 0));
    const wantMines = Math.max(0, Math.round(Number(customMinesInput.value) || 0));
    customMinesInput.max = String(Math.max(1, wantTiles - 1));
    const density = Math.min(100, (wantMines / wantTiles) * 100);
    customDensityOutput.textContent = density.toFixed(1) + "% mine density";
  }

  function newGame() {
    const setup = readDifficulty();
    hideOverlay();
    stopTimer();
    elapsedMs = 0;
    startTime = 0;

    buildBoard(setup.tiles);
    mineCount = Math.min(setup.mines, tileCount - 1);

    mines = new Uint8Array(tileCount);
    counts = new Uint8Array(tileCount);
    revealed = new Uint8Array(tileCount);
    flagged = new Uint8Array(tileCount);
    minesPlaced = false;
    generating = false;
    generatingBanner.hidden = true;
    gameOver = false;
    gameWon = false;
    revealedCount = 0;
    flagCount = 0;
    hitId = -1;

    boardWrap.classList.remove("is-over");
    boardWrap.classList.remove("is-generating");
    setFace("idle");
    updateReadouts();
    fitView();
    announce(currentLattice().name + " — " + tileCount + " tiles, " + mineCount +
      " mines (" + ((100 * mineCount) / tileCount).toFixed(1) + "%). Click any tile to start.");
  }

  latticeSelect.addEventListener("change", () => {
    refreshDifficultyLabels();
    newGame();
  });

  difficultySelect.addEventListener("change", () => {
    const isCustom = difficultySelect.value === "custom";
    customFields.hidden = !isCustom;
    if (!isCustom) newGame();
  });

  customTilesInput.addEventListener("input", updateCustomDensity);
  customMinesInput.addEventListener("input", updateCustomDensity);
  noGuessInput.addEventListener("change", () => {
    if (minesPlaced || gameOver) newGame();
  });
  newGameButton.addEventListener("click", newGame);
  faceButton.addEventListener("click", newGame);
  overlayButton.addEventListener("click", newGame);
  overlayClose.addEventListener("click", hideOverlay);

  boardSvg.addEventListener("contextmenu", (event) => event.preventDefault());
  boardSvg.addEventListener("pointerdown", onPointerDown);
  // Listening on the window rather than capturing the pointer keeps a drag
  // alive outside the board while leaving event.target usable for hit tests.
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
  // A gesture interrupted by losing focus never sends pointerup, so clear the
  // tracked pointers rather than leaving the board stuck mid-drag.
  window.addEventListener("blur", resetPointerState);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetPointerState();
  });
  boardSvg.addEventListener("pointermove", onHoverMove);
  boardSvg.addEventListener("pointerleave", () => setHover(-1));
  boardSvg.addEventListener("wheel", onWheel, { passive: false });
  boardSvg.addEventListener("dblclick", onDoubleClick);
  boardSvg.addEventListener("dragstart", (event) => event.preventDefault());

  document.querySelectorAll("[data-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.getAttribute("data-zoom");
      if (mode === "fit") {
        fitView();
        return;
      }
      zoomAbout(view.cx, view.cy, mode === "in" ? 1.35 : 1 / 1.35);
    });
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const previous = fitUpp;
      fitUpp = computeFitUpp();
      if (previous > 0) view.upp *= fitUpp / previous;
      applyView();
    }, 120);
  });

  populateLattices();
  refreshDifficultyLabels();
  updateCustomDensity();
  newGame();
})();
