const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../lib/db');
const router = express.Router();

router.get('/', (req, res) => res.json(readData('vendors.json')));
router.post('/', (req, res) => {
  const vendors = readData('vendors.json');
  const vendor = { id: uuidv4(), rating: 3, ...req.body };
  vendors.push(vendor);
  writeData('vendors.json', vendors);
  res.status(201).json(vendor);
});
router.put('/:id', (req, res) => {
  const vendors = readData('vendors.json');
  const idx = vendors.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  vendors[idx] = { ...vendors[idx], ...req.body };
  writeData('vendors.json', vendors);
  res.json(vendors[idx]);
});
router.delete('/:id', (req, res) => {
  let vendors = readData('vendors.json');
  vendors = vendors.filter(v => v.id !== req.params.id);
  writeData('vendors.json', vendors);
  res.json({ success: true });
});

module.exports = router;
