// --- Telegram Notifications + Reconciliation Scheduler ---
const https = require('https');
const { readData, readConfig } = require('./db');

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

function fmtUGX(n) { return 'UGX ' + Math.round(n || 0).toLocaleString('en-US'); }

function todayInEAT() {
  const now = new Date();
  const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return eat.toISOString().split('T')[0];
}

function buildReconciliation(date) {
  const orders = readData('orders.json').filter(o => o.date === date && o.paymentStatus === 'paid');
  const expenses = readData('expenses.json').filter(e => e.date === date);
  const cashSales = orders.filter(o => (o.paymentMethod || 'cash') === 'cash').reduce((s, o) => s + (o.total || 0), 0);
  const mobileSales = orders.filter(o => o.paymentMethod === 'mobile_money').reduce((s, o) => s + (o.total || 0), 0);
  const cardSales = orders.filter(o => o.paymentMethod === 'card').reduce((s, o) => s + (o.total || 0), 0);
  const cashExpenses = expenses.filter(e => (e.paymentMethod || 'cash') === 'cash').reduce((s, e) => s + (e.amount || 0), 0);
  return {
    date, cashSales, mobileSales, cardSales,
    totalSales: cashSales + mobileSales + cardSales,
    cashExpenses, expectedCashInHand: cashSales - cashExpenses,
    transactions: {
      cashOrders: orders.filter(o => (o.paymentMethod || 'cash') === 'cash').length,
      mobileOrders: orders.filter(o => o.paymentMethod === 'mobile_money').length,
      cardOrders: orders.filter(o => o.paymentMethod === 'card').length,
      expenseCount: expenses.length
    }
  };
}

function buildReconciliationMessage(date) {
  const r = buildReconciliation(date);
  const name = readConfig('settings.json').restaurantName || "AD's Kitchen";
  return [
    `🍴 <b>${name} — Daily Cash Reconciliation</b>`,
    `📅 ${date}`, '',
    `<b>Sales by Payment Method</b>`,
    `💵 Cash (${r.transactions.cashOrders}): ${fmtUGX(r.cashSales)}`,
    `📱 M-Money (${r.transactions.mobileOrders}): ${fmtUGX(r.mobileSales)}`,
    `💳 Card (${r.transactions.cardOrders}): ${fmtUGX(r.cardSales)}`,
    `━━━━━━━━━━━━━━━`,
    `<b>Total Sales:</b> ${fmtUGX(r.totalSales)}`, '',
    `<b>Cash Movement</b>`,
    `➕ Cash Sales: ${fmtUGX(r.cashSales)}`,
    `➖ Cash Expenses (${r.transactions.expenseCount}): ${fmtUGX(r.cashExpenses)}`,
    `━━━━━━━━━━━━━━━`,
    `💰 <b>Expected Cash in Hand: ${fmtUGX(r.expectedCashInHand)}</b>`
  ].join('\n');
}

function msUntilNext9pmEAT() {
  const now = new Date();
  const eatNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const target = new Date(Date.UTC(eatNow.getUTCFullYear(), eatNow.getUTCMonth(), eatNow.getUTCDate(), 21, 0, 0));
  if (eatNow.getTime() >= target.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime() - 3 * 60 * 60 * 1000 - now.getTime();
}

async function dispatchDailyReconciliation() {
  try {
    const date = todayInEAT();
    console.log(`[Telegram] Dispatching cash reconciliation for ${date}...`);
    await sendTelegramMessage(buildReconciliationMessage(date));
  } catch (e) { console.error('[Telegram] Dispatch failed:', e); }
  finally {
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

module.exports = {
  sendTelegramMessage, todayInEAT, fmtUGX,
  buildReconciliation, buildReconciliationMessage,
  startReconciliationScheduler
};
