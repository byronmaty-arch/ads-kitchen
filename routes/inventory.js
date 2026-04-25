const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const { validate } = require('../lib/validate');
const router = express.Router();

const MANAGER = ['manager'];
const MANAGER_CASHIER = ['manager', 'cashier'];

const INV_SCHEMA = {
  name: { type: 'string', max: 200, required: true },
  unit: { type: 'string', max: 50 },
  quantity: { type: 'number', min: 0, max: 1_000_000 },
  reorderLevel: { type: 'number', min: 0, max: 1_000_000 },
  costPerUnit: { type: 'number', min: 0, max: 100_000_000 },
  category: { type: 'string', max: 100 },
  standardPortions: { type: 'number', min: 0, max: 100_000 },
  costPerPortion: { type: 'number', min: 0, max: 100_000_000 }
};

const ADJUST_SCHEMA = {
  adjustment: { type: 'number', min: -1_000_000, max: 1_000_000, required: true },
  reason: { type: 'string', max: 500 }
};

const PORTION_SCHEMA = {
  menuItemId: { type: 'string', max: 100 },
  menuItemName: { type: 'string', max: 200 },
  stockItemId: { type: 'string', max: 100 },
  stockItemName: { type: 'string', max: 200 },
  portionsUsed: { type: 'number', min: 0, max: 1000 }
};

// Read-only: all authenticated roles
router.get('/', (req, res) => res.json(readData('inventory.json')));

// Write operations: manager only
router.post('/', requireRole(MANAGER), (req, res) => {
  const v = validate(req.body, INV_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const inv = readData('inventory.json');
  const item = { id: uuidv4(), ...v.data };
  inv.push(item);
  writeData('inventory.json', inv);
  res.status(201).json(item);
});

router.put('/:id', requireRole(MANAGER), (req, res) => {
  const v = validate(req.body, INV_SCHEMA, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const inv = readData('inventory.json');
  const idx = inv.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  inv[idx] = { ...inv[idx], ...v.data };
  writeData('inventory.json', inv);
  res.json(inv[idx]);
});

router.delete('/:id', requireRole(MANAGER), (req, res) => {
  let inv = readData('inventory.json');
  inv = inv.filter(i => i.id !== req.params.id);
  writeData('inventory.json', inv);
  res.json({ success: true });
});

router.post('/:id/adjust', requireRole(MANAGER), (req, res) => {
  const v = validate(req.body, ADJUST_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const inv = readData('inventory.json');
  const idx = inv.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { adjustment, reason } = v.data;
  const newQty = (inv[idx].quantity || 0) + adjustment;
  if (newQty < 0) {
    return res.status(400).json({
      error: `Adjustment would push stock below zero (current: ${inv[idx].quantity}, adjustment: ${adjustment})`
    });
  }
  inv[idx].quantity = newQty;
  writeData('inventory.json', inv);
  const logs = readData('stock-log.json');
  logs.push({
    id: uuidv4(), itemId: req.params.id, itemName: inv[idx].name,
    adjustment, reason: reason || '', newQuantity: newQty,
    timestamp: new Date().toISOString(),
    recordedBy: req.user.staffId, recordedByName: req.user.staffName
  });
  writeData('stock-log.json', logs);
  res.json(inv[idx]);
});

// Alerts + stock log: manager and cashier
router.get('/alerts', requireRole(MANAGER_CASHIER), (req, res) => {
  const inv = readData('inventory.json');
  res.json(inv.filter(i => i.quantity <= i.reorderLevel));
});

router.get('/stock-log', requireRole(MANAGER_CASHIER), (req, res) => {
  const logs = readData('stock-log.json');
  res.json(logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100));
});

// Portion map: manager only
router.get('/portion-map', requireRole(MANAGER), (req, res) => res.json(readData('portion-map.json')));
router.post('/portion-map', requireRole(MANAGER), (req, res) => {
  const v = validate(req.body, PORTION_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const maps = readData('portion-map.json');
  const entry = { id: uuidv4(), ...v.data };
  maps.push(entry);
  writeData('portion-map.json', maps);
  res.status(201).json(entry);
});
router.put('/portion-map/:id', requireRole(MANAGER), (req, res) => {
  const v = validate(req.body, PORTION_SCHEMA, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const maps = readData('portion-map.json');
  const idx = maps.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  maps[idx] = { ...maps[idx], ...v.data };
  writeData('portion-map.json', maps);
  res.json(maps[idx]);
});
router.delete('/portion-map/:id', requireRole(MANAGER), (req, res) => {
  let maps = readData('portion-map.json');
  maps = maps.filter(m => m.id !== req.params.id);
  writeData('portion-map.json', maps);
  res.json({ success: true });
});

module.exports = router;
