(function (global) {
  "use strict";

  const provider = global["space-groups"];
  const SpaceGroup = provider && provider.SpaceGroup;
  const cache = new Map();
  const PREFERRED_HALL_BY_HM = {
    "FD-3M": "-F 4vw 2vw 3",
    "FD-3C": "-F 4ud 2vw 3"
  };
  const PREFERRED_HALL_BY_ID = {
    227: "-F 4vw 2vw 3",
    228: "-F 4ud 2vw 3"
  };

  function normalizeKey(value) {
    return String(value || "")
      .replace(/\([^)]*\)/g, "")
      .replace(/[_'"]/g, "")
      .replace(/\s+/g, "")
      .toUpperCase();
  }

  function lookupSpaceGroup(value) {
    const raw = String(value || "").trim();
    if (!raw || !SpaceGroup) return null;
    const cacheKey = normalizeKey(raw);
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const number = /^\d+$/.test(raw) ? Number(raw) : null;
    let group = number && PREFERRED_HALL_BY_ID[number] ? SpaceGroup.getByHallName(PREFERRED_HALL_BY_ID[number]) : null;
    if (!group && number) group = SpaceGroup.getById(number);
    if (!group && PREFERRED_HALL_BY_HM[cacheKey]) {
      group = SpaceGroup.getByHallName(PREFERRED_HALL_BY_HM[cacheKey]);
    }
    if (!group) group = SpaceGroup.getByHMName(raw) || SpaceGroup.getByHallName(raw);
    if (!group) {
      const compact = raw.replace(/\s+/g, "");
      group = SpaceGroup.getByHMName(compact) || SpaceGroup.getByHallName(compact);
    }
    const result = group ? {
      id: group.id,
      hermannMauguin: group.hermannMauguin,
      hallSymbol: group.hallSymbol,
      operations: (group.symetryList || []).slice(),
      representativeOperations: group.representativeOperations || 0
    } : null;
    cache.set(cacheKey, result);
    return result;
  }

  function operationsForSpaceGroup(value) {
    const group = lookupSpaceGroup(value);
    return group ? group.operations.slice() : [];
  }

  global.SpaceGroupEngine = {
    lookupSpaceGroup,
    operationsForSpaceGroup,
    normalizeKey
  };
})(typeof window !== "undefined" ? window : globalThis);
