(function (global) {
  "use strict";

  const provider = global["space-groups"];
  const SpaceGroup = provider && provider.SpaceGroup;
  const SettingsData = global.SpaceGroupSettingsData || [];
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

  function defaultHallForKey(cacheKey, number) {
    if (number && PREFERRED_HALL_BY_ID[number]) return PREFERRED_HALL_BY_ID[number];
    return PREFERRED_HALL_BY_HM[cacheKey] || "";
  }

  function settingMatchesValue(setting, raw, cacheKey, number) {
    if (!setting) return false;
    if (number) return setting.id === number;
    return normalizeKey(setting.hm) === cacheKey || normalizeKey(setting.hs) === cacheKey;
  }

  function listSpaceGroupSettings(value) {
    const raw = String(value || "").trim();
    if (!raw) return [];
    const cacheKey = normalizeKey(raw);
    const number = /^\d+$/.test(raw) ? Number(raw) : null;
    const matches = SettingsData.filter((setting) => settingMatchesValue(setting, raw, cacheKey, number));
    const preferredHall = defaultHallForKey(cacheKey, number);
    return matches.map((setting) => ({
      id: setting.id,
      hermannMauguin: setting.hm,
      hallSymbol: setting.hs,
      representativeOperations: setting.o || 0,
      preferred: preferredHall ? setting.hs === preferredHall : false
    }));
  }

  function lookupSpaceGroup(value, settingHallSymbol) {
    const raw = String(value || "").trim();
    if (!raw || !SpaceGroup) return null;
    const selectedHall = String(settingHallSymbol || "").trim();
    const cacheKey = `${normalizeKey(raw)}|${selectedHall}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const rawKey = normalizeKey(raw);
    const number = /^\d+$/.test(raw) ? Number(raw) : null;
    let group = selectedHall ? SpaceGroup.getByHallName(selectedHall) : null;
    if (group && number && group.id !== number) group = null;
    if (group && !number && !settingMatchesValue({ id: group.id, hm: group.hermannMauguin, hs: group.hallSymbol }, raw, rawKey, number)) group = null;
    if (!group && number && PREFERRED_HALL_BY_ID[number]) group = SpaceGroup.getByHallName(PREFERRED_HALL_BY_ID[number]);
    if (!group && number) group = SpaceGroup.getById(number);
    if (!group && PREFERRED_HALL_BY_HM[rawKey]) {
      group = SpaceGroup.getByHallName(PREFERRED_HALL_BY_HM[rawKey]);
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

  function operationsForSpaceGroup(value, settingHallSymbol) {
    const group = lookupSpaceGroup(value, settingHallSymbol);
    return group ? group.operations.slice() : [];
  }

  global.SpaceGroupEngine = {
    listSpaceGroupSettings,
    lookupSpaceGroup,
    operationsForSpaceGroup,
    normalizeKey
  };
})(typeof window !== "undefined" ? window : globalThis);
