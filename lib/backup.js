// --- Nightly GitHub Backup ---
const fs = require('fs');
const https = require('https');
const { DATA_DIR, readConfig } = require('./db');
const { sendTelegramMessage, todayInEAT } = require('./telegram');

function buildBackupSnapshot() {
  const snapshot = {
    backedUpAt: new Date().toISOString(),
    dateEAT: todayInEAT(),
    restaurantName: (readConfig('settings.json').restaurantName) || "AD's Kitchen",
    files: {}
  };
  if (!fs.existsSync(DATA_DIR)) return snapshot;
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      snapshot.files[f] = JSON.parse(fs.readFileSync(require('path').join(DATA_DIR, f), 'utf8'));
    } catch (e) { console.error(`[backup] failed to read ${f}:`, e.message); }
  }
  return snapshot;
}

function githubRequest(method, pathname, token, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.github.com', path: pathname, method,
      headers: {
        'User-Agent': 'ads-kitchen-backup',
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    };
    if (payload) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request(opts, (r) => {
      let data = '';
      r.on('data', c => data += c);
      r.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch (e) {}
        resolve({ status: r.statusCode, body: parsed });
      });
    });
    req.on('error', (e) => {
      console.error('[backup] request error:', e.message);
      resolve({ status: 0, body: { error: e.message } });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function runBackup() {
  const token = process.env.BACKUP_GITHUB_TOKEN;
  const repo = process.env.BACKUP_REPO;
  const branch = process.env.BACKUP_BRANCH || 'main';
  if (!token || !repo) {
    console.warn('[backup] Not configured — set BACKUP_GITHUB_TOKEN and BACKUP_REPO');
    return { ok: false, reason: 'not_configured' };
  }
  const snapshot = buildBackupSnapshot();
  const dateStr = snapshot.dateEAT;
  const filePath = `backups/${dateStr}.json`;
  const contentB64 = Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8').toString('base64');

  const getPath = `/repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`;
  const existing = await githubRequest('GET', getPath, token);
  const existingSha = existing.status === 200 && existing.body && existing.body.sha ? existing.body.sha : null;

  const putBody = {
    message: `Backup ${dateStr} (${Object.keys(snapshot.files).length} files)`,
    content: contentB64, branch
  };
  if (existingSha) putBody.sha = existingSha;

  const result = await githubRequest('PUT', `/repos/${repo}/contents/${filePath}`, token, putBody);
  if (result.status === 200 || result.status === 201) {
    console.log(`[backup] ✅ ${dateStr}.json pushed to ${repo}`);
    return { ok: true, dateStr, filePath, updated: !!existingSha };
  } else {
    console.error('[backup] ❌ failed:', result.status, result.body && result.body.message);
    return { ok: false, status: result.status, error: result.body && result.body.message };
  }
}

function msUntilNext1130pmEAT() {
  const now = new Date();
  const eatNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const target = new Date(Date.UTC(eatNow.getUTCFullYear(), eatNow.getUTCMonth(), eatNow.getUTCDate(), 23, 30, 0));
  if (eatNow.getTime() >= target.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime() - 3 * 60 * 60 * 1000 - now.getTime();
}

async function dispatchDailyBackup() {
  try {
    const result = await runBackup();
    if (result.ok) {
      await sendTelegramMessage(`💾 <b>Backup completed</b>\n${result.filePath}\nrepo: ${process.env.BACKUP_REPO}`);
    } else if (result.reason !== 'not_configured') {
      await sendTelegramMessage(`⚠️ <b>Backup FAILED</b>\n${result.error || 'unknown error'} (HTTP ${result.status || '—'})`);
    }
  } catch (e) { console.error('[backup] unexpected error:', e); }
  finally {
    const delay = msUntilNext1130pmEAT();
    setTimeout(dispatchDailyBackup, delay);
    console.log(`[backup] Next backup in ${Math.round(delay / 60000)} min`);
  }
}

function startBackupScheduler() {
  const delay = msUntilNext1130pmEAT();
  console.log(`[backup] Nightly backup scheduled in ${Math.round(delay / 60000)} min (23:30 EAT)`);
  setTimeout(dispatchDailyBackup, delay);
}

module.exports = { runBackup, startBackupScheduler };
