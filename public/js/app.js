// ===== AD's Kitchen Manager - Frontend Application =====
(function () {
  'use strict';

  // --- State ---
  let currentUser = null;
  let sessionToken = null;
  let currentPage = 'dashboard';
  let cart = [];
  let menuItems = [];
  let categories = [];
  let settings = {};
  let kitchenRefreshTimer = null;
  let currentMenuType = 'walkin'; // 'walkin' | 'community' | 'glovo'

  // Map a menuType code to its display name. Centralised so all badges,
  // headers, and labels stay consistent.
  function menuTypeLabel(t) {
    if (t === 'community') return 'Community';
    if (t === 'glovo')     return 'Glovo';
    if (t === 'both')      return 'Both';
    if (t === 'online')    return 'Online';
    return 'Walk-in';
  }
  function menuTypeShort(t) {
    if (t === 'community') return 'Comm';
    if (t === 'glovo')     return 'Glovo';
    if (t === 'both')      return 'Both';
    if (t === 'online')    return 'Online';
    return 'Walk';
  }

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  function isAdmin() { return currentUser && currentUser.role === 'manager'; }
  function isWaiter() { return currentUser && currentUser.role === 'waiter'; }
  function myStaffParam() { return isWaiter() ? `staffId=${currentUser.id}` : ''; }

  // --- API Helper ---
  async function api(path, opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(sessionToken ? { 'X-Session-Token': sessionToken } : {})
    };
    const res = await fetch(`/api${path}`, {
      ...opts,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (res.status === 401 && path !== '/auth/login') {
      // Session expired or invalidated — force back to login screen
      sessionToken = null;
      currentUser = null;
      $('#app').classList.add('hidden');
      $('#login-screen').classList.add('active');
      toast('Session expired. Please log in again.');
      throw new Error('Session expired');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  }

  function fmt(amount) {
    return 'UGX ' + Number(amount || 0).toLocaleString('en-UG');
  }

  function fmtQty(n) {
    if (n == null || isNaN(n)) return '0';
    return String(Math.round(Number(n) * 1000) / 1000);
  }

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function today() { return new Date().toISOString().split('T')[0]; }

  // --- Toast ---
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 2500);
  }

  // --- Modal ---
  function openModal(title, html) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = html;
    $('#modal').classList.remove('hidden');
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
  }

  // --- LOGIN ---
  let pin = '';
  function initLogin() {
    $$('.pin-btn[data-num]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (pin.length >= 4) return;
        pin += btn.dataset.num;
        updatePinDots();
        if (pin.length === 4) attemptLogin();
      });
    });
    $('#pin-delete').addEventListener('click', () => {
      pin = pin.slice(0, -1);
      updatePinDots();
    });
  }

  function updatePinDots() {
    $$('.pin-dot').forEach((dot, i) => {
      dot.classList.toggle('filled', i < pin.length);
    });
  }

  async function attemptLogin() {
    try {
      const result = await api('/auth/login', { method: 'POST', body: { pin } });
      sessionToken = result.token;
      currentUser = { id: result.id, name: result.name, role: result.role };
      $('#login-screen').classList.remove('active');
      $('#app').classList.remove('hidden');
      $('#staff-name').textContent = currentUser.name;
      loadApp();
    } catch (e) {
      if (e.message !== 'Session expired') {
        $('#login-error').textContent = 'Invalid PIN. Try again.';
        pin = '';
        updatePinDots();
        setTimeout(() => { $('#login-error').textContent = ''; }, 2000);
      }
    }
  }

  // --- NAVIGATION ---
  function initNav() {
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.id === 'nav-more-btn') {
          toggleDrawer();
          return;
        }
        navigateTo(btn.dataset.page);
      });
    });

    $$('.drawer-item').forEach(btn => {
      btn.addEventListener('click', () => {
        navigateTo(btn.dataset.page);
        toggleDrawer(false);
      });
    });

    $$('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.goto));
    });

    // Drawer overlay close
    const drawer = $('#more-drawer');
    drawer.querySelector('.drawer-overlay').addEventListener('click', () => toggleDrawer(false));
    drawer.querySelector('.drawer-close').addEventListener('click', () => toggleDrawer(false));

    // Modal close
    $('#modal').querySelector('.modal-overlay').addEventListener('click', closeModal);
    $('#modal').querySelector('.modal-close').addEventListener('click', closeModal);

    // Logout
    $('#btn-logout').addEventListener('click', () => {
      // Invalidate server-side session (fire-and-forget)
      if (sessionToken) api('/auth/logout', { method: 'POST' }).catch(() => {});
      sessionToken = null;
      currentUser = null;
      pin = '';
      updatePinDots();
      $('#app').classList.add('hidden');
      $('#login-screen').classList.add('active');
      clearInterval(kitchenRefreshTimer);
      stopNotificationPolling();
    });

    // Sub tabs
    document.addEventListener('click', e => {
      const tab = e.target.closest('.sub-tab');
      if (!tab) return;
      const parent = tab.parentElement;
      const page = parent.closest('.page');
      parent.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      page.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
      $(`#subtab-${tab.dataset.subtab}`, page).classList.add('active');

      // Refresh data when switching to specific tabs
      if (tab.dataset.subtab === 'order-list') loadOrders();
      if (tab.dataset.subtab === 'settings-audit') loadAuditLog();
    });
  }

  function navigateTo(page) {
    // Block restricted pages by role
    const role = currentUser && currentUser.role;
    const waiterBlocked = ['kitchen', 'inventory', 'expenses', 'reports', 'procurement', 'customers'];
    const cashierBlocked = ['kitchen', 'inventory', 'customers']; // cashier keeps reports, expenses, procurement
    if (role === 'waiter' && waiterBlocked.includes(page)) {
      page = 'orders';
    } else if (role === 'cashier' && cashierBlocked.includes(page)) {
      page = 'orders';
    }

    currentPage = page;
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${page}`).classList.add('active');

    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    const navBtn = $(`.nav-btn[data-page="${page}"]`);
    if (navBtn) navBtn.classList.add('active');

    const titles = {
      dashboard: 'Dashboard', orders: 'Orders', kitchen: 'Kitchen',
      inventory: 'Inventory', menu: 'Menu', procurement: 'Procurement',
      expenses: 'Expenses', customers: 'Customers', reports: 'Reports',
      staff: 'Staff', settings: 'Settings'
    };
    $('#page-title').textContent = titles[page] || page;

    // Load page data
    const loaders = {
      dashboard: loadDashboard, orders: loadOrders, kitchen: loadKitchen,
      inventory: loadInventory, menu: loadMenuManage, procurement: loadProcurement,
      expenses: loadExpenses, customers: loadCustomers, reports: loadReports,
      staff: loadStaff, settings: loadSettings
    };
    if (loaders[page]) loaders[page]();
  }

  function toggleDrawer(show) {
    const drawer = $('#more-drawer');
    if (show === undefined) show = drawer.classList.contains('hidden');

    // Apply role-based visibility to drawer items
    const adminOnlyPages = ['menu', 'staff', 'settings'];
    const hiddenForKitchen = ['expenses', 'reports'];
    const hiddenForWaiter = ['expenses', 'reports', 'procurement', 'customers'];
    const hiddenForCashier = ['customers']; // cashier keeps reports, expenses, procurement
    const role = currentUser && currentUser.role;

    $$('.drawer-item', drawer).forEach(item => {
      const page = item.dataset.page;
      if (adminOnlyPages.includes(page)) {
        item.style.display = isAdmin() ? '' : 'none';
      } else if (role === 'kitchen' && hiddenForKitchen.includes(page)) {
        item.style.display = 'none';
      } else if (role === 'waiter' && hiddenForWaiter.includes(page)) {
        item.style.display = 'none';
      } else if (role === 'cashier' && hiddenForCashier.includes(page)) {
        item.style.display = 'none';
      } else {
        item.style.display = '';
      }
    });

    drawer.classList.toggle('hidden', !show);
  }

  function applyNavVisibility() {
    const role = currentUser && currentUser.role;
    $$('.nav-btn').forEach(btn => {
      const page = btn.dataset.page;
      if ((role === 'waiter' || role === 'cashier') && (page === 'kitchen' || page === 'inventory')) {
        btn.style.display = 'none';
      } else {
        btn.style.display = '';
      }
    });
  }

  // --- LOAD APP ---
  async function loadApp() {
    try {
      [settings, categories, menuItems] = await Promise.all([
        api('/settings'),
        api('/categories'),
        api('/menu')
      ]);
    } catch (e) { console.error(e); }

    // Apply role-based nav visibility on load
    applyNavVisibility();

    populateTableSelect();
    loadDashboard();
    loadOrderBuilder();

    // Start notification alerts for kitchen/waiter
    startNotificationPolling();

    // Auto-refresh kitchen
    kitchenRefreshTimer = setInterval(() => {
      if (currentPage === 'kitchen') loadKitchen();
    }, 10000);
  }

  function populateTableSelect() {
    const sel = $('#order-table');
    sel.innerHTML = '<option value="">No Table</option>';
    for (let i = 1; i <= (settings.tables || 10); i++) {
      sel.innerHTML += `<option value="${i}">Table ${i}</option>`;
    }
  }

  // ===== DASHBOARD =====
  async function loadDashboard() {
    try {
      const staffParam = myStaffParam();
      const d = await api(`/dashboard${staffParam ? '?' + staffParam : ''}`);

      // Hide revenue & profit cards for non-admin
      const revenueCard = $('.stat-revenue');
      const profitCard = $('.stat-profit');
      if (!isAdmin()) {
        revenueCard.classList.add('hidden');
        profitCard.classList.add('hidden');
      } else {
        revenueCard.classList.remove('hidden');
        profitCard.classList.remove('hidden');
      }

      $('#dash-revenue').textContent = fmt(d.todayRevenue);
      $('#dash-orders').textContent = d.todayOrders;
      $('#dash-profit').textContent = fmt(d.todayProfit);
      $('#dash-active').textContent = d.activeOrders;

      // Update labels for waiter — show "My Orders" / "My Active"
      if (isWaiter()) {
        const ordersLabel = $('.stat-orders .stat-label');
        const activeLabel = $('.stat-active .stat-label');
        if (ordersLabel) ordersLabel.textContent = 'My Orders Today';
        if (activeLabel) activeLabel.textContent = 'My Active Orders';
      } else {
        const ordersLabel = $('.stat-orders .stat-label');
        const activeLabel = $('.stat-active .stat-label');
        if (ordersLabel) ordersLabel.textContent = "Today's Orders";
        if (activeLabel) activeLabel.textContent = 'Active Orders';
      }

      const changeEl = $('#dash-revenue-change');
      if (isAdmin()) {
        const change = parseFloat(d.revenueChange);
        if (d.yesterdayRevenue > 0) {
          changeEl.textContent = `${change >= 0 ? '+' : ''}${change}% vs yesterday`;
          changeEl.className = `stat-change ${change >= 0 ? 'up' : 'down'}`;
        } else {
          changeEl.textContent = '';
        }
      } else {
        changeEl.textContent = '';
      }

      // Alerts
      const alertsDiv = $('#dash-alerts');
      const alertsList = $('#dash-alerts-list');
      if (d.lowStockCount > 0 || d.unpaidOrders > 0) {
        alertsDiv.classList.remove('hidden');
        alertsList.innerHTML = '';
        if (d.lowStockCount > 0) {
          alertsList.innerHTML += `<div class="alert-item"><span>${d.lowStockCount} items</span> low in stock: ${d.lowStockItems.join(', ')}</div>`;
        }
        if (d.unpaidOrders > 0) {
          alertsList.innerHTML += `<div class="alert-item"><span>${d.unpaidOrders} unpaid</span> orders today</div>`;
        }
      } else {
        alertsDiv.classList.add('hidden');
      }

      // Recent orders
      const orders = await api(`/orders?date=${today()}`);
      const recent = orders.slice(0, 5);
      $('#dash-recent-orders').innerHTML = recent.length === 0
        ? '<p style="color:var(--text-dim);font-size:13px">No orders today yet</p>'
        : recent.map(o => `
          <div class="recent-order-item">
            <div>
              <span class="order-num">#${o.orderNumber}</span>
              <span class="badge ${o.menuType === 'community' ? 'badge-preparing' : 'badge-new'}">${menuTypeShort(o.menuType)}</span>
              <span class="badge badge-${o.status}">${o.status}</span>
              <span class="badge badge-${o.paymentStatus}">${o.paymentStatus}</span>
            </div>
            <div>
              <span style="font-weight:600">${fmt(o.total)}</span>
              <span class="order-time">${fmtTime(o.createdAt)}</span>
            </div>
          </div>
        `).join('');
    } catch (e) { console.error(e); }
  }

  // ===== POS ORDER BUILDER (Square-style) =====
  let posClockTimer = null;
  let posSearchTerm = '';
  let posActiveCategory = 'all';
  let posInitialized = false; // guard one-time event bindings against re-login double-binding

  function loadOrderBuilder() {
    if (!posInitialized) {
      initMenuTypeToggle();
      initCartEvents();
      initPosSearch();
      posInitialized = true;
    }
    renderPosCategories();
    renderMenuGrid();
    updatePosWaiter();
    startPosClock();
  }

  function startPosClock() {
    if (posClockTimer) clearInterval(posClockTimer);
    const update = () => {
      const el = $('#pos-clock');
      if (el) el.textContent = new Date().toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' });
    };
    update();
    posClockTimer = setInterval(update, 30000);
  }

  function updatePosWaiter() {
    const el = $('#pos-waiter-name');
    if (el && currentUser) {
      el.querySelector('span:last-child').textContent = currentUser.name;
    }
  }

  function initMenuTypeToggle() {
    $$('.menu-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (currentMenuType !== btn.dataset.menu && cart.length > 0) {
          if (!confirm('Switching menu will clear your current cart. Continue?')) return;
          cart = [];
          renderCart();
        }
        currentMenuType = btn.dataset.menu;
        $$('.menu-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        posActiveCategory = 'all';
        renderPosCategories();
        renderMenuGrid();
      });
    });
  }

  function renderPosCategories() {
    const relevantItems = menuItems.filter(m => m.active && (m.menuType === currentMenuType || m.menuType === 'both'));
    const relevantCatIds = new Set(relevantItems.map(m => m.category));
    const relevantCats = categories.filter(c => relevantCatIds.has(c.id));

    const catIcons = {
      'Top Sellers': 'local_fire_department', 'Local Stews': 'soup_kitchen',
      'Breakfast': 'free_breakfast', 'Drinks': 'local_bar', 'Curries': 'lunch_dining',
      'Fast Food': 'fastfood', 'Sides': 'rice_bowl'
    };

    const container = $('#pos-categories');
    container.innerHTML = `
      <button class="pos-cat-btn ${posActiveCategory === 'all' ? 'active' : ''}" data-cat="all">
        <span class="material-icons-round">restaurant_menu</span>
        <span>All</span>
      </button>
    ` + relevantCats.map(c => `
      <button class="pos-cat-btn ${posActiveCategory === c.id ? 'active' : ''}" data-cat="${c.id}">
        <span class="material-icons-round">${catIcons[c.name] || 'restaurant'}</span>
        <span>${c.name}</span>
      </button>
    `).join('');

    $$('.pos-cat-btn', container).forEach(btn => {
      btn.addEventListener('click', () => {
        posActiveCategory = btn.dataset.cat;
        $$('.pos-cat-btn', container).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderMenuGrid();
      });
    });
  }

  function initPosSearch() {
    const searchEl = $('#pos-search');
    if (!searchEl) return;
    searchEl.addEventListener('input', (e) => {
      posSearchTerm = e.target.value.toLowerCase().trim();
      renderMenuGrid();
    });
  }

  function renderMenuGrid() {
    let items = menuItems.filter(m => m.active && (m.menuType === currentMenuType || m.menuType === 'both'));
    if (posActiveCategory !== 'all') items = items.filter(m => m.category === posActiveCategory);
    if (posSearchTerm) items = items.filter(m => m.name.toLowerCase().includes(posSearchTerm));

    const grid = $('#menu-grid');
    grid.innerHTML = items.length === 0
      ? '<div style="grid-column:1/-1;text-align:center;color:var(--text-dim);padding:40px 20px"><span class="material-icons-round" style="font-size:40px;display:block;margin-bottom:8px">search_off</span>No items found</div>'
      : items.map(m => {
        const inCart = cart.find(c => c.menuId === m.id);
        return `
        <div class="menu-item-card" data-id="${m.id}">
          ${inCart ? `<span class="item-qty-badge">${inCart.quantity}</span>` : ''}
          <span class="item-name">${m.name}</span>
          <span class="item-price">${fmt(m.price)}</span>
          <span class="item-desc">${m.description || ''}</span>
        </div>
      `}).join('');

    $$('.menu-item-card', grid).forEach(card => {
      card.addEventListener('click', () => {
        addToCart(card.dataset.id);
        // Quick visual feedback
        card.classList.add('just-added');
        setTimeout(() => card.classList.remove('just-added'), 300);
      });
    });
  }

  // --- Accompaniments (Local Stews + Community menu items) ---
  const ACCOMPANIMENTS = ['Matooke', 'Rice', 'Posho', 'Cassava', 'Yams', 'Sweet Potatoes', 'Pumpkin', 'Greens'];
  const MAX_ACCOMPANIMENTS = 5;

  function itemNeedsAccompaniments(item) {
    // Community menu: every item needs accompaniments
    if (currentMenuType === 'community') return true;
    // Walk-in menu: only "Local Stews" category
    const cat = categories.find(c => c.id === item.category);
    return !!(cat && cat.name === 'Local Stews');
  }

  function cartLineSignature(menuId, accompaniments, notes) {
    const accKey = (accompaniments || []).slice().sort().join(',');
    return `${menuId}|${accKey}|${(notes || '').trim()}`;
  }

  function addToCart(menuId) {
    const item = menuItems.find(m => m.id === menuId);
    if (!item) return;
    if (itemNeedsAccompaniments(item)) {
      openAccompanimentsModal(item, (acc, notes) => addCartLine(item, acc, notes));
    } else {
      addCartLine(item, [], '');
    }
  }

  function addCartLine(item, accompaniments, notes) {
    const sig = cartLineSignature(item.id, accompaniments, notes);
    const existing = cart.find(c => cartLineSignature(c.menuId, c.accompaniments, c.notes) === sig);
    if (existing) {
      existing.quantity++;
    } else {
      cart.push({
        menuId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        accompaniments: accompaniments || [],
        notes: notes || ''
      });
    }
    renderCart();
    renderMenuGrid();
  }

  function openAccompanimentsModal(item, onConfirm) {
    const html = `
      <div class="accomp-intro">
        <div class="accomp-item-name">${item.name}</div>
        <div class="accomp-hint">Tick up to ${MAX_ACCOMPANIMENTS} sides the customer wants</div>
      </div>
      <div class="accomp-grid" id="accomp-grid">
        ${ACCOMPANIMENTS.map(a => `
          <label class="accomp-chip">
            <input type="checkbox" value="${a}">
            <span>${a}</span>
          </label>
        `).join('')}
      </div>
      <div class="accomp-notes">
        <label class="accomp-notes-label" for="accomp-notes-input">
          <span class="material-icons-round">sticky_note_2</span>
          Notes for chef (optional)
        </label>
        <textarea id="accomp-notes-input" class="accomp-notes-input" rows="2"
          placeholder="e.g. extra spicy, no onions, well done, no salt..."></textarea>
      </div>
      <div class="accomp-actions">
        <button type="button" class="btn btn-outline" id="accomp-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="accomp-confirm">
          <span class="material-icons-round">add_shopping_cart</span>
          Add to Order
        </button>
      </div>
    `;
    openModal(`${item.name}`, html);

    const grid = $('#accomp-grid');
    // Enforce max-5 selection and apply visual states
    function refreshChipStates() {
      const checked = $$('input[type=checkbox]:checked', grid);
      const atMax = checked.length >= MAX_ACCOMPANIMENTS;
      $$('input[type=checkbox]', grid).forEach(cb => {
        const chip = cb.closest('.accomp-chip');
        cb.disabled = !cb.checked && atMax;
        chip.classList.toggle('is-checked', cb.checked);
        chip.classList.toggle('is-disabled', !cb.checked && atMax);
      });
    }
    grid.addEventListener('change', refreshChipStates);

    $('#accomp-cancel').addEventListener('click', closeModal);
    $('#accomp-confirm').addEventListener('click', () => {
      const selected = $$('input[type=checkbox]:checked', grid).map(cb => cb.value);
      const notes = ($('#accomp-notes-input').value || '').trim();
      closeModal();
      onConfirm(selected, notes);
    });
  }

  function renderCart() {
    const sendBtn = $('#btn-send-kitchen');
    if (cart.length === 0) {
      $('#cart-items').innerHTML = `
        <div class="pos-empty-cart">
          <span class="material-icons-round">add_shopping_cart</span>
          <p>Tap items to add</p>
        </div>
      `;
      $('#cart-count').textContent = '0';
      $('#cart-total').textContent = 'UGX 0';
      if (sendBtn) sendBtn.disabled = true;
      return;
    }
    if (sendBtn) sendBtn.disabled = false;
    const total = cart.reduce((s, c) => s + c.price * c.quantity, 0);
    const itemCount = cart.reduce((s, c) => s + c.quantity, 0);
    $('#cart-count').textContent = itemCount;
    $('#cart-total').textContent = fmt(total);
    $('#cart-items').innerHTML = cart.map((c, i) => {
      const accChips = (c.accompaniments && c.accompaniments.length)
        ? `<div class="cart-item-accomp">${c.accompaniments.map(a => `<span class="cart-chip">${a}</span>`).join('')}</div>`
        : '';
      const notesHtml = c.notes
        ? `<div class="cart-item-notes"><span class="material-icons-round">sticky_note_2</span>${c.notes}</div>`
        : '';
      const isComplex = accChips || notesHtml;
      return `
        <div class="cart-item ${isComplex ? 'cart-item-complex' : ''}">
          <div class="cart-item-info">
            <div class="cart-item-name">${c.name}</div>
            <div class="cart-item-price">${fmt(c.price)}</div>
            ${accChips}
            ${notesHtml}
          </div>
          <div class="cart-qty-controls">
            <button class="qty-btn" data-idx="${i}" data-act="dec">−</button>
            <span class="cart-qty">${c.quantity}</span>
            <button class="qty-btn" data-idx="${i}" data-act="inc">+</button>
          </div>
          <div class="cart-item-total">${fmt(c.price * c.quantity)}</div>
        </div>
      `;
    }).join('');
  }

  function initCartEvents() {
    $('#cart-items').addEventListener('click', e => {
      const btn = e.target.closest('.qty-btn');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      if (btn.dataset.act === 'inc') cart[idx].quantity++;
      else {
        cart[idx].quantity--;
        if (cart[idx].quantity <= 0) cart.splice(idx, 1);
      }
      renderCart();
      renderMenuGrid(); // refresh qty badges
    });

    $('#btn-clear-cart').addEventListener('click', () => {
      if (cart.length > 0 && !confirm('Clear entire order?')) return;
      cart = [];
      renderCart();
      renderMenuGrid();
    });

    $('#btn-send-kitchen').addEventListener('click', sendToKitchen);

    // Mobile: tap the order header (drag handle area) to expand/collapse the bottom sheet.
    // On desktop/tablet the .expanded class is ignored because the sheet isn't fixed.
    const orderCol = $('#pos-col-order');
    const orderHeader = $('#pos-order-header');
    if (orderHeader && orderCol) {
      orderHeader.addEventListener('click', (e) => {
        // Don't toggle when tapping the clear button inside the header
        if (e.target.closest('#btn-clear-cart')) return;
        orderCol.classList.toggle('expanded');
      });
    }
  }

  async function sendToKitchen() {
    if (cart.length === 0) return;
    const total = cart.reduce((s, c) => s + c.price * c.quantity, 0);
    const order = {
      type: $('#order-type').value,
      menuType: currentMenuType,
      table: $('#order-table').value || null,
      customerName: $('#order-customer').value || null,
      items: cart.map(c => ({
        menuId: c.menuId,
        name: c.name,
        price: c.price,
        quantity: c.quantity,
        accompaniments: c.accompaniments || [],
        notes: c.notes || ''
      })),
      total,
      staffId: currentUser.id,
      staffName: currentUser.name
    };

    const sendBtn = $('#btn-send-kitchen');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="material-icons-round">hourglass_top</span> Sending...';

    try {
      const result = await api('/orders', { method: 'POST', body: order });
      cart = [];
      renderCart();
      renderMenuGrid();
      $('#order-customer').value = '';
      toast(`Order #${result.orderNumber} sent to kitchen!`);
      // Brief success state on button
      sendBtn.innerHTML = '<span class="material-icons-round">check_circle</span> Sent!';
      sendBtn.style.background = 'var(--success)';
      setTimeout(() => {
        sendBtn.innerHTML = '<span class="material-icons-round">send</span> Send to Kitchen';
        sendBtn.style.background = '';
        sendBtn.disabled = true;
      }, 1500);
    } catch (e) {
      toast('Error: ' + e.message);
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<span class="material-icons-round">send</span> Send to Kitchen';
    }
  }

  // ===== ORDER LIST =====
  let allDayOrders = []; // cached for waiter filtering & reconciliation

  async function loadOrders() {
    const dateFilter = $('#orders-date-filter');
    if (!dateFilter.value) dateFilter.value = today();

    // Waiters only see their own orders — hide waiter filter, show personal recon
    const waiterFilter = $('#orders-waiter-filter');
    const reconBtn = $('#btn-waiter-summary');
    if (isWaiter()) {
      waiterFilter.style.display = 'none';
      reconBtn.innerHTML = '<span class="material-icons-round" style="font-size:16px;vertical-align:middle">summarize</span> My Summary';
    } else {
      waiterFilter.style.display = '';
      reconBtn.innerHTML = '<span class="material-icons-round" style="font-size:16px;vertical-align:middle">summarize</span> Waiter Recon';
    }

    const loadList = async () => {
      let url = '/orders?date=' + dateFilter.value;
      const statusVal = $('#orders-status-filter').value;
      if (statusVal) url += '&status=' + statusVal;
      const staffParam = myStaffParam();
      if (staffParam) url += '&' + staffParam;
      const orders = await api(url);
      allDayOrders = orders;

      // Populate waiter dropdown (non-waiter roles only)
      if (!isWaiter()) {
        const currentVal = waiterFilter.value;
        const waiters = [...new Set(orders.map(o => o.staffName).filter(Boolean))].sort();
        waiterFilter.innerHTML = '<option value="">All Waiters</option>' +
          waiters.map(w => `<option value="${w}" ${w === currentVal ? 'selected' : ''}>${w}</option>`).join('');

        // Apply waiter filter
        const waiterVal = waiterFilter.value;
        const filtered = waiterVal ? orders.filter(o => o.staffName === waiterVal) : orders;
        renderOrderList(filtered);
      } else {
        renderOrderList(orders);
      }
    };

    dateFilter.onchange = () => { hideWaiterRecon(); loadList(); };
    $('#orders-status-filter').onchange = loadList;
    if (!isWaiter()) {
      $('#orders-waiter-filter').onchange = () => {
        const waiterVal = $('#orders-waiter-filter').value;
        const filtered = waiterVal ? allDayOrders.filter(o => o.staffName === waiterVal) : allDayOrders;
        renderOrderList(filtered);
      };
    }
    $('#btn-waiter-summary').onclick = isWaiter() ? toggleMyRecon : toggleWaiterRecon;
    await loadList();
  }

  function hideWaiterRecon() {
    const panel = $('#waiter-recon-panel');
    if (panel) { panel.classList.add('hidden'); panel.innerHTML = ''; }
  }

  async function toggleWaiterRecon() {
    const panel = $('#waiter-recon-panel');
    if (!panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }

    panel.classList.remove('hidden');
    panel.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Loading reconciliation…</div>';

    try {
      const date = $('#orders-date-filter').value;

      // Fetch full reconciliation (all orders + expenses + credit settlements) and all unfiltered orders
      const [recon, allOrders] = await Promise.all([
        api(`/reports/reconciliation?date=${date}`),
        api(`/orders?date=${date}`)
      ]);

      // Build waiter breakdown from ALL orders for the day (not the status-filtered allDayOrders)
      const waiterData = {};
      allOrders.forEach(o => {
        const name = o.staffName || 'Unknown';
        if (!waiterData[name]) {
          waiterData[name] = {
            waiter: name,
            totalOrders: 0, totalRevenue: 0, totalItems: 0,
            paid: { count: 0, amount: 0 },
            unpaid: { count: 0, amount: 0 },
            credit: { count: 0, amount: 0 },
            methods: {}
          };
        }
        const wd = waiterData[name];
        wd.totalOrders++;
        wd.totalRevenue += o.total || 0;
        (o.items || []).forEach(i => { wd.totalItems += i.quantity; });

        if (o.paymentStatus === 'paid') {
          wd.paid.count++;
          wd.paid.amount += o.total || 0;
          const method = o.paymentMethod || 'cash';
          wd.methods[method] = (wd.methods[method] || 0) + (o.total || 0);
        } else if (o.paymentStatus === 'credit') {
          wd.credit.count++;
          wd.credit.amount += o.total || 0;
        } else {
          wd.unpaid.count++;
          wd.unpaid.amount += o.total || 0;
        }
      });

      const waiters = Object.values(waiterData).sort((a, b) => b.totalRevenue - a.totalRevenue);
      const grandUnpaid = waiters.reduce((s, w) => s + w.unpaid.amount, 0);
      const grandCredit = waiters.reduce((s, w) => s + w.credit.amount, 0);

      const fmtMethod = m => m === 'mobile_money' ? 'M-Money' : m === 'credit_settled' ? 'Credit (Settled)' : m.charAt(0).toUpperCase() + m.slice(1);

      panel.innerHTML = `
        <div class="recon-header">
          <h3><span class="material-icons-round">summarize</span> Cash Reconciliation — ${fmtDate(date)}</h3>
          <button class="pos-clear-btn" onclick="document.querySelector('#waiter-recon-panel').classList.add('hidden')">
            <span class="material-icons-round">close</span>
          </button>
        </div>

        <div class="recon-grand-total" style="flex-wrap:wrap">
          <div class="recon-stat">
            <span class="recon-stat-label">Cash Sales</span>
            <span class="recon-stat-value">${fmt(recon.cashSales)}</span>
          </div>
          <div class="recon-stat">
            <span class="recon-stat-label">M-Money</span>
            <span class="recon-stat-value">${fmt(recon.mobileSales)}</span>
          </div>
          <div class="recon-stat">
            <span class="recon-stat-label">Card</span>
            <span class="recon-stat-value">${fmt(recon.cardSales)}</span>
          </div>
          <div class="recon-stat">
            <span class="recon-stat-label">Total Sales</span>
            <span class="recon-stat-value" style="color:var(--success)">${fmt(recon.totalSales)}</span>
          </div>
        </div>

        <div style="background:var(--bg-card);border-radius:8px;padding:12px 16px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span>Cash Sales</span><span>+ ${fmt(recon.cashSales)}</span>
          </div>
          ${recon.creditCollected > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12px;color:var(--text-muted)">
            <span>↳ incl. credit collected today (${recon.transactions.creditPayments} payments)</span><span>${fmt(recon.creditCollected)}</span>
          </div>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:var(--danger)">
            <span>Cash Expenses (${recon.transactions.expenseCount})</span><span>− ${fmt(recon.cashExpenses)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:var(--danger)">
            <span>PO Cash Payments (${recon.transactions.purchasePaymentCount || 0})</span><span>− ${fmt(recon.cashPurchasePayments || 0)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-weight:700;padding-top:8px;border-top:1px solid var(--border)">
            <span>Expected Cash in Hand</span><span style="color:var(--success)">${fmt(recon.expectedCashInHand)}</span>
          </div>
        </div>

        ${grandUnpaid > 0 || grandCredit > 0 ? `
        <div style="background:var(--bg-card);border-radius:8px;padding:12px 16px;margin-bottom:12px">
          ${grandUnpaid > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:var(--danger)">
            <span>Unpaid Orders</span><span>${fmt(grandUnpaid)}</span>
          </div>` : ''}
          ${grandCredit > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;color:var(--info)">
            <span>Outstanding Credit</span><span>${fmt(grandCredit)}</span>
          </div>` : ''}
        </div>` : ''}

        <div style="padding:8px 0 4px;color:var(--text-muted);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">
          Breakdown by Waiter
        </div>

        ${waiters.map(w => {
          const waiterOrders = allOrders.filter(o => (o.staffName || 'Unknown') === w.waiter)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          return `
          <div class="recon-waiter-card">
            <div class="recon-waiter-header" onclick="this.parentElement.classList.toggle('recon-expanded')">
              <div class="recon-waiter-name">
                <span class="material-icons-round">person</span>
                <strong>${w.waiter}</strong>
                <span class="recon-order-count">${w.totalOrders} orders · ${w.totalItems} items</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-weight:700">${fmt(w.totalRevenue)}</span>
                <span class="material-icons-round" style="font-size:18px;transition:transform 0.2s">expand_more</span>
              </div>
            </div>
            <div class="recon-waiter-detail">
              <div class="recon-detail-grid">
                <div class="recon-detail-item">
                  <span class="recon-detail-label">Paid (Collected)</span>
                  <span class="recon-detail-val" style="color:var(--success)">${w.paid.count} orders · ${fmt(w.paid.amount)}</span>
                </div>
                <div class="recon-detail-item">
                  <span class="recon-detail-label">Unpaid</span>
                  <span class="recon-detail-val" style="color:var(--danger)">${w.unpaid.count} orders · ${fmt(w.unpaid.amount)}</span>
                </div>
                <div class="recon-detail-item">
                  <span class="recon-detail-label">Credit</span>
                  <span class="recon-detail-val" style="color:var(--info)">${w.credit.count} orders · ${fmt(w.credit.amount)}</span>
                </div>
              </div>
              ${Object.keys(w.methods).length > 0 ? `
                <div class="recon-methods">
                  <span class="recon-detail-label" style="margin-bottom:4px;display:block">Payment Methods</span>
                  ${Object.entries(w.methods).map(([m, amt]) => `
                    <div class="recon-method-row">
                      <span>${fmtMethod(m)}</span><span>${fmt(amt)}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              ${waiterOrders.length > 0 ? `
                <div class="recon-orders-list">
                  <span class="recon-detail-label" style="margin-bottom:6px;display:block">Orders (${waiterOrders.length})</span>
                  <div class="recon-orders-scroll">
                    ${waiterOrders.map(o => `
                      <div class="recon-order-row">
                        <div class="recon-order-meta">
                          <span class="recon-order-num">#${o.orderNumber}</span>
                          <span class="recon-order-time">${fmtTime(o.createdAt)}</span>
                          ${o.table ? `<span class="recon-order-table">T${o.table}</span>` : ''}
                          <span class="badge badge-${o.paymentStatus === 'credit' ? 'credit' : o.paymentStatus}" style="font-size:10px;padding:2px 5px">${o.paymentStatus === 'credit' ? 'CREDIT' : o.paymentStatus.toUpperCase()}</span>
                          <span class="recon-order-total">${fmt(o.total)}</span>
                        </div>
                        <div class="recon-order-items-list">${(o.items||[]).map(i => `${i.quantity}\u00d7 ${i.name}`).join(', ')}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
              <button class="btn btn-sm btn-outline recon-view-orders" data-waiter="${w.waiter.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" style="margin-top:8px;width:100%">
                <span class="material-icons-round" style="font-size:16px;vertical-align:middle">open_in_new</span> Open ${w.waiter}'s Orders
              </button>
            </div>
          </div>
          `;
        }).join('')}
      `;

      // Wire up view-orders buttons after DOM is rendered
      panel.querySelectorAll('.recon-view-orders').forEach(btn => {
        btn.addEventListener('click', () => {
          const name = btn.dataset.waiter;
          const wf = $('#orders-waiter-filter');
          if (wf) { wf.value = name; wf.dispatchEvent(new Event('change')); }
          panel.classList.add('hidden');
          $('#orders-list').scrollIntoView({ behavior: 'smooth' });
        });
      });

    } catch (e) {
      console.error(e);
      panel.innerHTML = '<div style="padding:20px;text-align:center;color:var(--danger)">Failed to load reconciliation. Please try again.</div>';
    }
  }

  function toggleMyRecon() {
    const panel = $('#waiter-recon-panel');
    if (!panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }

    const orders = allDayOrders; // already filtered to this waiter by staffId
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    let totalItems = 0;
    orders.forEach(o => (o.items || []).forEach(i => { totalItems += i.quantity; }));

    let paid = { count: 0, amount: 0 };
    let unpaid = { count: 0, amount: 0 };
    let credit = { count: 0, amount: 0 };
    const methods = {};

    orders.forEach(o => {
      if (o.paymentStatus === 'paid') {
        paid.count++; paid.amount += o.total || 0;
        const m = o.paymentMethod || 'cash';
        methods[m] = (methods[m] || 0) + (o.total || 0);
      } else if (o.paymentStatus === 'credit') {
        credit.count++; credit.amount += o.total || 0;
      } else {
        unpaid.count++; unpaid.amount += o.total || 0;
      }
    });

    const fmtMethod = m => m === 'mobile_money' ? 'M-Money' : m === 'credit_settled' ? 'Credit (Settled)' : m.charAt(0).toUpperCase() + m.slice(1);
    const dateLabel = fmtDate($('#orders-date-filter').value);

    panel.innerHTML = `
      <div class="recon-header">
        <h3><span class="material-icons-round">summarize</span> My Summary — ${dateLabel}</h3>
        <button class="pos-clear-btn" onclick="document.querySelector('#waiter-recon-panel').classList.add('hidden')">
          <span class="material-icons-round">close</span>
        </button>
      </div>

      <div class="recon-grand-total">
        <div class="recon-stat">
          <span class="recon-stat-label">My Orders</span>
          <span class="recon-stat-value">${totalOrders}</span>
        </div>
        <div class="recon-stat">
          <span class="recon-stat-label">Items Sold</span>
          <span class="recon-stat-value">${totalItems}</span>
        </div>
        <div class="recon-stat">
          <span class="recon-stat-label">Total Sales</span>
          <span class="recon-stat-value">${fmt(totalRevenue)}</span>
        </div>
      </div>

      <div class="recon-waiter-card recon-expanded">
        <div class="recon-waiter-detail" style="display:block">
          <div class="recon-detail-grid">
            <div class="recon-detail-item">
              <span class="recon-detail-label">Collected (Paid)</span>
              <span class="recon-detail-val" style="color:var(--success)">${paid.count} orders &middot; ${fmt(paid.amount)}</span>
            </div>
            <div class="recon-detail-item">
              <span class="recon-detail-label">Unpaid</span>
              <span class="recon-detail-val" style="color:var(--danger)">${unpaid.count} orders &middot; ${fmt(unpaid.amount)}</span>
            </div>
            <div class="recon-detail-item">
              <span class="recon-detail-label">Credit</span>
              <span class="recon-detail-val" style="color:var(--info)">${credit.count} orders &middot; ${fmt(credit.amount)}</span>
            </div>
          </div>
          ${Object.keys(methods).length > 0 ? `
            <div class="recon-methods">
              <span class="recon-detail-label" style="margin-bottom:4px;display:block">Payment Methods</span>
              ${Object.entries(methods).map(([m, amt]) => `
                <div class="recon-method-row">
                  <span>${fmtMethod(m)}</span><span>${fmt(amt)}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>

      <div style="margin-top:12px;padding:12px;background:var(--surface);border-radius:8px;font-size:13px;color:var(--text-secondary)">
        <span class="material-icons-round" style="font-size:16px;vertical-align:middle;color:var(--info)">info</span>
        Show this summary to the cashier when reconciling at end of day. Amount to hand over: <strong style="color:var(--success)">${fmt(paid.amount)}</strong>
      </div>
    `;

    panel.classList.remove('hidden');
  }

  function renderOrderList(orders) {
    $('#orders-list').innerHTML = orders.length === 0
      ? '<div class="empty-state"><span class="material-icons-round">receipt_long</span><p>No orders found</p></div>'
      : orders.map(o => `
        <div class="order-card" data-id="${o.id}">
          <div class="order-card-header">
            <span class="order-num">#${o.orderNumber} ${o.table ? '• T' + o.table : ''}</span>
            <div style="display:flex;gap:4px">
              <span class="badge ${o.menuType === 'community' ? 'badge-preparing' : 'badge-new'}">${menuTypeLabel(o.menuType)}</span>
              <span class="badge badge-${o.status}">${o.status}</span>
            </div>
          </div>
          <div class="order-card-items">${(o.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ')}</div>
          <div class="order-card-customer">
            <span class="material-icons-round" style="font-size:14px;color:var(--text-dim)">person</span>
            <span style="flex:1;font-size:12px;color:${o.customerName ? 'var(--text)' : 'var(--text-dim)'}">${o.customerName || 'No customer name'}</span>
            <button class="btn-icon edit-customer-btn" data-id="${o.id}" data-name="${o.customerName || ''}" data-table="${o.table || ''}" data-type="${o.type || 'dine_in'}" title="Edit details">
              <span class="material-icons-round" style="font-size:16px">edit</span>
            </button>
            ${o.staffName ? `<span style="font-size:11px;color:var(--text-dim);margin-left:4px">by ${o.staffName}</span>` : ''}
          </div>
          <div class="order-card-footer">
            <span class="order-card-total">${fmt(o.total)}</span>
            <div style="display:flex;gap:4px;align-items:center">
              <span class="badge badge-${o.paymentStatus === 'credit' ? 'credit' : o.paymentStatus}">${o.paymentStatus === 'credit' ? 'CREDIT' : o.paymentStatus}</span>
              ${o.paymentStatus === 'credit' ? `<span style="font-size:11px;color:var(--info)">Bal: ${fmt((o.total||0)-(o.creditAmountPaid||0))}</span>` : ''}
              <span style="font-size:12px;color:var(--text-muted)">${fmtTime(o.createdAt)}</span>
            </div>
          </div>
          ${!isWaiter() ? `<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
            ${o.paymentStatus === 'unpaid' ? `
              <button class="btn btn-sm btn-success pay-order-btn" data-id="${o.id}" data-method="cash">Cash</button>
              <button class="btn btn-sm btn-warning pay-order-btn" data-id="${o.id}" data-method="mobile_money">M-Money</button>
              <button class="btn btn-sm btn-outline pay-order-btn" data-id="${o.id}" data-method="card">Card</button>
              <button class="btn btn-sm btn-outline credit-sale-btn" data-id="${o.id}" data-name="${o.customerName || ''}" data-total="${o.total}" style="color:var(--info);border-color:var(--info)">Credit</button>
            ` : ''}
            ${o.paymentStatus === 'credit' ? `
              <button class="btn btn-sm btn-primary credit-pay-btn" data-id="${o.id}" data-balance="${(o.total || 0) - (o.creditAmountPaid || 0)}" data-order="${o.orderNumber}">Collect Payment</button>
            ` : ''}
            <button class="btn btn-sm btn-outline view-receipt-btn" data-id="${o.id}">Receipt</button>
            ${o.status === 'served' || o.status === 'ready' ? `<button class="btn btn-sm btn-primary complete-order-btn" data-id="${o.id}">Complete</button>` : ''}
          </div>` : ''}
        </div>
      `).join('');

    // Pay buttons
    $$('.pay-order-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/orders/${btn.dataset.id}`, {
            method: 'PUT',
            body: { paymentStatus: 'paid', paymentMethod: btn.dataset.method }
          });
          toast('Payment recorded!');
          loadOrders();
        } catch (e) { toast('Error: ' + e.message); }
      });
    });

    // Edit customer details on existing order
    $$('.edit-customer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.id;
        const currentName = btn.dataset.name;
        const currentTable = btn.dataset.table;
        const currentType = btn.dataset.type;
        openModal('Edit Order Details', `
          <div class="form-group"><label>Customer Name</label>
            <input type="text" id="edit-cust-name" class="input" value="${currentName}" placeholder="Enter customer name">
          </div>
          <div class="form-group"><label>Order Type</label>
            <select id="edit-cust-type" class="input">
              <option value="dine_in" ${currentType === 'dine_in' ? 'selected' : ''}>Dine In</option>
              <option value="takeaway" ${currentType === 'takeaway' ? 'selected' : ''}>Takeaway</option>
            </select>
          </div>
          <div class="form-group"><label>Table</label>
            <input type="text" id="edit-cust-table" class="input" value="${currentTable}" placeholder="Table number (optional)">
          </div>
          <button class="btn btn-primary btn-block" id="edit-cust-save">Save Changes</button>
        `);
        // Auto-focus customer name
        setTimeout(() => $('#edit-cust-name')?.focus(), 100);
        $('#edit-cust-save').addEventListener('click', async () => {
          const name = $('#edit-cust-name').value.trim();
          await api(`/orders/${orderId}`, { method: 'PUT', body: {
            customerName: name || null,
            type: $('#edit-cust-type').value,
            table: $('#edit-cust-table').value || null
          }});
          closeModal(); toast('Order details updated'); loadOrders();
        });
      });
    });

    // Credit sale buttons — with inline name entry if missing
    $$('.credit-sale-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        const total = btn.dataset.total;
        const orderId = btn.dataset.id;

        const showCreditConfirm = (customerName) => {
          openModal('Confirm Credit Sale', `
            <div style="text-align:center;padding:8px 0 16px">
              <span class="material-icons-round" style="font-size:40px;color:var(--info);margin-bottom:8px">credit_score</span>
              <p style="margin-bottom:4px">Mark as credit for <strong>${customerName}</strong>?</p>
              <p style="font-size:20px;font-weight:700;color:var(--danger);margin:8px 0">${fmt(parseFloat(total))}</p>
              <p style="font-size:12px;color:var(--text-muted)">This will be tracked as an outstanding receivable.</p>
            </div>
            <button class="btn btn-primary btn-block" id="confirm-credit-sale">Confirm Credit Sale</button>
          `);
          $('#confirm-credit-sale').addEventListener('click', async () => {
            await api(`/orders/${orderId}`, {
              method: 'PUT',
              body: { customerName: customerName, paymentMethod: 'credit' }
            });
            closeModal(); toast(`Credit sale recorded for ${customerName}`); loadOrders();
          });
        };

        if (!name) {
          // Prompt for customer name first
          openModal('Credit Sale — Customer Required', `
            <div style="text-align:center;padding:8px 0 12px">
              <span class="material-icons-round" style="font-size:40px;color:var(--info);margin-bottom:8px">person_add</span>
              <p style="margin-bottom:16px">Enter customer name to proceed with credit sale</p>
            </div>
            <div class="form-group">
              <input type="text" id="credit-cust-name" class="input" placeholder="Customer name" autofocus>
            </div>
            <div style="font-size:12px;color:var(--text-dim);text-align:center;margin-bottom:12px">Amount: ${fmt(parseFloat(total))}</div>
            <button class="btn btn-primary btn-block" id="credit-name-next">Continue to Credit Sale</button>
          `);
          setTimeout(() => $('#credit-cust-name')?.focus(), 100);
          $('#credit-name-next').addEventListener('click', () => {
            const enteredName = $('#credit-cust-name').value.trim();
            if (!enteredName) { toast('Please enter a customer name'); return; }
            closeModal();
            setTimeout(() => showCreditConfirm(enteredName), 200);
          });
        } else {
          showCreditConfirm(name);
        }
      });
    });

    // Credit payment collection buttons
    $$('.credit-pay-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const balance = parseFloat(btn.dataset.balance);
        const orderNum = btn.dataset.order;
        openModal(`Collect Payment — Order #${orderNum}`, `
          <div class="form-group">
            <label>Outstanding Balance</label>
            <div style="font-size:18px;font-weight:700;color:var(--danger);margin-bottom:8px">${fmt(balance)}</div>
          </div>
          <div class="form-group"><label>Amount Collecting</label>
            <input type="number" id="credit-pay-amount" class="input" value="${balance}" max="${balance}" step="100">
          </div>
          <div class="form-group"><label>Payment Method</label>
            <select id="credit-pay-method" class="input">
              <option value="cash">Cash</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          </div>
          <div class="form-group"><label>Note (optional)</label>
            <input type="text" id="credit-pay-note" class="input" placeholder="e.g. Partial payment...">
          </div>
          <button class="btn btn-primary btn-block" id="credit-pay-save">Confirm Payment</button>
        `);
        $('#credit-pay-save').addEventListener('click', async () => {
          const amount = parseFloat($('#credit-pay-amount').value);
          if (!amount || amount <= 0) { toast('Enter a valid amount', 'error'); return; }
          if (amount > balance) { toast('Amount exceeds balance', 'error'); return; }
          await api(`/orders/${btn.dataset.id}/credit-pay`, { method: 'POST', body: {
            amount, method: $('#credit-pay-method').value, note: $('#credit-pay-note').value
          }});
          closeModal(); toast('Payment collected!'); loadOrders();
        });
      });
    });

    // Complete buttons
    $$('.complete-order-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/orders/${btn.dataset.id}`, { method: 'PUT', body: { status: 'completed' } });
          toast('Order completed!');
          loadOrders();
        } catch (e) { toast('Error: ' + e.message); }
      });
    });

    // Receipt buttons
    $$('.view-receipt-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const order = await api(`/orders/${btn.dataset.id}`);
        showReceipt(order);
      });
    });
  }

  function showReceipt(order) {
    const s = settings;
    openModal('Receipt', `
      <div class="receipt">
        <div class="receipt-header">
          <h3>${s.restaurantName || "AD's Kitchen"}</h3>
          <div>${s.location || 'Kitooro, Entebbe'}</div>
          <div>${s.phone || ''}</div>
        </div>
        <div class="receipt-divider"></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span>Order #${order.orderNumber}</span>
          <span>${fmtDate(order.createdAt)}</span>
        </div>
        <div style="margin-bottom:4px">${menuTypeLabel(order.menuType)} • ${order.table ? 'Table ' + order.table : 'Takeaway'}${order.customerName ? ' • ' + order.customerName : ''}</div>
        <div class="receipt-divider"></div>
        <div class="receipt-items">
          ${(order.items || []).map(i => `
            <div class="receipt-row">
              <span>${i.quantity}x ${i.name}</span>
              <span>${fmt(i.price * i.quantity)}</span>
            </div>
          `).join('')}
        </div>
        <div class="receipt-divider"></div>
        <div class="receipt-total">
          <span>TOTAL</span>
          <span>${fmt(order.total)}</span>
        </div>
        <div style="margin-top:4px;font-size:11px">
          ${order.paymentStatus === 'paid' ? `Paid via ${(order.paymentMethod || 'cash').replace('_', ' ')}` : order.paymentStatus === 'credit' ? `CREDIT — Balance: ${fmt((order.total||0)-(order.creditAmountPaid||0))}` : 'UNPAID'}
        </div>
        <div class="receipt-divider"></div>
        <div class="receipt-footer">${s.receiptFooter || 'Thank you!'}</div>
      </div>
    `);
  }

  // ===== KITCHEN =====
  async function loadKitchen() {
    try {
      const orders = await api('/kitchen');
      const container = $('#kitchen-orders');
      const empty = $('#kitchen-empty');

      if (orders.length === 0) {
        container.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }
      empty.classList.add('hidden');

      container.innerHTML = orders.map(o => `
        <div class="kitchen-card status-${o.status}">
          <div class="kitchen-card-header">
            <div>
              <span class="kitchen-order-num">#${o.orderNumber}</span>
              <span class="badge ${o.menuType === 'community' ? 'badge-preparing' : 'badge-new'}">${menuTypeLabel(o.menuType)}</span>
              <span class="badge badge-${o.status}">${o.status}</span>
            </div>
            <div>
              <span class="kitchen-time">${fmtTime(o.createdAt)}</span>
              ${o.table ? `<span class="badge badge-new" style="margin-left:4px">T${o.table}</span>` : ''}
              ${o.type === 'takeaway' ? '<span class="badge badge-preparing" style="margin-left:4px">TAKE</span>' : ''}
            </div>
          </div>
          <div class="kitchen-items">
            ${(o.items || []).map(i => {
              const acc = (i.accompaniments && i.accompaniments.length)
                ? `<div class="kitchen-item-accomp">${i.accompaniments.map(a => `<span class="kitchen-chip">${a}</span>`).join('')}</div>`
                : '';
              const notes = i.notes
                ? `<div class="kitchen-item-notes"><span class="material-icons-round">sticky_note_2</span>${i.notes}</div>`
                : '';
              return `
                <div class="kitchen-item ${(acc || notes) ? 'kitchen-item-complex' : ''}">
                  <span class="kitchen-item-qty">${i.quantity}x</span>
                  <div class="kitchen-item-body">
                    <div class="kitchen-item-name">${i.name}</div>
                    ${acc}
                    ${notes}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          ${o.customerName ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Customer: ${o.customerName}</div>` : ''}
          <div class="kitchen-actions">
            ${o.status === 'new' ? `<button class="btn btn-sm btn-warning kitchen-status-btn" data-id="${o.id}" data-status="preparing">Start Preparing</button>` : ''}
            ${o.status === 'preparing' ? `<button class="btn btn-sm btn-success kitchen-status-btn" data-id="${o.id}" data-status="ready">Mark Ready</button>` : ''}
            <button class="btn btn-sm btn-primary kitchen-status-btn" data-id="${o.id}" data-status="served">Served</button>
          </div>
        </div>
      `).join('');

      $$('.kitchen-status-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await api(`/kitchen/${btn.dataset.id}/status`, { method: 'PUT', body: { status: btn.dataset.status } });
            toast(`Order marked as ${btn.dataset.status}`);
            loadKitchen();
          } catch (e) { toast('Error: ' + e.message); }
        });
      });
    } catch (e) { console.error(e); }
  }

  // ===== INVENTORY =====
  async function loadInventory() {
    try {
      const inv = await api('/inventory');
      const search = $('#inv-search').value.toLowerCase();
      const filtered = search ? inv.filter(i => i.name.toLowerCase().includes(search)) : inv;

      $('#inventory-list').innerHTML = filtered.length === 0
        ? '<div class="empty-state"><span class="material-icons-round">inventory_2</span><p>No items</p></div>'
        : filtered.map(i => `
          <div class="inv-card ${i.quantity <= i.reorderLevel ? 'low-stock' : ''}">
            <div class="inv-info">
              <div class="inv-name">${i.name}</div>
              <div class="inv-category">${i.category || ''} • Reorder: ${i.reorderLevel} ${i.unit}</div>
              ${i.standardPortions ? `<div class="inv-portion">${i.standardPortions} portions @ ${fmt(i.costPerPortion)}/portion</div>` : ''}
            </div>
            <div class="inv-qty">
              <div class="inv-qty-num ${i.quantity <= i.reorderLevel ? 'low' : ''}">${fmtQty(i.quantity)}</div>
              <div class="inv-qty-unit">${i.unit}</div>
            </div>
            <div class="inv-actions">
              <button class="icon-btn inv-adjust-btn" data-id="${i.id}" data-name="${i.name}" title="Adjust">
                <span class="material-icons-round">tune</span>
              </button>
              ${isAdmin() ? `<button class="icon-btn inv-edit-btn" data-id="${i.id}" title="Edit">
                <span class="material-icons-round">edit</span>
              </button>` : ''}
            </div>
          </div>
        `).join('');

      // Adjust buttons
      $$('.inv-adjust-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = inv.find(x => x.id === btn.dataset.id);
          const currentQty = Number(item?.quantity || 0);
          openModal(`Adjust: ${btn.dataset.name}`, `
            <div class="form-group" style="font-size:13px;color:var(--text-muted)">
              Current: ${fmtQty(currentQty)} ${item?.unit || ''}
            </div>
            <div class="form-group">
              <label><input type="checkbox" id="adj-mode-set"> Set exact quantity (instead of +/-)</label>
            </div>
            <div class="form-group">
              <label id="adj-qty-label">Quantity (+/-)</label>
              <input type="number" step="any" id="adj-qty" class="input" placeholder="e.g. 5 or -3">
            </div>
            <div class="form-group">
              <label>Reason</label>
              <select id="adj-reason" class="input">
                <option value="Restock">Restock</option>
                <option value="Used in cooking">Used in cooking</option>
                <option value="Wastage/Spoilage">Wastage/Spoilage</option>
                <option value="Stock count correction">Stock count correction</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <button class="btn btn-primary btn-block" id="adj-save">Save Adjustment</button>
          `);
          $('#adj-mode-set').addEventListener('change', (e) => {
            $('#adj-qty-label').textContent = e.target.checked ? 'New quantity (absolute)' : 'Quantity (+/-)';
            $('#adj-qty').placeholder = e.target.checked ? 'e.g. 0 or 12.5' : 'e.g. 5 or -3';
          });
          $('#adj-save').addEventListener('click', async () => {
            const raw = parseFloat($('#adj-qty').value);
            if (isNaN(raw)) return toast('Enter a valid quantity');
            const setMode = $('#adj-mode-set').checked;
            const adjustment = setMode ? (raw - currentQty) : raw;
            if (adjustment === 0) return toast('No change');
            try {
              await api(`/inventory/${btn.dataset.id}/adjust`, { method: 'POST', body: { adjustment, reason: $('#adj-reason').value } });
              closeModal();
              toast('Stock adjusted');
              loadInventory();
            } catch (e) { toast('Error: ' + e.message); }
          });
        });
      });

      // Edit buttons
      $$('.inv-edit-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const item = inv.find(i => i.id === btn.dataset.id);
          openModal('Edit Item', `
            <div class="form-group"><label>Name</label><input type="text" id="inv-e-name" class="input" value="${item.name}"></div>
            <div class="form-group"><label>Unit</label><input type="text" id="inv-e-unit" class="input" value="${item.unit}"></div>
            <div class="form-group"><label>Category</label><input type="text" id="inv-e-cat" class="input" value="${item.category || ''}"></div>
            <div class="form-group"><label>Reorder Level</label><input type="number" id="inv-e-reorder" class="input" value="${item.reorderLevel}"></div>
            <div class="form-group"><label>Cost per Unit (UGX)</label><input type="number" id="inv-e-cost" class="input" value="${item.costPerUnit}"></div>
            <div class="form-group"><label>Standard Portions per Unit</label><input type="number" id="inv-e-portions" class="input" value="${item.standardPortions || ''}" placeholder="Leave empty if N/A"></div>
            <div class="form-group"><label>Cost per Portion (UGX)</label><input type="number" id="inv-e-portioncost" class="input" value="${item.costPerPortion || ''}" placeholder="Auto-calculated if empty"></div>
            <button class="btn btn-primary btn-block" id="inv-e-save">Save</button>
            <button class="btn btn-outline btn-block" id="inv-e-del" style="margin-top:8px;color:var(--danger)">Delete Item</button>
          `);
          // Auto-calculate cost per portion
          const calcPortion = () => {
            const cost = parseInt($('#inv-e-cost').value) || 0;
            const portions = parseInt($('#inv-e-portions').value) || 0;
            if (cost > 0 && portions > 0) {
              $('#inv-e-portioncost').value = Math.round(cost / portions);
            }
          };
          $('#inv-e-cost').addEventListener('input', calcPortion);
          $('#inv-e-portions').addEventListener('input', calcPortion);

          $('#inv-e-save').addEventListener('click', async () => {
            try {
              const portions = parseInt($('#inv-e-portions').value) || 0;
              const costPerUnit = parseInt($('#inv-e-cost').value);
              const body = {
                name: $('#inv-e-name').value, unit: $('#inv-e-unit').value,
                category: $('#inv-e-cat').value, reorderLevel: parseInt($('#inv-e-reorder').value),
                costPerUnit
              };
              if (portions > 0) {
                body.standardPortions = portions;
                body.costPerPortion = parseInt($('#inv-e-portioncost').value) || Math.round(costPerUnit / portions);
              }
              await api(`/inventory/${btn.dataset.id}`, { method: 'PUT', body });
              closeModal(); toast('Updated'); loadInventory();
            } catch (e) { toast('Error: ' + e.message); }
          });
          $('#inv-e-del').addEventListener('click', async () => {
            if (!confirm('Delete this inventory item?')) return;
            await api(`/inventory/${btn.dataset.id}`, { method: 'DELETE' });
            closeModal(); toast('Deleted'); loadInventory();
          });
        });
      });

      // Add button (admin only)
      $('#btn-add-inventory').style.display = isAdmin() ? '' : 'none';
      $('#btn-add-inventory').onclick = () => {
        openModal('Add Inventory Item', `
          <div class="form-group"><label>Name</label><input type="text" id="inv-a-name" class="input" placeholder="e.g. Chicken (kg)"></div>
          <div class="form-group"><label>Unit</label><input type="text" id="inv-a-unit" class="input" placeholder="kg, pcs, liters..."></div>
          <div class="form-group"><label>Category</label><input type="text" id="inv-a-cat" class="input" placeholder="Proteins, Dry Goods..."></div>
          <div class="form-group"><label>Current Quantity</label><input type="number" id="inv-a-qty" class="input" value="0"></div>
          <div class="form-group"><label>Reorder Level</label><input type="number" id="inv-a-reorder" class="input" value="5"></div>
          <div class="form-group"><label>Cost per Unit (UGX)</label><input type="number" id="inv-a-cost" class="input" value="0"></div>
          <button class="btn btn-primary btn-block" id="inv-a-save">Add Item</button>
        `);
        $('#inv-a-save').addEventListener('click', async () => {
          try {
            await api('/inventory', { method: 'POST', body: {
              name: $('#inv-a-name').value, unit: $('#inv-a-unit').value,
              category: $('#inv-a-cat').value, quantity: parseInt($('#inv-a-qty').value),
              reorderLevel: parseInt($('#inv-a-reorder').value), costPerUnit: parseInt($('#inv-a-cost').value)
            }});
            closeModal(); toast('Item added'); loadInventory();
          } catch (e) { toast('Error: ' + e.message); }
        });
      };

      // Search
      $('#inv-search').oninput = loadInventory;

      // Stock log
      const logs = await api('/stock-log');
      $('#stock-log-list').innerHTML = logs.length === 0
        ? '<div class="empty-state"><p>No stock adjustments yet</p></div>'
        : logs.map(l => `
          <div class="log-item">
            <div class="log-item-info">
              <div class="log-item-name">${l.itemName}</div>
              <div class="log-item-reason">${l.reason} → Now: ${l.newQuantity}</div>
              <div class="log-item-time">${fmtDate(l.timestamp)} ${fmtTime(l.timestamp)}</div>
            </div>
            <div class="log-item-adj ${l.adjustment > 0 ? 'positive' : 'negative'}">
              ${l.adjustment > 0 ? '+' : ''}${l.adjustment}
            </div>
          </div>
        `).join('');
    } catch (e) { console.error(e); }
  }

  // ===== MENU MANAGEMENT =====
  async function loadMenuManage() {
    if (!isAdmin()) {
      $('#menu-manage-list').innerHTML = '<div class="empty-state"><span class="material-icons-round">lock</span><p>Manager access only</p></div>';
      $('#btn-add-menu').style.display = 'none';
      $('#menu-search').style.display = 'none';
      return;
    }
    try {
      menuItems = await api('/menu');
      categories = await api('/categories');
      const search = $('#menu-search').value.toLowerCase();
      const filtered = search ? menuItems.filter(m => m.name.toLowerCase().includes(search)) : menuItems;

      const catMap = {};
      categories.forEach(c => catMap[c.id] = c.name);

      $('#menu-manage-list').innerHTML = filtered.map(m => `
        <div class="mm-card">
          <div class="mm-card-header">
            <h4>${m.name} ${!m.active ? '<span style="color:var(--danger)">(Inactive)</span>' : ''}</h4>
            <span style="font-size:15px;font-weight:700;color:var(--success)">${fmt(m.price)}</span>
          </div>
          <div class="mm-card-detail">
            <span style="color:${m.menuType === 'community' ? 'var(--warning)' : m.menuType === 'glovo' ? 'var(--success)' : 'var(--info)'}">${menuTypeLabel(m.menuType)}</span> • ${catMap[m.category] || 'No category'} • Cost: ${fmt(m.cost || 0)} • Margin: ${m.price > 0 ? ((1 - (m.cost || 0) / m.price) * 100).toFixed(0) : 0}%
            ${m.description ? '<br>' + m.description : ''}
          </div>
          <div class="mm-card-actions">
            <button class="btn btn-sm btn-outline menu-edit-btn" data-id="${m.id}">Edit</button>
            <button class="btn btn-sm btn-outline menu-toggle-btn" data-id="${m.id}" data-active="${m.active}">${m.active ? 'Disable' : 'Enable'}</button>
          </div>
        </div>
      `).join('');

      $$('.menu-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const m = menuItems.find(i => i.id === btn.dataset.id);
          openModal('Edit Menu Item', `
            <div class="form-group"><label>Name</label><input type="text" id="me-name" class="input" value="${m.name}"></div>
            <div class="form-group"><label>Category</label>
              <select id="me-cat" class="input">
                ${categories.map(c => `<option value="${c.id}" ${c.id === m.category ? 'selected' : ''}>${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>Menu</label>
              <select id="me-menutype" class="input">
                <option value="walkin" ${m.menuType === 'walkin' ? 'selected' : ''}>Walk-in</option>
                <option value="community" ${m.menuType === 'community' ? 'selected' : ''}>Community</option>
                <option value="glovo" ${m.menuType === 'glovo' ? 'selected' : ''}>Glovo</option>
                <option value="both" ${m.menuType === 'both' ? 'selected' : ''}>Both</option>
              </select>
            </div>
            <div class="form-group"><label>Price (UGX)</label><input type="number" id="me-price" class="input" value="${m.price}"></div>
            <div class="form-group"><label>Cost (UGX)</label><input type="number" id="me-cost" class="input" value="${m.cost || 0}"></div>
            <div class="form-group"><label>Description</label><input type="text" id="me-desc" class="input" value="${m.description || ''}"></div>
            <button class="btn btn-primary btn-block" id="me-save">Save</button>
            <button class="btn btn-outline btn-block" id="me-del" style="margin-top:8px;color:var(--danger)">Delete</button>
          `);
          $('#me-save').addEventListener('click', async () => {
            await api(`/menu/${btn.dataset.id}`, { method: 'PUT', body: {
              name: $('#me-name').value, category: $('#me-cat').value,
              menuType: $('#me-menutype').value,
              price: parseInt($('#me-price').value), cost: parseInt($('#me-cost').value),
              description: $('#me-desc').value
            }});
            closeModal(); toast('Updated'); loadMenuManage(); menuItems = await api('/menu');
          });
          $('#me-del').addEventListener('click', async () => {
            if (!confirm('Delete this menu item?')) return;
            await api(`/menu/${btn.dataset.id}`, { method: 'DELETE' });
            closeModal(); toast('Deleted'); loadMenuManage(); menuItems = await api('/menu');
          });
        });
      });

      $$('.menu-toggle-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          await api(`/menu/${btn.dataset.id}`, { method: 'PUT', body: { active: btn.dataset.active !== 'true' } });
          toast('Updated'); loadMenuManage(); menuItems = await api('/menu');
        });
      });

      $('#btn-add-menu').onclick = () => {
        openModal('Add Menu Item', `
          <div class="form-group"><label>Name</label><input type="text" id="ma-name" class="input"></div>
          <div class="form-group"><label>Category</label>
            <select id="ma-cat" class="input">
              ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Menu</label>
            <select id="ma-menutype" class="input">
              <option value="walkin">Walk-in</option>
              <option value="community">Community</option>
              <option value="glovo">Glovo</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div class="form-group"><label>Price (UGX)</label><input type="number" id="ma-price" class="input"></div>
          <div class="form-group"><label>Cost (UGX)</label><input type="number" id="ma-cost" class="input"></div>
          <div class="form-group"><label>Description</label><input type="text" id="ma-desc" class="input"></div>
          <button class="btn btn-primary btn-block" id="ma-save">Add Item</button>
        `);
        $('#ma-save').addEventListener('click', async () => {
          await api('/menu', { method: 'POST', body: {
            name: $('#ma-name').value, category: $('#ma-cat').value,
            menuType: $('#ma-menutype').value,
            price: parseInt($('#ma-price').value), cost: parseInt($('#ma-cost').value),
            description: $('#ma-desc').value
          }});
          closeModal(); toast('Added'); loadMenuManage(); menuItems = await api('/menu');
        });
      };

      $('#menu-search').oninput = loadMenuManage;
    } catch (e) { console.error(e); }
  }

  // ===== PROCUREMENT =====
  async function loadProcurement() {
    await Promise.all([loadVendors(), loadPurchases(), loadPayables()]);
  }

  async function loadVendors() {
    try {
      const vendors = await api('/vendors');
      $('#vendors-list').innerHTML = vendors.length === 0
        ? '<div class="empty-state"><p>No vendors yet</p></div>'
        : vendors.map(v => `
          <div class="v-card">
            <div class="v-card-header">
              <h4>${v.name}</h4>
              <span class="v-rating">${'★'.repeat(v.rating || 0)}${'☆'.repeat(5 - (v.rating || 0))}</span>
            </div>
            <div class="v-card-detail">
              Phone: ${v.phone || 'N/A'}<br>
              Items: ${(v.items || []).join(', ') || 'N/A'}<br>
              ${v.notes ? 'Notes: ' + v.notes : ''}
            </div>
            ${isAdmin() ? `<div class="v-card-actions">
              <button class="btn btn-sm btn-outline vendor-edit-btn" data-id="${v.id}">Edit</button>
              <button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="if(confirm('Delete?'))fetch('/api/vendors/${v.id}',{method:'DELETE'}).then(()=>{document.querySelector('[data-page=procurement]')&&loadProcurement()})">Delete</button>
            </div>` : ''}
          </div>
        `).join('');

      $$('.vendor-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = vendors.find(x => x.id === btn.dataset.id);
          openModal('Edit Vendor', `
            <div class="form-group"><label>Name</label><input type="text" id="ve-name" class="input" value="${v.name}"></div>
            <div class="form-group"><label>Phone</label><input type="tel" id="ve-phone" class="input" value="${v.phone || ''}"></div>
            <div class="form-group"><label>Items (comma-separated)</label><input type="text" id="ve-items" class="input" value="${(v.items || []).join(', ')}"></div>
            <div class="form-group"><label>Rating (1-5)</label><input type="number" id="ve-rating" class="input" min="1" max="5" value="${v.rating || 3}"></div>
            <div class="form-group"><label>Notes</label><textarea id="ve-notes" class="input" rows="2">${v.notes || ''}</textarea></div>
            <button class="btn btn-primary btn-block" id="ve-save">Save</button>
          `);
          $('#ve-save').addEventListener('click', async () => {
            await api(`/vendors/${btn.dataset.id}`, { method: 'PUT', body: {
              name: $('#ve-name').value, phone: $('#ve-phone').value,
              items: $('#ve-items').value.split(',').map(s => s.trim()).filter(Boolean),
              rating: parseInt($('#ve-rating').value), notes: $('#ve-notes').value
            }});
            closeModal(); toast('Updated'); loadVendors();
          });
        });
      });

      $('#btn-add-vendor').style.display = isAdmin() ? '' : 'none';
      $('#btn-add-vendor').onclick = () => {
        openModal('Add Vendor', `
          <div class="form-group"><label>Name</label><input type="text" id="va-name" class="input"></div>
          <div class="form-group"><label>Phone</label><input type="tel" id="va-phone" class="input"></div>
          <div class="form-group"><label>Items (comma-separated)</label><input type="text" id="va-items" class="input"></div>
          <div class="form-group"><label>Rating (1-5)</label><input type="number" id="va-rating" class="input" min="1" max="5" value="3"></div>
          <div class="form-group"><label>Notes</label><textarea id="va-notes" class="input" rows="2"></textarea></div>
          <button class="btn btn-primary btn-block" id="va-save">Add Vendor</button>
        `);
        $('#va-save').addEventListener('click', async () => {
          await api('/vendors', { method: 'POST', body: {
            name: $('#va-name').value, phone: $('#va-phone').value,
            items: $('#va-items').value.split(',').map(s => s.trim()).filter(Boolean),
            rating: parseInt($('#va-rating').value), notes: $('#va-notes').value
          }});
          closeModal(); toast('Vendor added'); loadVendors();
        });
      };
    } catch (e) { console.error(e); }
  }

  async function loadPurchases() {
    try {
      const statusFilter = $('#po-status-filter').value;
      let url = '/purchases';
      if (statusFilter) url += '?status=' + statusFilter;
      const purchases = await api(url);
      const vendors = await api('/vendors');
      const vendorMap = {};
      vendors.forEach(v => vendorMap[v.id] = v.name);

      const today = new Date().toISOString().split('T')[0];
      $('#purchases-list').innerHTML = purchases.length === 0
        ? '<div class="empty-state"><p>No purchase orders</p></div>'
        : purchases.map(p => {
          const balance = (p.totalAmount || 0) - (p.amountPaid || 0);
          const isOverdue = p.dueDate && p.dueDate < today && p.paymentStatus !== 'paid';
          const payStatus = p.paymentStatus || 'unpaid';
          return `
          <div class="po-card ${isOverdue ? 'po-overdue' : ''}">
            <div class="po-card-header">
              <h4>${p.poNumber}</h4>
              <div style="display:flex;gap:6px;align-items:center">
                <span class="badge badge-${p.status}">${p.status}</span>
                <span class="badge badge-pay-${payStatus}">${payStatus === 'partial' ? 'Partial' : payStatus === 'paid' ? 'Paid' : 'Unpaid'}</span>
              </div>
            </div>
            <div class="po-card-detail">
              Vendor: ${vendorMap[p.vendorId] || p.vendorName || 'N/A'}<br>
              Date: ${fmtDate(p.date)}${p.creditDays ? ` · Credit: ${p.creditDays} days` : ''}<br>
              ${p.dueDate ? `Due: <span style="color:${isOverdue ? 'var(--danger);font-weight:700' : 'var(--text-muted)'}">${fmtDate(p.dueDate)}${isOverdue ? ' (OVERDUE)' : ''}</span><br>` : ''}
              Items: ${(p.items || []).map(i => `${i.quantity} ${i.name}`).join(', ')}<br>
              Total: ${fmt(p.totalAmount || 0)}${payStatus !== 'unpaid' ? ` · Paid: ${fmt(p.amountPaid || 0)} · Balance: ${fmt(balance)}` : ''}
            </div>
            ${(p.payments || []).length > 0 ? `
              <div class="po-payments-history">
                <small style="color:var(--text-muted)">Payment History:</small>
                ${p.payments.map(pay => `
                  <div class="po-pay-entry">${fmtDate(pay.date)} — ${fmt(pay.amount)} (${pay.method})${pay.note ? ' · ' + pay.note : ''}</div>
                `).join('')}
              </div>
            ` : ''}
            <div class="po-card-actions">
              ${p.status === 'pending' ? `
                <button class="btn btn-sm btn-success po-receive-btn" data-id="${p.id}">Mark Received</button>
                <button class="btn btn-sm btn-outline" style="color:var(--danger)" data-id="${p.id}" onclick="fetch('/api/purchases/${p.id}',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'cancelled'})}).then(()=>loadPurchases())">Cancel</button>
              ` : ''}
              ${p.status !== 'cancelled' && payStatus !== 'paid' ? `
                <button class="btn btn-sm btn-primary po-pay-btn" data-id="${p.id}" data-balance="${balance}" data-po="${p.poNumber}">Record Payment</button>
              ` : ''}
            </div>
          </div>
        `}).join('');

      $$('.po-receive-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          await api(`/purchases/${btn.dataset.id}`, { method: 'PUT', body: { status: 'received' } });
          toast('Purchase received & stock updated'); loadPurchases(); loadPayables(); loadInventory();
        });
      });

      $$('.po-pay-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const balance = parseFloat(btn.dataset.balance);
          const poNum = btn.dataset.po;
          openModal(`Record Payment — ${poNum}`, `
            <div class="form-group">
              <label>Outstanding Balance</label>
              <div style="font-size:18px;font-weight:700;color:var(--danger);margin-bottom:8px">${fmt(balance)}</div>
            </div>
            <div class="form-group"><label>Amount Paying</label>
              <input type="number" id="pay-amount" class="input" value="${balance}" max="${balance}" step="100">
            </div>
            <div class="form-group"><label>Payment Method</label>
              <select id="pay-method" class="input">
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
            <div class="form-group"><label>Note (optional)</label>
              <input type="text" id="pay-note" class="input" placeholder="e.g. Partial payment, check #...">
            </div>
            <button class="btn btn-primary btn-block" id="pay-save">Confirm Payment</button>
          `);
          $('#pay-save').addEventListener('click', async () => {
            const amount = parseFloat($('#pay-amount').value);
            if (!amount || amount <= 0) { toast('Enter a valid amount', 'error'); return; }
            if (amount > balance) { toast('Amount exceeds balance', 'error'); return; }
            await api(`/purchases/${btn.dataset.id}/pay`, { method: 'POST', body: {
              amount, method: $('#pay-method').value, note: $('#pay-note').value
            }});
            closeModal(); toast('Payment recorded'); loadPurchases(); loadPayables();
          });
        });
      });

      $('#po-status-filter').onchange = loadPurchases;

      $('#btn-add-po').onclick = async () => {
        const [inv, freshVendors] = await Promise.all([api('/inventory'), api('/vendors')]);
        openModal('New Purchase Order', `
          <div class="form-group"><label>Vendor</label>
            <select id="po-vendor" class="input">
              <option value="">Select vendor...</option>
              ${freshVendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
            </select>
          </div>
          <div id="po-items-container">
            <label style="font-size:13px;color:var(--text-muted);margin-bottom:6px;display:block">Items</label>
            <div class="po-item-row" style="display:flex;gap:6px;margin-bottom:6px">
              <select class="input-sm po-inv-item" style="flex:2">
                ${inv.map(i => `<option value="${i.id}">${i.name}</option>`).join('')}
              </select>
              <input type="number" class="input-sm po-inv-qty" placeholder="Qty" style="flex:1" value="1">
            </div>
          </div>
          <button class="text-btn" id="po-add-item-btn" style="color:var(--info);margin-bottom:12px">+ Add item</button>
          <div class="form-group"><label>Credit Terms (days)</label>
            <select id="po-credit-days" class="input">
              <option value="0">Pay on delivery</option>
              <option value="7">7 days</option>
              <option value="14" selected>14 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </div>
          <div class="form-group"><label>Notes</label><input type="text" id="po-notes" class="input"></div>
          <button class="btn btn-primary btn-block" id="po-save">Create PO</button>
        `);
        $('#po-add-item-btn').addEventListener('click', () => {
          const row = document.createElement('div');
          row.className = 'po-item-row';
          row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
          row.innerHTML = `
            <select class="input-sm po-inv-item" style="flex:2">
              ${inv.map(i => `<option value="${i.id}">${i.name}</option>`).join('')}
            </select>
            <input type="number" class="input-sm po-inv-qty" placeholder="Qty" style="flex:1" value="1">
          `;
          $('#po-items-container').appendChild(row);
        });
        $('#po-save').addEventListener('click', async () => {
          const items = [];
          $$('.po-item-row').forEach(row => {
            const sel = row.querySelector('.po-inv-item');
            const qty = parseInt(row.querySelector('.po-inv-qty').value) || 0;
            if (qty > 0) {
              const invItem = inv.find(i => i.id === sel.value);
              items.push({ inventoryId: sel.value, name: invItem.name, quantity: qty, unitCost: invItem.costPerUnit });
            }
          });
          const totalAmount = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
          await api('/purchases', { method: 'POST', body: {
            vendorId: $('#po-vendor').value, vendorName: freshVendors.find(v => v.id === $('#po-vendor').value)?.name,
            items, totalAmount, creditDays: parseInt($('#po-credit-days').value) || 0, notes: $('#po-notes').value
          }});
          closeModal(); toast('PO created'); loadPurchases();
        });
      };
    } catch (e) { console.error(e); }
  }

  // ===== PAYABLES =====
  async function loadPayables() {
    try {
      const data = await api('/payables');
      const el = $('#payables-content');
      if (!el) return;

      el.innerHTML = `
        <div class="report-section">
          <h4>Outstanding Payables</h4>
          <div class="report-big-number negative">${fmt(data.totalOutstanding)}</div>
          <div style="text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:8px">Total Owed to Vendors</div>
          ${data.totalOverdue > 0 ? `
            <div class="payable-overdue-banner">
              <span class="material-icons-round">warning</span>
              <span>${fmt(data.totalOverdue)} is overdue</span>
            </div>
          ` : ''}
        </div>

        <div class="report-section">
          <h4>Aging Summary</h4>
          <div class="report-row"><span class="label">Current (not yet due)</span><span class="value">${fmt(data.aging.current)}</span></div>
          <div class="report-row"><span class="label">1–30 days overdue</span><span class="value" style="color:var(--warning)">${fmt(data.aging.days30)}</span></div>
          <div class="report-row"><span class="label">31–60 days overdue</span><span class="value negative">${fmt(data.aging.days60)}</span></div>
          <div class="report-row"><span class="label">60+ days overdue</span><span class="value" style="color:var(--danger);font-weight:700">${fmt(data.aging.days90plus)}</span></div>
        </div>

        ${data.vendorPayables.length > 0 ? `
          <div class="report-section">
            <h4>By Vendor</h4>
            ${data.vendorPayables.map(v => `
              <div class="report-row" style="flex-wrap:wrap;gap:2px">
                <span class="label">${v.vendor} <small style="color:var(--text-dim)">(${v.poCount} PO${v.poCount > 1 ? 's' : ''})</small></span>
                <span class="value negative">${fmt(v.outstanding)}</span>
                ${v.overdue > 0 ? `<span style="width:100%;font-size:11px;color:var(--danger);text-align:right">${fmt(v.overdue)} overdue</span>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${data.unpaidPOs.length > 0 ? `
          <div class="report-section">
            <h4>Unpaid Purchase Orders</h4>
            ${data.unpaidPOs.map(po => `
              <div class="payable-po-item ${po.isOverdue ? 'po-overdue-item' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong>${po.poNumber}</strong>
                  <span class="badge badge-pay-${po.paymentStatus || 'unpaid'}">${po.paymentStatus === 'partial' ? 'Partial' : 'Unpaid'}</span>
                </div>
                <div style="font-size:12px;color:var(--text-muted);margin:4px 0">
                  ${po.vendorName} · Due: <span style="color:${po.isOverdue ? 'var(--danger)' : 'var(--text-muted)'};font-weight:${po.isOverdue ? '700' : '400'}">${fmtDate(po.dueDate)}${po.isOverdue ? ' (OVERDUE)' : po.daysUntilDue !== null ? ` (${po.daysUntilDue}d)` : ''}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:13px">
                  <span>Total: ${fmt(po.totalAmount || 0)}</span>
                  <span>Paid: ${fmt(po.amountPaid || 0)}</span>
                  <span style="font-weight:700;color:var(--danger)">Due: ${fmt(po.balance)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="empty-state"><p>All caught up — no outstanding payables!</p></div>'}
      `;
    } catch (e) { console.error(e); }
  }

  // ===== EXPENSES =====
  async function loadExpenses() {
    try {
      const dateFilter = $('#expense-date-filter');
      if (!dateFilter.value) dateFilter.value = today();

      const loadList = async () => {
        const expenses = await api(`/expenses?date=${dateFilter.value}`);
        const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
        $('#expense-total').textContent = fmt(total);

        $('#expenses-list').innerHTML = expenses.length === 0
          ? '<div class="empty-state"><p>No expenses recorded</p></div>'
          : expenses.map(e => `
            <div class="e-card">
              <div class="e-card-header">
                <h4>${e.description || 'Expense'}</h4>
                <span style="font-weight:700;color:var(--danger)">${fmt(e.amount)}</span>
              </div>
              <div class="e-card-detail">
                ${e.category || 'General'} • ${e.paymentMethod === 'mobile_money' ? 'Mobile Money' : e.paymentMethod === 'card' ? 'Card' : 'Cash'}
                ${e.vendor ? ' • ' + e.vendor : ''}
              </div>
              <div class="e-card-actions">
                <button class="btn btn-sm btn-outline exp-edit-btn" data-id="${e.id}">Edit</button>
                ${isAdmin() ? `<button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="if(confirm('Delete?'))fetch('/api/expenses/${e.id}',{method:'DELETE'}).then(()=>document.querySelector('#expense-date-filter').dispatchEvent(new Event('change')))">Delete</button>` : ''}
              </div>
            </div>
          `).join('');

        $$('.exp-edit-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const e = expenses.find(x => x.id === btn.dataset.id);
            showExpenseModal('Edit Expense', e, async (data) => {
              await api(`/expenses/${btn.dataset.id}`, { method: 'PUT', body: data });
              closeModal(); toast('Updated'); dateFilter.dispatchEvent(new Event('change'));
            });
          });
        });
      };

      dateFilter.onchange = loadList;
      await loadList();

      $('#btn-add-expense').onclick = () => {
        showExpenseModal('Add Expense', { date: today(), paymentMethod: 'cash' }, async (data) => {
          await api('/expenses', { method: 'POST', body: data });
          closeModal(); toast('Expense added'); dateFilter.dispatchEvent(new Event('change'));
        });
      };
    } catch (e) { console.error(e); }
  }

  function showExpenseModal(title, data, onSave) {
    openModal(title, `
      <div class="form-group"><label>Description</label><input type="text" id="exp-desc" class="input" value="${data.description || ''}"></div>
      <div class="form-group"><label>Amount (UGX)</label><input type="number" id="exp-amt" class="input" value="${data.amount || ''}"></div>
      <div class="form-group"><label>Category</label>
        <select id="exp-cat" class="input">
          <option value="Ingredients" ${data.category === 'Ingredients' ? 'selected' : ''}>Ingredients</option>
          <option value="Utilities" ${data.category === 'Utilities' ? 'selected' : ''}>Utilities (electricity, water, gas)</option>
          <option value="Rent" ${data.category === 'Rent' ? 'selected' : ''}>Rent</option>
          <option value="Salaries" ${data.category === 'Salaries' ? 'selected' : ''}>Salaries</option>
          <option value="Transport" ${data.category === 'Transport' ? 'selected' : ''}>Transport</option>
          <option value="Equipment" ${data.category === 'Equipment' ? 'selected' : ''}>Equipment</option>
          <option value="Marketing" ${data.category === 'Marketing' ? 'selected' : ''}>Marketing</option>
          <option value="Other" ${data.category === 'Other' ? 'selected' : ''}>Other</option>
        </select>
      </div>
      <div class="form-group"><label>Payment Method</label>
        <select id="exp-pay" class="input">
          <option value="cash" ${data.paymentMethod === 'cash' ? 'selected' : ''}>Cash</option>
          <option value="mobile_money" ${data.paymentMethod === 'mobile_money' ? 'selected' : ''}>Mobile Money</option>
          <option value="card" ${data.paymentMethod === 'card' ? 'selected' : ''}>Card</option>
        </select>
      </div>
      <div class="form-group"><label>Vendor/Payee</label><input type="text" id="exp-vendor" class="input" value="${data.vendor || ''}"></div>
      <button class="btn btn-primary btn-block" id="exp-save">Save</button>
    `);
    $('#exp-save').addEventListener('click', () => {
      const amt = parseInt($('#exp-amt').value);
      if (!amt) return toast('Enter an amount');
      onSave({
        description: $('#exp-desc').value, amount: amt,
        category: $('#exp-cat').value, paymentMethod: $('#exp-pay').value,
        vendor: $('#exp-vendor').value, date: data.date || today()
      });
    });
  }

  // ===== CUSTOMERS =====
  async function loadCustomers() {
    try {
      const customers = await api('/customers');
      const search = $('#customer-search').value.toLowerCase();
      const filtered = search ? customers.filter(c => (c.name || '').toLowerCase().includes(search) || (c.phone || '').includes(search)) : customers;

      $('#customers-list').innerHTML = filtered.length === 0
        ? '<div class="empty-state"><span class="material-icons-round">people</span><p>No customers yet</p></div>'
        : filtered.map(c => `
          <div class="c-card">
            <div class="c-card-header">
              <h4>${c.name}</h4>
              <span style="font-size:13px;color:var(--text-muted)">${c.visits || 0} visits</span>
            </div>
            <div class="c-card-detail">
              ${c.phone ? 'Phone: ' + c.phone + '<br>' : ''}
              Total Spent: ${fmt(c.totalSpent || 0)}<br>
              ${c.notes ? 'Notes: ' + c.notes : ''}
            </div>
          </div>
        `).join('');

      $('#customer-search').oninput = loadCustomers;

      $('#btn-add-customer').onclick = () => {
        openModal('Add Customer', `
          <div class="form-group"><label>Name</label><input type="text" id="cust-name" class="input"></div>
          <div class="form-group"><label>Phone</label><input type="tel" id="cust-phone" class="input"></div>
          <div class="form-group"><label>Notes</label><textarea id="cust-notes" class="input" rows="2"></textarea></div>
          <button class="btn btn-primary btn-block" id="cust-save">Add</button>
        `);
        $('#cust-save').addEventListener('click', async () => {
          await api('/customers', { method: 'POST', body: {
            name: $('#cust-name').value, phone: $('#cust-phone').value, notes: $('#cust-notes').value
          }});
          closeModal(); toast('Customer added'); loadCustomers();
        });
      };
    } catch (e) { console.error(e); }
  }

  // ===== REPORTS =====
  async function loadReports() {
    const reportDate = $('#report-date');
    const reconDate = $('#recon-date');
    const bsDate = $('#balance-sheet-date');
    if (!reportDate.value) reportDate.value = today();
    if (!reconDate.value) reconDate.value = today();
    if (!bsDate.value) bsDate.value = today();

    // Non-admin: hide Daily and Period tabs, show only Cash Recon
    const reportTabs = $('#page-reports .sub-tabs');
    if (!isAdmin()) {
      // Hide Daily, Period and Receivables tabs, auto-select Cash Recon
      reportTabs.querySelectorAll('.sub-tab').forEach(tab => {
        if (['daily-report', 'range-report', 'receivables-tab', 'balance-sheet-tab'].includes(tab.dataset.subtab)) {
          tab.style.display = 'none';
        }
      });
      // Activate Cash Recon tab
      reportTabs.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
      reportTabs.querySelector('[data-subtab="reconciliation"]').classList.add('active');
      $('#page-reports').querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
      $('#subtab-reconciliation').classList.add('active');
      loadReconciliation(reconDate.value);
    } else {
      // Ensure all tabs visible for admin
      reportTabs.querySelectorAll('.sub-tab').forEach(tab => {
        tab.style.display = '';
      });
    }

    // Default range: last 7 days
    const fromEl = $('#report-from');
    const toEl = $('#report-to');
    if (!toEl.value) toEl.value = today();
    if (!fromEl.value) {
      const d = new Date(); d.setDate(d.getDate() - 7);
      fromEl.value = d.toISOString().split('T')[0];
    }

    $('#btn-load-daily').onclick = () => loadDailyReport(reportDate.value);
    $('#btn-load-range').onclick = () => loadRangeReport(fromEl.value, toEl.value);
    $('#btn-load-recon').onclick = () => loadReconciliation(reconDate.value);
    $('#btn-load-balance-sheet').onclick = () => loadBalanceSheet(bsDate.value);

    // Quick-range presets
    $$('.quick-range').forEach(btn => {
      btn.onclick = () => {
        const now = new Date();
        const toISO = d => d.toISOString().split('T')[0];
        let from, to = toISO(now);
        switch (btn.dataset.range) {
          case 'today': from = to; break;
          case '7d': { const d = new Date(); d.setDate(d.getDate() - 6); from = toISO(d); break; }
          case '30d': { const d = new Date(); d.setDate(d.getDate() - 29); from = toISO(d); break; }
          case 'this-month': from = toISO(new Date(now.getFullYear(), now.getMonth(), 1)); break;
          case 'last-month': {
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = new Date(now.getFullYear(), now.getMonth(), 0);
            from = toISO(start); to = toISO(end); break;
          }
          case 'ytd': from = toISO(new Date(now.getFullYear(), 0, 1)); break;
        }
        fromEl.value = from;
        toEl.value = to;
        loadRangeReport(from, to);
      };
    });

    if (isAdmin()) {
      loadDailyReport(reportDate.value);
      loadReceivables();
      loadBalanceSheet(bsDate.value);
    }
  }

  async function loadDailyReport(date) {
    try {
      const r = await api(`/reports/daily?date=${date}`);
      const maxRev = Math.max(...r.topItems.map(i => i.revenue), 1);

      $('#daily-report-content').innerHTML = `
        <div class="report-section">
          <h4>Revenue & Profit</h4>
          <div class="report-big-number ${r.netProfit >= 0 ? 'positive' : 'negative'}">${fmt(r.netProfit)}</div>
          <div style="text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:8px">Net Profit</div>
          <div class="report-row"><span class="label">Revenue</span><span class="value positive">${fmt(r.totalRevenue)}</span></div>
          <div class="report-row"><span class="label">Cost of Goods</span><span class="value negative">${fmt(r.cogs)}</span></div>
          <div class="report-row"><span class="label">Gross Profit</span><span class="value">${fmt(r.grossProfit)}</span></div>
          <div class="report-row"><span class="label">Gross Margin</span><span class="value">${r.grossMargin}%</span></div>
          <div class="report-row"><span class="label">Expenses</span><span class="value negative">${fmt(r.totalExpenses)}</span></div>
          <div class="report-row"><span class="label">Net Profit</span><span class="value ${r.netProfit >= 0 ? 'positive' : 'negative'}">${fmt(r.netProfit)}</span></div>
        </div>

        ${r.cogsBreakdown && r.cogsBreakdown.length > 0 ? `
          <div class="report-section">
            <h4 class="cogs-toggle" onclick="this.parentElement.classList.toggle('cogs-expanded')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between">
              COGS Breakdown <span class="material-icons" style="font-size:20px;transition:transform 0.2s">expand_more</span>
            </h4>
            <div class="cogs-detail">
              <div class="cogs-table">
                <div class="cogs-header">
                  <span>Item</span><span>Stock Source</span><span>Qty</span><span>Unit Cost</span><span>Total</span><span>Margin</span>
                </div>
                ${r.cogsBreakdown.map(c => `
                  <div class="cogs-row">
                    <span class="cogs-item-name">${c.menuItem}</span>
                    <span class="cogs-stock">${c.stockItem}</span>
                    <span>${c.qtySold}</span>
                    <span>${fmt(c.unitCost)}</span>
                    <span class="negative">${fmt(c.totalCost)}</span>
                    <span style="color:${parseFloat(c.margin) >= 50 ? 'var(--success)' : parseFloat(c.margin) >= 30 ? 'var(--warning, #f39c12)' : 'var(--danger, #e74c3c)'}">${c.margin}%</span>
                  </div>
                `).join('')}
                <div class="cogs-row cogs-total">
                  <span>TOTAL</span><span></span><span>${r.cogsBreakdown.reduce((s,c) => s + c.qtySold, 0)}</span><span></span><span class="negative">${fmt(r.cogs)}</span><span></span>
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="report-section">
          <h4>Orders</h4>
          <div class="report-row"><span class="label">Total Orders</span><span class="value">${r.totalOrders}</span></div>
          <div class="report-row"><span class="label">Paid</span><span class="value positive">${r.paidOrders}</span></div>
          <div class="report-row"><span class="label">Unpaid</span><span class="value negative">${r.unpaidOrders}</span></div>
          <div class="report-row"><span class="label">Average Order Value</span><span class="value">${fmt(r.averageOrderValue)}</span></div>
        </div>

        <div class="report-section">
          <h4>Payment Methods</h4>
          ${Object.entries(r.paymentMethods).map(([method, amount]) => `
            <div class="report-row">
              <span class="label">${method === 'mobile_money' ? 'Mobile Money' : method.charAt(0).toUpperCase() + method.slice(1)}</span>
              <span class="value">${fmt(amount)}</span>
            </div>
          `).join('') || '<p style="color:var(--text-dim);font-size:13px">No payments today</p>'}
        </div>

        <div class="report-section">
          <h4>Top Selling Items</h4>
          <div class="report-bar">
            ${r.topItems.map(i => `
              <div class="bar-item">
                <span class="bar-label">${i.name}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${(i.revenue / maxRev * 100).toFixed(0)}%"></div></div>
                <span class="bar-value">${i.qty}x</span>
              </div>
            `).join('') || '<p style="color:var(--text-dim);font-size:13px">No sales today</p>'}
          </div>
        </div>

        ${r.expenseBreakdown.length > 0 ? `
          <div class="report-section">
            <h4>Expense Breakdown</h4>
            ${r.expenseBreakdown.map(e => `
              <div class="report-row"><span class="label">${e.category}: ${e.description || ''}</span><span class="value negative">${fmt(e.amount)}</span></div>
            `).join('')}
          </div>
        ` : ''}

        ${r.waiterPerformance && r.waiterPerformance.length > 0 ? `
          <div class="report-section">
            <h4>Waiter Performance</h4>
            ${r.waiterPerformance.map(w => `
              <div class="report-row" style="flex-wrap:wrap;gap:2px">
                <span class="label"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">person</span>${w.waiter}</span>
                <span class="value">${fmt(w.revenue)}</span>
                <span style="width:100%;display:flex;justify-content:space-between;font-size:11px;color:var(--text-dim)">
                  <span>${w.orders} orders</span>
                  <span>${w.items} items served</span>
                </span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      `;
    } catch (e) { console.error(e); }
  }

  async function loadRangeReport(from, to) {
    try {
      const r = await api(`/reports/range?from=${from}&to=${to}`);
      const maxRev = Math.max(...r.itemPerformance.map(i => i.revenue), 1);

      // Build daily chart (simple text-based)
      const days = Object.entries(r.dailyData);
      const maxDayRev = Math.max(...days.map(([, d]) => d.revenue), 1);

      $('#range-report-content').innerHTML = `
        <div class="report-section">
          <h4>Period Summary (${fmtDate(from)} - ${fmtDate(to)})</h4>
          <div class="report-big-number ${r.netProfit >= 0 ? 'positive' : 'negative'}">${fmt(r.netProfit)}</div>
          <div style="text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:8px">Net Profit</div>
          <div class="report-row"><span class="label">Total Revenue</span><span class="value positive">${fmt(r.totalRevenue)}</span></div>
          <div class="report-row"><span class="label">Cost of Goods</span><span class="value negative">${fmt(r.totalCogs)}</span></div>
          <div class="report-row"><span class="label">Gross Profit</span><span class="value">${fmt(r.grossProfit)}</span></div>
          <div class="report-row"><span class="label">Gross Margin</span><span class="value">${r.grossMargin}%</span></div>
          <div class="report-row"><span class="label">Total Expenses</span><span class="value negative">${fmt(r.totalExpenses)}</span></div>
          <div class="report-row"><span class="label">Total Orders</span><span class="value">${r.totalOrders}</span></div>
          <div class="report-row"><span class="label">Avg Order Value</span><span class="value">${fmt(r.averageOrderValue)}</span></div>
        </div>

        ${r.cogsBreakdown && r.cogsBreakdown.length > 0 ? `
          <div class="report-section">
            <h4 class="cogs-toggle" onclick="this.parentElement.classList.toggle('cogs-expanded')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between">
              COGS Breakdown <span class="material-icons" style="font-size:20px;transition:transform 0.2s">expand_more</span>
            </h4>
            <div class="cogs-detail">
              <div class="cogs-table">
                <div class="cogs-header">
                  <span>Item</span><span>Stock Source</span><span>Qty</span><span>Unit Cost</span><span>Total</span><span>Margin</span>
                </div>
                ${r.cogsBreakdown.map(c => `
                  <div class="cogs-row">
                    <span class="cogs-item-name">${c.menuItem}</span>
                    <span class="cogs-stock">${c.stockItem}</span>
                    <span>${c.qtySold}</span>
                    <span>${fmt(c.unitCost)}</span>
                    <span class="negative">${fmt(c.totalCost)}</span>
                    <span style="color:${parseFloat(c.margin) >= 50 ? 'var(--success)' : parseFloat(c.margin) >= 30 ? 'var(--warning, #f39c12)' : 'var(--danger, #e74c3c)'}">${c.margin}%</span>
                  </div>
                `).join('')}
                <div class="cogs-row cogs-total">
                  <span>TOTAL</span><span></span><span>${r.cogsBreakdown.reduce((s,c) => s + c.qtySold, 0)}</span><span></span><span class="negative">${fmt(r.totalCogs)}</span><span></span>
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="report-section">
          <h4>Daily Revenue Trend</h4>
          <div class="report-bar">
            ${days.map(([date, d]) => `
              <div class="bar-item">
                <span class="bar-label">${new Date(date).toLocaleDateString('en-UG', {weekday:'short', day:'numeric'})}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${(d.revenue / maxDayRev * 100).toFixed(0)}%;background:var(--success)"></div></div>
                <span class="bar-value">${d.revenue > 0 ? (d.revenue / 1000).toFixed(0) + 'k' : '0'}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="report-section">
          <h4>Item Performance</h4>
          <div class="report-bar">
            ${r.itemPerformance.slice(0, 15).map(i => `
              <div class="bar-item">
                <span class="bar-label">${i.name}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${(i.revenue / maxRev * 100).toFixed(0)}%"></div></div>
                <span class="bar-value">${i.margin}%</span>
              </div>
            `).join('')}
          </div>
        </div>

        ${r.waiterPerformance && r.waiterPerformance.length > 0 ? `
          <div class="report-section">
            <h4>Waiter Performance</h4>
            ${r.waiterPerformance.map(w => `
              <div class="report-row" style="flex-wrap:wrap;gap:2px">
                <span class="label"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">person</span>${w.waiter}</span>
                <span class="value">${fmt(w.revenue)}</span>
                <span style="width:100%;display:flex;justify-content:space-between;font-size:11px;color:var(--text-dim)">
                  <span>${w.orders} orders</span>
                  <span>${w.items} items served</span>
                </span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      `;
    } catch (e) { console.error(e); }
  }

  async function loadReceivables() {
    try {
      const data = await api('/receivables');
      const el = $('#receivables-content');
      if (!el) return;

      el.innerHTML = `
        <div class="report-section">
          <h4>Credit Sales — Outstanding</h4>
          <div class="report-big-number" style="color:var(--info)">${fmt(data.totalReceivable)}</div>
          <div style="text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:8px">
            Total Owed by Customers (${data.creditOrderCount} order${data.creditOrderCount !== 1 ? 's' : ''})
          </div>
          ${data.totalSettled > 0 ? `
            <div style="text-align:center;font-size:12px;color:var(--success);margin-bottom:4px">
              ${fmt(data.totalSettled)} collected in last 30 days
            </div>
          ` : ''}
        </div>

        <div class="report-section">
          <h4>Aging Summary</h4>
          <div class="report-row"><span class="label">Current (0–3 days)</span><span class="value">${fmt(data.aging.current)}</span></div>
          <div class="report-row"><span class="label">4–7 days</span><span class="value" style="color:var(--warning)">${fmt(data.aging.days7)}</span></div>
          <div class="report-row"><span class="label">8–14 days</span><span class="value negative">${fmt(data.aging.days14)}</span></div>
          <div class="report-row"><span class="label">14+ days</span><span class="value" style="color:var(--danger);font-weight:700">${fmt(data.aging.days30plus)}</span></div>
        </div>

        ${data.customerDebts.length > 0 ? `
          <div class="report-section">
            <h4>By Customer</h4>
            ${data.customerDebts.map(c => `
              <div class="receivable-customer">
                <div class="receivable-customer-header" onclick="this.parentElement.classList.toggle('recv-expanded')">
                  <div>
                    <strong>${c.customer}</strong>
                    <small style="color:var(--text-dim);margin-left:6px">${c.orderCount} order${c.orderCount > 1 ? 's' : ''}</small>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-weight:700;color:var(--info)">${fmt(c.outstanding)}</span>
                    <span class="material-icons" style="font-size:18px;transition:transform 0.2s">expand_more</span>
                  </div>
                </div>
                <div class="receivable-orders">
                  ${c.orders.map(o => `
                    <div class="receivable-order-item">
                      <div style="display:flex;justify-content:space-between;align-items:center">
                        <span>Order #${o.orderNumber} · ${fmtDate(o.date)}</span>
                        <span style="font-size:11px;color:${o.daysSinceSale > 14 ? 'var(--danger)' : o.daysSinceSale > 7 ? 'var(--warning)' : 'var(--text-muted)'}">${o.daysSinceSale}d ago</span>
                      </div>
                      <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:4px">
                        <span>Total: ${fmt(o.total)}</span>
                        <span>Paid: ${fmt(o.amountPaid)}</span>
                        <span style="font-weight:700;color:var(--info)">Due: ${fmt(o.balance)}</span>
                      </div>
                      ${o.payments.length > 0 ? `
                        <div style="margin-top:4px;padding-top:4px;border-top:1px solid var(--border)">
                          ${o.payments.map(p => `
                            <div style="font-size:11px;color:var(--text-muted)">${fmtDate(p.date)} — ${fmt(p.amount)} (${p.method})${p.note ? ' · ' + p.note : ''}</div>
                          `).join('')}
                        </div>
                      ` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="empty-state"><p>No outstanding credit sales</p></div>'}
      `;
    } catch (e) { console.error(e); }
  }

  async function loadReconciliation(date) {
    try {
      const r = await api(`/reports/reconciliation?date=${date}`);
      $('#recon-content').innerHTML = `
        <div class="report-section">
          <h4>Cash Reconciliation - ${fmtDate(date)}</h4>
          <div class="report-big-number positive">${fmt(r.expectedCashInHand)}</div>
          <div style="text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:8px">Expected Cash in Hand</div>
        </div>

        <div class="report-section">
          <h4>Sales by Payment Method</h4>
          <div class="report-row"><span class="label">Cash (${r.transactions.cashOrders} orders)</span><span class="value">${fmt(r.cashSales)}</span></div>
          <div class="report-row"><span class="label">Mobile Money (${r.transactions.mobileOrders} orders)</span><span class="value">${fmt(r.mobileSales)}</span></div>
          <div class="report-row"><span class="label">Card (${r.transactions.cardOrders} orders)</span><span class="value">${fmt(r.cardSales)}</span></div>
          ${r.creditCollected > 0 ? `<div class="report-row" style="font-size:12px;color:var(--text-muted)"><span class="label">↳ incl. credit collected today (${r.transactions.creditPayments} payments)</span><span class="value">${fmt(r.creditCollected)}</span></div>` : ''}
          <div class="report-row" style="font-weight:700"><span class="label">Total Sales</span><span class="value positive">${fmt(r.totalSales)}</span></div>
        </div>

        <div class="report-section">
          <h4>Cash Movement</h4>
          <div class="report-row"><span class="label">Cash Sales</span><span class="value positive">${fmt(r.cashSales)}</span></div>
          <div class="report-row"><span class="label">Cash Expenses (${r.transactions.expenseCount})</span><span class="value negative">${fmt(r.cashExpenses)}</span></div>
          <div class="report-row"><span class="label">PO Cash Payments (${r.transactions.purchasePaymentCount || 0})</span><span class="value negative">${fmt(r.cashPurchasePayments || 0)}</span></div>
          <div class="report-row" style="font-weight:700"><span class="label">Expected Cash in Hand</span><span class="value">${fmt(r.expectedCashInHand)}</span></div>
        </div>
      `;
    } catch (e) { console.error(e); }
  }

  // ===== BALANCE SHEET =====
  async function loadBalanceSheet(date) {
    try {
      const r = await api(`/reports/balance-sheet?date=${date}`);
      const a = r.assets, l = r.liabilities, eq = r.equity, cb = a.cashBreakdown;
      $('#balance-sheet-content').innerHTML = `
        <div class="report-section">
          <h4>Balance Sheet — As of ${fmtDate(r.asOfDate)}</h4>
          ${r.balanced ? '' : '<div style="text-align:center;padding:6px;background:var(--danger);color:#fff;border-radius:6px;margin-bottom:8px;font-size:12px">Warning: Balance sheet does not balance — data may be incomplete</div>'}
        </div>

        <div class="report-section">
          <h4>Assets</h4>
          <div class="report-row" style="cursor:pointer" onclick="this.nextElementSibling.classList.toggle('hidden')">
            <span class="label">Cash & Bank</span>
            <span class="value">${fmt(a.cashAndBank)}</span>
          </div>
          <div class="hidden" style="padding:0 0 8px 12px;border-bottom:1px solid var(--border)">
            <div class="report-row" style="font-size:12px"><span class="label">Cash collected</span><span class="value">${fmt(cb.cashCollected)}</span></div>
            <div class="report-row" style="font-size:12px"><span class="label">Mobile money</span><span class="value">${fmt(cb.mobileMoney)}</span></div>
            <div class="report-row" style="font-size:12px"><span class="label">Card collected</span><span class="value">${fmt(cb.cardCollected)}</span></div>
            <div class="report-row" style="font-size:12px"><span class="label">Less: expenses paid</span><span class="value negative">(${fmt(cb.lessExpenses)})</span></div>
            <div class="report-row" style="font-size:12px"><span class="label">Less: purchase payments</span><span class="value negative">(${fmt(cb.lessPurchasePayments)})</span></div>
          </div>

          <div class="report-row">
            <span class="label">Accounts Receivable (${r.receivableCount} orders)</span>
            <span class="value">${fmt(a.accountsReceivable)}</span>
          </div>

          <div class="report-row" style="cursor:pointer" onclick="document.getElementById('bs-inv-detail').classList.toggle('hidden')">
            <span class="label">Inventory</span>
            <span class="value">${fmt(a.inventory)}</span>
          </div>
          <div id="bs-inv-detail" class="hidden" style="padding:0 0 8px 12px;border-bottom:1px solid var(--border)">
            ${r.inventoryItems.map(i => `
              <div class="report-row" style="font-size:12px">
                <span class="label">${i.name} (${i.quantity} ${i.unit} @ ${fmt(i.costPerUnit)})</span>
                <span class="value">${fmt(i.value)}</span>
              </div>
            `).join('') || '<div style="font-size:12px;color:var(--text-dim)">No stock on hand</div>'}
          </div>

          <div class="report-row" style="font-weight:700;border-top:2px solid var(--border-light);padding-top:8px">
            <span class="label">Total Assets</span>
            <span class="value positive">${fmt(a.total)}</span>
          </div>
        </div>

        <div class="report-section">
          <h4>Liabilities</h4>
          <div class="report-row">
            <span class="label">Accounts Payable (${r.payableCount} POs)</span>
            <span class="value">${fmt(l.accountsPayable)}</span>
          </div>
          <div class="report-row" style="font-weight:700;border-top:2px solid var(--border-light);padding-top:8px">
            <span class="label">Total Liabilities</span>
            <span class="value negative">${fmt(l.total)}</span>
          </div>
        </div>

        <div class="report-section">
          <h4>Owner's Equity</h4>
          <div class="report-row" style="cursor:pointer" onclick="this.nextElementSibling.classList.toggle('hidden')">
            <span class="label">Retained Earnings</span>
            <span class="value">${fmt(eq.retainedEarnings)}</span>
          </div>
          <div class="hidden" style="padding:0 0 8px 12px;border-bottom:1px solid var(--border)">
            <div class="report-row" style="font-size:12px"><span class="label">Total Revenue</span><span class="value positive">${fmt(r.summary.totalRevenue)}</span></div>
            <div class="report-row" style="font-size:12px"><span class="label">Less: Cost of Goods</span><span class="value negative">(${fmt(r.summary.totalCogs)})</span></div>
            <div class="report-row" style="font-size:12px"><span class="label">Less: Expenses</span><span class="value negative">(${fmt(r.summary.totalExpenses)})</span></div>
            <div class="report-row" style="font-size:12px;font-weight:600"><span class="label">Net Income</span><span class="value ${r.summary.netIncome >= 0 ? 'positive' : 'negative'}">${fmt(r.summary.netIncome)}</span></div>
          </div>
          <div class="report-row" title="Implied starting capital — captures seed inventory and any pre-existing Inventory ↔ AP drift">
            <span class="label">Opening Balance Equity</span>
            <span class="value">${fmt(eq.openingBalanceEquity || 0)}</span>
          </div>
          <div class="report-row" style="font-weight:700;border-top:2px solid var(--border-light);padding-top:8px">
            <span class="label">Total Equity</span>
            <span class="value">${fmt(eq.total)}</span>
          </div>
        </div>

        <div class="report-section" style="background:var(--bg-card-2);border-radius:var(--radius-sm);padding:12px">
          <div class="report-row" style="font-weight:700">
            <span class="label">Total Assets</span>
            <span class="value positive">${fmt(a.total)}</span>
          </div>
          <div class="report-row" style="font-weight:700">
            <span class="label">Liabilities + Equity</span>
            <span class="value">${fmt(r.totalLiabilitiesAndEquity)}</span>
          </div>
          ${r.balanced ? '<div style="text-align:center;margin-top:6px;font-size:12px;color:var(--success)">Balanced</div>' : '<div style="text-align:center;margin-top:6px;font-size:12px;color:var(--danger)">Imbalanced — review data</div>'}
        </div>
      `;
    } catch (e) { console.error(e); }
  }

  // ===== STAFF =====
  async function loadStaff() {
    if (currentUser.role !== 'manager') {
      $('#staff-list').innerHTML = '<div class="empty-state"><p>Manager access only</p></div>';
      $('#btn-add-staff').classList.add('hidden');
      return;
    }
    try {
      const staff = await api('/staff');
      $('#staff-list').innerHTML = staff.map(s => `
        <div class="s-card">
          <div class="s-card-header">
            <h4>${s.name}</h4>
            <span class="badge badge-${s.active ? 'completed' : 'cancelled'}">${s.active ? 'Active' : 'Inactive'}</span>
          </div>
          <div class="s-card-detail">Role: ${s.role}</div>
          <div style="margin-top:8px;display:flex;gap:6px">
            <button class="btn btn-sm btn-outline staff-edit-btn" data-id="${s.id}">Edit</button>
          </div>
        </div>
      `).join('');

      $$('.staff-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const s = staff.find(x => x.id === btn.dataset.id);
          openModal('Edit Staff', `
            <div class="form-group"><label>Name</label><input type="text" id="st-name" class="input" value="${s.name}"></div>
            <div class="form-group"><label>Role</label>
              <select id="st-role" class="input">
                <option value="manager" ${s.role === 'manager' ? 'selected' : ''}>Manager</option>
                <option value="waiter" ${s.role === 'waiter' ? 'selected' : ''}>Waiter</option>
                <option value="kitchen" ${s.role === 'kitchen' ? 'selected' : ''}>Kitchen</option>
                <option value="cashier" ${s.role === 'cashier' ? 'selected' : ''}>Cashier</option>
              </select>
            </div>
            <div class="form-group"><label>New PIN (4 digits)</label><input type="text" id="st-pin" class="input" maxlength="4" placeholder="Leave blank to keep current"></div>
            <div class="form-group"><label>Active</label>
              <select id="st-active" class="input">
                <option value="true" ${s.active ? 'selected' : ''}>Yes</option>
                <option value="false" ${!s.active ? 'selected' : ''}>No</option>
              </select>
            </div>
            <button class="btn btn-primary btn-block" id="st-save">Save</button>
          `);
          $('#st-save').addEventListener('click', async () => {
            const body = {
              name: $('#st-name').value, role: $('#st-role').value,
              active: $('#st-active').value === 'true'
            };
            const newPin = $('#st-pin').value;
            if (newPin && newPin.length === 4) body.pin = newPin;
            await api(`/staff/${btn.dataset.id}`, { method: 'PUT', body });
            closeModal(); toast('Updated'); loadStaff();
          });
        });
      });

      $('#btn-add-staff').onclick = () => {
        openModal('Add Staff', `
          <div class="form-group"><label>Name</label><input type="text" id="sta-name" class="input"></div>
          <div class="form-group"><label>Role</label>
            <select id="sta-role" class="input">
              <option value="waiter">Waiter</option>
              <option value="kitchen">Kitchen</option>
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <div class="form-group"><label>PIN (4 digits)</label><input type="text" id="sta-pin" class="input" maxlength="4"></div>
          <button class="btn btn-primary btn-block" id="sta-save">Add Staff</button>
        `);
        $('#sta-save').addEventListener('click', async () => {
          const p = $('#sta-pin').value;
          if (!p || p.length !== 4) return toast('PIN must be 4 digits');
          await api('/staff', { method: 'POST', body: {
            name: $('#sta-name').value, role: $('#sta-role').value, pin: p
          }});
          closeModal(); toast('Staff added'); loadStaff();
        });
      };
    } catch (e) { console.error(e); }
  }

  // ===== SETTINGS =====
  async function loadSettings() {
    if (currentUser.role !== 'manager') {
      $('#settings-sub-tabs').classList.add('hidden');
      $('#subtab-settings-general').innerHTML = '<div class="empty-state"><p>Manager access only</p></div>';
      $('#subtab-settings-general').classList.add('active');
      $('#subtab-settings-audit').classList.remove('active');
      return;
    }
    $('#settings-sub-tabs').classList.remove('hidden');
    // Hide audit tab for non-managers (redundant safety check)
    $('#settings-audit-tab').classList.remove('hidden');

    settings = await api('/settings');
    $('#set-name').value = settings.restaurantName || '';
    $('#set-location').value = settings.location || '';
    $('#set-phone').value = settings.phone || '';
    $('#set-email').value = settings.email || '';
    $('#set-tables').value = settings.tables || 10;
    $('#set-receipt').value = settings.receiptFooter || '';

    $('#btn-save-settings').onclick = async () => {
      await api('/settings', { method: 'PUT', body: {
        restaurantName: $('#set-name').value, location: $('#set-location').value,
        phone: $('#set-phone').value, email: $('#set-email').value,
        tables: parseInt($('#set-tables').value), receiptFooter: $('#set-receipt').value
      }});
      settings = await api('/settings');
      populateTableSelect();
      toast('Settings saved');
    };
  }

  // ===== SYSTEM AUDIT LOG =====
  let auditFilter = 'all';

  function parseDeviceUA(ua) {
    if (!ua) return 'Unknown device';
    let os = 'Unknown OS';
    if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';
    let browser = '?';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/Chrome/i.test(ua)) browser = 'Chrome';
    else if (/Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Safari/i.test(ua)) browser = 'Safari';
    return `${browser} / ${os}`;
  }

  function fmtAuditTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short' }) + ' ' +
      d.toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' });
  }

  async function loadAuditLog() {
    const el = $('#audit-log-list');
    if (!el) return;
    try {
      const log = await api('/audit/login-log');

      // Filter buttons
      $$('.audit-filter').forEach(btn => {
        btn.onclick = () => {
          auditFilter = btn.dataset.filter;
          $$('.audit-filter').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderAuditLog(log);
        };
      });

      $('#btn-clear-audit').onclick = async () => {
        if (!confirm('Clear the entire login history? This cannot be undone.')) return;
        await api('/audit/login-log', { method: 'DELETE' });
        toast('Audit log cleared');
        loadAuditLog();
      };

      renderAuditLog(log);
    } catch (e) {
      el.innerHTML = `<div class="empty-state"><p>Failed to load audit log</p></div>`;
    }
  }

  function renderAuditLog(log) {
    const el = $('#audit-log-list');
    let filtered = log;
    if (auditFilter === 'success') filtered = log.filter(e => e.success);
    else if (auditFilter === 'failed') filtered = log.filter(e => !e.success);
    else if (auditFilter === 'alerts') filtered = log.filter(e => e.ipChanged);

    if (!filtered.length) {
      el.innerHTML = `<div class="empty-state"><span class="material-icons-round">verified_user</span><p>${auditFilter === 'alerts' ? 'No IP alerts — all logins from known devices' : 'No log entries'}</p></div>`;
      return;
    }

    el.innerHTML = filtered.map(entry => {
      const device = parseDeviceUA(entry.userAgent);
      const time = fmtAuditTime(entry.timestamp);
      const statusClass = entry.success ? 'audit-status-ok' : 'audit-status-fail';
      const statusLabel = entry.success ? 'Success' : 'Failed';
      return `
        <div class="audit-entry${entry.ipChanged ? ' audit-entry-alert' : ''}">
          ${entry.ipChanged ? '<div class="audit-alert-banner"><span class="material-icons-round">warning</span> New IP / Device detected</div>' : ''}
          <div class="audit-entry-row">
            <div class="audit-user">
              <span class="material-icons-round">${entry.success ? 'person' : 'person_off'}</span>
              <div>
                <div class="audit-name">${entry.staffName || 'Unknown'}</div>
                <div class="audit-role">${entry.role || 'unknown role'}</div>
              </div>
            </div>
            <span class="audit-status ${statusClass}">${statusLabel}</span>
          </div>
          <div class="audit-meta">
            <span class="material-icons-round">schedule</span>${time}
            <span class="material-icons-round">dns</span>${entry.ip}
            <span class="material-icons-round">devices</span>${device}
          </div>
        </div>`;
    }).join('');
  }

  // ===== NOTIFICATION / ALERT SYSTEM =====
  let notifTimer = null;
  let lastNotifCheck = new Date().toISOString();
  let alertAudio = null;

  function initAlertSound() {
    // Create a simple beep using Web Audio API
    alertAudio = {
      play: function(type) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          gain.gain.value = 0.3;

          if (type === 'new-order') {
            // Two-tone chime for new orders (kitchen)
            osc.frequency.value = 880;
            osc.start();
            osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.4);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
            osc.stop(ctx.currentTime + 0.5);
          } else {
            // Rising tone for ready orders (waiter)
            osc.frequency.value = 660;
            osc.start();
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
            osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.3);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
            osc.stop(ctx.currentTime + 0.5);
          }
        } catch (e) { /* Audio not available */ }
      }
    };
  }

  function showAlertBanner(message, type) {
    // Remove existing alert banners
    const existing = document.querySelector('.alert-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'alert-banner';
    banner.innerHTML = `
      <div class="alert-banner-content ${type}">
        <span class="material-icons-round">${type === 'new-order' ? 'notifications_active' : 'check_circle'}</span>
        <span>${message}</span>
        <button class="alert-banner-close" onclick="this.parentElement.parentElement.remove()">
          <span class="material-icons-round">close</span>
        </button>
      </div>
    `;
    document.body.appendChild(banner);

    // Auto-dismiss after 8 seconds
    setTimeout(() => { if (banner.parentElement) banner.remove(); }, 8000);
  }

  function startNotificationPolling() {
    if (notifTimer) clearInterval(notifTimer);
    if (!currentUser) return;

    initAlertSound();
    lastNotifCheck = new Date().toISOString();

    const role = currentUser.role;
    // Kitchen staff polls for new orders, waiters poll for ready orders
    const pollRole = role === 'kitchen' ? 'kitchen' : (role === 'waiter' || role === 'cashier' ? 'waiter' : null);
    if (!pollRole) return; // Admin doesn't need alerts

    notifTimer = setInterval(async () => {
      try {
        const res = await api(`/notifications?since=${encodeURIComponent(lastNotifCheck)}&role=${pollRole}`);
        if (res.alerts && res.alerts.length > 0) {
          lastNotifCheck = new Date().toISOString();

          res.alerts.forEach(alert => {
            if (pollRole === 'kitchen') {
              const itemList = (alert.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ');
              const menuLabel = menuTypeLabel(alert.menuType);
              showAlertBanner(
                `NEW ORDER #${alert.orderNumber} (${menuLabel})${alert.table ? ' - Table ' + alert.table : ''}: ${itemList}`,
                'new-order'
              );
              alertAudio.play('new-order');
            } else {
              showAlertBanner(
                `ORDER #${alert.orderNumber} IS READY${alert.table ? ' - Table ' + alert.table : ''}`,
                'order-ready'
              );
              alertAudio.play('order-ready');
            }
          });

          // Also vibrate if supported
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

          // Auto-refresh current page if relevant
          if (pollRole === 'kitchen' && currentPage === 'kitchen') loadKitchen();
          if (pollRole === 'waiter' && currentPage === 'orders') loadOrders();
        }
      } catch (e) { /* silent fail on poll */ }
    }, 5000); // Poll every 5 seconds
  }

  function stopNotificationPolling() {
    if (notifTimer) { clearInterval(notifTimer); notifTimer = null; }
  }

  // --- INIT ---
  initLogin();
  initNav();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Expose for inline handlers
  window.loadProcurement = loadProcurement;
  window.loadPurchases = loadPurchases;

})();
