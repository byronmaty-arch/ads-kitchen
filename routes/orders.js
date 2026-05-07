const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const { validate } = require('../lib/validate');
const { computeRequiredStock, checkAvailability, applyStockDelta, formatShortageMessage } = require('../lib/stock');
const router = express.Router();

const ORDER_ITEM_SHAPE = {
  menuId: { type: 'string', required: true, max: 100 },
  name: { type: 'string', max: 200 },
  price: { type: 'number', min: 0, max: 10_000_000 },
  quantity: { type: 'number', integer: true, min: 1, max: 200, required: true },
  accompaniments: { type: 'array', maxLen: 10, of: { type: 'string', max: 100 } },
  notes: { type: 'string', max: 500 }
};

const ORDER_CREATE_SCHEMA = {
  items: { type: 'array', maxLen: 100, of: { type: 'object', shape: ORDER_ITEM_SHAPE } },
  total: { type: 'number', min: 0, max: 100_000_000 },
  staffId: { type: 'string', max: 100 },
  staffName: { type: 'string', max: 100 },
  table: { type: 'string', max: 50 },
  customerName: { type: 'string', max: 200 },
  customerPhone: { type: 'string', max: 50 },
  source: { type: 'string', enum: ['walkin', 'online'], max: 20 },
  type: { type: 'string', enum: ['dine_in', 'takeaway'], max: 20 },
  menuType: { type: 'string', enum: ['walkin', 'community', 'online', 'glovo'], max: 20 },
  paymentStatus: { type: 'string', enum: ['paid', 'unpaid', 'credit'], max: 20 },
  paymentMethod: { type: 'string', enum: ['cash', 'mobile_money', 'card', 'credit', 'credit_settled'], max: 30 },
  notes: { type: 'string', max: 1000 }
};

const ORDER_UPDATE_SCHEMA = {
  ...ORDER_CREATE_SCHEMA,
  status: { type: 'string', enum: ['new', 'preparing', 'ready', 'served'], max: 20 }
};

const CREDIT_PAY_SCHEMA = {
  amount: { type: 'number', min: 0.01, max: 100_000_000, required: true },
  method: { type: 'string', enum: ['cash', 'mobile_money', 'card'], max: 30 },
  note: { type: 'string', max: 500 }
};

const VOID_SCHEMA = {
  reason: { type: 'string', max: 500, required: true }
};

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

  const v = validate(req.body, ORDER_CREATE_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const body = v.data;

  const orders = readData('orders.json');
  const menu = readData('menu.json');
  const now = new Date();
  const today = now.toISOString().split('T')[0];

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

  // Stock check + deduction (skips items without portion-map entry)
  const required = computeRequiredStock(body.items);
  const avail = checkAvailability(required);
  if (!avail.ok) return res.status(400).json({ error: formatShortageMessage(avail.shortages), shortages: avail.shortages });

  const order = {
    id: uuidv4(), orderNumber, date: today,
    createdAt: now.toISOString(), status: 'new', paymentStatus: 'unpaid',
    ...body
  };
  applyStockDelta(required, -1, `order:${order.orderNumber}`, req.user);
  orders.push(order);
  writeData('orders.json', orders);
  res.status(201).json(order);
});

// PUT — all roles can update basic fields (e.g. customer name, table);
//        only manager/cashier can change paymentStatus or paymentMethod
router.put('/:id', (req, res) => {
  const v = validate(req.body, ORDER_UPDATE_SCHEMA, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  req.body = v.data;
  if (req.body.paymentStatus !== undefined || req.body.paymentMethod !== undefined) {
    if (!['manager', 'cashier'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only managers and cashiers can update payment status' });
    }
  }
  const orders = readData('orders.json');
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (orders[idx].voided) return res.status(400).json({ error: 'Order is voided and cannot be modified' });
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

// DELETE — manager only; writes deleted snapshot to audit-log.json
router.delete('/:id', requireRole(['manager']), (req, res) => {
  const orders = readData('orders.json');
  const target = orders.find(o => o.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Not found' });
  // Restore stock that was deducted at order creation
  const required = computeRequiredStock(target.items);
  applyStockDelta(required, +1, `order-delete:${target.orderNumber}`, req.user);
  const log = readData('audit-log.json');
  log.unshift({
    id: uuidv4(), action: 'order.delete', timestamp: new Date().toISOString(),
    actorId: req.user.staffId, actorName: req.user.staffName, actorRole: req.user.role,
    orderId: target.id, snapshot: target
  });
  writeData('audit-log.json', log.slice(0, 1000));
  writeData('orders.json', orders.filter(o => o.id !== req.params.id));
  res.json({ success: true });
});

// VOID — admin (manager) only. Soft-cancels the bill, restores stock, audits.
// Voided orders remain in orders.json for transparency but are excluded from
// revenue / receivables / dashboards / kitchen / reconciliation aggregates.
router.post('/:id/void', requireRole(['manager']), (req, res) => {
  const v = validate(req.body, VOID_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const orders = readData('orders.json');
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const target = orders[idx];
  if (target.voided) return res.status(400).json({ error: 'Order is already voided' });

  // Restore stock that was deducted at order creation
  const required = computeRequiredStock(target.items);
  applyStockDelta(required, +1, `order-void:${target.orderNumber}`, req.user);

  const snapshot = JSON.parse(JSON.stringify(target));
  const now = new Date().toISOString();
  orders[idx] = {
    ...target,
    voided: true,
    voidedAt: now,
    voidedBy: { staffId: req.user.staffId, staffName: req.user.staffName, role: req.user.role },
    voidReason: v.data.reason
  };
  writeData('orders.json', orders);

  const log = readData('audit-log.json');
  log.unshift({
    id: uuidv4(), action: 'order.void', timestamp: now,
    actorId: req.user.staffId, actorName: req.user.staffName, actorRole: req.user.role,
    orderId: target.id, orderNumber: target.orderNumber,
    reason: v.data.reason,
    snapshot
  });
  writeData('audit-log.json', log.slice(0, 1000));

  res.json(orders[idx]);
});

// Credit payments — manager and cashier only
router.post('/:id/credit-pay', requireRole(['manager', 'cashier']), (req, res) => {
  const v = validate(req.body, CREDIT_PAY_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const orders = readData('orders.json');
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (orders[idx].voided) return res.status(400).json({ error: 'Order is voided and cannot accept payments' });
  const amount = v.data.amount;
  const order = orders[idx];
  const newPaid = Math.min((order.creditAmountPaid || 0) + amount, order.total || 0);
  order.creditAmountPaid = newPaid;
  order.creditPayments = order.creditPayments || [];
  order.creditPayments.push({
    id: uuidv4(), amount, method: v.data.method || 'cash',
    note: v.data.note || '', date: new Date().toISOString(),
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
