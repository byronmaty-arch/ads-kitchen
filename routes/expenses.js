const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const { validate } = require('../lib/validate');
const router = express.Router();

const MANAGER_CASHIER = ['manager', 'cashier'];

const EXPENSE_SCHEMA = {
  date: { type: 'string', max: 30, pattern: /^\d{4}-\d{2}-\d{2}$/ },
  category: { type: 'string', max: 100 },
  description: { type: 'string', max: 500 },
  amount: { type: 'number', min: 0, max: 1_000_000_000 },
  paymentMethod: { type: 'string', enum: ['cash', 'mobile_money', 'card'], max: 30 },
  vendor: { type: 'string', max: 200 },
  notes: { type: 'string', max: 1000 }
};

const CUSTOMER_SCHEMA = {
  name: { type: 'string', max: 200 },
  phone: { type: 'string', max: 50 },
  email: { type: 'string', max: 200 },
  address: { type: 'string', max: 500 },
  notes: { type: 'string', max: 1000 },
  visits: { type: 'number', integer: true, min: 0, max: 1_000_000 },
  totalSpent: { type: 'number', min: 0, max: 1_000_000_000 }
};

// Expenses — manager and cashier only
router.get('/', requireRole(MANAGER_CASHIER), (req, res) => {
  let expenses = readData('expenses.json');
  if (req.query.date) expenses = expenses.filter(e => e.date === req.query.date);
  if (req.query.from && req.query.to) expenses = expenses.filter(e => e.date >= req.query.from && e.date <= req.query.to);
  res.json(expenses.sort((a, b) => new Date(b.date) - new Date(a.date)));
});
router.post('/', requireRole(MANAGER_CASHIER), (req, res) => {
  const v = validate(req.body, EXPENSE_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const expenses = readData('expenses.json');
  const expense = { id: uuidv4(), date: new Date().toISOString().split('T')[0], ...v.data };
  expenses.push(expense);
  writeData('expenses.json', expenses);
  res.status(201).json(expense);
});
router.put('/:id', requireRole(MANAGER_CASHIER), (req, res) => {
  const v = validate(req.body, EXPENSE_SCHEMA, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const expenses = readData('expenses.json');
  const idx = expenses.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  expenses[idx] = { ...expenses[idx], ...v.data };
  writeData('expenses.json', expenses);
  res.json(expenses[idx]);
});
router.delete('/:id', requireRole(MANAGER_CASHIER), (req, res) => {
  let expenses = readData('expenses.json');
  expenses = expenses.filter(e => e.id !== req.params.id);
  writeData('expenses.json', expenses);
  res.json({ success: true });
});

// Customers — all authenticated roles (waiters need to create/look up customers when placing orders)
router.get('/customers', (req, res) => res.json(readData('customers.json')));
router.post('/customers', (req, res) => {
  const v = validate(req.body, CUSTOMER_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const customers = readData('customers.json');
  const customer = { id: uuidv4(), visits: 0, totalSpent: 0, createdAt: new Date().toISOString(), ...v.data };
  customers.push(customer);
  writeData('customers.json', customers);
  res.status(201).json(customer);
});
router.put('/customers/:id', (req, res) => {
  const v = validate(req.body, CUSTOMER_SCHEMA, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const customers = readData('customers.json');
  const idx = customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  customers[idx] = { ...customers[idx], ...v.data };
  writeData('customers.json', customers);
  res.json(customers[idx]);
});

module.exports = router;
