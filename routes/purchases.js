const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const { validate } = require('../lib/validate');
const router = express.Router();

const MANAGER_CASHIER = ['manager', 'cashier'];

const PO_ITEM_SHAPE = {
  inventoryId: { type: 'string', max: 100 },
  name: { type: 'string', max: 200 },
  quantity: { type: 'number', min: 0, max: 1_000_000 },
  unit: { type: 'string', max: 50 },
  unitCost: { type: 'number', min: 0, max: 100_000_000 },
  totalCost: { type: 'number', min: 0, max: 1_000_000_000 }
};

const PO_SCHEMA = {
  vendorId: { type: 'string', max: 100 },
  vendorName: { type: 'string', max: 200 },
  items: { type: 'array', maxLen: 200, of: { type: 'object', shape: PO_ITEM_SHAPE } },
  totalAmount: { type: 'number', min: 0, max: 10_000_000_000 },
  status: { type: 'string', enum: ['pending', 'received', 'cancelled'], max: 30 },
  paymentStatus: { type: 'string', enum: ['unpaid', 'partial', 'paid'], max: 30 },
  creditDays: { type: 'number', integer: true, min: 0, max: 365 },
  dueDate: { type: 'string', max: 30 },
  notes: { type: 'string', max: 1000 },
  receivedDate: { type: 'string', max: 50 }
};

const PO_PAY_SCHEMA = {
  amount: { type: 'number', min: 0.01, max: 10_000_000_000, required: true },
  method: { type: 'string', enum: ['cash', 'mobile_money', 'card', 'bank'], max: 30 },
  note: { type: 'string', max: 500 }
};

const VOID_SCHEMA = {
  reason: { type: 'string', max: 500, required: true }
};

router.get('/', requireRole(MANAGER_CASHIER), (req, res) => {
  let purchases = readData('purchases.json');
  if (req.query.status) purchases = purchases.filter(p => p.status === req.query.status);
  res.json(purchases.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

router.post('/', requireRole(MANAGER_CASHIER), (req, res) => {
  const v = validate(req.body, PO_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const purchases = readData('purchases.json');
  const creditDays = v.data.creditDays || 0;
  const dueDate = creditDays > 0
    ? new Date(Date.now() + creditDays * 86400000).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  const po = {
    id: uuidv4(), poNumber: `PO-${Date.now().toString(36).toUpperCase()}`,
    status: 'pending', paymentStatus: 'unpaid', date: new Date().toISOString(),
    creditDays, dueDate, amountPaid: 0, payments: [],
    ...v.data, creditDays, dueDate, amountPaid: 0, payments: []
  };
  purchases.push(po);
  writeData('purchases.json', purchases);
  res.status(201).json(po);
});

router.put('/:id', requireRole(MANAGER_CASHIER), (req, res) => {
  const v = validate(req.body, PO_SCHEMA, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const purchases = readData('purchases.json');
  const idx = purchases.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (purchases[idx].voided) return res.status(400).json({ error: 'Purchase order is voided and cannot be modified' });
  purchases[idx] = { ...purchases[idx], ...v.data };
  if (req.body.status === 'received' && purchases[idx].items) {
    purchases[idx].receivedDate = new Date().toISOString();
    const inv = readData('inventory.json');
    purchases[idx].items.forEach(poItem => {
      const invIdx = inv.findIndex(i => i.id === poItem.inventoryId);
      if (invIdx === -1) return;
      // Weighted-average cost so inventory value increases by exactly
      // poItem.quantity * poItem.unitCost — keeps Inventory ↔ AP in lockstep.
      const oldQty = Number(inv[invIdx].quantity || 0);
      const oldCost = Number(inv[invIdx].costPerUnit || 0);
      const addQty = Number(poItem.quantity || 0);
      const addCost = Number(poItem.unitCost || 0);
      const newQty = oldQty + addQty;
      if (newQty > 0 && addQty > 0) {
        inv[invIdx].costPerUnit = Math.round(((oldQty * oldCost) + (addQty * addCost)) / newQty);
      }
      inv[invIdx].quantity = newQty;
      // Recompute portion cost if portion size is set
      if (inv[invIdx].standardPortions && inv[invIdx].standardPortions > 0) {
        inv[invIdx].costPerPortion = Math.round(inv[invIdx].costPerUnit / inv[invIdx].standardPortions);
      }
    });
    writeData('inventory.json', inv);
  }
  writeData('purchases.json', purchases);
  res.json(purchases[idx]);
});

router.post('/:id/pay', requireRole(MANAGER_CASHIER), (req, res) => {
  const v = validate(req.body, PO_PAY_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const purchases = readData('purchases.json');
  const idx = purchases.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (purchases[idx].voided) return res.status(400).json({ error: 'Purchase order is voided and cannot accept payments' });
  const amount = v.data.amount;
  const po = purchases[idx];
  const newPaid = Math.min((po.amountPaid || 0) + amount, po.totalAmount || 0);
  po.amountPaid = newPaid;
  po.payments = po.payments || [];
  po.payments.push({
    id: uuidv4(), amount, method: v.data.method || 'cash',
    note: v.data.note || '', date: new Date().toISOString(),
    recordedBy: req.user.staffName
  });
  po.paymentStatus = newPaid >= (po.totalAmount || 0) ? 'paid' : 'partial';
  po.paidDate = newPaid >= (po.totalAmount || 0) ? new Date().toISOString() : null;
  writeData('purchases.json', purchases);
  res.json(po);
});

// VOID — admin (manager) only. Soft-cancels the PO, reverses received-stock
// inventory and audits. Voided POs are excluded from payables/balance-sheet.
router.post('/:id/void', requireRole(['manager']), (req, res) => {
  const v = validate(req.body, VOID_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const purchases = readData('purchases.json');
  const idx = purchases.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const target = purchases[idx];
  if (target.voided) return res.status(400).json({ error: 'PO is already voided' });
  if ((target.amountPaid || 0) > 0) {
    return res.status(400).json({
      error: 'PO has recorded payments. Reverse the payments before voiding (or cancel via vendor refund first).'
    });
  }

  // If the PO was received, the inventory was increased at receive time.
  // Reverse that increase. If any received item has been consumed below the
  // received quantity, refuse so we never leave inventory negative.
  let inventoryAdjustments = [];
  if (target.status === 'received' && Array.isArray(target.items)) {
    const inv = readData('inventory.json');
    const shortages = [];
    for (const poItem of target.items) {
      const invIdx = inv.findIndex(i => i.id === poItem.inventoryId);
      if (invIdx === -1) continue;
      const onHand = Number(inv[invIdx].quantity || 0);
      const recv = Number(poItem.quantity || 0);
      if (onHand < recv) {
        shortages.push({ name: inv[invIdx].name, received: recv, onHand, unit: inv[invIdx].unit || '' });
      }
    }
    if (shortages.length > 0) {
      return res.status(400).json({
        error: 'Cannot void — received stock has been consumed since receipt: ' +
          shortages.map(s => `${s.name} (received ${s.received}${s.unit}, on hand ${s.onHand}${s.unit})`).join('; '),
        shortages
      });
    }
    // Apply reversal
    const stockLogs = readData('stock-log.json');
    const now = new Date().toISOString();
    for (const poItem of target.items) {
      const invIdx = inv.findIndex(i => i.id === poItem.inventoryId);
      if (invIdx === -1) continue;
      const recv = Number(poItem.quantity || 0);
      inv[invIdx].quantity = Number(inv[invIdx].quantity || 0) - recv;
      stockLogs.push({
        id: uuidv4(),
        itemId: inv[invIdx].id,
        itemName: inv[invIdx].name,
        adjustment: -recv,
        reason: `po-void:${target.poNumber}`,
        newQuantity: inv[invIdx].quantity,
        timestamp: now,
        recordedBy: req.user.staffId,
        recordedByName: req.user.staffName
      });
      inventoryAdjustments.push({ itemId: inv[invIdx].id, name: inv[invIdx].name, reversed: recv });
    }
    writeData('inventory.json', inv);
    writeData('stock-log.json', stockLogs);
  }

  const snapshot = JSON.parse(JSON.stringify(target));
  const now = new Date().toISOString();
  purchases[idx] = {
    ...target,
    voided: true,
    voidedAt: now,
    voidedBy: { staffId: req.user.staffId, staffName: req.user.staffName, role: req.user.role },
    voidReason: v.data.reason
  };
  writeData('purchases.json', purchases);

  const log = readData('audit-log.json');
  log.unshift({
    id: uuidv4(), action: 'purchase.void', timestamp: now,
    actorId: req.user.staffId, actorName: req.user.staffName, actorRole: req.user.role,
    purchaseId: target.id, poNumber: target.poNumber,
    reason: v.data.reason,
    inventoryAdjustments,
    snapshot
  });
  writeData('audit-log.json', log.slice(0, 1000));

  res.json(purchases[idx]);
});

// Payables summary
router.get('/payables', requireRole(MANAGER_CASHIER), (req, res) => {
  const purchases = readData('purchases.json');
  const vendors = readData('vendors.json');
  const vendorMap = {};
  vendors.forEach(v => { vendorMap[v.id] = v.name; });
  const today = new Date().toISOString().split('T')[0];
  const unpaidPOs = purchases.filter(p =>
    !p.voided &&
    (p.status === 'received' || p.status === 'pending') && p.paymentStatus !== 'paid'
  );
  let totalOutstanding = 0, totalOverdue = 0;
  const vendorPayables = {};
  unpaidPOs.forEach(po => {
    const balance = (po.totalAmount || 0) - (po.amountPaid || 0);
    const isOverdue = po.dueDate && po.dueDate < today;
    totalOutstanding += balance;
    if (isOverdue) totalOverdue += balance;
    const vName = vendorMap[po.vendorId] || po.vendorName || 'Unknown';
    if (!vendorPayables[vName]) vendorPayables[vName] = { vendor: vName, outstanding: 0, overdue: 0, poCount: 0 };
    vendorPayables[vName].outstanding += balance;
    vendorPayables[vName].poCount++;
    if (isOverdue) vendorPayables[vName].overdue += balance;
  });
  const aging = { current: 0, days30: 0, days60: 0, days90plus: 0 };
  unpaidPOs.forEach(po => {
    const balance = (po.totalAmount || 0) - (po.amountPaid || 0);
    const dueDate = po.dueDate ? new Date(po.dueDate) : new Date(po.date);
    const daysOverdue = Math.floor((new Date(today) - dueDate) / 86400000);
    if (daysOverdue <= 0) aging.current += balance;
    else if (daysOverdue <= 30) aging.days30 += balance;
    else if (daysOverdue <= 60) aging.days60 += balance;
    else aging.days90plus += balance;
  });
  res.json({
    totalOutstanding, totalOverdue, aging,
    vendorPayables: Object.values(vendorPayables).sort((a, b) => b.outstanding - a.outstanding),
    unpaidPOs: unpaidPOs.map(po => ({
      ...po, vendorName: vendorMap[po.vendorId] || po.vendorName || 'Unknown',
      balance: (po.totalAmount || 0) - (po.amountPaid || 0),
      isOverdue: po.dueDate && po.dueDate < today,
      daysUntilDue: po.dueDate ? Math.floor((new Date(po.dueDate) - new Date(today)) / 86400000) : null
    })).sort((a, b) => (a.dueDate || '9999') > (b.dueDate || '9999') ? 1 : -1)
  });
});

module.exports = router;
