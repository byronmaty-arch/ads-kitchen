const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
// DATA_DIR is configurable so we can point at a mounted volume on Railway.
// Defaults to ./data for local dev.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SEED_DIR = path.join(__dirname, 'data-seed');

// First-boot seed: if DATA_DIR is empty/missing, copy the sanitized baseline
// from ./data-seed so production starts with menu/categories/staff/settings
// already configured.
function seedDataDirIfEmpty() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(SEED_DIR)) return;
    const seedFiles = fs.readdirSync(SEED_DIR);
    for (const f of seedFiles) {
      const dest = path.join(DATA_DIR, f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(SEED_DIR, f), dest);
        console.log(`[seed] copied ${f} -> ${DATA_DIR}`);
      }
    }
  } catch (e) {
    console.error('[seed] failed:', e);
  }
}
seedDataDirIfEmpty();

// Trust Railway's proxy so req.ip / x-forwarded-for reflect the real client
app.set('trust proxy', true);

app.use(express.json());

// CORS for public ordering API (allow adskitchens.com + localhost dev)
app.use('/api/public', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// --- JSON File Storage Helpers ---
function readData(file) {
  const fp = path.join(DATA_DIR, file);
  if (!fs.existsSync(fp)) return [];
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function writeData(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

function readConfig(file) {
  const fp = path.join(DATA_DIR, file);
  if (!fs.existsSync(fp)) return {};
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function writeConfig(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// --- Seed default data if empty ---
function seedDefaults() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (readData('categories.json').length === 0) {
    writeData('categories.json', [
      { id: uuidv4(), name: 'Top Sellers', color: '#e74c3c' },
      { id: uuidv4(), name: 'Local Stews', color: '#f39c12' },
      { id: uuidv4(), name: 'Breakfast', color: '#9b59b6' },
      { id: uuidv4(), name: 'Drinks', color: '#3498db' },
      { id: uuidv4(), name: 'Curries', color: '#2ecc71' }
    ]);
  }

  // Menu items now have 'menuType': 'walkin', 'community', or 'both'
  // Walk-in prices from adskitchens.com, Community prices from community menu
  if (readData('menu.json').length === 0) {
    const cats = readData('categories.json');
    const catMap = {};
    cats.forEach(c => catMap[c.name] = c.id);

    writeData('menu.json', [
      // === WALK-IN MENU (from website) ===
      // Top Sellers / Fast Food
      { id: uuidv4(), name: 'Chips Chicken + Mango Juice', category: catMap['Top Sellers'], price: 23000, cost: 10000, active: true, menuType: 'walkin', description: 'Chips with chicken, served with mango juice' },
      { id: uuidv4(), name: 'Chips Liver + Mango Juice', category: catMap['Top Sellers'], price: 30000, cost: 14000, active: true, menuType: 'walkin', description: 'Chips with liver, served with mango juice' },
      { id: uuidv4(), name: 'Chips Goat + Mango Juice', category: catMap['Top Sellers'], price: 25000, cost: 12000, active: true, menuType: 'walkin', description: 'Chips with goat meat, served with mango juice' },
      { id: uuidv4(), name: 'Chips Beef + Mango Juice', category: catMap['Top Sellers'], price: 20000, cost: 9000, active: true, menuType: 'walkin', description: 'Chips with beef, served with mango juice' },
      { id: uuidv4(), name: 'Chips Whole Fish', category: catMap['Top Sellers'], price: 40000, cost: 20000, active: true, menuType: 'walkin', description: 'Chips with whole fried fish' },
      // Local Stews (Walk-in) - served with posho, rice, or matooke
      { id: uuidv4(), name: 'Beef Stew', category: catMap['Local Stews'], price: 12000, cost: 5000, active: true, menuType: 'walkin', description: 'Served with posho, rice, or matooke' },
      { id: uuidv4(), name: 'Chicken Stew', category: catMap['Local Stews'], price: 15000, cost: 7000, active: true, menuType: 'walkin', description: 'Served with posho, rice, or matooke' },
      { id: uuidv4(), name: 'Fish Stew', category: catMap['Local Stews'], price: 15000, cost: 7000, active: true, menuType: 'walkin', description: 'Served with posho, rice, or matooke' },
      { id: uuidv4(), name: 'G.Nuts Stew', category: catMap['Local Stews'], price: 7000, cost: 3000, active: true, menuType: 'walkin', description: 'Groundnut stew, served with posho, rice, or matooke' },
      { id: uuidv4(), name: 'Goat Stew', category: catMap['Local Stews'], price: 18000, cost: 9000, active: true, menuType: 'walkin', description: 'Served with posho, rice, or matooke' },
      { id: uuidv4(), name: 'Offals Stew', category: catMap['Local Stews'], price: 13000, cost: 6000, active: true, menuType: 'walkin', description: 'Served with posho, rice, or matooke' },
      { id: uuidv4(), name: 'Peas Stew', category: catMap['Local Stews'], price: 8000, cost: 3500, active: true, menuType: 'walkin', description: 'Served with posho, rice, or matooke' },
      // Breakfast (Walk-in)
      { id: uuidv4(), name: 'Katogo', category: catMap['Breakfast'], price: 12000, cost: 5000, active: true, menuType: 'walkin', description: 'Traditional breakfast' },
      { id: uuidv4(), name: 'Plain Chips', category: catMap['Breakfast'], price: 10000, cost: 4000, active: true, menuType: 'walkin', description: 'French fries' },
      { id: uuidv4(), name: 'Sausages', category: catMap['Breakfast'], price: 7000, cost: 3000, active: true, menuType: 'walkin', description: 'Fried sausages' },
      { id: uuidv4(), name: 'Omelette', category: catMap['Breakfast'], price: 6000, cost: 2500, active: true, menuType: 'walkin', description: 'Egg omelette' },
      { id: uuidv4(), name: 'Chapati', category: catMap['Breakfast'], price: 4000, cost: 1500, active: true, menuType: 'walkin', description: 'Flatbread' },
      // Drinks (Walk-in)
      { id: uuidv4(), name: 'Juice (No Sugar)', category: catMap['Drinks'], price: 13000, cost: 5000, active: true, menuType: 'walkin', description: 'Natural juice, no added sugar' },
      { id: uuidv4(), name: 'Cocktail Juice', category: catMap['Drinks'], price: 13000, cost: 5000, active: true, menuType: 'walkin', description: 'Mixed fruit cocktail' },
      { id: uuidv4(), name: 'Mango Juice', category: catMap['Drinks'], price: 6500, cost: 2500, active: true, menuType: 'walkin', description: 'Fresh mango juice' },

      // === COMMUNITY MENU (lower prices) ===
      // Curries
      { id: uuidv4(), name: 'Beans Curry', category: catMap['Curries'], price: 5000, cost: 2000, active: true, menuType: 'community', description: 'Beans curry' },
      { id: uuidv4(), name: 'Beef Curry', category: catMap['Curries'], price: 5000, cost: 2500, active: true, menuType: 'community', description: 'Beef curry' },
      { id: uuidv4(), name: 'Peas Curry', category: catMap['Curries'], price: 6000, cost: 2500, active: true, menuType: 'community', description: 'Peas curry' },
      { id: uuidv4(), name: 'Chicken Curry', category: catMap['Curries'], price: 12000, cost: 5500, active: true, menuType: 'community', description: 'Chicken curry' },
      { id: uuidv4(), name: 'Fish Curry', category: catMap['Curries'], price: 7000, cost: 3500, active: true, menuType: 'community', description: 'Fish curry' },
      { id: uuidv4(), name: 'G.Nuts Curry', category: catMap['Curries'], price: 5000, cost: 2000, active: true, menuType: 'community', description: 'Groundnuts curry' },
      { id: uuidv4(), name: 'Pasted Beef', category: catMap['Curries'], price: 6000, cost: 3000, active: true, menuType: 'community', description: 'Pasted beef curry' },
      { id: uuidv4(), name: 'Pasted Fish', category: catMap['Curries'], price: 8000, cost: 4000, active: true, menuType: 'community', description: 'Pasted fish curry' }
    ]);
  }

  if (readData('inventory.json').length === 0) {
    writeData('inventory.json', [
      // Portioned items (standardPortions = servings per unit, costPerPortion = costPerUnit / standardPortions)
      { id: uuidv4(), name: 'Chicken - Curry', unit: 'pc', quantity: 20, reorderLevel: 5, costPerUnit: 25000, standardPortions: 6, costPerPortion: 4167, category: 'Proteins' },
      { id: uuidv4(), name: 'Chicken - Fast Food', unit: 'pc', quantity: 15, reorderLevel: 5, costPerUnit: 14000, standardPortions: 4, costPerPortion: 3500, category: 'Proteins' },
      { id: uuidv4(), name: 'Beef', unit: 'kg', quantity: 20, reorderLevel: 5, costPerUnit: 18000, standardPortions: 10, costPerPortion: 1800, category: 'Proteins' },
      { id: uuidv4(), name: 'Fish', unit: 'pc', quantity: 15, reorderLevel: 5, costPerUnit: 15000, standardPortions: 4, costPerPortion: 3750, category: 'Proteins' },
      // Non-portioned items
      { id: uuidv4(), name: 'Groundnuts (kg)', unit: 'kg', quantity: 10, reorderLevel: 3, costPerUnit: 8000, category: 'Dry Goods' },
      { id: uuidv4(), name: 'Matooke (bunch)', unit: 'bunch', quantity: 8, reorderLevel: 3, costPerUnit: 10000, category: 'Fresh Produce' },
      { id: uuidv4(), name: 'Rice (kg)', unit: 'kg', quantity: 25, reorderLevel: 10, costPerUnit: 4000, category: 'Dry Goods' },
      { id: uuidv4(), name: 'Maize Flour (kg)', unit: 'kg', quantity: 20, reorderLevel: 5, costPerUnit: 3000, category: 'Dry Goods' },
      { id: uuidv4(), name: 'Cooking Oil (L)', unit: 'liters', quantity: 15, reorderLevel: 5, costPerUnit: 7000, category: 'Cooking Essentials' },
      { id: uuidv4(), name: 'Onions (kg)', unit: 'kg', quantity: 10, reorderLevel: 3, costPerUnit: 4000, category: 'Fresh Produce' },
      { id: uuidv4(), name: 'Tomatoes (kg)', unit: 'kg', quantity: 8, reorderLevel: 3, costPerUnit: 5000, category: 'Fresh Produce' },
      { id: uuidv4(), name: 'Eggs (tray)', unit: 'tray', quantity: 5, reorderLevel: 2, costPerUnit: 12000, category: 'Proteins' },
      { id: uuidv4(), name: 'Passion Fruits (kg)', unit: 'kg', quantity: 5, reorderLevel: 2, costPerUnit: 6000, category: 'Fresh Produce' },
      { id: uuidv4(), name: 'Sugar (kg)', unit: 'kg', quantity: 10, reorderLevel: 3, costPerUnit: 4000, category: 'Dry Goods' },
      { id: uuidv4(), name: 'Milk (L)', unit: 'liters', quantity: 10, reorderLevel: 3, costPerUnit: 3000, category: 'Dairy' },
      { id: uuidv4(), name: 'Wheat Flour (kg)', unit: 'kg', quantity: 15, reorderLevel: 5, costPerUnit: 4000, category: 'Dry Goods' }
    ]);
  }

  // Portion mappings: links menu items to inventory items with portion cost
  // This tells the system which stock item is consumed per menu item sold
  if (readData('portion-map.json').length === 0) {
    writeData('portion-map.json', [
      // Community curries
      { menuItemName: 'Chicken Curry', stockItemName: 'Chicken - Curry', portionsUsed: 1 },
      { menuItemName: 'Beef Curry', stockItemName: 'Beef', portionsUsed: 1 },
      { menuItemName: 'Fish Curry', stockItemName: 'Fish', portionsUsed: 1 },
      { menuItemName: 'Pasted Beef', stockItemName: 'Beef', portionsUsed: 1 },
      { menuItemName: 'Pasted Fish', stockItemName: 'Fish', portionsUsed: 1 },
      // Walk-in items
      { menuItemName: 'Chips Chicken + Mango Juice', stockItemName: 'Chicken - Fast Food', portionsUsed: 1 },
      { menuItemName: 'Chicken Stew', stockItemName: 'Chicken - Curry', portionsUsed: 1 },
      { menuItemName: 'Beef Stew', stockItemName: 'Beef', portionsUsed: 1 },
      { menuItemName: 'Fish Stew', stockItemName: 'Fish', portionsUsed: 1 },
      { menuItemName: 'Goat Stew', stockItemName: 'Beef', portionsUsed: 1 },
      { menuItemName: 'Chips Beef + Mango Juice', stockItemName: 'Beef', portionsUsed: 1 },
      { menuItemName: 'Chips Whole Fish', stockItemName: 'Fish', portionsUsed: 1 },
      { menuItemName: 'Chips Goat + Mango Juice', stockItemName: 'Beef', portionsUsed: 1 }
    ]);
  }

  if (readData('vendors.json').length === 0) {
    writeData('vendors.json', [
      { id: uuidv4(), name: 'Entebbe Fish Market', phone: '+256700000001', items: ['Tilapia', 'Nile Perch'], rating: 4, notes: 'Best fresh fish, delivers by 7am' },
      { id: uuidv4(), name: 'Kitooro Market Vendor', phone: '+256700000002', items: ['Vegetables', 'Fruits', 'Matooke'], rating: 4, notes: 'Daily fresh produce' },
      { id: uuidv4(), name: 'Mama Grace Poultry', phone: '+256700000003', items: ['Chicken', 'Eggs'], rating: 5, notes: 'Reliable, consistent quality' }
    ]);
  }

  if (readData('staff.json').length === 0) {
    writeData('staff.json', [
      { id: uuidv4(), name: 'Admin', role: 'manager', pin: '1234', active: true },
      { id: uuidv4(), name: 'Waiter 1', role: 'waiter', pin: '1111', active: true },
      { id: uuidv4(), name: 'Chef', role: 'kitchen', pin: '2222', active: true },
      { id: uuidv4(), name: 'Cashier', role: 'cashier', pin: '3333', active: true }
    ]);
  }

  if (!fs.existsSync(path.join(DATA_DIR, 'settings.json'))) {
    writeConfig('settings.json', {
      restaurantName: "AD's Kitchen",
      location: 'Kitooro, Entebbe',
      phone: '+256 784 313399',
      email: 'adskitchen323@gmail.com',
      currency: 'UGX',
      taxRate: 0,
      tables: 10,
      receiptFooter: 'Thank you for dining at AD\'s Kitchen!\nKitooro, Entebbe | +256 784 313399'
    });
  }
}

seedDefaults();

// --- AUTH ---
// --- LOGIN RATE LIMITER ---
// Prevents brute-forcing 4-digit PINs. Tracks failed attempts per IP.
// After MAX_FAILS failures within WINDOW_MS, lock the IP out for LOCKOUT_MS.
// A successful login clears that IP's counter immediately.
const loginAttempts = new Map(); // ip -> { fails: [timestamps], lockedUntil: ts|null }
const LOGIN_WINDOW_MS = 5 * 60 * 1000;   // rolling 5-minute window
const LOGIN_MAX_FAILS = 5;               // 5 wrong PINs
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // then locked for 15 minutes

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();
}

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { fails: [], lockedUntil: null };
  if (rec.lockedUntil && now < rec.lockedUntil) {
    const minsLeft = Math.ceil((rec.lockedUntil - now) / 60000);
    return { allowed: false, retryAfterMin: minsLeft };
  }
  if (rec.lockedUntil && now >= rec.lockedUntil) {
    // Lockout expired — reset
    rec.fails = [];
    rec.lockedUntil = null;
    loginAttempts.set(ip, rec);
  }
  return { allowed: true };
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { fails: [], lockedUntil: null };
  rec.fails = rec.fails.filter(t => now - t < LOGIN_WINDOW_MS);
  rec.fails.push(now);
  if (rec.fails.length >= LOGIN_MAX_FAILS) {
    rec.lockedUntil = now + LOGIN_LOCKOUT_MS;
    console.warn(`[auth] IP ${ip} locked out after ${rec.fails.length} failed attempts`);
  }
  loginAttempts.set(ip, rec);
}

function clearLoginFailures(ip) {
  loginAttempts.delete(ip);
}

// Periodic cleanup so the Map doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginAttempts) {
    const stale = (!rec.lockedUntil || rec.lockedUntil < now)
      && rec.fails.every(t => now - t > LOGIN_WINDOW_MS);
    if (stale) loginAttempts.delete(ip);
  }
}, 10 * 60 * 1000).unref();

app.post('/api/auth/login', (req, res) => {
  const ip = getClientIp(req);
  const check = checkLoginRateLimit(ip);
  if (!check.allowed) {
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${check.retryAfterMin} minute${check.retryAfterMin === 1 ? '' : 's'}.`
    });
  }

  const { pin } = req.body || {};
  if (!pin) {
    recordLoginFailure(ip);
    return res.status(400).json({ error: 'PIN required' });
  }

  const staff = readData('staff.json');
  const user = staff.find(s => s.pin === pin && s.active);
  if (!user) {
    recordLoginFailure(ip);
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  clearLoginFailures(ip);
  res.json({ id: user.id, name: user.name, role: user.role });
});

// --- SETTINGS ---
app.get('/api/settings', (req, res) => {
  res.json(readConfig('settings.json'));
});

app.put('/api/settings', (req, res) => {
  const settings = { ...readConfig('settings.json'), ...req.body };
  writeConfig('settings.json', settings);
  res.json(settings);
});

// --- CATEGORIES ---
app.get('/api/categories', (req, res) => res.json(readData('categories.json')));

app.post('/api/categories', (req, res) => {
  const cats = readData('categories.json');
  const cat = { id: uuidv4(), ...req.body };
  cats.push(cat);
  writeData('categories.json', cats);
  res.status(201).json(cat);
});

app.put('/api/categories/:id', (req, res) => {
  const cats = readData('categories.json');
  const idx = cats.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  cats[idx] = { ...cats[idx], ...req.body };
  writeData('categories.json', cats);
  res.json(cats[idx]);
});

app.delete('/api/categories/:id', (req, res) => {
  let cats = readData('categories.json');
  cats = cats.filter(c => c.id !== req.params.id);
  writeData('categories.json', cats);
  res.json({ success: true });
});

// --- MENU ---
app.get('/api/menu', (req, res) => {
  let items = readData('menu.json');
  if (req.query.menuType) {
    items = items.filter(i => i.menuType === req.query.menuType || i.menuType === 'both');
  }
  res.json(items);
});

app.post('/api/menu', (req, res) => {
  const items = readData('menu.json');
  const item = { id: uuidv4(), active: true, ...req.body };
  items.push(item);
  writeData('menu.json', items);
  res.status(201).json(item);
});

app.put('/api/menu/:id', (req, res) => {
  const items = readData('menu.json');
  const idx = items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  items[idx] = { ...items[idx], ...req.body };
  writeData('menu.json', items);
  res.json(items[idx]);
});

app.delete('/api/menu/:id', (req, res) => {
  let items = readData('menu.json');
  items = items.filter(i => i.id !== req.params.id);
  writeData('menu.json', items);
  res.json({ success: true });
});

// --- INVENTORY ---
app.get('/api/inventory', (req, res) => res.json(readData('inventory.json')));

app.post('/api/inventory', (req, res) => {
  const inv = readData('inventory.json');
  const item = { id: uuidv4(), ...req.body };
  inv.push(item);
  writeData('inventory.json', inv);
  res.status(201).json(item);
});

app.put('/api/inventory/:id', (req, res) => {
  const inv = readData('inventory.json');
  const idx = inv.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  inv[idx] = { ...inv[idx], ...req.body };
  writeData('inventory.json', inv);
  res.json(inv[idx]);
});

app.delete('/api/inventory/:id', (req, res) => {
  let inv = readData('inventory.json');
  inv = inv.filter(i => i.id !== req.params.id);
  writeData('inventory.json', inv);
  res.json({ success: true });
});

// Adjust stock (add/remove)
app.post('/api/inventory/:id/adjust', (req, res) => {
  const inv = readData('inventory.json');
  const idx = inv.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const { adjustment, reason } = req.body;
  inv[idx].quantity += adjustment;
  writeData('inventory.json', inv);

  // Log the adjustment
  const logs = readData('stock-log.json');
  logs.push({
    id: uuidv4(),
    itemId: req.params.id,
    itemName: inv[idx].name,
    adjustment,
    reason: reason || '',
    newQuantity: inv[idx].quantity,
    timestamp: new Date().toISOString()
  });
  writeData('stock-log.json', logs);

  res.json(inv[idx]);
});

app.get('/api/inventory/alerts', (req, res) => {
  const inv = readData('inventory.json');
  const alerts = inv.filter(i => i.quantity <= i.reorderLevel);
  res.json(alerts);
});

// --- VENDORS ---
app.get('/api/vendors', (req, res) => res.json(readData('vendors.json')));

app.post('/api/vendors', (req, res) => {
  const vendors = readData('vendors.json');
  const vendor = { id: uuidv4(), rating: 3, ...req.body };
  vendors.push(vendor);
  writeData('vendors.json', vendors);
  res.status(201).json(vendor);
});

app.put('/api/vendors/:id', (req, res) => {
  const vendors = readData('vendors.json');
  const idx = vendors.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  vendors[idx] = { ...vendors[idx], ...req.body };
  writeData('vendors.json', vendors);
  res.json(vendors[idx]);
});

app.delete('/api/vendors/:id', (req, res) => {
  let vendors = readData('vendors.json');
  vendors = vendors.filter(v => v.id !== req.params.id);
  writeData('vendors.json', vendors);
  res.json({ success: true });
});

// --- PURCHASE ORDERS ---
app.get('/api/purchases', (req, res) => {
  let purchases = readData('purchases.json');
  if (req.query.status) purchases = purchases.filter(p => p.status === req.query.status);
  res.json(purchases.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/purchases', (req, res) => {
  const purchases = readData('purchases.json');
  const creditDays = parseInt(req.body.creditDays) || 0;
  const dateStr = new Date().toISOString();
  const dueDate = creditDays > 0
    ? new Date(Date.now() + creditDays * 86400000).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  const po = {
    id: uuidv4(),
    poNumber: `PO-${Date.now().toString(36).toUpperCase()}`,
    status: 'pending',
    paymentStatus: 'unpaid',
    date: dateStr,
    creditDays,
    dueDate,
    amountPaid: 0,
    payments: [],
    ...req.body,
    creditDays,
    dueDate,
    amountPaid: 0,
    payments: []
  };
  purchases.push(po);
  writeData('purchases.json', purchases);
  res.status(201).json(po);
});

app.put('/api/purchases/:id', (req, res) => {
  const purchases = readData('purchases.json');
  const idx = purchases.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  purchases[idx] = { ...purchases[idx], ...req.body };

  // If marking as received, update inventory and set received date
  if (req.body.status === 'received' && purchases[idx].items) {
    purchases[idx].receivedDate = new Date().toISOString();
    const inv = readData('inventory.json');
    purchases[idx].items.forEach(poItem => {
      const invIdx = inv.findIndex(i => i.id === poItem.inventoryId);
      if (invIdx !== -1) {
        inv[invIdx].quantity += poItem.quantity;
      }
    });
    writeData('inventory.json', inv);
  }

  writeData('purchases.json', purchases);
  res.json(purchases[idx]);
});

// Record payment against a purchase order
app.post('/api/purchases/:id/pay', (req, res) => {
  const purchases = readData('purchases.json');
  const idx = purchases.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const amount = parseFloat(req.body.amount) || 0;
  const method = req.body.method || 'cash';
  const note = req.body.note || '';
  if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  const po = purchases[idx];
  const totalAmount = po.totalAmount || 0;
  const prevPaid = po.amountPaid || 0;
  const newPaid = Math.min(prevPaid + amount, totalAmount);

  po.amountPaid = newPaid;
  po.payments = po.payments || [];
  po.payments.push({
    id: uuidv4(),
    amount,
    method,
    note,
    date: new Date().toISOString(),
    recordedBy: req.body.recordedBy || 'admin'
  });
  po.paymentStatus = newPaid >= totalAmount ? 'paid' : 'partial';
  po.paidDate = newPaid >= totalAmount ? new Date().toISOString() : null;

  writeData('purchases.json', purchases);
  res.json(po);
});

// Payables summary
app.get('/api/payables', (req, res) => {
  const purchases = readData('purchases.json');
  const vendors = readData('vendors.json');
  const vendorMap = {};
  vendors.forEach(v => { vendorMap[v.id] = v.name; });

  const today = new Date().toISOString().split('T')[0];
  const unpaidPOs = purchases.filter(p =>
    (p.status === 'received' || p.status === 'pending') &&
    p.paymentStatus !== 'paid'
  );

  let totalOutstanding = 0;
  let totalOverdue = 0;
  const vendorPayables = {};

  unpaidPOs.forEach(po => {
    const balance = (po.totalAmount || 0) - (po.amountPaid || 0);
    const isOverdue = po.dueDate && po.dueDate < today;
    totalOutstanding += balance;
    if (isOverdue) totalOverdue += balance;

    const vName = vendorMap[po.vendorId] || po.vendorName || 'Unknown';
    if (!vendorPayables[vName]) {
      vendorPayables[vName] = { vendor: vName, outstanding: 0, overdue: 0, poCount: 0 };
    }
    vendorPayables[vName].outstanding += balance;
    vendorPayables[vName].poCount++;
    if (isOverdue) vendorPayables[vName].overdue += balance;
  });

  // Aging buckets
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
    totalOutstanding,
    totalOverdue,
    aging,
    vendorPayables: Object.values(vendorPayables).sort((a, b) => b.outstanding - a.outstanding),
    unpaidPOs: unpaidPOs.map(po => ({
      ...po,
      vendorName: vendorMap[po.vendorId] || po.vendorName || 'Unknown',
      balance: (po.totalAmount || 0) - (po.amountPaid || 0),
      isOverdue: po.dueDate && po.dueDate < today,
      daysUntilDue: po.dueDate ? Math.floor((new Date(po.dueDate) - new Date(today)) / 86400000) : null
    })).sort((a, b) => (a.dueDate || '9999') > (b.dueDate || '9999') ? 1 : -1)
  });
});

// --- ORDERS ---
app.get('/api/orders', (req, res) => {
  let orders = readData('orders.json');
  if (req.query.date) {
    orders = orders.filter(o => o.date && o.date.startsWith(req.query.date));
  }
  if (req.query.status) {
    orders = orders.filter(o => o.status === req.query.status);
  }
  if (req.query.staffId) {
    orders = orders.filter(o => o.staffId === req.query.staffId);
  }
  res.json(orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.get('/api/orders/:id', (req, res) => {
  const orders = readData('orders.json');
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});

function staffCodeFromName(name) {
  if (!name) return 'XX';
  const first = name.trim().split(/\s+/)[0] || name.trim();
  const letters = first.replace(/[^a-zA-Z]/g, '');
  if (!letters) return 'XX';
  const a = letters[0].toUpperCase();
  const b = letters[letters.length - 1].toUpperCase();
  return a + b;
}

app.post('/api/orders', (req, res) => {
  const orders = readData('orders.json');
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const body = req.body || {};

  // Build staff-scoped order number: <Initials>01<seq>, e.g. SH0101, SH0102
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
    id: uuidv4(),
    orderNumber,
    date: today,
    createdAt: now.toISOString(),
    status: 'new',
    paymentStatus: 'unpaid',
    ...body
  };
  orders.push(order);
  writeData('orders.json', orders);
  res.status(201).json(order);
});

app.put('/api/orders/:id', (req, res) => {
  const orders = readData('orders.json');
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  orders[idx] = { ...orders[idx], ...req.body };

  // If completing payment, record it
  if (req.body.paymentStatus === 'paid' && !orders[idx].paidAt) {
    orders[idx].paidAt = new Date().toISOString();
  }

  // If marking as credit, initialize credit tracking
  if (req.body.paymentMethod === 'credit') {
    orders[idx].paymentStatus = 'credit';
    orders[idx].creditAmountPaid = orders[idx].creditAmountPaid || 0;
    orders[idx].creditPayments = orders[idx].creditPayments || [];
  }

  writeData('orders.json', orders);
  res.json(orders[idx]);
});

// Record payment against a credit order
app.post('/api/orders/:id/credit-pay', (req, res) => {
  const orders = readData('orders.json');
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const amount = parseFloat(req.body.amount) || 0;
  const method = req.body.method || 'cash';
  const note = req.body.note || '';
  if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  const order = orders[idx];
  const total = order.total || 0;
  const prevPaid = order.creditAmountPaid || 0;
  const newPaid = Math.min(prevPaid + amount, total);

  order.creditAmountPaid = newPaid;
  order.creditPayments = order.creditPayments || [];
  order.creditPayments.push({
    id: uuidv4(),
    amount, method, note,
    date: new Date().toISOString(),
    recordedBy: req.body.recordedBy || 'admin'
  });

  // If fully paid off, mark as paid
  if (newPaid >= total) {
    order.paymentStatus = 'paid';
    order.paymentMethod = 'credit_settled';
    order.paidAt = new Date().toISOString();
  }

  writeData('orders.json', orders);
  res.json(order);
});

// Receivables summary (credit sales tracking)
app.get('/api/receivables', (req, res) => {
  const orders = readData('orders.json');
  const today = new Date().toISOString().split('T')[0];

  const creditOrders = orders.filter(o => o.paymentStatus === 'credit');

  let totalReceivable = 0;
  const customerDebts = {};

  creditOrders.forEach(o => {
    const balance = (o.total || 0) - (o.creditAmountPaid || 0);
    totalReceivable += balance;
    const name = o.customerName || 'Walk-in (unnamed)';
    if (!customerDebts[name]) {
      customerDebts[name] = { customer: name, outstanding: 0, orderCount: 0, orders: [] };
    }
    customerDebts[name].outstanding += balance;
    customerDebts[name].orderCount++;
    customerDebts[name].orders.push({
      id: o.id,
      orderNumber: o.orderNumber,
      date: o.date,
      total: o.total || 0,
      amountPaid: o.creditAmountPaid || 0,
      balance,
      daysSinceSale: Math.floor((new Date(today) - new Date(o.date)) / 86400000),
      payments: o.creditPayments || []
    });
  });

  // Aging
  const aging = { current: 0, days7: 0, days14: 0, days30plus: 0 };
  creditOrders.forEach(o => {
    const balance = (o.total || 0) - (o.creditAmountPaid || 0);
    const days = Math.floor((new Date(today) - new Date(o.date)) / 86400000);
    if (days <= 3) aging.current += balance;
    else if (days <= 7) aging.days7 += balance;
    else if (days <= 14) aging.days14 += balance;
    else aging.days30plus += balance;
  });

  // Recently settled (last 30 days)
  const settled = orders.filter(o =>
    o.paymentMethod === 'credit_settled' && o.paidAt &&
    o.paidAt.split('T')[0] >= new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  );
  const totalSettled = settled.reduce((s, o) => s + (o.total || 0), 0);

  res.json({
    totalReceivable,
    totalSettled,
    creditOrderCount: creditOrders.length,
    aging,
    customerDebts: Object.values(customerDebts).sort((a, b) => b.outstanding - a.outstanding)
  });
});

app.delete('/api/orders/:id', (req, res) => {
  let orders = readData('orders.json');
  orders = orders.filter(o => o.id !== req.params.id);
  writeData('orders.json', orders);
  res.json({ success: true });
});

// --- KITCHEN DISPLAY ---
app.get('/api/kitchen', (req, res) => {
  const orders = readData('orders.json');
  const active = orders.filter(o => ['new', 'preparing'].includes(o.status));
  res.json(active.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
});

app.put('/api/kitchen/:id/status', (req, res) => {
  const orders = readData('orders.json');
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  orders[idx].status = req.body.status;
  if (req.body.status === 'ready') orders[idx].readyAt = new Date().toISOString();
  if (req.body.status === 'served') orders[idx].servedAt = new Date().toISOString();
  writeData('orders.json', orders);
  res.json(orders[idx]);
});

// --- EXPENSES ---
app.get('/api/expenses', (req, res) => {
  let expenses = readData('expenses.json');
  if (req.query.date) expenses = expenses.filter(e => e.date === req.query.date);
  if (req.query.from && req.query.to) {
    expenses = expenses.filter(e => e.date >= req.query.from && e.date <= req.query.to);
  }
  res.json(expenses.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/expenses', (req, res) => {
  const expenses = readData('expenses.json');
  const expense = { id: uuidv4(), date: new Date().toISOString().split('T')[0], ...req.body };
  expenses.push(expense);
  writeData('expenses.json', expenses);
  res.status(201).json(expense);
});

app.put('/api/expenses/:id', (req, res) => {
  const expenses = readData('expenses.json');
  const idx = expenses.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  expenses[idx] = { ...expenses[idx], ...req.body };
  writeData('expenses.json', expenses);
  res.json(expenses[idx]);
});

app.delete('/api/expenses/:id', (req, res) => {
  let expenses = readData('expenses.json');
  expenses = expenses.filter(e => e.id !== req.params.id);
  writeData('expenses.json', expenses);
  res.json({ success: true });
});

// --- CUSTOMERS ---
app.get('/api/customers', (req, res) => res.json(readData('customers.json')));

app.post('/api/customers', (req, res) => {
  const customers = readData('customers.json');
  const customer = { id: uuidv4(), visits: 0, totalSpent: 0, createdAt: new Date().toISOString(), ...req.body };
  customers.push(customer);
  writeData('customers.json', customers);
  res.status(201).json(customer);
});

app.put('/api/customers/:id', (req, res) => {
  const customers = readData('customers.json');
  const idx = customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  customers[idx] = { ...customers[idx], ...req.body };
  writeData('customers.json', customers);
  res.json(customers[idx]);
});

// --- STAFF ---
app.get('/api/staff', (req, res) => {
  const staff = readData('staff.json');
  res.json(staff.map(s => ({ ...s, pin: '****' })));
});

app.post('/api/staff', (req, res) => {
  const staff = readData('staff.json');
  const member = { id: uuidv4(), active: true, ...req.body };
  staff.push(member);
  writeData('staff.json', staff);
  res.status(201).json({ ...member, pin: '****' });
});

app.put('/api/staff/:id', (req, res) => {
  const staff = readData('staff.json');
  const idx = staff.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  staff[idx] = { ...staff[idx], ...req.body };
  writeData('staff.json', staff);
  res.json({ ...staff[idx], pin: '****' });
});

app.delete('/api/staff/:id', (req, res) => {
  let staff = readData('staff.json');
  staff = staff.filter(s => s.id !== req.params.id);
  writeData('staff.json', staff);
  res.json({ success: true });
});

// --- REPORTS ---
app.get('/api/reports/daily', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const orders = readData('orders.json').filter(o => o.date === date);
  const expenses = readData('expenses.json').filter(e => e.date === date);

  const totalRevenue = orders.filter(o => o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + (o.total || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalOrders = orders.length;
  const paidOrders = orders.filter(o => o.paymentStatus === 'paid').length;
  const unpaidOrders = orders.filter(o => o.paymentStatus === 'unpaid').length;

  // Payment method breakdown
  const paymentMethods = {};
  orders.filter(o => o.paymentStatus === 'paid').forEach(o => {
    const method = o.paymentMethod || 'cash';
    paymentMethods[method] = (paymentMethods[method] || 0) + (o.total || 0);
  });

  // Top selling items
  const itemSales = {};
  orders.forEach(o => {
    (o.items || []).forEach(item => {
      if (!itemSales[item.name]) itemSales[item.name] = { qty: 0, revenue: 0 };
      itemSales[item.name].qty += item.quantity;
      itemSales[item.name].revenue += item.quantity * item.price;
    });
  });
  const topItems = Object.entries(itemSales)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Cost of goods sold (portion-based costing)
  const portionMap = readData('portion-map.json');
  const inventory = readData('inventory.json');
  const invCostMap = {};
  inventory.forEach(i => { invCostMap[i.name] = i.costPerPortion || i.costPerUnit || 0; });
  const portionCostMap = {};
  portionMap.forEach(pm => {
    portionCostMap[pm.menuItemName] = (invCostMap[pm.stockItemName] || 0) * (pm.portionsUsed || 1);
  });
  // Fallback to menu item cost if no portion mapping exists
  const menu = readData('menu.json');
  const menuCostMap = {};
  menu.forEach(m => { menuCostMap[m.name] = m.cost || 0; });

  let cogs = 0;
  const cogsDetail = {};
  // Build reverse lookup: menu item -> stock item name
  const menuToStock = {};
  portionMap.forEach(pm => { menuToStock[pm.menuItemName] = pm.stockItemName; });

  orders.filter(o => o.paymentStatus === 'paid').forEach(o => {
    (o.items || []).forEach(item => {
      const portionCost = portionCostMap[item.name];
      const unitCost = portionCost !== undefined ? portionCost : (menuCostMap[item.name] || 0);
      const totalCost = unitCost * item.quantity;
      cogs += totalCost;

      if (!cogsDetail[item.name]) {
        cogsDetail[item.name] = {
          menuItem: item.name,
          stockItem: menuToStock[item.name] || '—',
          unitCost,
          qtySold: 0,
          revenue: 0,
          totalCost: 0
        };
      }
      cogsDetail[item.name].qtySold += item.quantity;
      cogsDetail[item.name].revenue += item.quantity * item.price;
      cogsDetail[item.name].totalCost += totalCost;
    });
  });

  // Sort by totalCost descending and add margin
  const cogsBreakdown = Object.values(cogsDetail)
    .map(c => ({ ...c, margin: c.revenue > 0 ? ((c.revenue - c.totalCost) / c.revenue * 100).toFixed(1) : '0.0' }))
    .sort((a, b) => b.totalCost - a.totalCost);

  res.json({
    date,
    totalRevenue,
    totalExpenses,
    cogs,
    cogsBreakdown,
    grossProfit: totalRevenue - cogs,
    netProfit: totalRevenue - cogs - totalExpenses,
    grossMargin: totalRevenue > 0 ? ((totalRevenue - cogs) / totalRevenue * 100).toFixed(1) : 0,
    totalOrders,
    paidOrders,
    unpaidOrders,
    averageOrderValue: paidOrders > 0 ? Math.round(totalRevenue / paidOrders) : 0,
    paymentMethods,
    topItems,
    expenseBreakdown: expenses.map(e => ({ category: e.category, amount: e.amount, description: e.description })),
    // Waiter performance
    waiterPerformance: (() => {
      const wp = {};
      orders.forEach(o => {
        const name = o.staffName || 'Unknown';
        if (!wp[name]) wp[name] = { waiter: name, orders: 0, revenue: 0, items: 0 };
        wp[name].orders++;
        if (o.paymentStatus === 'paid') wp[name].revenue += o.total || 0;
        (o.items || []).forEach(i => { wp[name].items += i.quantity; });
      });
      return Object.values(wp).sort((a, b) => b.revenue - a.revenue);
    })()
  });
});

app.get('/api/reports/range', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });

  const orders = readData('orders.json').filter(o => o.date >= from && o.date <= to);
  const expenses = readData('expenses.json').filter(e => e.date >= from && e.date <= to);

  // Portion-based costing
  const portionMap = readData('portion-map.json');
  const inventory = readData('inventory.json');
  const invCostMap = {};
  inventory.forEach(i => { invCostMap[i.name] = i.costPerPortion || i.costPerUnit || 0; });
  const portionCostMap = {};
  portionMap.forEach(pm => {
    portionCostMap[pm.menuItemName] = (invCostMap[pm.stockItemName] || 0) * (pm.portionsUsed || 1);
  });
  const menu = readData('menu.json');
  const menuCostMap = {};
  menu.forEach(m => { menuCostMap[m.name] = m.cost || 0; });

  function getItemCost(itemName) {
    const pc = portionCostMap[itemName];
    return pc !== undefined ? pc : (menuCostMap[itemName] || 0);
  }

  // Daily breakdown
  const dailyData = {};
  let d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    const ds = d.toISOString().split('T')[0];
    dailyData[ds] = { revenue: 0, expenses: 0, orders: 0, cogs: 0 };
    d.setDate(d.getDate() + 1);
  }

  orders.filter(o => o.paymentStatus === 'paid').forEach(o => {
    if (dailyData[o.date]) {
      dailyData[o.date].revenue += o.total || 0;
      dailyData[o.date].orders++;
      (o.items || []).forEach(item => {
        dailyData[o.date].cogs += getItemCost(item.name) * item.quantity;
      });
    }
  });

  expenses.forEach(e => {
    if (dailyData[e.date]) {
      dailyData[e.date].expenses += e.amount || 0;
    }
  });

  const totalRevenue = Object.values(dailyData).reduce((s, d) => s + d.revenue, 0);
  const totalExpenses = Object.values(dailyData).reduce((s, d) => s + d.expenses, 0);
  const totalCogs = Object.values(dailyData).reduce((s, d) => s + d.cogs, 0);
  const totalOrders = Object.values(dailyData).reduce((s, d) => s + d.orders, 0);

  // Item performance & COGS breakdown
  const itemPerf = {};
  const menuToStock = {};
  portionMap.forEach(pm => { menuToStock[pm.menuItemName] = pm.stockItemName; });

  orders.forEach(o => {
    (o.items || []).forEach(item => {
      if (!itemPerf[item.name]) itemPerf[item.name] = { qty: 0, revenue: 0, cost: 0 };
      itemPerf[item.name].qty += item.quantity;
      itemPerf[item.name].revenue += item.quantity * item.price;
      itemPerf[item.name].cost += getItemCost(item.name) * item.quantity;
    });
  });

  // COGS breakdown per item
  const cogsBreakdown = Object.entries(itemPerf)
    .map(([name, data]) => ({
      menuItem: name,
      stockItem: menuToStock[name] || '—',
      unitCost: getItemCost(name),
      qtySold: data.qty,
      revenue: data.revenue,
      totalCost: data.cost,
      margin: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue * 100).toFixed(1) : '0.0'
    }))
    .sort((a, b) => b.totalCost - a.totalCost);

  res.json({
    from, to,
    totalRevenue,
    totalExpenses,
    totalCogs,
    cogsBreakdown,
    grossProfit: totalRevenue - totalCogs,
    netProfit: totalRevenue - totalCogs - totalExpenses,
    grossMargin: totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue * 100).toFixed(1) : 0,
    totalOrders,
    averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    dailyData,
    itemPerformance: Object.entries(itemPerf)
      .map(([name, data]) => ({ name, ...data, margin: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue * 100).toFixed(1) : 0 }))
      .sort((a, b) => b.revenue - a.revenue),
    // Waiter performance
    waiterPerformance: (() => {
      const wp = {};
      orders.forEach(o => {
        const name = o.staffName || 'Unknown';
        if (!wp[name]) wp[name] = { waiter: name, orders: 0, revenue: 0, items: 0 };
        wp[name].orders++;
        if (o.paymentStatus === 'paid') wp[name].revenue += o.total || 0;
        (o.items || []).forEach(i => { wp[name].items += i.quantity; });
      });
      return Object.values(wp).sort((a, b) => b.revenue - a.revenue);
    })()
  });
});

// Cash reconciliation
function buildReconciliation(date) {
  const orders = readData('orders.json').filter(o => o.date === date && o.paymentStatus === 'paid');
  const expenses = readData('expenses.json').filter(e => e.date === date);

  const cashSales = orders.filter(o => (o.paymentMethod || 'cash') === 'cash')
    .reduce((s, o) => s + (o.total || 0), 0);
  const mobileSales = orders.filter(o => o.paymentMethod === 'mobile_money')
    .reduce((s, o) => s + (o.total || 0), 0);
  const cardSales = orders.filter(o => o.paymentMethod === 'card')
    .reduce((s, o) => s + (o.total || 0), 0);
  const cashExpenses = expenses.filter(e => (e.paymentMethod || 'cash') === 'cash')
    .reduce((s, e) => s + (e.amount || 0), 0);

  return {
    date,
    cashSales,
    mobileSales,
    cardSales,
    totalSales: cashSales + mobileSales + cardSales,
    cashExpenses,
    expectedCashInHand: cashSales - cashExpenses,
    transactions: {
      cashOrders: orders.filter(o => (o.paymentMethod || 'cash') === 'cash').length,
      mobileOrders: orders.filter(o => o.paymentMethod === 'mobile_money').length,
      cardOrders: orders.filter(o => o.paymentMethod === 'card').length,
      expenseCount: expenses.length
    }
  };
}

app.get('/api/reports/reconciliation', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  res.json(buildReconciliation(date));
});

// --- STOCK LOG ---
app.get('/api/stock-log', (req, res) => {
  const logs = readData('stock-log.json');
  res.json(logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100));
});

// --- PORTION MAP ---
app.get('/api/portion-map', (req, res) => res.json(readData('portion-map.json')));

app.post('/api/portion-map', (req, res) => {
  const maps = readData('portion-map.json');
  const entry = { id: uuidv4(), ...req.body };
  maps.push(entry);
  writeData('portion-map.json', maps);
  res.status(201).json(entry);
});

app.put('/api/portion-map/:id', (req, res) => {
  const maps = readData('portion-map.json');
  const idx = maps.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  maps[idx] = { ...maps[idx], ...req.body };
  writeData('portion-map.json', maps);
  res.json(maps[idx]);
});

app.delete('/api/portion-map/:id', (req, res) => {
  let maps = readData('portion-map.json');
  maps = maps.filter(m => m.id !== req.params.id);
  writeData('portion-map.json', maps);
  res.json({ success: true });
});

// --- NOTIFICATIONS (polling) ---
// Returns new/ready orders since a given timestamp for alert purposes
app.get('/api/notifications', (req, res) => {
  const { since, role } = req.query;
  const orders = readData('orders.json');
  const sinceTime = since ? new Date(since) : new Date(0);

  if (role === 'kitchen') {
    // Kitchen wants to know about NEW orders
    const newOrders = orders.filter(o =>
      o.status === 'new' && new Date(o.createdAt) > sinceTime
    );
    res.json({ alerts: newOrders.map(o => ({ id: o.id, orderNumber: o.orderNumber, items: o.items, table: o.table, menuType: o.menuType, createdAt: o.createdAt })) });
  } else if (role === 'waiter') {
    // Waiter wants to know about READY orders
    const readyOrders = orders.filter(o =>
      o.status === 'ready' && o.readyAt && new Date(o.readyAt) > sinceTime
    );
    res.json({ alerts: readyOrders.map(o => ({ id: o.id, orderNumber: o.orderNumber, table: o.table, menuType: o.menuType, readyAt: o.readyAt })) });
  } else {
    res.json({ alerts: [] });
  }
});

// --- DASHBOARD ---
app.get('/api/dashboard', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  let orders = readData('orders.json');
  if (req.query.staffId) {
    orders = orders.filter(o => o.staffId === req.query.staffId);
  }
  const todayOrders = orders.filter(o => o.date === today);
  const expenses = readData('expenses.json').filter(e => e.date === today);
  const inventory = readData('inventory.json');
  const lowStock = inventory.filter(i => i.quantity <= i.reorderLevel);

  const todayRevenue = todayOrders.filter(o => o.paymentStatus === 'paid')
    .reduce((s, o) => s + (o.total || 0), 0);
  const todayExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const activeOrders = todayOrders.filter(o => ['new', 'preparing', 'ready'].includes(o.status)).length;

  // Yesterday comparison
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yd = yesterday.toISOString().split('T')[0];
  const yesterdayRevenue = orders.filter(o => o.date === yd && o.paymentStatus === 'paid')
    .reduce((s, o) => s + (o.total || 0), 0);

  res.json({
    todayRevenue,
    todayExpenses,
    todayProfit: todayRevenue - todayExpenses,
    todayOrders: todayOrders.length,
    activeOrders,
    lowStockCount: lowStock.length,
    lowStockItems: lowStock.map(i => i.name),
    yesterdayRevenue,
    revenueChange: yesterdayRevenue > 0 ? (((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100).toFixed(1) : 0,
    unpaidOrders: todayOrders.filter(o => o.paymentStatus === 'unpaid').length
  });
});

// ===== PUBLIC ONLINE ORDERING API =====
// Endpoints under /api/public/* are internet-facing (no auth) and used by adskitchens.com.

// Simple in-memory rate limiter: max 8 order submissions per IP per 10 minutes
const orderRateMap = new Map();
function rateLimitOrders(req, res, next) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const maxHits = 8;
  const hits = (orderRateMap.get(ip) || []).filter(t => now - t < windowMs);
  if (hits.length >= maxHits) {
    return res.status(429).json({ error: 'Too many orders. Please try again later.' });
  }
  hits.push(now);
  orderRateMap.set(ip, hits);
  next();
}

// GET /api/public/settings — public-facing restaurant config for the order page
app.get('/api/public/settings', (req, res) => {
  const s = readConfig('settings.json');
  res.json({
    restaurantName: s.restaurantName || "AD's Kitchen",
    location: s.location || 'Kitooro, Entebbe',
    phone: s.phone || '',
    currency: s.currency || 'UGX',
    deliveryFee: 5000,
    deliveryRadiusKm: 10,
    payment: {
      mtnMomoCode: '382889',
      airtelMerchantCode: '4382901'
    }
  });
});

// GET /api/public/menu — active menu items grouped by category, for the online storefront
app.get('/api/public/menu', (req, res) => {
  const items = readData('menu.json').filter(m => m.active !== false);
  const categories = readData('categories.json');
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
  const grouped = categories.map(c => ({
    id: c.id,
    name: c.name,
    color: c.color,
    items: items.filter(m => m.category === c.id).map(m => ({
      id: m.id,
      name: m.name,
      price: m.price,
      description: m.description || ''
    }))
  })).filter(g => g.items.length > 0);
  res.json({ categories: grouped });
});

// POST /api/public/orders — create an online order from the public website
app.post('/api/public/orders', rateLimitOrders, (req, res) => {
  const body = req.body || {};
  const { customerName, customerPhone, deliveryType, deliveryAddress, items, notes } = body;

  // Validation
  if (!customerName || !customerName.trim()) return res.status(400).json({ error: 'Customer name is required.' });
  if (!customerPhone || !/^[+0-9\s-]{7,}$/.test(customerPhone)) return res.status(400).json({ error: 'Valid phone number is required.' });
  if (!['delivery', 'pickup'].includes(deliveryType)) return res.status(400).json({ error: 'Invalid delivery type.' });
  if (deliveryType === 'delivery' && (!deliveryAddress || !deliveryAddress.trim())) {
    return res.status(400).json({ error: 'Delivery address is required for delivery orders.' });
  }
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });

  // Server-side price validation against menu.json (never trust prices from the browser)
  const menu = readData('menu.json');
  const menuById = Object.fromEntries(menu.map(m => [m.id, m]));
  const validatedItems = [];
  for (const it of items) {
    const m = menuById[it.menuId];
    if (!m || m.active === false) return res.status(400).json({ error: `Item no longer available: ${it.name || it.menuId}` });
    const qty = parseInt(it.quantity, 10);
    if (!qty || qty < 1 || qty > 50) return res.status(400).json({ error: `Invalid quantity for ${m.name}` });
    validatedItems.push({ menuId: m.id, name: m.name, price: m.price, quantity: qty });
  }

  const subtotal = validatedItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const deliveryFee = deliveryType === 'delivery' ? 5000 : 0;
  const total = subtotal + deliveryFee;

  // Build online order number: WEB01 + daily sequence
  const orders = readData('orders.json');
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const seq = orders.filter(o => o.date === today && o.source === 'online').length + 1;
  const orderNumber = 'WEB01' + String(seq).padStart(2, '0');

  const order = {
    id: uuidv4(),
    orderNumber,
    date: today,
    createdAt: now.toISOString(),
    status: 'new',
    paymentStatus: 'unpaid',
    source: 'online',
    type: deliveryType === 'delivery' ? 'delivery' : 'pickup',
    menuType: 'online',
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim(),
    deliveryAddress: deliveryType === 'delivery' ? deliveryAddress.trim() : null,
    items: validatedItems,
    subtotal,
    deliveryFee,
    total,
    paymentMethod: 'mobile_money',
    notes: (notes || '').toString().slice(0, 500)
  };
  orders.push(order);
  writeData('orders.json', orders);

  // Fire-and-forget Telegram alert
  const itemList = validatedItems.map(i => `• ${i.quantity}× ${i.name}`).join('\n');
  const alertMsg = [
    `🛵 <b>NEW ONLINE ORDER — ${order.orderNumber}</b>`,
    '',
    `👤 ${order.customerName}`,
    `📞 ${order.customerPhone}`,
    `📦 ${deliveryType === 'delivery' ? 'DELIVERY' : 'PICKUP'}`,
    ...(order.deliveryAddress ? [`📍 ${order.deliveryAddress}`] : []),
    '',
    `<b>Items</b>`,
    itemList,
    '',
    `Subtotal: UGX ${subtotal.toLocaleString('en-US')}`,
    ...(deliveryFee ? [`Delivery: UGX ${deliveryFee.toLocaleString('en-US')}`] : []),
    `<b>Total: UGX ${total.toLocaleString('en-US')}</b>`,
    ...(order.notes ? ['', `📝 ${order.notes}`] : [])
  ].join('\n');
  sendTelegramMessage(alertMsg).catch(() => {});

  res.status(201).json({
    success: true,
    orderNumber: order.orderNumber,
    total: order.total,
    deliveryFee: order.deliveryFee,
    payment: {
      mtnMomoCode: '382889',
      airtelMerchantCode: '4382901',
      instructions: `Pay UGX ${total.toLocaleString('en-US')} via MTN MoMo code 382889 or Airtel Merchant 4382901 and include your order number ${order.orderNumber} as the reference.`
    }
  });
});

// ===== TELEGRAM NOTIFICATIONS =====
// Config read from env vars first, then settings.json as fallback.
// Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (or add "telegramBotToken"/"telegramChatId" to data/settings.json)
function getTelegramConfig() {
  const settings = readConfig('settings.json');
  return {
    token: process.env.TELEGRAM_BOT_TOKEN || settings.telegramBotToken || '',
    chatId: process.env.TELEGRAM_CHAT_ID || settings.telegramChatId || ''
  };
}

function sendTelegramMessage(text) {
  const { token, chatId } = getTelegramConfig();
  if (!token || !chatId) {
    console.warn('[Telegram] Not configured — skipping send.');
    return Promise.resolve({ ok: false, reason: 'not_configured' });
  }
  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
  const opts = {
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };
  return new Promise((resolve) => {
    const req = https.request(opts, (r) => {
      let body = '';
      r.on('data', (c) => (body += c));
      r.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (!json.ok) console.error('[Telegram] API error:', json);
          resolve(json);
        } catch (e) { resolve({ ok: false }); }
      });
    });
    req.on('error', (e) => { console.error('[Telegram] Request error:', e.message); resolve({ ok: false }); });
    req.write(payload);
    req.end();
  });
}

function fmtUGX(n) {
  return 'UGX ' + Math.round(n || 0).toLocaleString('en-US');
}

function buildReconciliationMessage(date) {
  const r = buildReconciliation(date);
  const settings = readConfig('settings.json');
  const name = settings.restaurantName || "AD's Kitchen";
  const lines = [
    `🍴 <b>${name} — Daily Cash Reconciliation</b>`,
    `📅 ${date}`,
    '',
    `<b>Sales by Payment Method</b>`,
    `💵 Cash (${r.transactions.cashOrders}): ${fmtUGX(r.cashSales)}`,
    `📱 M-Money (${r.transactions.mobileOrders}): ${fmtUGX(r.mobileSales)}`,
    `💳 Card (${r.transactions.cardOrders}): ${fmtUGX(r.cardSales)}`,
    `━━━━━━━━━━━━━━━`,
    `<b>Total Sales:</b> ${fmtUGX(r.totalSales)}`,
    '',
    `<b>Cash Movement</b>`,
    `➕ Cash Sales: ${fmtUGX(r.cashSales)}`,
    `➖ Cash Expenses (${r.transactions.expenseCount}): ${fmtUGX(r.cashExpenses)}`,
    `━━━━━━━━━━━━━━━`,
    `💰 <b>Expected Cash in Hand: ${fmtUGX(r.expectedCashInHand)}</b>`
  ];
  return lines.join('\n');
}

// Return today's date string in East Africa Time (UTC+3) regardless of server TZ
function todayInEAT() {
  const now = new Date();
  const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return eat.toISOString().split('T')[0];
}

// Returns ms until next 21:00 EAT
function msUntilNext9pmEAT() {
  const now = new Date();
  // Current time in EAT
  const eatNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const target = new Date(Date.UTC(eatNow.getUTCFullYear(), eatNow.getUTCMonth(), eatNow.getUTCDate(), 21, 0, 0));
  if (eatNow.getTime() >= target.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  // Convert EAT target back to UTC for scheduling
  const targetUtcMs = target.getTime() - 3 * 60 * 60 * 1000;
  return targetUtcMs - now.getTime();
}

async function dispatchDailyReconciliation() {
  try {
    const date = todayInEAT();
    const msg = buildReconciliationMessage(date);
    console.log(`[Telegram] Dispatching cash reconciliation for ${date}...`);
    await sendTelegramMessage(msg);
  } catch (e) {
    console.error('[Telegram] Dispatch failed:', e);
  } finally {
    // Schedule next run
    const delay = msUntilNext9pmEAT();
    setTimeout(dispatchDailyReconciliation, delay);
    console.log(`[Telegram] Next reconciliation in ${Math.round(delay / 60000)} min`);
  }
}

function startReconciliationScheduler() {
  const delay = msUntilNext9pmEAT();
  console.log(`[Telegram] Cash reconciliation scheduled in ${Math.round(delay / 60000)} min (21:00 EAT)`);
  setTimeout(dispatchDailyReconciliation, delay);
}

// Manual trigger endpoint (for testing / on-demand send)
app.post('/api/reports/reconciliation/send', async (req, res) => {
  const date = (req.body && req.body.date) || todayInEAT();
  const msg = buildReconciliationMessage(date);
  const result = await sendTelegramMessage(msg);
  if (result && result.ok) res.json({ success: true, date });
  else res.status(500).json({ success: false, error: result && result.description || 'Failed — check Telegram config' });
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🍴 AD's Kitchen Manager running at http://localhost:${PORT}`);
  console.log(`   Kitooro, Entebbe | +256 784 313399\n`);
  startReconciliationScheduler();
});
