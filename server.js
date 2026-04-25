// AD's Kitchen — Server Entry Point
const express = require('express');
const path = require('path');
const { seedDataDirIfEmpty, readData, writeData } = require('./lib/db');
const crypto = require('crypto');
const { migrateStaffPinsIfNeeded, requireSession, requireRole } = require('./lib/auth');
const { createRateLimiter } = require('./lib/rate-limit');
const seedDefaults = require('./lib/seed-defaults');
const { startReconciliationScheduler } = require('./lib/telegram');
const { runBackup, startBackupScheduler } = require('./lib/backup');

// --- Bootstrap ---
seedDataDirIfEmpty();
migrateStaffPinsIfNeeded();
seedDefaults();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // Trust only the immediate Railway proxy (hardens IP-based rate limiting)
app.use(express.json({ limit: '100kb' })); // Reject bodies >100kb to prevent disk-fill via JSON store
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  next(err);
});

// --- Security Headers ---
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  next();
});

// CORS for public ordering API
app.use('/api/public', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Static assets with HTTP caching
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true, lastModified: true, maxAge: '7d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    else if (/\.(png|jpe?g|svg|webp|ico|woff2?|ttf)$/i.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    else if (/\.(css|js)$/i.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800');
  }
}));

// --- Session Auth Guard ---
// Protects all /api routes except: login (/auth/*), public ordering (/public/*), and the backup trigger (own token)
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path.startsWith('/public') || req.path === '/backup/run') return next();
  requireSession(req, res, next);
});

// --- Mount Route Modules ---
app.use('/api/auth',       require('./lib/auth').router);
app.use('/api',            require('./routes/settings'));    // /api/settings, /api/categories
app.use('/api/menu',       require('./routes/menu'));
app.use('/api/inventory',  require('./routes/inventory'));   // also serves /stock-log, /portion-map
app.use('/api/vendors',    require('./routes/vendors'));
app.use('/api/purchases',  require('./routes/purchases'));   // also serves /payables
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/expenses',   require('./routes/expenses'));    // also serves /customers
app.use('/api/staff',      require('./routes/staff'));
app.use('/api/reports',    require('./routes/reports'));
app.use('/api/public',     require('./routes/public'));

// --- Alias routes (frontend calls these at different paths) ---

const MANAGER_CASHIER = ['manager', 'cashier'];
const MANAGER = ['manager'];

// /api/kitchen → active orders for kitchen display
app.get('/api/kitchen', (req, res) => {
  const orders = readData('orders.json');
  res.json(orders.filter(o => ['new', 'preparing'].includes(o.status))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
});
app.put('/api/kitchen/:id/status', requireRole(['manager', 'kitchen']), (req, res) => {
  const orders = readData('orders.json');
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  orders[idx].status = req.body.status;
  if (req.body.status === 'ready') orders[idx].readyAt = new Date().toISOString();
  if (req.body.status === 'served') orders[idx].servedAt = new Date().toISOString();
  writeData('orders.json', orders);
  res.json(orders[idx]);
});

// /api/dashboard → today's snapshot
app.get('/api/dashboard', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  let orders = readData('orders.json');
  if (req.query.staffId) orders = orders.filter(o => o.staffId === req.query.staffId);
  const todayOrders = orders.filter(o => o.date === today);
  const expenses = readData('expenses.json').filter(e => e.date === today);
  const inventory = readData('inventory.json');
  const lowStock = inventory.filter(i => i.quantity <= i.reorderLevel);
  const isRev = o => o.paymentStatus === 'paid' || o.paymentStatus === 'credit';
  const todayRevenue = todayOrders.filter(isRev).reduce((s, o) => s + (o.total || 0), 0);
  const todayExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const yd = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const yesterdayRevenue = orders.filter(o => o.date === yd && isRev(o)).reduce((s, o) => s + (o.total || 0), 0);
  res.json({
    todayRevenue, todayExpenses, todayProfit: todayRevenue - todayExpenses,
    todayOrders: todayOrders.length,
    activeOrders: todayOrders.filter(o => ['new', 'preparing', 'ready'].includes(o.status)).length,
    lowStockCount: lowStock.length, lowStockItems: lowStock.map(i => i.name),
    yesterdayRevenue, revenueChange: yesterdayRevenue > 0 ? (((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100).toFixed(1) : 0,
    unpaidOrders: todayOrders.filter(o => o.paymentStatus === 'unpaid').length,
    creditOrders: todayOrders.filter(o => o.paymentStatus === 'credit').length
  });
});

// /api/notifications → polling for kitchen/waiter alerts
// Rate-limited (clients poll frequently); restricted to roles that actually consume alerts
const notificationsLimiter = createRateLimiter({ windowMs: 60_000, max: 120, message: 'Notification poll rate limit reached.' });
app.get('/api/notifications',
  notificationsLimiter,
  requireRole(['manager', 'kitchen', 'waiter']),
  (req, res) => {
  const { since, role } = req.query;
  const orders = readData('orders.json');
  const sinceTime = since ? new Date(since) : new Date(0);
  if (role === 'kitchen') {
    res.json({ alerts: orders.filter(o => o.status === 'new' && new Date(o.createdAt) > sinceTime)
      .map(o => ({ id: o.id, orderNumber: o.orderNumber, items: o.items, table: o.table, menuType: o.menuType, createdAt: o.createdAt })) });
  } else if (role === 'waiter') {
    res.json({ alerts: orders.filter(o => o.status === 'ready' && o.readyAt && new Date(o.readyAt) > sinceTime)
      .map(o => ({ id: o.id, orderNumber: o.orderNumber, table: o.table, menuType: o.menuType, readyAt: o.readyAt })) });
  } else { res.json({ alerts: [] }); }
});

// /api/receivables → credit sales tracking (manager + cashier only)
app.get('/api/receivables', requireRole(MANAGER_CASHIER), (req, res) => {
  const orders = readData('orders.json');
  const today = new Date().toISOString().split('T')[0];
  const creditOrders = orders.filter(o => o.paymentStatus === 'credit');
  let totalReceivable = 0;
  const customerDebts = {};
  creditOrders.forEach(o => {
    const balance = (o.total || 0) - (o.creditAmountPaid || 0);
    totalReceivable += balance;
    const name = o.customerName || 'Walk-in (unnamed)';
    if (!customerDebts[name]) customerDebts[name] = { customer: name, outstanding: 0, orderCount: 0, orders: [] };
    customerDebts[name].outstanding += balance;
    customerDebts[name].orderCount++;
    customerDebts[name].orders.push({
      id: o.id, orderNumber: o.orderNumber, date: o.date, total: o.total || 0,
      amountPaid: o.creditAmountPaid || 0, balance,
      daysSinceSale: Math.floor((new Date(today) - new Date(o.date)) / 86400000),
      payments: o.creditPayments || []
    });
  });
  const aging = { current: 0, days7: 0, days14: 0, days30plus: 0 };
  creditOrders.forEach(o => {
    const balance = (o.total || 0) - (o.creditAmountPaid || 0);
    const days = Math.floor((new Date(today) - new Date(o.date)) / 86400000);
    if (days <= 3) aging.current += balance;
    else if (days <= 7) aging.days7 += balance;
    else if (days <= 14) aging.days14 += balance;
    else aging.days30plus += balance;
  });
  const settled = orders.filter(o => o.paymentMethod === 'credit_settled' && o.paidAt &&
    o.paidAt.split('T')[0] >= new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]);
  res.json({
    totalReceivable, totalSettled: settled.reduce((s, o) => s + (o.total || 0), 0),
    creditOrderCount: creditOrders.length, aging,
    customerDebts: Object.values(customerDebts).sort((a, b) => b.outstanding - a.outstanding)
  });
});

// /api/payables → redirect to purchases sub-route
app.get('/api/payables', (req, res) => res.redirect(307, '/api/purchases/payables'));

// /api/stock-log → direct read (manager + cashier only)
app.get('/api/stock-log', requireRole(MANAGER_CASHIER), (req, res) => {
  const logs = readData('stock-log.json');
  res.json(logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100));
});

// /api/portion-map → forward to inventory sub-routes
app.get('/api/portion-map', (req, res) => res.redirect(307, '/api/inventory/portion-map'));

// /api/customers → direct handlers (not forwarded through expenses router)
const { validate } = require('./lib/validate');
const CUSTOMER_SCHEMA = {
  name: { type: 'string', max: 200 },
  phone: { type: 'string', max: 50 },
  email: { type: 'string', max: 200 },
  address: { type: 'string', max: 500 },
  notes: { type: 'string', max: 1000 },
  visits: { type: 'number', integer: true, min: 0, max: 1_000_000 },
  totalSpent: { type: 'number', min: 0, max: 1_000_000_000 }
};
app.get('/api/customers', (req, res) => res.json(readData('customers.json')));
app.post('/api/customers', (req, res) => {
  const v = validate(req.body, CUSTOMER_SCHEMA);
  if (v.error) return res.status(400).json({ error: v.error });
  const { v4: uuidv4 } = require('uuid');
  const customers = readData('customers.json');
  const customer = { id: uuidv4(), visits: 0, totalSpent: 0, createdAt: new Date().toISOString(), ...v.data };
  customers.push(customer);
  writeData('customers.json', customers);
  res.status(201).json(customer);
});
app.put('/api/customers/:id', (req, res) => {
  const v = validate(req.body, CUSTOMER_SCHEMA, { partial: true });
  if (v.error) return res.status(400).json({ error: v.error });
  const customers = readData('customers.json');
  const idx = customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  customers[idx] = { ...customers[idx], ...v.data };
  writeData('customers.json', customers);
  res.json(customers[idx]);
});

// /api/audit/login-log → manager only
app.get('/api/audit/login-log', requireRole(MANAGER), (req, res) => {
  res.json(readData('login-log.json'));
});
app.delete('/api/audit/login-log', requireRole(MANAGER), (req, res) => {
  writeData('login-log.json', []);
  res.json({ ok: true });
});

// Manual backup trigger — timing-safe token comparison
app.post('/api/backup/run', async (req, res) => {
  const expected = process.env.BACKUP_GITHUB_TOKEN || '';
  if (!expected) return res.status(401).json({ error: 'Unauthorized' });
  const provided = (req.headers['x-backup-token'] || (req.body && req.body.token) || '').toString();
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  const valid = providedBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(providedBuf, expectedBuf);
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });
  const result = await runBackup();
  if (result.ok) res.json(result); else res.status(500).json(result);
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n🍴 AD's Kitchen Manager running at http://localhost:${PORT}`);
  console.log(`   Kitooro, Entebbe | +256 784 313399\n`);
  startReconciliationScheduler();
  startBackupScheduler();
});
