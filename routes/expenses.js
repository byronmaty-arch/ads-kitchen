const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../lib/db');
const { requireRole } = require('../lib/auth');
const router = express.Router();

const MANAGER_CASHIER = ['manager', 'cashier'];

// Expenses — manager and cashier only
router.get('/', requireRole(MANAGER_CASHIER), (req, res) => {
  let expenses = readData('expenses.json');
  if (req.query.date) expenses = expenses.filter(e => e.date === req.query.date);
  if (req.query.from && req.query.to) expenses = expenses.filter(e => e.date >= req.query.from && e.date <= req.query.to);
  res.json(expenses.sort((a, b) => new Date(b.date) - new Date(a.date)));
});
router.post('/', requireRole(MANAGER_CASHIER), (req, res) => {
  const expenses = readData('expenses.json');
  const expense = { id: uuidv4(), date: new Date().toISOString().split('T')[0], ...req.body };
  expenses.push(expense);
  writeData('expenses.json', expenses);
  res.status(201).json(expense);
});
router.put('/:id', requireRole(MANAGER_CASHIER), (req, res) => {
  const expenses = readData('expenses.json');
  const idx = expenses.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  expenses[idx] = { ...expenses[idx], ...req.body };
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
  const customers = readData('customers.json');
  const customer = { id: uuidv4(), visits: 0, totalSpent: 0, createdAt: new Date().toISOString(), ...req.body };
  customers.push(customer);
  writeData('customers.json', customers);
  res.status(201).json(customer);
});
router.put('/customers/:id', (req, res) => {
  const customers = readData('customers.json');
  const idx = customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  customers[idx] = { ...customers[idx], ...req.body };
  writeData('customers.json', customers);
  res.json(customers[idx]);
});

module.exports = router;
