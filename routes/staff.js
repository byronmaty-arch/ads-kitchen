const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../lib/db');
const { hashPin, isHashedPin, requireRole } = require('../lib/auth');
const router = express.Router();

const MANAGER = ['manager'];

router.get('/', requireRole(MANAGER), (req, res) => {
  const staff = readData('staff.json');
  res.json(staff.map(s => ({ ...s, pin: '****' })));
});

router.post('/', requireRole(MANAGER), (req, res) => {
  const staff = readData('staff.json');
  const member = { id: uuidv4(), active: true, ...req.body };
  if (member.pin && !isHashedPin(member.pin)) member.pin = hashPin(member.pin);
  staff.push(member);
  writeData('staff.json', staff);
  res.status(201).json({ ...member, pin: '****' });
});

router.put('/:id', requireRole(MANAGER), (req, res) => {
  const staff = readData('staff.json');
  const idx = staff.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const patch = { ...req.body };
  if (patch.pin === '' || patch.pin == null) delete patch.pin;
  else if (!isHashedPin(patch.pin)) patch.pin = hashPin(patch.pin);
  staff[idx] = { ...staff[idx], ...patch };
  writeData('staff.json', staff);
  res.json({ ...staff[idx], pin: '****' });
});

router.delete('/:id', requireRole(MANAGER), (req, res) => {
  let staff = readData('staff.json');
  staff = staff.filter(s => s.id !== req.params.id);
  writeData('staff.json', staff);
  res.json({ success: true });
});

module.exports = router;
