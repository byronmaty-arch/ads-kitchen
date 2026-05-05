// ⚠️ TEMPORARY — added 2026-05-05 alongside the factory-reset endpoint.
// REMOVE AFTER WEDNESDAY 2026-05-06 MORNING VERIFICATION.
// See ads-kitchen/CLAUDE.md → "Pending Cleanup" for the full removal checklist.
//
// One-shot menu importer that adds the AD's Kitchen Glovo menu items to
// data/menu.json. Items + prices captured 2026-05-05 from
// https://glovoapp.com/en/ug/entebbe/stores/ads-kitchen-ebb.
//
// Items are added with menuType='online' (Glovo is a third-party online
// delivery channel) and category set to the Glovo section name so reports
// can attribute revenue back to Glovo.
//
// Idempotent: skips any item where a row with the same (name, menuType)
// already exists. Safe to re-run.

const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('./db');

const MENU_TYPE = 'online';

// 16 unique items across 4 categories. "Chips Chicken plus mango juice"
// appeared twice on Glovo (Top Sellers + Meals with Mango Juice) — same
// physical dish, listed once here.
const GLOVO_ITEMS = [
  // Meals with Mango Juice
  { name: 'Chips Chicken plus mango juice', price: 23000, category: 'Glovo — Meals with Mango Juice', description: 'Crispy fries served with juicy fried chicken' },
  { name: 'Chips Liver plus mango juice',   price: 30000, category: 'Glovo — Meals with Mango Juice', description: 'Deep-fried chips paired with savory liver' },
  { name: 'Chips Goat plus mango juice',    price: 25000, category: 'Glovo — Meals with Mango Juice', description: 'A delicious serving of goat meat with crispy fries' },
  { name: 'Chips Beef plus mango juice',    price: 20000, category: 'Glovo — Meals with Mango Juice', description: 'Golden chips served with tender, flavorful beef' },

  // Breakfast
  { name: 'Plain Chips', price: 10000, category: 'Glovo — Breakfast', description: 'Crispy golden fries served hot' },
  { name: 'Omelette',    price:  6000, category: 'Glovo — Breakfast', description: 'Fluffy eggs cooked to perfection with optional vegetables' },
  { name: 'Chapati',     price:  4000, category: 'Glovo — Breakfast', description: 'Golden, flaky, and full of flavor — our pan-fried chapati is the perfect side or standalone snack' },

  // Fast Food
  { name: 'Double portions Pilao, Chips and Chicken', price: 38000, category: 'Glovo — Fast Food', description: 'Enjoy our flavorful chicken with double portions of pilao and chips with freshly squeezed Juice. Best for a hungry stomach!' },
  { name: 'Chips Liver',           price: 30000, category: 'Glovo — Fast Food', description: 'Deep-fried chips paired with savory liver' },
  { name: 'Chips Goat',            price: 25000, category: 'Glovo — Fast Food', description: 'A delicious serving of goat meat with crispy fries' },
  { name: 'Chips Chicken',         price: 23000, category: 'Glovo — Fast Food', description: 'Crispy fries served with juicy fried chicken' },
  { name: 'Chips Beef',            price: 20000, category: 'Glovo — Fast Food', description: 'Golden chips served with tender, flavorful beef' },
  { name: '1/2 Chips 1/2 Pilau',   price: 18000, category: 'Glovo — Fast Food', description: 'A satisfying mix of half pilau rice and half chips' },

  // Juice & Soft Drinks
  { name: 'Juice (No Sugar)', price: 13000, category: 'Glovo — Juice & Soft Drinks', description: '100% natural fruit juice with no added sugar' },
  { name: 'Cocktail Juice',   price: 13000, category: 'Glovo — Juice & Soft Drinks', description: 'A refreshing blend of multiple tropical fruits' },
  { name: 'Juice',            price:  6500, category: 'Glovo — Juice & Soft Drinks', description: 'Freshly made juice with just the right sweetness' },
];

const CONFIRM_PHRASE = 'yes import glovo';

async function runImportGlovoMenu({ confirm, dryRun = false }) {
  if (confirm !== CONFIRM_PHRASE) {
    return { ok: false, error: 'confirm phrase mismatch' };
  }

  const existing = readData('menu.json');
  const seen = new Set(existing.map((i) => `${(i.name || '').toLowerCase()}|${i.menuType || ''}`));

  const toAdd = [];
  const skipped = [];
  for (const it of GLOVO_ITEMS) {
    const key = `${it.name.toLowerCase()}|${MENU_TYPE}`;
    if (seen.has(key)) {
      skipped.push(it.name);
      continue;
    }
    toAdd.push({
      id: uuidv4(),
      name: it.name,
      price: it.price,
      category: it.category,
      description: it.description,
      menuType: MENU_TYPE,
      active: true,
    });
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      existing_count: existing.length,
      to_add: toAdd.map(({ name, price, category }) => ({ name, price, category })),
      skipped,
    };
  }

  if (toAdd.length === 0) {
    return { ok: true, dryRun: false, added: 0, skipped, note: 'No new items to add — all Glovo items already exist with menuType=online.' };
  }

  const updated = [...existing, ...toAdd];
  writeData('menu.json', updated);

  return {
    ok: true,
    dryRun: false,
    added: toAdd.length,
    skipped,
    new_total: updated.length,
    items_added: toAdd.map(({ id, name, price, category }) => ({ id, name, price, category })),
  };
}

module.exports = { runImportGlovoMenu, GLOVO_ITEMS };
