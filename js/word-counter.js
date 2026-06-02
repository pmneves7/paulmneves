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

  function setActiveTab(tabName) {
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    tabPanes.forEach((pane) => {
      pane.hidden = pane.dataset.tabPane !== tabName;
    });
  }

  function autoGrow(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function countWords(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function countSentences(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    const parts = trimmed.split(/[.!?]+(?:\s+|$)/).filter((part) => part.trim().length > 0);
    return parts.length;
  }

  function countParagraphs(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\n\s*\n/).filter((part) => part.trim().length > 0).length;
  }

  function normalizeWord(word) {
    return word.toLowerCase().replace(/^[^\w]+|[^\w]+$/g, "");
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
    const n = oldTokens.length;
    const m = newTokens.length;
    const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

    for (let i = 1; i <= n; i += 1) {
      for (let j = 1; j <= m; j += 1) {
        if (oldTokens[i - 1] === newTokens[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const result = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
        result.unshift({ type: "equal", value: oldTokens[i - 1] });
        i -= 1;
        j -= 1;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({ type: "insert", value: newTokens[j - 1] });
        j -= 1;
      } else {
        result.unshift({ type: "delete", value: oldTokens[i - 1] });
        i -= 1;
      }
    }
    return result;
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
    const html = parts.map((part) => {
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

  growInputs.forEach((textarea) => {
    textarea.addEventListener("input", () => autoGrow(textarea));
    autoGrow(textarea);
  });

  counterInput.addEventListener("input", updateCounter);
  diffOld.addEventListener("input", updateDiff);
  diffNew.addEventListener("input", updateDiff);

  updateCounter();
  updateDiff();
})();
