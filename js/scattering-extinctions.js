/**
 * Bragg extinction rules for the scattering calculator.
 * Uses International Tables conventions in the standard setting.
 */
(function () {
  // Bravais centering letter for IT space groups 1–230 (standard setting).
  const SPACE_GROUP_CENTERING =
    "PPPPCPPCCPPCPPCPPPPCCFIIPPPPPPPPPPCCCAAAAFFIIIPPPPPPPPPPPPPPPPCCCCCCFFIIIIPPPPIIPIPPPPIIPPPPPPPPIIPPPPPPPPIIIIPPPPPPPPIIIIPPPPPPPPPPPPPPPPIIIIPPPRPRPPPPPPRPPPPRRPPPPRRPPPPPPPPPPPPPPPPPPPPPPPPPPPPFIPIPPFFIPIPPFFIPPIPFIPFIPPPPFFFFII";

  function mod(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function isEven(value) {
    return mod(value, 2) === 0;
  }

  function sameParity(h, k, l) {
    return mod(h, 2) === mod(k, 2) && mod(k, 2) === mod(l, 2);
  }

  function normalizeSymbol(symbol) {
    return String(symbol || "")
      .toLowerCase()
      .replace(/[ \t._\-/]/g, "")
      .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (ch) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(ch)))
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (ch) => String("⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(ch)));
  }

  function crystalSystem(number) {
    if (!Number.isInteger(number) || number < 1 || number > 230) return "unknown";
    if (number <= 2) return "triclinic";
    if (number <= 15) return "monoclinic";
    if (number <= 74) return "orthorhombic";
    if (number <= 142) return "tetragonal";
    if (number <= 167) return "trigonal";
    if (number <= 194) return "hexagonal";
    return "cubic";
  }

  // Resolve a Hermann–Mauguin symbol to its International Tables number using the
  // symmetry engine when it is loaded. This is exact for any recognised symbol;
  // the regex heuristic below is only a fallback for when the engine is absent
  // (e.g. unit tests) or cannot parse the input.
  function spaceGroupNumberFromEngine(symbol) {
    const engine = (typeof window !== "undefined" && window.SpaceGroupEngine)
      || (typeof globalThis !== "undefined" && globalThis.SpaceGroupEngine);
    if (!engine || typeof engine.lookupSpaceGroup !== "function") return null;
    const query = String(symbol || "").split(":")[0].trim();
    if (!query) return null;
    try {
      const group = engine.lookupSpaceGroup(query, "");
      return group && Number.isInteger(group.id) ? group.id : null;
    } catch (error) {
      return null;
    }
  }

  function parseSpaceGroupInput(input) {
    const trimmed = String(input || "").trim();
    const number = parseInt(trimmed, 10);
    const hasNumber = Number.isInteger(number) && String(number) === trimmed;
    const symbol = hasNumber ? "" : trimmed;
    const normalizedSymbol = normalizeSymbol(symbol);
    const resolvedNumber = hasNumber ? number : spaceGroupNumberFromEngine(trimmed);

    let rhombohedralSetting = "obverse";
    if (/:r\b/i.test(trimmed) || /\(r\)/i.test(trimmed)) {
      rhombohedralSetting = "reverse";
    } else if (/:h\b/i.test(trimmed) || /\(h\)/i.test(trimmed)) {
      rhombohedralSetting = "obverse";
    }

    const centering = hasNumber
      ? (SPACE_GROUP_CENTERING.charAt(number - 1) || "P")
      : (["p", "a", "b", "c", "i", "f", "r"].includes(normalizedSymbol.charAt(0))
        ? normalizedSymbol.charAt(0).toUpperCase()
        : "P");

    const system = Number.isInteger(resolvedNumber)
      ? crystalSystem(resolvedNumber)
      : guessCrystalSystem(normalizedSymbol, centering);

    return {
      input: trimmed,
      number: resolvedNumber,
      symbol,
      normalizedSymbol,
      centering,
      system,
      rhombohedralSetting
    };
  }

  function normalizeExtinctionOptions(options) {
    if (options === "obverse" || options === "reverse") {
      return { rhombohedralSetting: options };
    }
    if (options && typeof options === "object") {
      return options;
    }
    return {};
  }

  // Best-effort crystal system from a normalized Hermann–Mauguin symbol, used
  // only when the symmetry engine cannot resolve the input (see
  // spaceGroupNumberFromEngine). String heuristics on H-M symbols are inherently
  // ambiguous (screw subscripts vs axes, compact vs full symbols), so the rare
  // 4₃ screw groups and full-form monoclinic symbols may be misclassified here.
  function guessCrystalSystem(normalizedSymbol, centering) {
    const body = normalizedSymbol.slice(centering.length);
    if (!body) return "triclinic";

    const hasThree = body.includes("3");
    const hasFour = body.includes("4");
    const hasSix = body.includes("6");
    const leadsWithThree = /^3/.test(body);

    // Cubic: a 3-fold along <111> sits after the leading axis and there is no
    // 6-fold (covers m-3, m-3m, 23, 432, -43m and the F d -3 diamond forms).
    if (hasThree && !leadsWithThree && !hasSix) return "cubic";
    if (hasSix) return "hexagonal";
    if (leadsWithThree) return "trigonal";
    if (hasFour) return "tetragonal";

    // Monoclinic compact symbols: "2", "21", "m", "c", "2/m", "21/c", … which
    // normalize (no slash) to bodies like "2", "21", "m", "2c", "21c".
    if (body.length <= 3 && /^(2|21)?[abcmn]?$/.test(body)) return "monoclinic";
    if (body.length >= 3) return "orthorhombic";
    if (body.includes("2") || body.includes("m")) return "monoclinic";
    return "triclinic";
  }

  function centeringRule(centering, rhombohedralSetting) {
    switch (centering) {
      case "P":
        return {
          id: "centering-p",
          label: "P-centering (primitive): no lattice absences",
          test() {
            return true;
          }
        };
      case "A":
        return {
          id: "centering-a",
          label: "A-centering: (hkl) require k + l = 2n",
          test(h, k, l) {
            return isEven(k + l);
          }
        };
      case "B":
        return {
          id: "centering-b",
          label: "B-centering: (hkl) require h + l = 2n",
          test(h, k, l) {
            return isEven(h + l);
          }
        };
      case "C":
        return {
          id: "centering-c",
          label: "C-centering: (hkl) require h + k = 2n",
          test(h, k, l) {
            return isEven(h + k);
          }
        };
      case "I":
        return {
          id: "centering-i",
          label: "I-centering: (hkl) require h + k + l = 2n",
          test(h, k, l) {
            return isEven(h + k + l);
          }
        };
      case "F":
        return {
          id: "centering-f",
          label: "F-centering: h, k, l all odd or all even",
          test(h, k, l) {
            return sameParity(h, k, l);
          }
        };
      case "R":
        return rhombohedralSetting === "reverse"
          ? {
            id: "centering-r-reverse",
            label: "R-centering (reverse hex setting): (hkl) require h − k + l = 3n",
            test(h, k, l) {
              return mod(h - k + l, 3) === 0;
            }
          }
          : {
            id: "centering-r-obverse",
            label: "R-centering (obverse hex setting): (hkl) require −h + k + l = 3n",
            test(h, k, l) {
              return mod(-h + k + l, 3) === 0;
            }
          };
      default:
        return null;
    }
  }

  function zoneRule(id, label, zone, test) {
    return {
      id,
      label,
      test(h, k, l) {
        if (!zone(h, k, l)) return true;
        return test(h, k, l);
      }
    };
  }

  const ZONES = {
    h00: (h, k, l) => k === 0 && l === 0,
    "0k0": (h, k, l) => h === 0 && l === 0,
    h0l: (h, k, l) => k === 0,
    "0kl": (h, k, l) => h === 0,
    hk0: (h, k, l) => l === 0,
    "00l": (h, k, l) => h === 0 && k === 0
  };

  const ORTHO_GLIDE_RULES = {
    0: {
      b: ["ortho-b-0kl", "b-glide ⊥ a: (0kl) require k = 2n", ZONES["0kl"], (h, k) => isEven(k)],
      c: ["ortho-c-0kl", "c-glide ⊥ a: (0kl) require l = 2n", ZONES["0kl"], (h, k, l) => isEven(l)],
      n: ["ortho-n-0kl", "n-glide ⊥ a: (0kl) require k + l = 2n", ZONES["0kl"], (h, k, l) => isEven(k + l)],
      "21": ["ortho-21-h00", "2₁ screw ∥ a: (h00) require h = 2n", ZONES.h00, (h) => isEven(h)]
    },
    1: {
      a: ["ortho-a-h0l", "a-glide ⊥ b: (h0l) require h = 2n", ZONES.h0l, (h) => isEven(h)],
      c: ["ortho-c-h0l", "c-glide ⊥ b: (h0l) require l = 2n", ZONES.h0l, (h, k, l) => isEven(l)],
      n: ["ortho-n-h0l", "n-glide ⊥ b: (h0l) require h + l = 2n", ZONES.h0l, (h, k, l) => isEven(h + l)],
      "21": ["ortho-21-0k0", "2₁ screw ∥ b: (0k0) require k = 2n", ZONES["0k0"], (h, k) => isEven(k)]
    },
    2: {
      a: ["ortho-a-hk0", "a-glide ⊥ c: (hk0) require h = 2n", ZONES.hk0, (h) => isEven(h)],
      b: ["ortho-b-hk0", "b-glide ⊥ c: (hk0) require k = 2n", ZONES.hk0, (h, k) => isEven(k)],
      n: ["ortho-n-hk0", "n-glide ⊥ c: (hk0) require h + k = 2n", ZONES.hk0, (h, k) => isEven(h + k)],
      "21": ["ortho-21-00l", "2₁ screw ∥ c: (00l) require l = 2n", ZONES["00l"], (h, k, l) => isEven(l)]
    }
  };

  function orthorhombicRules(normalizedSymbol) {
    const body = normalizedSymbol.replace(/^[abcfipr]/, "");
    const chunks = body.match(/21|[abcndm2]/g) || [];
    const positions = [];

    for (const chunk of chunks) {
      if (positions.length >= 3) break;
      if (chunk === "2") continue;
      if (chunk === "21" || /^[abcnd]$/.test(chunk)) {
        positions.push(chunk);
      } else if (chunk === "m") {
        positions.push(null);
      }
    }

    while (positions.length < 3) positions.push(null);

    const rules = [];
    positions.slice(0, 3).forEach((token, index) => {
      if (!token) return;
      const mapping = ORTHO_GLIDE_RULES[index][token];
      if (mapping) rules.push(zoneRule(...mapping));
    });
    return rules;
  }

  function monoclinicRules(normalizedSymbol) {
    const rules = [];
    if (/21/.test(normalizedSymbol)) {
      rules.push(zoneRule("mono-21-0k0", "2₁ screw ∥ b: (0k0) require k = 2n", ZONES["0k0"], (h, k) => isEven(k)));
    }
    if (/[^a-z]c/.test(normalizedSymbol) || /\/c/.test(normalizedSymbol)) {
      rules.push(zoneRule("mono-c-h0l", "c-glide: (h0l) require l = 2n", ZONES.h0l, (h, k, l) => isEven(l)));
    }
    if (/[^a-z]a/.test(normalizedSymbol) || /\/a/.test(normalizedSymbol)) {
      rules.push(zoneRule("mono-a-h0l", "a-glide: (h0l) require h = 2n", ZONES.h0l, (h) => isEven(h)));
    }
    if (/[^a-z]n/.test(normalizedSymbol) || /\/n/.test(normalizedSymbol)) {
      rules.push(zoneRule("mono-n-h0l", "n-glide: (h0l) require h + l = 2n", ZONES.h0l, (h, k, l) => isEven(h + l)));
    }
    return dedupeRules(rules);
  }

  function cAxisScrewRule(screwType) {
    const labels = {
      "21c": "2₁ screw ∥ c: (00l) require l = 2n",
      "31c": "3₁/3₂ screw ∥ c: (00l) require l = 3n",
      "41c": "4₁/4₃ screw ∥ c: (00l) require l = 4n",
      "42c": "4₂ screw ∥ c: (00l) require l = 2n",
      "61c": "6₁/6₅ screw ∥ c: (00l) require l = 6n",
      "62c": "6₂/6₄ screw ∥ c: (00l) require l = 3n",
      "63c": "6₃ screw ∥ c: (00l) require l = 2n"
    };
    const tests = {
      "21c": (h, k, l) => isEven(l),
      "31c": (h, k, l) => mod(l, 3) === 0,
      "41c": (h, k, l) => mod(l, 4) === 0,
      "42c": (h, k, l) => isEven(l),
      "61c": (h, k, l) => mod(l, 6) === 0,
      "62c": (h, k, l) => mod(l, 3) === 0,
      "63c": (h, k, l) => isEven(l)
    };

    return zoneRule(`screw-${screwType}`, labels[screwType], ZONES["00l"], tests[screwType]);
  }

  function detectCAxisScrew(normalizedSymbol) {
    if (/6[15]/.test(normalizedSymbol)) return "61c";
    if (/6[24]/.test(normalizedSymbol)) return "62c";
    if (/63/.test(normalizedSymbol)) return "63c";
    if (/4[13]/.test(normalizedSymbol)) return "41c";
    if (/42/.test(normalizedSymbol)) return "42c";
    if (/3[12]/.test(normalizedSymbol)) return "31c";
    if (/21/.test(normalizedSymbol) && /[346]/.test(normalizedSymbol)) return "21c";
    return null;
  }

  function tetragonalHexagonalRules(normalizedSymbol) {
    const rules = [];
    const cScrew = detectCAxisScrew(normalizedSymbol);
    if (cScrew) rules.push(cAxisScrewRule(cScrew));

    return dedupeRules(rules);
  }

  function diamondBasisAllowed(h, k, l) {
    const allOdd = mod(h, 2) === 1 && mod(k, 2) === 1 && mod(l, 2) === 1;
    if (allOdd) return true;

    const allEven = mod(h, 2) === 0 && mod(k, 2) === 0 && mod(l, 2) === 0;
    if (allEven) return mod(h + k + l, 4) === 0;

    // Mixed parity should already be excluded by F-centering.
    return true;
  }

  function hasDiamondBasisExtinctions(crystal) {
    if (!crystal) return false;

    const sg = normalizeSymbol(crystal.spaceGroup || "");
    const formula = String(crystal.chemicalFormula || "").toLowerCase();

    return (
      crystal.structureModel === "diamond" ||
      crystal.presetId === "si-diamond" ||
      crystal.presetId === "ge-diamond" ||
      (
        (sg === "fd3m" || sg === "fd-3m") &&
        /^(si|ge)$/.test(formula.replace(/\s+/g, ""))
      )
    );
  }

  function dedupeRules(rules) {
    const seen = new Set();
    return rules.filter((rule) => {
      if (seen.has(rule.id)) return false;
      seen.add(rule.id);
      return true;
    });
  }

  function buildExtinctionRules(context) {
    const rules = [];
    const centering = centeringRule(context.centering, context.rhombohedralSetting);
    if (centering) rules.push(centering);

    if (context.applyScrewGlideRules) {
      switch (context.system) {
        case "monoclinic":
          rules.push(...monoclinicRules(context.normalizedSymbol));
          break;
        case "orthorhombic":
          rules.push(...orthorhombicRules(context.normalizedSymbol));
          break;
        case "tetragonal":
        case "hexagonal":
        case "trigonal":
          rules.push(...tetragonalHexagonalRules(context.normalizedSymbol));
          break;
        default:
          break;
      }
    }

    return dedupeRules(rules);
  }

  function resolveExtinctionContext(spaceGroupInput, options) {
    const opts = normalizeExtinctionOptions(options);
    const context = parseSpaceGroupInput(spaceGroupInput);
    if (opts.rhombohedralSetting === "obverse" || opts.rhombohedralSetting === "reverse") {
      context.rhombohedralSetting = opts.rhombohedralSetting;
    }
    context.applyScrewGlideRules = !!opts.applyScrewGlideRules;
    context.rules = buildExtinctionRules(context);
    return context;
  }

  function isReflectionAllowed(h, k, l, context) {
    if (h === 0 && k === 0 && l === 0) return false;
    return context.rules.every((rule) => rule.test(h, k, l));
  }

  function isReflectionAllowedWithCrystal(h, k, l, crystal, context) {
    if (context && !isReflectionAllowed(h, k, l, context)) return false;
    if (hasDiamondBasisExtinctions(crystal) && !diamondBasisAllowed(h, k, l)) return false;
    if (h === 0 && k === 0 && l === 0) return false;
    return true;
  }

  // Alternative twin domains whose *lattice* reflection condition differs from
  // the current setting. Merohedral twins share the lattice (same absences), so
  // the meaningful case is the rhombohedral obverse/reverse pair, where a twin
  // domain can fill in reflections that are absent in the chosen setting.
  function twinExtinctionAlternatives(context) {
    if (!context || context.centering !== "R") return [];
    const condition = {
      obverse: "−h + k + l = 3n",
      reverse: "h − k + l = 3n"
    };
    const current = context.rhombohedralSetting === "reverse" ? "reverse" : "obverse";
    const other = current === "reverse" ? "obverse" : "reverse";
    return [
      {
        id: "twin-r-current",
        setting: current,
        label: `This domain (${current} R setting): (hkl) require ${condition[current]}`
      },
      {
        id: "twin-r-alternate",
        setting: other,
        label: `Obverse/reverse twin domain (${other} R setting): (hkl) require ${condition[other]}`
      }
    ];
  }

  // Point group of the lattice (holohedry) and its order, by crystal system.
  // A hexagonal lattice (trigonal-P or hexagonal groups) has holohedry 6/mmm;
  // a rhombohedral (R) lattice has −3m.
  function latticeHolohedry(system, centering) {
    switch (system) {
      case "triclinic": return { symbol: "−1", order: 2 };
      case "monoclinic": return { symbol: "2/m", order: 4 };
      case "orthorhombic": return { symbol: "mmm", order: 8 };
      case "tetragonal": return { symbol: "4/mmm", order: 16 };
      case "trigonal": return centering === "R" ? { symbol: "−3m", order: 12 } : { symbol: "6/mmm", order: 24 };
      case "hexagonal": return { symbol: "6/mmm", order: 24 };
      case "cubic": return { symbol: "m−3m", order: 48 };
      default: return null;
    }
  }

  // Merohedral twinning is possible when the crystal point group is a proper
  // subgroup of its lattice holohedry. Such twins preserve the lattice (and so
  // the reflection conditions), overlapping otherwise-inequivalent reflections.
  // pointGroupOrder = number of distinct rotation/mirror parts in the group.
  function merohedralTwinInfo(context, pointGroupOrder) {
    const holohedry = latticeHolohedry(context && context.system, context && context.centering);
    if (!holohedry || !Number.isInteger(pointGroupOrder) || pointGroupOrder <= 0) return null;
    if (holohedry.order % pointGroupOrder !== 0) {
      return { holohedry, pointGroupOrder, index: null, possible: false };
    }
    const index = holohedry.order / pointGroupOrder;
    return { holohedry, pointGroupOrder, index, possible: index > 1 };
  }

  function describeExtinctionRules(context, crystal) {
    const lines = [
      "Reflections must satisfy every rule below (International Tables standard setting):"
    ];

    if (context.rules.length === 0) {
      lines.push("No extinction rules inferred — only (0 0 0) is excluded.");
      return lines;
    }

    const activeRules = context.rules.filter((rule) => rule.id !== "centering-p");
    if (activeRules.length === 0) {
      lines.push("1. P-centering (primitive): no lattice absences");
      lines.push("Only (0 0 0) is excluded.");
      return lines;
    }

    activeRules.forEach((rule, index) => {
      lines.push(`${index + 1}. ${rule.label}`);
    });

    if (context.rules.some((rule) => rule.id === "centering-p")) {
      lines.push("Primitive (P) centering: no additional lattice absences.");
    }

    if (context.centering === "R") {
      lines.push(`R-centering setting: ${context.rhombohedralSetting}.`);
    }

    if (crystal && hasDiamondBasisExtinctions(crystal)) {
      lines.push("Diamond Si/Ge basis extinctions are applied from the structure/preset (all-even require h + k + l = 4n).");
    }

    if (context.applyScrewGlideRules) {
      lines.push("Screw/glide rules are inferred from the Hermann-Mauguin symbol; unusual settings may need manual checking.");
    } else {
      lines.push("Only Bravais centering absences are applied. Screw/glide and most symmetry absences are not filtered.");
    }

    return lines;
  }

  window.resolveExtinctionContext = resolveExtinctionContext;
  window.isReflectionAllowed = isReflectionAllowed;
  window.isReflectionAllowedWithCrystal = isReflectionAllowedWithCrystal;
  window.hasDiamondBasisExtinctions = hasDiamondBasisExtinctions;
  window.diamondBasisAllowed = diamondBasisAllowed;
  window.describeExtinctionRules = describeExtinctionRules;
  window.twinExtinctionAlternatives = twinExtinctionAlternatives;
  window.latticeHolohedry = latticeHolohedry;
  window.merohedralTwinInfo = merohedralTwinInfo;
  window.crystalSystemFromNumber = crystalSystem;
})();
