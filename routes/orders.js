const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../lib/db');
const router = express.Router();

function staffCodeFromName(name) {
  if (!name) return 'XX';
  const first = name.trim().split(/\s+/)[0] || name.trim();
  const letters = first.replace(/[^a-zA-Z]/g, '');
  if (!letters) return 'XX';
  return letters[0].toUpperCase() + letters[letters.length - 1].toUpperCase();
}

router.get('/', (req, res) => {
  let orders = readData('orders.json');
  if (req.query.date) orders = orders.filter(o => o.date && o.date.startsWith(req.query.date));
  if (req.query.status) orders = orders.filter(o => o.status === req.query.status);
  if (req.query.staffId) orders = orders.filter(o => o.staffId === req.query.staffId);
  res.json(orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

router.get('/:id', (req, res) => {
  const order = readData('orders.json').find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});

router.post('/', (req, res) => {
  const orders = readData('orders.json');
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const body = req.body || {};
  let orderNumber;
  if (body.staffId) {
    const staff = readData('staff.json').find(s => s.id === body.staffId);
    const staffCode = staff ? staffCodeFromName(staff.name) + '01' : 'XX01';
    const seq = orders.filter(o => o.date === today && o.staffId === body.staffId).length + 1;
    orderNumber = staffCode + String(seq).padStart(2, '0');
  } else {
    orderNumber = orders.filter(o => o.date === today).length + 1;
  }
  const order = {
    id: uuidv4(), orderNumber, date: today,
    createdAt: now.toISOString(), status: 'new', paymentStatus: 'unpaid',
    ...body
  };
  orders.push(order);
  writeData('orders.json', orders);
  res.status(201).json(order);
});

router.put('/:id', (req, res) => {
  const orders = readData('orders.json');
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  orders[idx] = { ...orders[idx], ...req.body };
  if (req.body.paymentStatus === 'paid' && !orders[idx].paidAt) orders[idx].paidAt = new Date().toISOString();
  if (req.body.paymentMethod === 'credit') {
    orders[idx].paymentStatus = 'credit';
    orders[idx].creditAmountPaid = orders[idx].creditAmountPaid || 0;
    orders[idx].creditPayments = orders[idx].creditPayments || [];
  }
  writeData('orders.json', orders);
  res.json(orders[idx]);
});

router.delete('/:id', (req, res) => {
  let orders = readData('orders.json');
  orders = orders.filter(o => o.id !== req.params.id);
  writeData('orders.json', orders);
  res.json({ success: true });
});

// Credit payments
router.post('/:id/credit-pay', (req, res) => {
  const orders = readData('orders.json');
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const amount = parseFloat(req.body.amount) || 0;
  if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  const order = orders[idx];
  const newPaid = Math.min((order.creditAmountPaid || 0) + amount, order.total || 0);
  order.creditAmountPaid = newPaid;
  order.creditPayments = order.creditPayments || [];
  order.creditPayments.push({
    id: uuidv4(), amount, method: req.body.method || 'cash',
    note: req.body.note || '', date: new Date().toISOString(),
    recordedBy: req.body.recordedBy || 'admin'
  });
  if (newPaid >= (order.total || 0)) {
    order.paymentStatus = 'paid';
    order.paymentMethod = 'credit_settled';
    order.paidAt = new Date().toISOString();
  }
  writeData('orders.json', orders);
  res.json(order);
});

module.exports = router;
