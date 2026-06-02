/**
 * Standard room-temperature lattice parameters for common neutron and X-ray samples.
 * Values are representative crystallographic data (ICSD / Pearson's Crystal Data).
 */
const CRYSTAL_PRESET_GROUPS = [
  {
    label: "Semiconductors",
    presets: [
      {
        id: "si-diamond",
        name: "Silicon (diamond)",
        a: 5.4310,
        b: 5.4310,
        c: 5.4310,
        alpha: 90,
        beta: 90,
        gamma: 90,
        spaceGroup: "Fd-3m",
        structureModel: "diamond"
      },
      {
        id: "ge-diamond",
        name: "Germanium (diamond)",
        a: 5.6580,
        b: 5.6580,
        c: 5.6580,
        alpha: 90,
        beta: 90,
        gamma: 90,
        spaceGroup: "Fd-3m",
        structureModel: "diamond"
      }
    ]
  },
  {
    label: "Elemental metals",
    presets: [
      {
        id: "al-fcc",
        name: "Aluminum (FCC)",
        a: 4.0496,
        b: 4.0496,
        c: 4.0496,
        alpha: 90,
        beta: 90,
        gamma: 90,
        spaceGroup: "Fm-3m"
      },
      {
        id: "cu-fcc",
        name: "Copper (FCC)",
        a: 3.6150,
        b: 3.6150,
        c: 3.6150,
        alpha: 90,
        beta: 90,
        gamma: 90,
        spaceGroup: "Fm-3m"
      }
    ]
  },
  {
    label: "Layered / hexagonal",
    presets: [
      {
        id: "graphite",
        name: "Graphite (hexagonal)",
        a: 2.4612,
        b: 2.4612,
        c: 6.7084,
        alpha: 90,
        beta: 90,
        gamma: 120,
        spaceGroup: "P63/mmc"
      },
      {
        id: "sapphire",
        name: "Sapphire, α-Al₂O₃ (trigonal)",
        a: 4.7588,
        b: 4.7588,
        c: 12.991,
        alpha: 90,
        beta: 90,
        gamma: 120,
        spaceGroup: "R-3c"
      }
    ]
  },
  {
    label: "Heusler alloys (L2₁)",
    presets: [
      {
        id: "co2mnga",
        name: "Co₂MnGa",
        a: 5.806,
        b: 5.806,
        c: 5.806,
        alpha: 90,
        beta: 90,
        gamma: 90,
        spaceGroup: "Fm-3m"
      },
      {
        id: "co2mnsi",
        name: "Co₂MnSi",
        a: 5.693,
        b: 5.693,
        c: 5.693,
        alpha: 90,
        beta: 90,
        gamma: 90,
        spaceGroup: "Fm-3m"
      },
      {
        id: "ni2mnga",
        name: "Ni₂MnGa",
        a: 5.825,
        b: 5.825,
        c: 5.825,
        alpha: 90,
        beta: 90,
        gamma: 90,
        spaceGroup: "Fm-3m"
      },
      {
        id: "cu2mnal",
        name: "Cu₂MnAl",
        a: 5.869,
        b: 5.869,
        c: 5.869,
        alpha: 90,
        beta: 90,
        gamma: 90,
        spaceGroup: "Fm-3m"
      }
    ]
  }
];

function getAllCrystalPresets() {
  return CRYSTAL_PRESET_GROUPS.flatMap((group) => group.presets);
}

function getCrystalPreset(id) {
  if (!id) return null;
  return getAllCrystalPresets().find((preset) => preset.id === id) || null;
}

function populateCrystalPresetSelect(selectEl) {
  if (!selectEl) return;

  selectEl.replaceChildren();

  const customOption = document.createElement("option");
  customOption.value = "";
  customOption.textContent = "Custom / manual entry";
  selectEl.appendChild(customOption);

  CRYSTAL_PRESET_GROUPS.forEach((group) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;

    group.presets.forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.name;
      optgroup.appendChild(option);
    });

    selectEl.appendChild(optgroup);
  });
}

function applyCrystalPresetToFields(preset, fieldMap) {
  if (!preset) return;

  const entries = [
    ["a", preset.a],
    ["b", preset.b],
    ["c", preset.c],
    ["alpha", preset.alpha],
    ["beta", preset.beta],
    ["gamma", preset.gamma]
  ];

  entries.forEach(([key, value]) => {
    const input = fieldMap[key];
    if (input && Number.isFinite(value)) {
      input.value = String(value);
    }
  });

  if (fieldMap.spaceGroup && preset.spaceGroup) {
    fieldMap.spaceGroup.value = preset.spaceGroup;
  }
}

function wrapCrystalPresetFraction(value) {
  const wrapped = Number(value) - Math.floor(Number(value));
  return Math.abs(wrapped - 1) < 1e-9 || Math.abs(wrapped) < 1e-9 ? 0 : wrapped;
}

function crystalPresetDirectPositions(points) {
  return points.map(([fractX, fractY, fractZ]) => ({
    fractX: wrapCrystalPresetFraction(fractX),
    fractY: wrapCrystalPresetFraction(fractY),
    fractZ: wrapCrystalPresetFraction(fractZ)
  }));
}

function crystalPresetTranslatedPositions(basis, translations) {
  return basis.flatMap((base) =>
    translations.map((shift) => ({
      fractX: wrapCrystalPresetFraction(base[0] + shift[0]),
      fractY: wrapCrystalPresetFraction(base[1] + shift[1]),
      fractZ: wrapCrystalPresetFraction(base[2] + shift[2])
    }))
  );
}

const CRYSTAL_PRESET_FACE_CENTER_TRANSLATIONS = [
  [0, 0, 0],
  [0, 0.5, 0.5],
  [0.5, 0, 0.5],
  [0.5, 0.5, 0]
];

const CRYSTAL_PRESET_RHOMBOHEDRAL_HEX_TRANSLATIONS = [
  [0, 0, 0],
  [2 / 3, 1 / 3, 1 / 3],
  [1 / 3, 2 / 3, 2 / 3]
];

function crystalPresetWyckoffAtom(label, element, fract, wyckoff, positions) {
  return {
    label,
    element,
    fractX: fract[0],
    fractY: fract[1],
    fractZ: fract[2],
    occupancy: 1,
    wyckoff,
    wyckoffPositions: positions
  };
}

function atomsForCrystalPreset(preset) {
  if (!preset) return null;
  if (preset.structureModel === "diamond") {
    const element = preset.id && preset.id.startsWith("ge-") ? "Ge" : "Si";
    return [
      crystalPresetWyckoffAtom(
        `${element}1`,
        element,
        [0, 0, 0],
        "8a",
        crystalPresetTranslatedPositions([[0, 0, 0], [0.25, 0.25, 0.25]], CRYSTAL_PRESET_FACE_CENTER_TRANSLATIONS)
      )
    ];
  }
  const elementMatch = String(preset.name || "").match(/[A-Z][a-z]?/);
  if (elementMatch && ["al-", "cu-"].some((prefix) => preset.id && preset.id.startsWith(prefix))) {
    const element = elementMatch[0].charAt(0).toUpperCase() + elementMatch[0].slice(1).toLowerCase();
    return [
      crystalPresetWyckoffAtom(
        `${element}1`,
        element,
        [0, 0, 0],
        "4a",
        crystalPresetTranslatedPositions([[0, 0, 0]], CRYSTAL_PRESET_FACE_CENTER_TRANSLATIONS)
      )
    ];
  }
  const heusler = {
    co2mnga: ["Co", "Mn", "Ga"],
    co2mnsi: ["Co", "Mn", "Si"],
    ni2mnga: ["Ni", "Mn", "Ga"],
    cu2mnal: ["Cu", "Mn", "Al"]
  }[preset.id];
  if (heusler) {
    const [x, y, z] = heusler;
    return [
      crystalPresetWyckoffAtom(`${x}1`, x, [0.25, 0.25, 0.25], "8c", crystalPresetTranslatedPositions([[0.25, 0.25, 0.25], [0.75, 0.75, 0.75]], CRYSTAL_PRESET_FACE_CENTER_TRANSLATIONS)),
      crystalPresetWyckoffAtom(`${y}1`, y, [0, 0, 0], "4a", crystalPresetTranslatedPositions([[0, 0, 0]], CRYSTAL_PRESET_FACE_CENTER_TRANSLATIONS)),
      crystalPresetWyckoffAtom(`${z}1`, z, [0.5, 0.5, 0.5], "4b", crystalPresetTranslatedPositions([[0.5, 0.5, 0.5]], CRYSTAL_PRESET_FACE_CENTER_TRANSLATIONS))
    ];
  }
  if (preset.id === "graphite") {
    return [
      crystalPresetWyckoffAtom(
        "C1",
        "C",
        [1 / 3, 2 / 3, 0.25],
        "4f",
        crystalPresetDirectPositions([
          [1 / 3, 2 / 3, 0.25],
          [2 / 3, 1 / 3, 0.75],
          [2 / 3, 1 / 3, 0.25],
          [1 / 3, 2 / 3, 0.75]
        ])
      )
    ];
  }
  if (preset.id === "sapphire") {
    const alZ = 0.3522;
    const oX = 0.306;
    return [
      crystalPresetWyckoffAtom(
        "Al1",
        "Al",
        [0, 0, alZ],
        "12c",
        crystalPresetTranslatedPositions([[0, 0, alZ], [0, 0, -alZ], [0, 0, 0.5 + alZ], [0, 0, 0.5 - alZ]], CRYSTAL_PRESET_RHOMBOHEDRAL_HEX_TRANSLATIONS)
      ),
      crystalPresetWyckoffAtom(
        "O1",
        "O",
        [oX, 0, 0.25],
        "18e",
        crystalPresetTranslatedPositions([[oX, 0, 0.25], [0, oX, 0.25], [-oX, -oX, 0.25], [-oX, 0, 0.75], [0, -oX, 0.75], [oX, oX, 0.75]], CRYSTAL_PRESET_RHOMBOHEDRAL_HEX_TRANSLATIONS)
      )
    ];
  }
  return null;
}
