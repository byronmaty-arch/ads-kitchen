const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const router = express.Router();

function staffCodeFromName(name) {
  if (!name) return 'XX';
  const first = name.trim().split(/\s+/)[0] || name.trim();
  const letters = first.replace(/[^a-zA-Z]/g, '');
  if (!letters) return 'XX';
  return letters[0].toUpperCase() + letters[letters.length - 1].toUpperCase();
}

// GET — all authenticated roles (waiter sees own via ?staffId=, others see all)
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

// POST — validate item prices server-side; kitchen role cannot create orders
router.post('/', (req, res) => {
  if (req.user.role === 'kitchen') return res.status(403).json({ error: 'Access denied' });

  const orders = readData('orders.json');
  const menu = readData('menu.json');
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const body = req.body || {};

  // Server-side price validation — ignore client-supplied prices entirely
  if (body.items && Array.isArray(body.items)) {
    const validated = [];
    for (const item of body.items) {
      const menuItem = menu.find(m => m.id === item.menuId && m.active !== false);
      if (!menuItem) return res.status(400).json({ error: `Menu item not available: ${item.menuId}` });
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return res.status(400).json({ error: `Invalid quantity for item: ${menuItem.name}` });
      }
      validated.push({
        menuId: item.menuId,
        name: menuItem.name,          // server-side name
        price: menuItem.price,        // server-side price — client value ignored
        quantity: item.quantity,
        ...(item.accompaniments ? { accompaniments: item.accompaniments } : {}),
        ...(item.notes ? { notes: item.notes } : {})
      });
    }
    body.items = validated;
    body.total = validated.reduce((s, i) => s + i.price * i.quantity, 0);
  }

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

// PUT — all roles can update basic fields (e.g. customer name, table);
//        only manager/cashier can change paymentStatus or paymentMethod
router.put('/:id', (req, res) => {
  if (req.body.paymentStatus !== undefined || req.body.paymentMethod !== undefined) {
    if (!['manager', 'cashier'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only managers and cashiers can update payment status' });
    }
  }
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

// DELETE — manager only
router.delete('/:id', requireRole(['manager']), (req, res) => {
  let orders = readData('orders.json');
  orders = orders.filter(o => o.id !== req.params.id);
  writeData('orders.json', orders);
  res.json({ success: true });
});

// Credit payments — manager and cashier only
router.post('/:id/credit-pay', requireRole(['manager', 'cashier']), (req, res) => {
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
    recordedBy: req.user.staffName
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
