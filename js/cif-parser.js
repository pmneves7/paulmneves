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

  function tokenizeCifLine(line) {
    const tokens = [];
    let token = "";
    let quote = "";

    for (let i = 0; i < line.length; i += 1) {
      const ch = line.charAt(i);
      if (quote) {
        token += ch;
        if (ch === quote && (i === line.length - 1 || /\s/.test(line.charAt(i + 1)))) {
          quote = "";
        }
        continue;
      }
      if (ch === "'" || ch === '"') {
        quote = ch;
        token += ch;
        continue;
      }
      if (ch === "#") break;
      if (/\s/.test(ch)) {
        if (token) {
          tokens.push(token);
          token = "";
        }
        continue;
      }
      token += ch;
    }

    if (token) tokens.push(token);
    return tokens;
  }

  function firstCifToken(value) {
    const tokens = tokenizeCifLine(value);
    return tokens.length ? tokens[0] : "";
  }

  function normalizeSpaceGroupName(value) {
    const cleaned = stripCifString(value).replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    if (/\s+[A-Z]$/.test(cleaned) && /[-\d/]/.test(cleaned)) {
      return cleaned.replace(/\s+[A-Z]$/, "").trim();
    }
    return cleaned;
  }

  function readSemicolonBlock(lines, startIndex) {
    const first = lines[startIndex];
    const parts = [first.replace(/^;/, "")];
    let i = startIndex + 1;
    while (i < lines.length) {
      if (lines[i].startsWith(";")) {
        return { value: parts.join("\n").trim(), nextIndex: i + 1 };
      }
      parts.push(lines[i]);
      i += 1;
    }
    return { value: parts.join("\n").trim(), nextIndex: i };
  }

  function parseLoop(lines, startIndex) {
    const headers = [];
    const values = [];
    let i = startIndex;

    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith("#")) {
        i += 1;
        continue;
      }
      if (!trimmed.startsWith("_")) break;
      headers.push(trimmed.split(/\s+/)[0].toLowerCase());
      i += 1;
    }

    while (i < lines.length) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        i += 1;
        continue;
      }
      if (/^(loop_|data_|save_|global_)/i.test(trimmed) || trimmed.startsWith("_")) break;
      if (raw.startsWith(";")) {
        const block = readSemicolonBlock(lines, i);
        values.push(block.value);
        i = block.nextIndex;
      } else {
        values.push(...tokenizeCifLine(raw));
        i += 1;
      }
    }

    const rows = [];
    if (headers.length) {
      for (let j = 0; j + headers.length <= values.length; j += headers.length) {
        const row = {};
        headers.forEach((header, k) => {
          row[header] = values[j + k];
        });
        rows.push(row);
      }
    }

    return { headers, rows, nextIndex: i };
  }

  function parseAtomSiteLoop(loop) {
    const hasFractionalCoords =
      loop.headers.includes("_atom_site_fract_x") &&
      loop.headers.includes("_atom_site_fract_y") &&
      loop.headers.includes("_atom_site_fract_z");
    if (!hasFractionalCoords) return [];

    return loop.rows
      .map((row, index) => {
        const x = parseCifNumber(row._atom_site_fract_x);
        const y = parseCifNumber(row._atom_site_fract_y);
        const z = parseCifNumber(row._atom_site_fract_z);
        if (x == null || y == null || z == null) return null;

        const type = stripCifString(row._atom_site_type_symbol || "");
        const label = stripCifString(row._atom_site_label || `Atom${index + 1}`);
        const occupancy = parseCifNumber(row._atom_site_occupancy);
        const multiplicity = parseCifNumber(row._atom_site_symmetry_multiplicity);
        const wyckoff = stripCifString(row._atom_site_wyckoff_symbol || "");
        const element = type || (label.match(/[A-Z][a-z]?/) || ["X"])[0];

        return {
          label,
          element,
          typeSymbol: type,
          fractX: x,
          fractY: y,
          fractZ: z,
          occupancy: occupancy == null ? 1 : occupancy,
          multiplicity,
          wyckoff
        };
      })
      .filter(Boolean);
  }

  function parseSymmetryOperationLoop(loop) {
    const operationKey = loop.headers.find((header) =>
      header === "_space_group_symop_operation_xyz" ||
      header === "_symmetry_equiv_pos_as_xyz"
    );
    if (!operationKey) return [];

    return loop.rows
      .map((row) => stripCifString(row[operationKey] || ""))
      .filter(Boolean);
  }

  function readNextValue(lines, startIndex) {
    let i = startIndex;
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith("#")) {
        i += 1;
        continue;
      }
      if (lines[i].startsWith(";")) {
        const parts = [trimmed.slice(1)];
        i += 1;
        while (i < lines.length) {
          if (lines[i].startsWith(";")) {
            i += 1;
            return { value: parts.join("\n").trim(), nextIndex: i };
          }
          parts.push(lines[i]);
          i += 1;
        }
        return { value: parts.join("\n").trim(), nextIndex: i };
      }
      return { value: firstCifToken(trimmed), nextIndex: i + 1 };
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
      if (/^loop_$/i.test(trimmed)) {
        const loop = parseLoop(lines, i);
        i = loop.nextIndex;
        const atoms = parseAtomSiteLoop(loop);
        if (atoms.length) {
          result.atoms = (result.atoms || []).concat(atoms);
        }
        const symmetryOperations = parseSymmetryOperationLoop(loop);
        if (symmetryOperations.length) {
          result.symmetryOperations = (result.symmetryOperations || []).concat(symmetryOperations);
        }
        continue;
      }

      const keyMatch = trimmed.match(/^(_[A-Za-z][\w.\-]*)\s*(.*)$/);
      if (!keyMatch) continue;

      const key = keyMatch[1].toLowerCase();
      let value = keyMatch[2].trim();

      if (!value) {
        const next = readNextValue(lines, i);
        value = next.value;
        i = next.nextIndex;
      } else {
        value = firstCifToken(value);
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
          if (!result.spaceGroupNameRaw) {
            result.spaceGroupNameRaw = stripCifString(value);
            result.spaceGroupName = normalizeSpaceGroupName(value);
          }
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
