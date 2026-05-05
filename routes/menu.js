const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const { validate } = require('../lib/validate');
const router = express.Router();

const MANAGER = ['manager'];

const MENU_SCHEMA = {
  name: { type: 'string', max: 200, required: true },
  price: { type: 'number', min: 0, max: 10_000_000, required: true },
  cost: { type: 'number', min: 0, max: 10_000_000 },
  category: { type: 'string', max: 100 },
  description: { type: 'string', max: 1000 },
  menuType: { type: 'string', enum: ['walkin', 'community', 'online', 'both', 'glovo'], max: 20 },
  active: { type: 'boolean' },
  hasAccompaniments: { type: 'boolean' },
  image: { type: 'string', max: 500 }
};

router.get('/', (req, res) => {
  let items = readData('menu.json');
  if (req.query.menuType) items = items.filter(i => i.menuType === req.query.menuType || i.menuType === 'both');
  res.json(items);
});

router.post('/', requireRole(MANAGER), (req, res) => {
  const v = validate(req.body, MENU_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const items = readData('menu.json');
  const item = { id: uuidv4(), active: true, ...v.data };
  items.push(item);
  writeData('menu.json', items);
  res.status(201).json(item);
});

router.put('/:id', requireRole(MANAGER), (req, res) => {
  const v = validate(req.body, MENU_SCHEMA, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const items = readData('menu.json');
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  items[idx] = { ...items[idx], ...v.data };
  writeData('menu.json', items);
  res.json(items[idx]);
});

router.delete('/:id', requireRole(MANAGER), (req, res) => {
  let items = readData('menu.json');
  items = items.filter(i => i.id !== req.params.id);
  writeData('menu.json', items);
  res.json({ success: true });
});

module.exports = router;
