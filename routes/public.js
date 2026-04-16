// --- Public Online Ordering API (no auth, internet-facing) ---
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData, readConfig } = require('../lib/db');
const { sendTelegramMessage } = require('../lib/telegram');
const router = express.Router();

// Rate limiter: max 8 order submissions per IP per 10 min
const orderRateMap = new Map();
function rateLimitOrders(req, res, next) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
  const now = Date.now();
  const hits = (orderRateMap.get(ip) || []).filter(t => now - t < 600000);
  if (hits.length >= 8) return res.status(429).json({ error: 'Too many orders. Please try again later.' });
  hits.push(now);
  orderRateMap.set(ip, hits);
  next();
}

router.get('/settings', (req, res) => {
  const s = readConfig('settings.json');
  res.json({
    restaurantName: s.restaurantName || "AD's Kitchen",
    location: s.location || 'Kitooro, Entebbe',
    phone: s.phone || '', currency: s.currency || 'UGX',
    deliveryFee: 5000, deliveryRadiusKm: 10,
    payment: { mtnMomoCode: '382889', airtelMerchantCode: '4382901' }
  });
});

router.get('/menu', (req, res) => {
  const items = readData('menu.json').filter(m => m.active !== false);
  const categories = readData('categories.json');
  const grouped = categories.map(c => ({
    id: c.id, name: c.name, color: c.color,
    items: items.filter(m => m.category === c.id).map(m => ({ id: m.id, name: m.name, price: m.price, description: m.description || '' }))
  })).filter(g => g.items.length > 0);
  res.json({ categories: grouped });
});

router.post('/orders', rateLimitOrders, (req, res) => {
  const body = req.body || {};
  const { customerName, customerPhone, deliveryType, deliveryAddress, items, notes } = body;
  if (!customerName || !customerName.trim()) return res.status(400).json({ error: 'Customer name is required.' });
  if (!customerPhone || !/^[+0-9\s-]{7,}$/.test(customerPhone)) return res.status(400).json({ error: 'Valid phone number is required.' });
  if (!['delivery', 'pickup'].includes(deliveryType)) return res.status(400).json({ error: 'Invalid delivery type.' });
  if (deliveryType === 'delivery' && (!deliveryAddress || !deliveryAddress.trim())) return res.status(400).json({ error: 'Delivery address is required for delivery orders.' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });

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

  const orders = readData('orders.json');
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const seq = orders.filter(o => o.date === today && o.source === 'online').length + 1;
  const order = {
    id: uuidv4(), orderNumber: 'WEB01' + String(seq).padStart(2, '0'),
    date: today, createdAt: now.toISOString(), status: 'new', paymentStatus: 'unpaid',
    source: 'online', type: deliveryType === 'delivery' ? 'delivery' : 'pickup',
    menuType: 'online', customerName: customerName.trim(), customerPhone: customerPhone.trim(),
    deliveryAddress: deliveryType === 'delivery' ? deliveryAddress.trim() : null,
    items: validatedItems, subtotal, deliveryFee, total,
    paymentMethod: 'mobile_money', notes: (notes || '').toString().slice(0, 500)
  };
  orders.push(order);
  writeData('orders.json', orders);

  const itemList = validatedItems.map(i => `• ${i.quantity}× ${i.name}`).join('\n');
  sendTelegramMessage([
    `🛵 <b>NEW ONLINE ORDER — ${order.orderNumber}</b>`, '',
    `👤 ${order.customerName}`, `📞 ${order.customerPhone}`,
    `📦 ${deliveryType === 'delivery' ? 'DELIVERY' : 'PICKUP'}`,
    ...(order.deliveryAddress ? [`📍 ${order.deliveryAddress}`] : []), '',
    `<b>Items</b>`, itemList, '',
    `Subtotal: UGX ${subtotal.toLocaleString('en-US')}`,
    ...(deliveryFee ? [`Delivery: UGX ${deliveryFee.toLocaleString('en-US')}`] : []),
    `<b>Total: UGX ${total.toLocaleString('en-US')}</b>`,
    ...(order.notes ? ['', `📝 ${order.notes}`] : [])
  ].join('\n')).catch(() => {});

  res.status(201).json({
    success: true, orderNumber: order.orderNumber, total: order.total, deliveryFee: order.deliveryFee,
    payment: {
      mtnMomoCode: '382889', airtelMerchantCode: '4382901',
      instructions: `Pay UGX ${total.toLocaleString('en-US')} via MTN MoMo code 382889 or Airtel Merchant 4382901 and include your order number ${order.orderNumber} as the reference.`
    }
  });
});

module.exports = router;
