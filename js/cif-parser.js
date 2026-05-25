(function (global) {
  "use strict";

  function stripUncertainty(value) {
    return String(value).replace(/\(\d+\)\s*$/, "").trim();
  }

  function stripCifString(value) {
    let v = String(value).trim();
    if (v.length >= 2) {
      const first = v.charAt(0);
      const last = v.charAt(v.length - 1);
      if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
        v = v.slice(1, -1);
      }
    }
    return v.trim();
  }

  function parseCifNumber(value) {
    const cleaned = stripUncertainty(stripCifString(value));
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  function readNextValue(lines, startIndex) {
    let i = startIndex;
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith("#")) {
        i += 1;
        continue;
      }
      if (trimmed.startsWith(";")) {
        const parts = [trimmed.slice(1)];
        i += 1;
        while (i < lines.length) {
          const blockTrim = lines[i].trim();
          if (blockTrim.startsWith(";")) {
            i += 1;
            return { value: parts.join("\n").trim(), nextIndex: i };
          }
          parts.push(lines[i]);
          i += 1;
        }
        return { value: parts.join("\n").trim(), nextIndex: i };
      }
      return { value: trimmed, nextIndex: i + 1 };
    }
    return { value: "", nextIndex: i };
  }

  function parseCif(text) {
    if (typeof text !== "string") {
      throw new Error("Expected CIF text input.");
    }

    const lines = text.split(/\r?\n/);
    const result = {};
    let i = 0;

    while (i < lines.length) {
      const trimmed = lines[i].trim();
      i += 1;

      if (!trimmed || trimmed.startsWith("#")) continue;
      if (/^data_/i.test(trimmed)) continue;
      if (/^save_/i.test(trimmed)) continue;
      if (/^global_$/i.test(trimmed)) continue;
      if (/^loop_$/i.test(trimmed)) continue;

      const keyMatch = trimmed.match(/^(_[A-Za-z][\w.\-]*)\s*(.*)$/);
      if (!keyMatch) continue;

      const key = keyMatch[1].toLowerCase();
      let value = keyMatch[2].trim();

      if (!value) {
        const next = readNextValue(lines, i);
        value = next.value;
        i = next.nextIndex;
      }

      switch (key) {
        case "_cell_length_a":
          result.a = parseCifNumber(value);
          break;
        case "_cell_length_b":
          result.b = parseCifNumber(value);
          break;
        case "_cell_length_c":
          result.c = parseCifNumber(value);
          break;
        case "_cell_angle_alpha":
          result.alpha = parseCifNumber(value);
          break;
        case "_cell_angle_beta":
          result.beta = parseCifNumber(value);
          break;
        case "_cell_angle_gamma":
          result.gamma = parseCifNumber(value);
          break;
        case "_cell_volume":
          result.volume = parseCifNumber(value);
          break;
        case "_symmetry_space_group_name_h-m":
        case "_space_group_name_h-m":
        case "_space_group_name_h-m_alt":
        case "_space_group_name_h-m_ref":
          if (!result.spaceGroupName) result.spaceGroupName = stripCifString(value);
          break;
        case "_symmetry_int_tables_number":
        case "_space_group_it_number":
          if (result.spaceGroupNumber == null) {
            const parsed = parseInt(stripUncertainty(stripCifString(value)), 10);
            if (Number.isFinite(parsed)) result.spaceGroupNumber = parsed;
          }
          break;
        case "_chemical_formula_sum":
        case "_chemical_formula_structural":
          if (!result.chemicalFormula) result.chemicalFormula = stripCifString(value);
          break;
        case "_chemical_name_common":
        case "_chemical_name_mineral":
        case "_chemical_name_systematic":
          if (!result.chemicalName) result.chemicalName = stripCifString(value);
          break;
      }
    }

    return result;
  }

  function describeCif(data) {
    const parts = [];
    if (data.chemicalName) parts.push(data.chemicalName);
    if (data.chemicalFormula) parts.push(data.chemicalFormula);
    return parts.length ? parts.join(" — ") : "";
  }

  global.parseCif = parseCif;
  global.describeCif = describeCif;
})(typeof window !== "undefined" ? window : globalThis);
