// FFXIV Submarine component presets
// Add more presets here as needed

const PRESETS = {
  'submarine-shark': {
  name: 'Submarine - Shark',
  items: [
    // Hull
    { item_name: 'Hull - Walnut Lumber', quantity_needed: 18 },
    { item_name: 'Hull - Spruce Lumber', quantity_needed: 18 },
    { item_name: 'Hull - Iron Nails', quantity_needed: 18 },
    { item_name: 'Hull - Cobalt Ingot', quantity_needed: 18 },
    { item_name: 'Hull - Cedar Lumber', quantity_needed: 9 },
    { item_name: 'Hull - Iron Rivets', quantity_needed: 18 },
    { item_name: 'Hull - Mythril Plate', quantity_needed: 18 },
    { item_name: 'Hull - Electrum Ingot', quantity_needed: 18 },
    { item_name: 'Hull - Horn Glue', quantity_needed: 18 },
    { item_name: 'Hull - Mythril Rivets', quantity_needed: 18 },
    { item_name: 'Hull - Rose Gold Ingot', quantity_needed: 21 },
    { item_name: 'Hull - Varnish', quantity_needed: 18 },
    // Stern
    { item_name: 'Stern - Steel Rivets', quantity_needed: 24 },
    { item_name: 'Stern - Cobalt Ingot', quantity_needed: 18 },
    { item_name: 'Stern - Steel Ingot', quantity_needed: 24 },
    { item_name: 'Stern - Cobalt Joint Plate', quantity_needed: 24 },
    { item_name: 'Stern - Steel Ingot', quantity_needed: 30 },
    { item_name: 'Stern - Darksteel Ingot', quantity_needed: 9 },
    { item_name: 'Stern - Steel Joint Plate', quantity_needed: 30 },
    { item_name: 'Stern - Cobalt Ingot', quantity_needed: 30 },
    { item_name: 'Stern - Ancient Lumber', quantity_needed: 9 },
    { item_name: 'Stern - Mythril Rivets', quantity_needed: 30 },
    { item_name: 'Stern - Cobalt Ingot', quantity_needed: 30 },
    { item_name: 'Stern - Silver Ingot', quantity_needed: 30 },
    // Bow
    { item_name: 'Bow - Steel Ingot', quantity_needed: 30 },
    { item_name: 'Bow - Steel Rivets', quantity_needed: 30 },
    { item_name: 'Bow - Cobalt Joint Plate', quantity_needed: 30 },
    { item_name: 'Bow - Cobalt Ingot', quantity_needed: 18 },
    { item_name: 'Bow - Steel Rivets', quantity_needed: 30 },
    { item_name: 'Bow - Steel Joint Plate', quantity_needed: 30 },
    { item_name: 'Bow - Darksteel Ingot', quantity_needed: 12 },
    { item_name: 'Bow - Ancient Lumber', quantity_needed: 9 },
    { item_name: 'Bow - Mythril Rivets', quantity_needed: 30 },
    { item_name: 'Bow - Silver Ingot', quantity_needed: 30 },
    // Bridge
    { item_name: 'Bridge - Treated Spruce Lumber', quantity_needed: 12 },
    { item_name: 'Bridge - Darksteel Nugget', quantity_needed: 21 },
    { item_name: 'Bridge - Iron Nails', quantity_needed: 21 },
    { item_name: 'Bridge - Iron Rivets', quantity_needed: 21 },
    { item_name: 'Bridge - Steel Ingot', quantity_needed: 21 },
    { item_name: 'Bridge - Steel Rivets', quantity_needed: 21 },
    { item_name: 'Bridge - Darksteel Ingot', quantity_needed: 24 },
    { item_name: 'Bridge - Cobalt Rivets', quantity_needed: 21 },
    { item_name: 'Bridge - Cobalt Ingot', quantity_needed: 18 },
    { item_name: 'Bridge - Electrum Ingot', quantity_needed: 21 },
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
