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
