// FFXIV Submarine component presets
// Add more presets here as needed

const PRESETS = {
  'submarine-shark': {
    name: 'Submarine - Shark',
    items: [
      { item_name: 'Coke', quantity_needed: 8 },
      { item_name: 'Mythril Plate', quantity_needed: 4 },
      { item_name: 'Electrum Ingot', quantity_needed: 4 },
      { item_name: 'Walnut Lumber', quantity_needed: 4 },
    ]
  },
  'submarine-unkiu': {
    name: 'Submarine - Unkiu',
    items: [
      { item_name: 'Titanium Alloy Mirror', quantity_needed: 8 },
      { item_name: 'Hardsilver Ingot', quantity_needed: 12 },
      { item_name: 'Teak Lumber', quantity_needed: 8 },
      { item_name: 'Gaganaskin Strap', quantity_needed: 4 },
    ]
  },
  'submarine-syldra': {
    name: 'Submarine - Syldra',
    items: [
      { item_name: 'Hallowed Chestnut Lumber', quantity_needed: 8 },
      { item_name: 'Chromite Ingot', quantity_needed: 12 },
      { item_name: 'Dwarven Cotton Yarn', quantity_needed: 8 },
      { item_name: 'Palladium Ingot', quantity_needed: 8 },
    ]
  },
  'submarine-modified-shark': {
    name: 'Submarine - Modified Shark',
    items: [
      { item_name: 'Cobalt Ingot', quantity_needed: 12 },
      { item_name: 'Mythril Plate', quantity_needed: 8 },
      { item_name: 'Electrum Ingot', quantity_needed: 8 },
      { item_name: 'Walnut Lumber', quantity_needed: 8 },
    ]
  },
};

function getPresetNames() {
  return Object.keys(PRESETS).map(key => ({
    key,
    name: PRESETS[key].name
  }));
}

function getPreset(key) {
  return PRESETS[key] || null;
}

module.exports = { PRESETS, getPresetNames, getPreset };
