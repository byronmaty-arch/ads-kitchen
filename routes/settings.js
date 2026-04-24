const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData, readConfig, writeConfig } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const router = express.Router();

const MANAGER = ['manager'];

// --- SETTINGS ---
router.get('/settings', (req, res) => res.json(readConfig('settings.json')));
router.put('/settings', requireRole(MANAGER), (req, res) => {
  const settings = { ...readConfig('settings.json'), ...req.body };
  writeConfig('settings.json', settings);
  res.json(settings);
});

// --- CATEGORIES ---
router.get('/categories', (req, res) => res.json(readData('categories.json')));
router.post('/categories', requireRole(MANAGER), (req, res) => {
  const cats = readData('categories.json');
  const cat = { id: uuidv4(), ...req.body };
  cats.push(cat);
  writeData('categories.json', cats);
  res.status(201).json(cat);
});
router.put('/categories/:id', requireRole(MANAGER), (req, res) => {
  const cats = readData('categories.json');
  const idx = cats.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  cats[idx] = { ...cats[idx], ...req.body };
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
