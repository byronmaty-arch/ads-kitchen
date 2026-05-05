// ⚠️ TEMPORARY — added 2026-05-05 for the test→live cutover wipe.
// REMOVE AFTER WEDNESDAY 2026-05-06 MORNING VERIFICATION.
// See ads-kitchen/CLAUDE.md → "Deferred Items" for the cleanup checklist.
//
// One-shot factory-reset routine for the live POS volume on Railway.
// Wipes test orders / customers / expenses / purchases / operational logs,
// preserves real config (menu, staff PINs, vendors, settings, categories,
// portion-map). Inventory levels are LEFT AS-IS; the operator must do a
// stock-take via the inventory UI after running this.
//
// Triggered exclusively via POST /api/admin/factory-reset (token-guarded,
// see server.js). Not exported as a standalone CLI to keep accidental local
// invocation impossible — running this against a live volume from the wrong
// machine would be silent and irreversible.

const fs = require('fs');
const path = require('path');
const { DATA_DIR, writeData } = require('./db');

// Files to wipe to []
const WIPE_FILES = [
  'orders.json',
  'expenses.json',
  'purchases.json',
  'customers.json',
  'audit-log.json',
  'login-log.json',
  'stock-log.json',
];

// Files we explicitly do NOT touch — checked at runtime as a safety guard.
// If any of these is somehow on the WIPE list (e.g. a bad edit later), we
// abort before any write.
const PRESERVE_FILES = [
  'menu.json',
  'categories.json',
  'staff.json',
  'vendors.json',
  'settings.json',
  'portion-map.json',
  'inventory.json',
];

const CONFIRM_PHRASE = 'yes wipe everything';

function fileExists(name) {
  return fs.existsSync(path.join(DATA_DIR, name));
}

function rowCount(name) {
  try {
    const fp = path.join(DATA_DIR, name);
    if (!fs.existsSync(fp)) return 0;
    const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return Array.isArray(j) ? j.length : 0;
  } catch {
    return 0;
  }
}

async function runFactoryReset({ confirm, dryRun = false }) {
  // Guard 1: confirm phrase must match exactly.
  if (confirm !== CONFIRM_PHRASE) {
    return { ok: false, error: 'confirm phrase mismatch' };
  }

  // Guard 2: WIPE list and PRESERVE list must not overlap.
  const overlap = WIPE_FILES.filter((f) => PRESERVE_FILES.includes(f));
  if (overlap.length) {
    return { ok: false, error: `wipe/preserve overlap: ${overlap.join(', ')}` };
  }

  // Guard 3: critical preserve files must actually exist before we touch
  // anything (otherwise something is wrong with the volume).
  for (const f of ['menu.json', 'staff.json', 'settings.json']) {
    if (!fileExists(f)) {
      return { ok: false, error: `preserve file missing: ${f} — aborting` };
    }
  }

  const before = {};
  for (const f of [...WIPE_FILES, ...PRESERVE_FILES]) {
    before[f] = rowCount(f);
  }

  if (dryRun) {
    return { ok: true, dryRun: true, before, wiped: WIPE_FILES, preserved: PRESERVE_FILES };
  }

  // Wipe: write [] to each file. Each writeData call is its own fs.writeFileSync;
  // not transactional across files, but each individual file write is atomic on
  // POSIX. Worst case (process killed mid-loop): some test data lingers in a
  // few files — operator can re-run; idempotent.
  const wiped = {};
  for (const f of WIPE_FILES) {
    try {
      writeData(f, []);
      wiped[f] = { ok: true, before: before[f], after: 0 };
    } catch (err) {
      wiped[f] = { ok: false, before: before[f], error: err.message };
    }
  }

  const after = {};
  for (const f of [...WIPE_FILES, ...PRESERVE_FILES]) {
    after[f] = rowCount(f);
  }

  // Sanity: every preserve file's count must be unchanged.
  const tampered = PRESERVE_FILES.filter((f) => before[f] !== after[f]);
  if (tampered.length) {
    return {
      ok: false,
      error: `preserve files changed unexpectedly: ${tampered.join(', ')}`,
      before,
      after,
    };
  }

  return {
    ok: true,
    dryRun: false,
    cutover_date: '2026-05-05',
    before,
    after,
    wiped,
    preserved: PRESERVE_FILES,
    note:
      'Inventory NOT touched. Operator must do a stock-take via the ' +
      'inventory UI before resuming live orders.',
  };
}

module.exports = { runFactoryReset, WIPE_FILES, PRESERVE_FILES };
