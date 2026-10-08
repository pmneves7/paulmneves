(function () {
  const tabButtons = Array.from(document.querySelectorAll(".text-tool-tab"));
  const tabPanes = Array.from(document.querySelectorAll("[data-tab-pane]"));
  const counterInput = document.getElementById("counter-input");
  const diffOld = document.getElementById("diff-old");
  const diffNew = document.getElementById("diff-new");
  const diffOutput = document.getElementById("diff-output");
  const diffOutputWrap = document.getElementById("diff-output-wrap");

  const statEls = {
    characters: document.getElementById("stat-characters"),
    words: document.getElementById("stat-words"),
    sentences: document.getElementById("stat-sentences"),
    paragraphs: document.getElementById("stat-paragraphs"),
    commonWords: document.getElementById("stat-common-words"),
  };

  const growInputs = Array.from(document.querySelectorAll(".text-tool-grow-input"));
  const TOP_WORDS = 10;
  const supportsFieldSizing = typeof CSS !== "undefined" &&
    CSS.supports("field-sizing", "content");

  function setActiveTab(tabName) {
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    tabPanes.forEach((pane) => {
      pane.hidden = pane.dataset.tabPane !== tabName;
    });
    if (tabName === "counter") {
      requestAnimationFrame(() => autoGrow(counterInput));
    }
  }

  function autoGrow(textarea) {
    if (!textarea) return;
    if (supportsFieldSizing) {
      textarea.style.height = "";
      return;
    }
    textarea.style.height = "auto";
    const minHeight = parseFloat(getComputedStyle(textarea).minHeight) || 0;
    textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`;
  }

  function bindAutoGrow(textarea) {
    const refresh = () => autoGrow(textarea);
    textarea.addEventListener("input", refresh);
    textarea.addEventListener("paste", () => {
      requestAnimationFrame(refresh);
    });
    refresh();
  }

  function countWords(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function countSentences(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    const parts = trimmed.split(/[.!?]+["'”’»\)\]]*(?:\s+|$)/).filter((part) => part.trim().length > 0);
    return parts.length;
  }

  function countParagraphs(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\n\s*\n/).filter((part) => part.trim().length > 0).length;
  }

  function normalizeWord(word) {
    return word.normalize("NFC").toLowerCase().replace(/^[^\p{L}\p{N}\p{M}_]+|[^\p{L}\p{N}\p{M}_]+$/gu, "");
  }

  function mostCommonWords(text, limit) {
    const counts = new Map();
    const matches = text.match(/\S+/g) || [];
    matches.forEach((token) => {
      const word = normalizeWord(token);
      if (!word) return;
      counts.set(word, (counts.get(word) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit);
  }

  function renderCommonWords(entries) {
    statEls.commonWords.innerHTML = "";
    if (!entries.length) {
      const li = document.createElement("li");
      li.className = "text-tool-common-empty";
      li.textContent = "Enter text to see word frequencies.";
      statEls.commonWords.appendChild(li);
      return;
    }
    entries.forEach(([word, count]) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="text-tool-common-word">${escapeHtml(word)}</span><span class="text-tool-common-count">${count}</span>`;
      statEls.commonWords.appendChild(li);
    });
  }

  function updateCounter() {
    const text = counterInput.value;
    statEls.characters.textContent = String(text.length);
    statEls.words.textContent = String(countWords(text));
    statEls.sentences.textContent = String(countSentences(text));
    statEls.paragraphs.textContent = String(countParagraphs(text));
    renderCommonWords(mostCommonWords(text, TOP_WORDS));
  }

  function tokenize(text) {
    return text.match(/\S+|\s+/g) || [];
  }

  function diffTokens(oldTokens, newTokens) {
    // Trim unchanged ends and use a bounded Myers search. Large rewrites fall
    // back to one replacement, preserving every token without a quadratic table.
    let prefix = 0;
    while (prefix < oldTokens.length && prefix < newTokens.length && oldTokens[prefix] === newTokens[prefix]) prefix++;
    let suffix = 0;
    while (suffix < oldTokens.length - prefix && suffix < newTokens.length - prefix &&
      oldTokens[oldTokens.length - 1 - suffix] === newTokens[newTokens.length - 1 - suffix]) suffix++;
    const a = oldTokens.slice(prefix, oldTokens.length - suffix);
    const b = newTokens.slice(prefix, newTokens.length - suffix);
    const v = new Map([[1, 0]]);
    const trace = [];
    let middle = null;
    let work = 0;
    search: for (let d = 0; d <= Math.min(a.length + b.length, 512); d++) {
      trace.push(new Map(v));
      for (let k = -d; k <= d; k += 2) {
        if (++work > 1000000) break search;
        let x = k === -d || (k !== d && (v.get(k - 1) ?? -Infinity) < (v.get(k + 1) ?? -Infinity))
          ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
        let y = x - k;
        while (x < a.length && y < b.length && a[x] === b[y]) {
          x++; y++;
          if (++work > 1000000) break search;
        }
        v.set(k, x);
        if (x >= a.length && y >= b.length) {
          middle = [];
          for (let depth = d; depth >= 0; depth--) {
            const prev = trace[depth];
            const diagonal = x - y;
            const prevK = diagonal === -depth || (diagonal !== depth &&
              (prev.get(diagonal - 1) ?? -Infinity) < (prev.get(diagonal + 1) ?? -Infinity))
              ? diagonal + 1 : diagonal - 1;
            const prevX = prev.get(prevK) ?? 0;
            const prevY = prevX - prevK;
            while (x > prevX && y > prevY) {
              middle.push({ type: "equal", value: a[--x] });
              y--;
            }
            if (depth > 0) {
              if (x === prevX) middle.push({ type: "insert", value: b[--y] });
              else middle.push({ type: "delete", value: a[--x] });
            }
          }
          middle.reverse();
          break search;
        }
      }
    }
    if (!middle) middle = a.map(value => ({ type: "delete", value }))
      .concat(b.map(value => ({ type: "insert", value })));
    return oldTokens.slice(0, prefix).map(value => ({ type: "equal", value })).concat(
      middle, oldTokens.slice(oldTokens.length - suffix).map(value => ({ type: "equal", value })));
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderDiff(oldText, newText) {
    if (!oldText && !newText) {
      diffOutputWrap.hidden = true;
      diffOutput.textContent = "";
      return;
    }

    const parts = diffTokens(tokenize(oldText), tokenize(newText));
    // Group neighboring edits so a large replacement creates two spans rather
    // than one element for every word and whitespace token.
    const groups = [];
    for (const part of parts) {
      const previous = groups[groups.length - 1];
      if (previous?.type === part.type) previous.values.push(part.value);
      else groups.push({ type: part.type, values: [part.value] });
    }
    const html = groups.map((group) => {
      const part = { type: group.type, value: group.values.join("") };
      const safe = escapeHtml(part.value);
      if (part.type === "delete") return `<span class="diff-removed">${safe}</span>`;
      if (part.type === "insert") return `<span class="diff-added">${safe}</span>`;
      return safe;
    }).join("");

    diffOutput.innerHTML = html;
    diffOutputWrap.hidden = false;
  }

  function updateDiff() {
    renderDiff(diffOld.value, diffNew.value);
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  growInputs.forEach(bindAutoGrow);

  counterInput.addEventListener("input", () => {
    autoGrow(counterInput);
    updateCounter();
  });
  window.addEventListener("resize", () => {
    growInputs.forEach(autoGrow);
  });
  let diffTimer;
  const scheduleDiff = () => { clearTimeout(diffTimer); diffTimer = setTimeout(updateDiff, 100); };
  diffOld.addEventListener("input", scheduleDiff);
  diffNew.addEventListener("input", scheduleDiff);

  updateCounter();
  updateDiff();
})();
