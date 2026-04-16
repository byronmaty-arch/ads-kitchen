const express = require('express');
const { readData, readConfig } = require('../lib/db');
const { buildReconciliation, buildReconciliationMessage, sendTelegramMessage, todayInEAT } = require('../lib/telegram');
const router = express.Router();

// Helper: build costing maps used by daily + range reports
function buildCostingMaps() {
  const portionMap = readData('portion-map.json');
  const inventory = readData('inventory.json');
  const menu = readData('menu.json');
  const invCostMap = {};
  inventory.forEach(i => { invCostMap[i.name] = i.costPerPortion || i.costPerUnit || 0; });
  const portionCostMap = {};
  portionMap.forEach(pm => { portionCostMap[pm.menuItemName] = (invCostMap[pm.stockItemName] || 0) * (pm.portionsUsed || 1); });
  const menuCostMap = {};
  menu.forEach(m => { menuCostMap[m.name] = m.cost || 0; });
  const menuToStock = {};
  portionMap.forEach(pm => { menuToStock[pm.menuItemName] = pm.stockItemName; });
  function getItemCost(name) {
    const pc = portionCostMap[name];
    return pc !== undefined ? pc : (menuCostMap[name] || 0);
  }
  return { getItemCost, menuToStock, portionCostMap, menuCostMap };
}

function buildWaiterPerformance(orders) {
  const wp = {};
  orders.forEach(o => {
    const name = o.staffName || 'Unknown';
    if (!wp[name]) wp[name] = { waiter: name, orders: 0, revenue: 0, items: 0 };
    wp[name].orders++;
    if (o.paymentStatus === 'paid') wp[name].revenue += o.total || 0;
    (o.items || []).forEach(i => { wp[name].items += i.quantity; });
  });
  return Object.values(wp).sort((a, b) => b.revenue - a.revenue);
}

// Daily report
router.get('/daily', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const orders = readData('orders.json').filter(o => o.date === date);
  const expenses = readData('expenses.json').filter(e => e.date === date);
  const { getItemCost, menuToStock } = buildCostingMaps();

  const totalRevenue = orders.filter(o => o.paymentStatus === 'paid').reduce((s, o) => s + (o.total || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const paymentMethods = {};
  orders.filter(o => o.paymentStatus === 'paid').forEach(o => {
    const method = o.paymentMethod || 'cash';
    paymentMethods[method] = (paymentMethods[method] || 0) + (o.total || 0);
  });
  const itemSales = {};
  orders.forEach(o => (o.items || []).forEach(item => {
    if (!itemSales[item.name]) itemSales[item.name] = { qty: 0, revenue: 0 };
    itemSales[item.name].qty += item.quantity;
    itemSales[item.name].revenue += item.quantity * item.price;
  }));

  let cogs = 0;
  const cogsDetail = {};
  orders.filter(o => o.paymentStatus === 'paid').forEach(o => (o.items || []).forEach(item => {
    const unitCost = getItemCost(item.name);
    const totalCost = unitCost * item.quantity;
    cogs += totalCost;
    if (!cogsDetail[item.name]) cogsDetail[item.name] = { menuItem: item.name, stockItem: menuToStock[item.name] || '—', unitCost, qtySold: 0, revenue: 0, totalCost: 0 };
    cogsDetail[item.name].qtySold += item.quantity;
    cogsDetail[item.name].revenue += item.quantity * item.price;
    cogsDetail[item.name].totalCost += totalCost;
  }));
  const cogsBreakdown = Object.values(cogsDetail)
    .map(c => ({ ...c, margin: c.revenue > 0 ? ((c.revenue - c.totalCost) / c.revenue * 100).toFixed(1) : '0.0' }))
    .sort((a, b) => b.totalCost - a.totalCost);

  const paidOrders = orders.filter(o => o.paymentStatus === 'paid').length;
  res.json({
    date, totalRevenue, totalExpenses, cogs, cogsBreakdown,
    grossProfit: totalRevenue - cogs, netProfit: totalRevenue - cogs - totalExpenses,
    grossMargin: totalRevenue > 0 ? ((totalRevenue - cogs) / totalRevenue * 100).toFixed(1) : 0,
    totalOrders: orders.length, paidOrders,
    unpaidOrders: orders.filter(o => o.paymentStatus === 'unpaid').length,
    averageOrderValue: paidOrders > 0 ? Math.round(totalRevenue / paidOrders) : 0,
    paymentMethods,
    topItems: Object.entries(itemSales).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    expenseBreakdown: expenses.map(e => ({ category: e.category, amount: e.amount, description: e.description })),
    waiterPerformance: buildWaiterPerformance(orders)
  });
});

// Date-range report
router.get('/range', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });
  const orders = readData('orders.json').filter(o => o.date >= from && o.date <= to);
  const expenses = readData('expenses.json').filter(e => e.date >= from && e.date <= to);
  const { getItemCost, menuToStock } = buildCostingMaps();

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
      (o.items || []).forEach(item => { dailyData[o.date].cogs += getItemCost(item.name) * item.quantity; });
    }
  });
  expenses.forEach(e => { if (dailyData[e.date]) dailyData[e.date].expenses += e.amount || 0; });

  const totalRevenue = Object.values(dailyData).reduce((s, d) => s + d.revenue, 0);
  const totalExpenses = Object.values(dailyData).reduce((s, d) => s + d.expenses, 0);
  const totalCogs = Object.values(dailyData).reduce((s, d) => s + d.cogs, 0);
  const totalOrders = Object.values(dailyData).reduce((s, d) => s + d.orders, 0);

  const itemPerf = {};
  orders.forEach(o => (o.items || []).forEach(item => {
    if (!itemPerf[item.name]) itemPerf[item.name] = { qty: 0, revenue: 0, cost: 0 };
    itemPerf[item.name].qty += item.quantity;
    itemPerf[item.name].revenue += item.quantity * item.price;
    itemPerf[item.name].cost += getItemCost(item.name) * item.quantity;
  }));
  const cogsBreakdown = Object.entries(itemPerf)
    .map(([name, data]) => ({ menuItem: name, stockItem: menuToStock[name] || '—', unitCost: getItemCost(name), qtySold: data.qty, revenue: data.revenue, totalCost: data.cost, margin: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue * 100).toFixed(1) : '0.0' }))
    .sort((a, b) => b.totalCost - a.totalCost);

  res.json({
    from, to, totalRevenue, totalExpenses, totalCogs, cogsBreakdown,
    grossProfit: totalRevenue - totalCogs, netProfit: totalRevenue - totalCogs - totalExpenses,
    grossMargin: totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue * 100).toFixed(1) : 0,
    totalOrders, averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    dailyData,
    itemPerformance: Object.entries(itemPerf).map(([name, data]) => ({ name, ...data, margin: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue * 100).toFixed(1) : 0 })).sort((a, b) => b.revenue - a.revenue),
    waiterPerformance: buildWaiterPerformance(orders)
  });
});

// Reconciliation
router.get('/reconciliation', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  res.json(buildReconciliation(date));
});
router.post('/reconciliation/send', async (req, res) => {
  const date = (req.body && req.body.date) || todayInEAT();
  const msg = buildReconciliationMessage(date);
  const result = await sendTelegramMessage(msg);
  if (result && result.ok) res.json({ success: true, date });
  else res.status(500).json({ success: false, error: result && result.description || 'Failed — check Telegram config' });
});

module.exports = router;
