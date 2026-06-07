/**
 * Links a Hermann-Mauguin space-group *symbol* field with an International
 * Tables *number* field so that editing either updates the other, using the
 * symmetry engine (SpaceGroupEngine) to map between them.
 *
 * Usage:
 *   const link = SpaceGroupFields.linkSpaceGroupFields({
 *     symbol: "crystal-spacegroup",          // id or element
 *     number: "crystal-spacegroup-number"    // id or element
 *   });
 *   // Call link.sync() after the symbol field is changed programmatically
 *   // (CIF/preset/config load, state restore) to refresh the number field.
 */
(function (global) {
  "use strict";

  function engine() {
    const e = global.SpaceGroupEngine;
    return e && typeof e.lookupSpaceGroup === "function" ? e : null;
  }

  // Symbol (or number string) -> International Tables number, or null.
  function spaceGroupNumberFor(value) {
    const e = engine();
    if (!e) return null;
    const query = String(value || "").split(":")[0].trim();
    if (!query) return null;
    try {
      const group = e.lookupSpaceGroup(query, "");
      return group && Number.isInteger(group.id) ? group.id : null;
    } catch (error) {
      return null;
    }
  }

  // International Tables number -> Hermann-Mauguin symbol, or "".
  function spaceGroupSymbolFor(number) {
    const e = engine();
    if (!e) return "";
    try {
      const group = e.lookupSpaceGroup(String(number), "");
      return group ? group.hermannMauguin : "";
    } catch (error) {
      return "";
    }
  }

  function resolve(elementOrId) {
    return typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;
  }

  function linkSpaceGroupFields(options) {
    const opts = options || {};
    const symbolEl = resolve(opts.symbol);
    const numberEl = resolve(opts.number);
    const noop = { sync() {} };
    if (!symbolEl || !numberEl) return noop;

    // Mirror the current symbol into the number field. Skip while the user is
    // typing in the number field so we never fight their edit.
    function syncNumberFromSymbol() {
      if (document.activeElement === numberEl) return;
      const number = spaceGroupNumberFor(symbolEl.value);
      numberEl.value = number == null ? "" : String(number);
    }

    // Live symbol -> number while typing the symbol.
    symbolEl.addEventListener("input", syncNumberFromSymbol);

    // number -> symbol: rewrite the symbol field, then let the host tool's own
    // listeners react by dispatching the events they already listen for.
    numberEl.addEventListener("input", function () {
      const number = parseInt(numberEl.value, 10);
      if (!Number.isInteger(number) || number < 1 || number > 230) return;
      symbolEl.value = spaceGroupSymbolFor(number) || String(number);
      symbolEl.dispatchEvent(new Event("input", { bubbles: true }));
      symbolEl.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // On blur, restore a valid number from the symbol if the entry was invalid.
    numberEl.addEventListener("change", function () {
      const number = parseInt(numberEl.value, 10);
      if (!Number.isInteger(number) || number < 1 || number > 230) syncNumberFromSymbol();
    });

    syncNumberFromSymbol();
    return { sync: syncNumberFromSymbol };
  }

  global.SpaceGroupFields = {
    linkSpaceGroupFields,
    spaceGroupNumberFor,
    spaceGroupSymbolFor
  };
})(typeof window !== "undefined" ? window : globalThis);
