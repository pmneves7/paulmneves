/**
 * Bragg extinction rules for the scattering calculator.
 * Uses International Tables conventions in the standard setting.
 */
(function () {
  const SPACE_GROUP_CENTERING =
    "PPPPCPPCCPPCPPCPPPPCCFIIPPPPPPPPPPPPPAAAAFFIIIPPPPPPPPPPPPPPPPCCCCCCFFIIIIPPPPIIPPPPPPIIPPPPPPPPIIPPPPPPPPIIIIPPPPPPPPIIIIPPPPPPPPPPPPPPPPIIIIPPPRPRPPPPPPRPPPPRRPPPPRRPPPPPPPPPPPPPPPPPPPPPPPPPPPPFIPIPPFFIPIPPFFIPPIPFIPFIPPPPFFFFII";

  const DIAMOND_SPACE_GROUPS = new Set([203, 210, 227, 228]);

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

  function parseSpaceGroupInput(input) {
    const trimmed = String(input || "").trim();
    const number = parseInt(trimmed, 10);
    const hasNumber = Number.isInteger(number) && String(number) === trimmed;
    const symbol = hasNumber ? "" : trimmed;
    const normalizedSymbol = normalizeSymbol(symbol);
    const resolvedNumber = hasNumber ? number : null;

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

    const system = hasNumber ? crystalSystem(number) : guessCrystalSystem(normalizedSymbol, centering);
    const body = normalizedSymbol.slice(centering.length);
    const isDiamond = DIAMOND_SPACE_GROUPS.has(resolvedNumber) || (centering === "F" && body.startsWith("d"));

    return {
      input: trimmed,
      number: resolvedNumber,
      symbol,
      normalizedSymbol,
      centering,
      system,
      rhombohedralSetting,
      isDiamond
    };
  }

  function guessCrystalSystem(normalizedSymbol, centering) {
    const body = normalizedSymbol.slice(centering.length);
    if (/m3/.test(body) || (centering === "F" && body.startsWith("d"))) return "cubic";
    if (/[46]/.test(body)) return "hexagonal";
    if (/^r?3/.test(body) && !/m3/.test(body)) return "trigonal";
    if (/4/.test(body)) return "tetragonal";
    if (/^2(1)?[mc]$/.test(body) || /^c2[mc]$/.test(body)) return "monoclinic";
    if (body.length >= 3) return "orthorhombic";
    if (/2/.test(body)) return "monoclinic";
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
    h0l: (h, k, l) => k === 0,
    "0kl": (h, k, l) => h === 0,
    hk0: (h, k, l) => l === 0,
    "00l": (h, k, l) => h === 0 && k === 0
  };

  const ORTHO_GLIDE_RULES = {
    0: {
      a: ["ortho-a-0kl", "a-glide ⊥ a: (0kl) require k = 2n", ZONES["0kl"], (h, k) => isEven(k)],
      b: ["ortho-b-0kl", "b-glide ⊥ a: (0kl) require l = 2n", ZONES["0kl"], (h, k, l) => isEven(l)],
      c: ["ortho-c-0kl", "c-glide ⊥ a: (0kl) require l = 2n", ZONES["0kl"], (h, k, l) => isEven(l)],
      n: ["ortho-n-0kl", "n-glide ⊥ a: (0kl) require k + l = 2n", ZONES["0kl"], (h, k, l) => isEven(k + l)],
      "21": ["ortho-21-0kl", "2₁ screw ⊥ a: (0kl) require k + l = 2n", ZONES["0kl"], (h, k, l) => isEven(k + l)]
    },
    1: {
      a: ["ortho-a-h0l", "a-glide ⊥ b: (h0l) require h = 2n", ZONES.h0l, (h) => isEven(h)],
      b: ["ortho-b-h0l", "b-glide ⊥ b: (h0l) require l = 2n", ZONES.h0l, (h, k, l) => isEven(l)],
      c: ["ortho-c-h0l", "c-glide ⊥ b: (h0l) require h = 2n", ZONES.h0l, (h) => isEven(h)],
      n: ["ortho-n-h0l", "n-glide ⊥ b: (h0l) require h + l = 2n", ZONES.h0l, (h, k, l) => isEven(h + l)],
      "21": ["ortho-21-h0l", "2₁ screw ⊥ b: (h0l) require h + l = 2n", ZONES.h0l, (h, k, l) => isEven(h + l)]
    },
    2: {
      a: ["ortho-a-hk0", "a-glide ⊥ c: (hk0) require h = 2n", ZONES.hk0, (h) => isEven(h)],
      b: ["ortho-b-hk0", "b-glide ⊥ c: (hk0) require k = 2n", ZONES.hk0, (h, k) => isEven(k)],
      c: ["ortho-c-hk0", "c-glide ⊥ c: (hk0) require h = 2n", ZONES.hk0, (h) => isEven(h)],
      n: ["ortho-n-hk0", "n-glide ⊥ c: (hk0) require h + k = 2n", ZONES.hk0, (h, k) => isEven(h + k)],
      "21": ["ortho-21-hk0", "2₁ screw ⊥ c: (hk0) require h + k = 2n", ZONES.hk0, (h, k) => isEven(h + k)]
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
      rules.push(zoneRule("mono-21-h0l", "2₁ screw ∥ b: (h0l) require l = 2n", ZONES.h0l, (h, k, l) => isEven(l)));
    }
    if (/[^a-z]c/.test(normalizedSymbol) || /\/c/.test(normalizedSymbol)) {
      rules.push(zoneRule("mono-c-h0l", "c-glide: (h0l) require l = 2n", ZONES.h0l, (h, k, l) => isEven(l)));
    }
    if (/[^a-z]a/.test(normalizedSymbol) || /\/a/.test(normalizedSymbol)) {
      rules.push(zoneRule("mono-a-h0l", "a-glide: (h0l) require h = 2n", ZONES.h0l, (h) => isEven(h)));
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

    if (/21/.test(normalizedSymbol)) {
      rules.push(zoneRule("tet-21-hk0", "2₁ in ab plane: (hk0) require h + k = 2n", ZONES.hk0, (h, k) => isEven(h + k)));
    }
    if (/[^a-z]c/.test(normalizedSymbol) && /[46]/.test(normalizedSymbol)) {
      rules.push(zoneRule("tet-c-hk0", "c-glide: (hk0) require h = 2n", ZONES.hk0, (h) => isEven(h)));
    }
    if (/[^a-z]n/.test(normalizedSymbol) && /[46]/.test(normalizedSymbol)) {
      rules.push(zoneRule("tet-n-hk0", "n-glide: (hk0) require h + k = 2n", ZONES.hk0, (h, k) => isEven(h + k)));
    }
    return dedupeRules(rules);
  }

  function diamondRules() {
    return [
      {
        id: "diamond-odd",
        label: "d-glide (diamond): (hkl) with h, k, l all odd are absent",
        test(h, k, l) {
          return !(mod(h, 2) === 1 && mod(k, 2) === 1 && mod(l, 2) === 1);
        }
      },
      {
        id: "diamond-even",
        label: "d-glide (diamond): (hkl) with h, k, l all even and h + k + l = 4n + 2 are absent",
        test(h, k, l) {
          if (!sameParity(h, k, l) || !isEven(h)) return true;
          return mod(h + k + l, 4) !== 2;
        }
      }
    ];
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

    if (context.isDiamond) {
      rules.push(...diamondRules());
    }

    return dedupeRules(rules);
  }

  function resolveExtinctionContext(spaceGroupInput, rhombohedralSettingOverride) {
    const context = parseSpaceGroupInput(spaceGroupInput);
    if (rhombohedralSettingOverride === "obverse" || rhombohedralSettingOverride === "reverse") {
      context.rhombohedralSetting = rhombohedralSettingOverride;
    }
    context.rules = buildExtinctionRules(context);
    return context;
  }

  function isReflectionAllowed(h, k, l, context) {
    if (h === 0 && k === 0 && l === 0) return false;
    return context.rules.every((rule) => rule.test(h, k, l));
  }

  function describeExtinctionRules(context) {
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
      lines.push(`Rhombohedral setting: ${context.rhombohedralSetting} (override with :H or :R in the symbol).`);
    }

    if (context.isDiamond) {
      lines.push("Diamond-type d-glide rules are applied (Fd-3m and related groups).");
    }

    lines.push("Glide and screw rules are inferred from the Hermann-Mauguin symbol; unusual settings may need manual checking.");
    return lines;
  }

  window.resolveExtinctionContext = resolveExtinctionContext;
  window.isReflectionAllowed = isReflectionAllowed;
  window.describeExtinctionRules = describeExtinctionRules;
})();
