const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const { validate } = require('../lib/validate');
const router = express.Router();

const MANAGER_CASHIER = ['manager', 'cashier'];

const VENDOR_SCHEMA = {
  name: { type: 'string', max: 200, required: true },
  phone: { type: 'string', max: 50 },
  email: { type: 'string', max: 200 },
  address: { type: 'string', max: 500 },
  category: { type: 'string', max: 100 },
  rating: { type: 'number', min: 0, max: 5 },
  notes: { type: 'string', max: 1000 }
};

router.get('/', requireRole(MANAGER_CASHIER), (req, res) => res.json(readData('vendors.json')));
router.post('/', requireRole(MANAGER_CASHIER), (req, res) => {
  const v = validate(req.body, VENDOR_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const vendors = readData('vendors.json');
  const vendor = { id: uuidv4(), rating: 3, ...v.data };
  vendors.push(vendor);
  writeData('vendors.json', vendors);
  res.status(201).json(vendor);
});
router.put('/:id', requireRole(MANAGER_CASHIER), (req, res) => {
  const v = validate(req.body, VENDOR_SCHEMA, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const vendors = readData('vendors.json');
  const idx = vendors.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  vendors[idx] = { ...vendors[idx], ...v.data };
  writeData('vendors.json', vendors);
  res.json(vendors[idx]);
});
router.delete('/:id', requireRole(MANAGER_CASHIER), (req, res) => {
  let vendors = readData('vendors.json');
  vendors = vendors.filter(v => v.id !== req.params.id);
  writeData('vendors.json', vendors);
  res.json({ success: true });
});

module.exports = router;
