# AD's Kitchen Manager — Project Guide

> Mobile-first restaurant management PWA for AD's Kitchen, Kitooro, Entebbe, Uganda.
> Owner: Byron | Currency: UGX | Deployed on Railway

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js (>=18) + Express 4 |
| Frontend | Vanilla HTML / CSS / JS (no framework) — single-page app |
| Database | JSON files on disk (`data/` directory) — no external DB |
| Auth | PIN-based login, scrypt-hashed (`crypto.scryptSync`) |
| PWA | Service worker (cache-first statics, network-first HTML), web manifest |
| Deployment | Railway (Nixpacks builder, persistent volume at `/data`) |
| Notifications | Telegram Bot API (order alerts, daily reconciliation at 21:00 EAT) |
| Backup | Nightly GitHub snapshot at 23:30 EAT via GitHub Contents API |
| Dependencies | Only `express` and `uuid` — deliberately minimal |

---

## Project Structure

```
ads-kitchen/
├── server.js                  # Express entry point (~197 lines)
│                                Middleware, route mounting, alias routes, SPA fallback
│
├── lib/                       # Shared backend modules
│   ├── db.js                  # DATA_DIR, readData/writeData, seedDataDirIfEmpty
│   ├── auth.js                # PIN hashing, login route, rate limiter, migration
│   ├── telegram.js            # sendTelegramMessage, reconciliation builder/scheduler (cash recon nets PO cash payments)
│   ├── backup.js              # GitHub backup snapshot, nightly scheduler
│   ├── stock.js               # Order → portion-map → inventory deduction/restoration helpers
│   └── seed-defaults.js       # Fallback seed data if data-seed/ files missing
│
├── routes/                    # API route modules (all export express.Router)
│   ├── settings.js            # GET/PUT /api/settings, CRUD /api/categories
│   ├── menu.js                # CRUD /api/menu
│   ├── inventory.js           # CRUD /api/inventory + /alerts + /stock-log + /portion-map
│   ├── vendors.js             # CRUD /api/vendors
│   ├── purchases.js           # CRUD /api/purchases + /:id/pay + /payables
│   ├── orders.js              # CRUD /api/orders + /:id/credit-pay
│   ├── expenses.js            # CRUD /api/expenses + /customers sub-routes
│   ├── staff.js               # CRUD /api/staff (PINs auto-hashed, returned as ****)
│   ├── reports.js             # /api/reports/daily, /range, /reconciliation
│   └── public.js              # /api/public/settings, /menu, /orders (online ordering)
│
├── public/                    # Static frontend (served by Express)
│   ├── index.html             # SPA shell — login screen + all page sections (~510 lines)
│   ├── js/app.js              # All frontend logic — IIFE, ~2,600 lines
│   ├── css/style.css          # Dark theme, CSS Grid, responsive (~1,000 lines)
│   ├── sw.js                  # Service worker v3 — cache strategies
│   ├── manifest.json          # PWA manifest (standalone, portrait)
│   └── icons/                 # logo.png (22KB), icon-192.png, icon-512.png
│
├── data-seed/                 # Template data (copied to data/ on first boot)
│   ├── menu.json              # ~28 menu items (walkin + community types)
│   ├── categories.json        # 5 categories with colors
│   ├── inventory.json         # ~16 stock items with reorder levels
│   ├── portion-map.json       # Menu-to-inventory mappings
│   ├── vendors.json           # 3 default vendors
│   ├── staff.json             # 4 default staff (Admin/1234, Waiter/1111, Chef/2222, Cashier/3333)
│   ├── settings.json          # Restaurant name, location, phone, currency
│   ├── orders.json            # Empty
│   ├── expenses.json          # Empty
│   ├── purchases.json         # Empty
│   └── customers.json         # Empty
│
├── data/                      # Runtime data (gitignored, persistent volume on Railway)
├── package.json               # Only express + uuid
├── railway.json               # Nixpacks, node server.js, port 3000
└── .gitignore
```

---

## API Endpoints

### Mounted Route Modules

| Mount Path | Router File | Key Endpoints |
|---|---|---|
| `/api/auth` | `lib/auth.js` | `POST /login` |
| `/api` | `routes/settings.js` | `GET/PUT /settings`, CRUD `/categories` |
| `/api/menu` | `routes/menu.js` | CRUD `/` (filter by `?menuType=`) |
| `/api/inventory` | `routes/inventory.js` | CRUD `/`, `POST /:id/adjust`, `GET /alerts`, `GET /stock-log`, CRUD `/portion-map` |
| `/api/vendors` | `routes/vendors.js` | CRUD `/` |
| `/api/purchases` | `routes/purchases.js` | CRUD `/`, `POST /:id/pay`, `GET /payables` |
| `/api/orders` | `routes/orders.js` | CRUD `/`, `POST /:id/credit-pay` (POST deducts stock per portion-map; 400 on shortage. DELETE restores stock.) |
| `/api/expenses` | `routes/expenses.js` | CRUD `/`, CRUD `/customers` |
| `/api/staff` | `routes/staff.js` | CRUD `/` (PINs masked in responses) |
| `/api/reports` | `routes/reports.js` | `GET /daily`, `GET /range`, `GET /reconciliation`, `POST /reconciliation/send` |
| `/api/public` | `routes/public.js` | `GET /settings`, `GET /menu`, `POST /orders` (rate-limited) |

### Alias Routes (inline in server.js)

These exist because the frontend calls them at paths that don't map neatly to a single router:

| Path | Purpose |
|---|---|
| `GET /api/kitchen` | Active orders (status: new/preparing) for kitchen display |
| `PUT /api/kitchen/:id/status` | Update order status from kitchen |
| `GET /api/dashboard` | Today's snapshot: revenue, orders, expenses, low stock |
| `GET /api/notifications` | Polling for kitchen/waiter alerts (`?role=kitchen&since=ISO`) |
| `GET /api/receivables` | Credit sales aging analysis |
| `GET /api/payables` | 307 redirect to `/api/purchases/payables` |
| `GET /api/stock-log` | Direct stock-log.json read |
| `GET /api/portion-map` | 307 redirect to `/api/inventory/portion-map` |
| `GET/POST/PUT /api/customers` | Direct customer CRUD |
| `POST /api/backup/run` | Manual backup trigger (requires token) |

---

## Key Data Schemas

### Order
```
id, orderNumber, date (YYYY-MM-DD), createdAt, status (new|preparing|ready|served),
paymentStatus (paid|unpaid|credit), paymentMethod (cash|mobile_money|card|credit),
items [{menuId, name, price, quantity, accompaniments?, notes?}],
total, staffId, staffName, table, customerName, customerPhone,
source (walkin|online), type (dine-in|pickup|delivery), menuType (walkin|community|online),
creditAmountPaid, creditPayments [{id, amount, method, date}]
```

### Inventory Item
```
id, name, unit, quantity, reorderLevel, costPerUnit, category,
standardPortions (optional), costPerPortion (optional)
```

### Staff
```
id, name, role (manager|waiter|kitchen|cashier), pin (scrypt hash), active
```

---

## What Has Been Built (Working)

- **Full POS system** — 3-column layout (controls | menu grid | cart), menu type toggle (walk-in vs community), category filtering, search
- **Accompaniments workflow** — Local stews and community menu items prompt for sides (max 5 of 7: Matooke, Rice, Posho, Cassava, Yams, Pumpkin, Greens) + chef notes text box
- **Kitchen display** — Real-time order cards with status progression, auto-refresh every 3 seconds, sound + vibration alerts
- **Order management** — Full lifecycle: create, status updates, payment recording, credit tracking with partial payments
- **Inventory** — Stock levels, reorder alerts, adjustment logging with reasons, menu-to-stock portion mapping for COGS calculation
- **Procurement** — Purchase orders with vendor tracking, auto-inventory update on receipt, payment tracking, payables aging
- **Financial reports** — Daily P&L with COGS breakdown, date-range analysis, item-level margins, waiter performance, payment method splits
- **Cash reconciliation** — Auto-sent via Telegram at 21:00 EAT, shows cash/mobile/card breakdown and expected cash in hand. Cash movement nets out **both** cash expenses AND cash payments made against purchase orders on that date (mobile/card PO payments excluded from cash deduction).
- **Inventory auto-deduction** — When an order is sent (POST `/api/orders` or `/api/public/orders`), the portion map is consulted and stock is deducted in inventory units (`portionsUsed / standardPortions`). Insufficient stock returns 400 with a per-item shortage list. Deleting an order restores stock. All movements logged to `stock-log.json` with reason codes `order:<num>` / `order-delete:<num>` / `online-order:<num>`.
- **Staff management** — Role-based access control, PIN login with scrypt hashing, brute-force rate limiting
- **Online ordering API** — Public endpoints for customer-facing ordering app, rate-limited, server-side price validation, Telegram notification on new orders
- **Nightly GitHub backup** — 23:30 EAT, snapshots all JSON data files to private repo
- **PWA** — Installable, offline-capable (cache-first for statics), custom icons
- **Performance** — Logo compressed 365KB→22KB, HTTP cache headers, service worker precaching

---

## Key Decisions Made

1. **JSON files over SQLite/Postgres** — Byron's Windows dev environment lacks Visual Studio build tools needed for `better-sqlite3`. JSON files work everywhere, no native compilation. Persistent volume on Railway at `/data`.

2. **Scrypt over bcrypt for PIN hashing** — Node.js `crypto` module built-in, zero dependencies. Format: `scrypt$<salt_b64>$<hash_b64>`. Constant-time comparison via `timingSafeEqual`.

3. **No frontend framework** — Single `app.js` IIFE keeps things simple. Staff use phones with varying specs; minimal JS = faster loads.

4. **Modular server split** — Original 1,775-line `server.js` split into 16 files (lib/ + routes/) for token efficiency and maintainability. Alias routes kept inline in server.js where they don't map cleanly to a single router.

5. **Cache-first service worker** — Static assets served from cache instantly with background revalidation. API calls always go to network. HTML uses network-first.

6. **307 redirects for cross-router aliases** — `/api/payables` and `/api/portion-map` redirect to their canonical router paths rather than duplicating logic.

7. **East Africa Time (EAT = UTC+3)** — All scheduled tasks (reconciliation, backup) use EAT. Date calculations in `todayInEAT()` function.

8. **Seed data strategy** — `data-seed/` contains templates. On first boot, `seedDataDirIfEmpty()` copies them to `data/`. If seed files don't exist either, `seed-defaults.js` creates them in memory.

9. **Stock deducted at order creation, not at "preparing"** — When the waiter sends an order to the kitchen, inventory is deducted immediately and the request is rejected with HTTP 400 if any line lacks stock. Considered the alternative of deducting only when the chef marks the ticket "preparing"; rejected because the customer would already be committed before the system noticed the stock-out. Restoration on order delete keeps the books honest. Single helper module: [lib/stock.js](lib/stock.js).

10. **One-time POS event bindings via `posInitialized` flag** — `loadOrderBuilder()` previously re-bound cart `+/-`, menu-type toggle, and search listeners on every login. Because logout doesn't reload the page, repeated logins stacked listeners and made the cart counter advance N× per click. A module-level `posInitialized` boolean now gates the bindings to one-time setup; render functions still re-run each call.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 3000) |
| `DATA_DIR` | Yes (Railway) | Path to persistent data directory. Railway: `/data` |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token for notifications |
| `TELEGRAM_CHAT_ID` | No | Telegram chat ID for notifications |
| `BACKUP_GITHUB_TOKEN` | No | GitHub PAT for nightly backup |
| `BACKUP_REPO` | No | GitHub repo (`owner/repo`) for backup storage |
| `BACKUP_BRANCH` | No | Branch name for backups (default: `main`) |

---

## Running Locally

```bash
cd ads-kitchen
npm install
node server.js
# Open http://localhost:3000
# Login with PIN: 1234 (admin)
```

Data is stored in `./data/` (auto-created from `data-seed/` on first run).

---

## Deployment (Railway)

- Connected to GitHub repo `byronmaty-arch/ads-kitchen`
- Auto-deploys on push to `main`
- Persistent volume mounted at `/data` (set `DATA_DIR=/data` in Railway env vars)
- `railway.json` configures Nixpacks builder + `node server.js` start command

---

## What's Still In Progress / Next Steps

- **Online ordering frontend** — Public API (`/api/public/*`) is built and working, but the customer-facing web app that calls it hasn't been built yet
- **Receipt printing** — Receipt generation UI exists but physical printer integration not connected
- **Marketing/analytics** — No customer analytics, loyalty tracking, or marketing automation yet
- **Multi-branch support** — Currently single-restaurant; Byron has 3 branches that could eventually share the system
- **Testing** — No automated test suite; all testing is manual via API + UI
- **Image uploads** — Menu items don't have photos yet; `img/` directory has some product images but they're not wired into the menu system

---

## Common Tasks

**Add a new API endpoint:**
1. Create or edit the relevant file in `routes/`
2. If it's a new router, mount it in `server.js` under `// --- Mount Route Modules ---`
3. Add the frontend call in `public/js/app.js`

**Add a new page/section:**
1. Add the HTML section in `public/index.html` inside `<div id="pages">`
2. Add a nav button in the sidebar
3. Add the load function in `public/js/app.js`
4. Add the route in `navigateTo()` switch statement
5. Add CSS in `public/css/style.css`

**Modify seed data:**
Edit files in `data-seed/`. These are only used on first boot (when `data/` is empty). For existing deployments, use the API or edit `data/*.json` directly.

**Debug a route:**
Each route file is self-contained. Find the mount path in `server.js`, then read the corresponding file in `routes/`. Alias routes are inline in `server.js` (search for "Alias routes").
