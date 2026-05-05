// Stock deduction helpers for order lifecycle.
// Order items reference menu items by name; portion-map maps menu item name → stock item name + portions used.
// Inventory `quantity` is in `unit` (pc, kg). `standardPortions` is portions per unit, so
// inventory delta (in `unit`) = portionsUsed / standardPortions.

const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('./db');

// Returns Map<inventoryId, { item, qty }> — qty is in inventory unit, positive = needed
function computeRequiredStock(orderItems) {
  const portionMap = readData('portion-map.json');
  const inventory = readData('inventory.json');
  const invByName = new Map(inventory.map(i => [i.name, i]));
  const required = new Map();
  for (const oi of (orderItems || [])) {
    const pm = portionMap.find(p => p.menuItemName === oi.name);
    if (!pm) continue; // no mapping → nothing to deduct (drinks, sides without recipe)
    const inv = invByName.get(pm.stockItemName);
    if (!inv) continue; // mapped stock item missing from inventory
    const portionsPerUnit = inv.standardPortions && inv.standardPortions > 0 ? inv.standardPortions : 1;
    const qty = ((pm.portionsUsed || 1) * (oi.quantity || 0)) / portionsPerUnit;
    if (qty <= 0) continue;
    const prev = required.get(inv.id);
    required.set(inv.id, { item: inv, qty: (prev ? prev.qty : 0) + qty });
  }
  return required;
}

// Returns { ok, shortages: [{ name, need, have, unit }] }
function checkAvailability(required) {
  const shortages = [];
  for (const { item, qty } of required.values()) {
    if ((item.quantity || 0) < qty) {
      shortages.push({ name: item.name, need: round3(qty), have: item.quantity || 0, unit: item.unit || '' });
    }
  }
  return { ok: shortages.length === 0, shortages };
}

// Apply delta. sign = -1 to deduct (sale), +1 to restore (cancel/delete).
function applyStockDelta(required, sign, reason, user) {
  const inventory = readData('inventory.json');
  const logs = readData('stock-log.json');
  const invById = new Map(inventory.map(i => [i.id, i]));
  const now = new Date().toISOString();
  const userId = user && user.staffId;
  const userName = user && user.staffName;
  for (const { item, qty } of required.values()) {
    const live = invById.get(item.id);
    if (!live) continue;
    const adjustment = sign * qty;
    const newQty = (live.quantity || 0) + adjustment;
    live.quantity = Math.max(0, round3(newQty));
    logs.push({
      id: uuidv4(),
      itemId: live.id,
      itemName: live.name,
      adjustment: round3(adjustment),
      reason: reason || (sign < 0 ? 'order' : 'order-reversal'),
      newQuantity: live.quantity,
      timestamp: now,
      recordedBy: userId,
      recordedByName: userName
    });
  }
  writeData('inventory.json', inventory);
  writeData('stock-log.json', logs);
}

function round3(n) { return Math.round(n * 1000) / 1000; }

function formatShortageMessage(shortages) {
  return 'Insufficient stock: ' + shortages
    .map(s => `${s.name} (need ${s.need}${s.unit}, have ${s.have}${s.unit})`)
    .join('; ');
}

module.exports = { computeRequiredStock, checkAvailability, applyStockDelta, formatShortageMessage };
