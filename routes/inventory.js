const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const router = express.Router();

const MANAGER = ['manager'];
const MANAGER_CASHIER = ['manager', 'cashier'];

// Read-only: all authenticated roles
router.get('/', (req, res) => res.json(readData('inventory.json')));

// Write operations: manager only
router.post('/', requireRole(MANAGER), (req, res) => {
  const inv = readData('inventory.json');
  const item = { id: uuidv4(), ...req.body };
  inv.push(item);
  writeData('inventory.json', inv);
  res.status(201).json(item);
});

router.put('/:id', requireRole(MANAGER), (req, res) => {
  const inv = readData('inventory.json');
  const idx = inv.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  inv[idx] = { ...inv[idx], ...req.body };
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
  const inv = readData('inventory.json');
  const idx = inv.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { adjustment, reason } = req.body;
  inv[idx].quantity += adjustment;
  writeData('inventory.json', inv);
  const logs = readData('stock-log.json');
  logs.push({
    id: uuidv4(), itemId: req.params.id, itemName: inv[idx].name,
    adjustment, reason: reason || '', newQuantity: inv[idx].quantity,
    timestamp: new Date().toISOString()
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
  const maps = readData('portion-map.json');
  const entry = { id: uuidv4(), ...req.body };
  maps.push(entry);
  writeData('portion-map.json', maps);
  res.status(201).json(entry);
});
router.put('/portion-map/:id', requireRole(MANAGER), (req, res) => {
  const maps = readData('portion-map.json');
  const idx = maps.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  maps[idx] = { ...maps[idx], ...req.body };
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
