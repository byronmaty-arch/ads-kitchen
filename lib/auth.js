// --- PIN Hashing + Login Rate Limiter ---
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { DATA_DIR, readData, writeData } = require('./db');

const router = express.Router();

// --- PIN HASHING (scrypt, no external deps) ---
const PIN_HASH_PREFIX = 'scrypt$';
const PIN_HASH_KEYLEN = 64;
const PIN_HASH_SALT_BYTES = 16;

function hashPin(pin) {
  const salt = crypto.randomBytes(PIN_HASH_SALT_BYTES);
  const hash = crypto.scryptSync(String(pin), salt, PIN_HASH_KEYLEN);
  return `${PIN_HASH_PREFIX}${salt.toString('base64')}$${hash.toString('base64')}`;
}

function isHashedPin(stored) {
  return typeof stored === 'string' && stored.startsWith(PIN_HASH_PREFIX);
}

function verifyPin(pin, stored) {
  if (stored == null) return false;
  if (!isHashedPin(stored)) return String(pin) === String(stored);
  try {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const salt = Buffer.from(parts[1], 'base64');
    const expected = Buffer.from(parts[2], 'base64');
    const actual = crypto.scryptSync(String(pin), salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (e) {
    console.error('[pin-verify] failed:', e.message);
    return false;
  }
}

function migrateStaffPinsIfNeeded() {
  try {
    const fp = path.join(DATA_DIR, 'staff.json');
    if (!fs.existsSync(fp)) return;
    const staff = JSON.parse(fs.readFileSync(fp, 'utf8'));
    let changed = 0;
    for (const s of staff) {
      if (s.pin && !isHashedPin(s.pin)) { s.pin = hashPin(s.pin); changed++; }
    }
    if (changed > 0) {
      fs.writeFileSync(fp, JSON.stringify(staff, null, 2));
      console.log(`[pin-migrate] Hashed ${changed} plaintext PIN(s) in staff.json`);
    }
  } catch (e) { console.error('[pin-migrate] failed:', e); }
}

// --- SESSION STORE ---
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const sessions = new Map(); // token → { staffId, staffName, role, expiresAt }

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    staffId: user.id,
    staffName: user.name,
    role: user.role,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function destroySession(token) {
  sessions.delete(token);
}

function requireSession(req, res, next) {
  const token = req.headers['x-session-token'];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const session = sessions.get(token);
  if (!session || Date.now() > session.expiresAt) {
    if (session) sessions.delete(token);
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  // Slide the expiry window on each request (activity = stays logged in)
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  req.user = session;
  next();
}

// Periodic cleanup of expired sessions (every 30 min)
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token);
  }
}, 30 * 60 * 1000).unref();

// --- LOGIN RATE LIMITER ---
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();
}

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip) || { fails: [], lockedUntil: null };
  if (rec.lockedUntil && now < rec.lockedUntil) {
    return { allowed: false, retryAfterMin: Math.ceil((rec.lockedUntil - now) / 60000) };
  }
  if (rec.lockedUntil && now >= rec.lockedUntil) {
    rec.fails = []; rec.lockedUntil = null; loginAttempts.set(ip, rec);
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

function clearLoginFailures(ip) { loginAttempts.delete(ip); }

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginAttempts) {
    const stale = (!rec.lockedUntil || rec.lockedUntil < now)
      && rec.fails.every(t => now - t > LOGIN_WINDOW_MS);
    if (stale) loginAttempts.delete(ip);
  }
}, 10 * 60 * 1000).unref();

// --- LOGIN AUDIT LOG ---
const MAX_LOG_ENTRIES = 500;

function appendLoginLog(entry) {
  try {
    const log = readData('login-log.json');
    log.unshift(entry); // newest first
    writeData('login-log.json', log.slice(0, MAX_LOG_ENTRIES));
  } catch (e) {
    console.error('[audit] Failed to write login log:', e.message);
  }
}

function getLastSuccessfulIp(staffId) {
  try {
    const log = readData('login-log.json');
    const prev = log.find(e => e.staffId === staffId && e.success);
    return prev ? prev.ip : null;
  } catch (e) { return null; }
}

function parseDevice(ua) {
  if (!ua) return 'Unknown device';
  let os = 'Unknown OS';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Unknown browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome/i.test(ua)) browser = 'Chrome';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Safari/i.test(ua)) browser = 'Safari';

  return `${browser} on ${os}`;
}

// --- LOGIN ROUTE ---
router.post('/login', async (req, res) => {
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '';
  const check = checkLoginRateLimit(ip);
  if (!check.allowed) {
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${check.retryAfterMin} minute${check.retryAfterMin === 1 ? '' : 's'}.`
    });
  }
  const { pin } = req.body || {};
  if (!pin) { recordLoginFailure(ip); return res.status(400).json({ error: 'PIN required' }); }

  const staff = readData('staff.json');
  const user = staff.find(s => s.active && verifyPin(pin, s.pin));
  if (!user) {
    recordLoginFailure(ip);
    appendLoginLog({ id: uuidv4(), timestamp: new Date().toISOString(), staffId: null, staffName: 'Unknown', role: null, ip, userAgent: ua, success: false, ipChanged: false });
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  if (!isHashedPin(user.pin)) {
    user.pin = hashPin(pin);
    writeData('staff.json', staff);
    console.log(`[pin-migrate] Hashed PIN on login for ${user.name}`);
  }

  clearLoginFailures(ip);

  // IP change detection
  const lastIp = getLastSuccessfulIp(user.id);
  const ipChanged = lastIp !== null && lastIp !== ip;

  appendLoginLog({ id: uuidv4(), timestamp: new Date().toISOString(), staffId: user.id, staffName: user.name, role: user.role, ip, userAgent: ua, success: true, ipChanged });

  if (ipChanged) {
    console.warn(`[audit] IP change detected for ${user.name}: ${lastIp} → ${ip}`);
    // Fire-and-forget Telegram alert
    try {
      const { sendTelegramMessage } = require('./telegram');
      const device = parseDevice(ua);
      const eatTime = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 16);
      sendTelegramMessage(
        `🚨 <b>Security Alert — New IP/Device Detected</b>\n\n` +
        `👤 <b>${user.name}</b> (${user.role}) logged in from a new IP address.\n\n` +
        `📍 Previous IP: <code>${lastIp}</code>\n` +
        `📍 New IP: <code>${ip}</code>\n` +
        `📱 Device: ${device}\n` +
        `🕐 Time: ${eatTime} EAT\n\n` +
        `⚠️ This may indicate unauthorized sharing of staff access.`
      ).catch(() => {});
    } catch (e) { /* telegram not configured */ }
  }

  const token = createSession(user);
  res.json({ id: user.id, name: user.name, role: user.role, token });
});

// --- LOGOUT ROUTE ---
router.post('/logout', (req, res) => {
  const token = req.headers['x-session-token'];
  if (token) destroySession(token);
  res.json({ ok: true });
});

module.exports = { router, hashPin, isHashedPin, verifyPin, migrateStaffPinsIfNeeded, requireSession };
