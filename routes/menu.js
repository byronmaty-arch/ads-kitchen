const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../lib/db');
const router = express.Router();

router.get('/', (req, res) => {
  let items = readData('menu.json');
  if (req.query.menuType) items = items.filter(i => i.menuType === req.query.menuType || i.menuType === 'both');
  res.json(items);
});

router.post('/', (req, res) => {
  const items = readData('menu.json');
  const item = { id: uuidv4(), active: true, ...req.body };
  items.push(item);
  writeData('menu.json', items);
  res.status(201).json(item);
});

router.put('/:id', (req, res) => {
  const items = readData('menu.json');
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  items[idx] = { ...items[idx], ...req.body };
  writeData('menu.json', items);
  res.json(items[idx]);
});

router.delete('/:id', (req, res) => {
  let items = readData('menu.json');
  items = items.filter(i => i.id !== req.params.id);
  writeData('menu.json', items);
  res.json({ success: true });
});

module.exports = router;
