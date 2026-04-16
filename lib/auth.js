// --- PIN Hashing + Login Rate Limiter ---
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
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

// --- LOGIN ROUTE ---
router.post('/login', (req, res) => {
  const ip = getClientIp(req);
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
  if (!user) { recordLoginFailure(ip); return res.status(401).json({ error: 'Invalid PIN' }); }

  if (!isHashedPin(user.pin)) {
    user.pin = hashPin(pin);
    writeData('staff.json', staff);
    console.log(`[pin-migrate] Hashed PIN on login for ${user.name}`);
  }

  clearLoginFailures(ip);
  res.json({ id: user.id, name: user.name, role: user.role });
});

module.exports = { router, hashPin, isHashedPin, verifyPin, migrateStaffPinsIfNeeded };
