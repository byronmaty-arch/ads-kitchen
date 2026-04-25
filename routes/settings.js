const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData, readConfig, writeConfig } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const { validate } = require('../lib/validate');
const router = express.Router();

const MANAGER = ['manager'];

const SETTINGS_SCHEMA = {
  restaurantName: { type: 'string', max: 200 },
  location: { type: 'string', max: 500 },
  phone: { type: 'string', max: 50 },
  currency: { type: 'string', max: 10 },
  address: { type: 'string', max: 500 },
  email: { type: 'string', max: 200 },
  taxRate: { type: 'number', min: 0, max: 100 },
  serviceCharge: { type: 'number', min: 0, max: 100 }
};

const CATEGORY_SCHEMA = {
  name: { type: 'string', max: 100, required: true },
  color: { type: 'string', max: 30 },
  icon: { type: 'string', max: 50 },
  order: { type: 'number', integer: true, min: 0, max: 1000 }
};

// --- SETTINGS ---
router.get('/settings', (req, res) => res.json(readConfig('settings.json')));
router.put('/settings', requireRole(MANAGER), (req, res) => {
  const v = validate(req.body, SETTINGS_SCHEMA, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const settings = { ...readConfig('settings.json'), ...v.data };
  writeConfig('settings.json', settings);
  res.json(settings);
});

// --- CATEGORIES ---
router.get('/categories', (req, res) => res.json(readData('categories.json')));
router.post('/categories', requireRole(MANAGER), (req, res) => {
  const v = validate(req.body, CATEGORY_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const cats = readData('categories.json');
  const cat = { id: uuidv4(), ...v.data };
  cats.push(cat);
  writeData('categories.json', cats);
  res.status(201).json(cat);
});
router.put('/categories/:id', requireRole(MANAGER), (req, res) => {
  const v = validate(req.body, CATEGORY_SCHEMA, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const cats = readData('categories.json');
  const idx = cats.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  cats[idx] = { ...cats[idx], ...v.data };
  writeData('categories.json', cats);
  res.json(cats[idx]);
});
router.delete('/categories/:id', requireRole(MANAGER), (req, res) => {
  let cats = readData('categories.json');
  cats = cats.filter(c => c.id !== req.params.id);
  writeData('categories.json', cats);
  res.json({ success: true });
});

module.exports = router;
