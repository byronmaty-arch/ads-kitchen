// --- JSON File Storage Helpers ---
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SEED_DIR = path.join(__dirname, '..', 'data-seed');

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

module.exports = { DATA_DIR, SEED_DIR, seedDataDirIfEmpty, readData, writeData, readConfig, writeConfig };
