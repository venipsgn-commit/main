/* ============================================
   VENIPS – APPLICATION JAVASCRIPT
   Base de données : localStorage
   ============================================ */

'use strict';

// ============================================
// AUTHENTIFICATION
// ============================================
const AUTH = {
  USERS: [
    { username: 'VENIPS', password: 'venips224@', role: 'admin',   display: 'VENIPS' },
    { username: 'JACOB',  password: 'compilateur787', role: 'vendeur', display: 'JACOB'  }
  ],
  KEY: 'venips_session',

  currentUser() {
    try { return JSON.parse(sessionStorage.getItem(this.KEY)); } catch { return null; }
  },
  isLoggedIn()  { return !!this.currentUser(); },
  isAdmin()     { return this.currentUser()?.role === 'admin'; },
  displayName() { return this.currentUser()?.display || ''; },

  login(username, password) {
    const u = this.USERS.find(x => x.username === username && x.password === password);
    if (u) { sessionStorage.setItem(this.KEY, JSON.stringify(u)); return true; }
    return false;
  },
  logout() { sessionStorage.removeItem(this.KEY); }
};

(function initAuth() {
  const screen   = document.getElementById('loginScreen');
  const btnLogin = document.getElementById('loginBtn');
  const userEl   = document.getElementById('loginUser');
  const passEl   = document.getElementById('loginPass');
  const errEl    = document.getElementById('loginError');
  const eyeBtn   = document.getElementById('loginEye');

  function applyRoleUI() {
    const user = AUTH.currentUser();
    if (!user) return;

    // Afficher le nom dans la topbar
    const titleUser = document.getElementById('topbarUser');
    if (titleUser) titleUser.textContent = user.display;

    // Réinitialiser les éléments restreints
    document.getElementById('btnAddStock').style.display = '';
    const ventesSummary = document.querySelector('#page-ventes .summary-row');
    if (ventesSummary) ventesSummary.style.display = '';
    const stockSummaryCards = document.querySelectorAll('#page-stock .summary-card');
    if (stockSummaryCards[2]) stockSummaryCards[2].style.display = '';

    if (user.role === 'vendeur') {
      document.querySelectorAll('.nav-item').forEach(el => {
        const p = el.dataset.page;
        el.style.display = (p === 'ventes' || p === 'stock') ? '' : 'none';
      });
      if (ventesSummary) ventesSummary.style.display = 'none';
      document.getElementById('btnAddStock').style.display = 'none';
      if (stockSummaryCards[2]) stockSummaryCards[2].style.display = 'none';
    } else {
      document.querySelectorAll('.nav-item').forEach(el => el.style.display = '');
    }
  }

  function showApp() {
    screen.classList.add('hidden');
    applyRoleUI();
  }
  function showLogin() {
    screen.classList.remove('hidden');
    // Réinitialiser la sidebar
    document.querySelectorAll('.nav-item').forEach(el => el.style.display = '');
  }

  if (AUTH.isLoggedIn()) { showApp(); } else { showLogin(); }

  eyeBtn.addEventListener('click', () => {
    const isPass = passEl.type === 'password';
    passEl.type  = isPass ? 'text' : 'password';
    eyeBtn.textContent = isPass ? '🙈' : '👁️';
  });

  function tryLogin() {
    const user = userEl.value.trim();
    const pass = passEl.value;
    if (AUTH.login(user, pass)) {
      errEl.classList.remove('show');
      showApp();
    } else {
      errEl.textContent = 'Nom d\'utilisateur ou mot de passe incorrect.';
      errEl.classList.add('show');
      passEl.value = '';
      passEl.focus();
    }
  }

  btnLogin.addEventListener('click', tryLogin);
  passEl.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  userEl.addEventListener('keydown', e => { if (e.key === 'Enter') passEl.focus(); });

  document.getElementById('btnLogout').addEventListener('click', () => {
    AUTH.logout();
    showLogin();
    userEl.value = '';
    passEl.value = '';
  });
})();

// ============================================
// BASE DE DONNÉES (localStorage)
// ============================================
const DB = {
  _tables: ['stock', 'ventes', 'vendeurs', 'charges', 'dettes'],

  load(table) {
    try {
      return JSON.parse(localStorage.getItem('bp_' + table) || '[]');
    } catch { return []; }
  },

  save(table, data) {
    localStorage.setItem('bp_' + table, JSON.stringify(data));
  },

  getAll(table) {
    return this.load(table);
  },

  insert(table, record) {
    const data = this.load(table);
    record.id = Date.now() + Math.floor(Math.random() * 1000);
    record.createdAt = new Date().toISOString();
    data.push(record);
    this.save(table, data);
    return record;
  },

  update(table, id, updates) {
    const data = this.load(table);
    const idx = data.findIndex(r => r.id === id);
    if (idx !== -1) {
      data[idx] = { ...data[idx], ...updates, updatedAt: new Date().toISOString() };
      this.save(table, data);
      return data[idx];
    }
    return null;
  },

  delete(table, id) {
    const data = this.load(table).filter(r => r.id !== id);
    this.save(table, data);
  },

  findById(table, id) {
    return this.load(table).find(r => r.id === id) || null;
  }
};

// ============================================
// UTILITAIRES
// ============================================
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' GNF';
const fmtNum = n => new Intl.NumberFormat('fr-FR').format(n || 0);
const today = () => new Date().toISOString().slice(0, 10);
const ym = (d) => d ? d.slice(0, 7) : '';
const currentYM = () => today().slice(0, 7);
const prevYM = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

function toast(msg, type = 'success') {
  const tc = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', warning: '⚠' };
  t.innerHTML = `<span>${icons[type] || '•'}</span><span>${msg}</span>`;
  tc.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function showModal(id) {
  document.getElementById(id).classList.add('open');
}
function hideModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ============================================
// NAVIGATION
// ============================================
const pageTitles = {
  dashboard: 'Dashboard',
  ventes: 'Gestion des Ventes',
  stock: 'Gestion du Stock',
  vendeurs: 'Gestion des Vendeurs',
  charges: 'Gestion des Charges',
  dettes: 'Gestion des Dettes'
};

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  const pageEl = document.getElementById(`page-${page}`);
  if (navItem) navItem.classList.add('active');
  if (pageEl) pageEl.classList.add('active');
  document.getElementById('pageTitle').textContent = pageTitles[page] || page;
  // Mémoriser la page courante pour JACOB
  if (AUTH.currentUser()?.role === 'vendeur') {
    sessionStorage.setItem('venips_last_page', page);
  }
  if (page === 'dashboard') renderDashboard();
  if (page === 'ventes') renderVentes();
  if (page === 'stock') renderStock();
  if (page === 'vendeurs') renderVendeurs();
  if (page === 'charges') renderCharges();
  if (page === 'dettes') renderDettes();
}

// ============================================
// DASHBOARD
// ============================================
let chartVentes = null;
let chartGains = null;

function renderDashboard() {
  if (typeof Chart === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = () => renderDashboard();
    document.head.appendChild(s);
    return;
  }
  const ventes = DB.getAll('ventes');
  const stock = DB.getAll('stock');
  const charges = DB.getAll('charges');
  const dettes = DB.getAll('dettes');

  // KPIs
  const totalCA = ventes.reduce((s, v) => s + (v.pv * v.qty), 0);
  const totalGain = ventes.reduce((s, v) => s + v.gain, 0);
  const totalQty = ventes.reduce((s, v) => s + v.qty, 0);
  const totalCharges = charges.reduce((s, c) => s + c.montant, 0);
  const totalStockItems = stock.reduce((s, p) => s + p.qty, 0);
  const ruptures = stock.filter(p => p.qty === 0).length;

  document.getElementById('kpi-ca').textContent = fmt(totalCA);
  document.getElementById('kpi-gain').textContent = fmt(totalGain);
  document.getElementById('kpi-sold').textContent = fmtNum(totalQty);
  document.getElementById('kpi-charges').textContent = fmt(totalCharges);
  document.getElementById('kpi-stock').textContent = fmtNum(totalStockItems);
  document.getElementById('kpi-rupture').textContent = fmtNum(ruptures);


  // Comparaison mensuelle
  const curYM = currentYM();
  const pYM = prevYM();
  const curSales = ventes.filter(v => ym(v.date) === curYM).reduce((s, v) => s + v.pv * v.qty, 0);
  const prevSales = ventes.filter(v => ym(v.date) === pYM).reduce((s, v) => s + v.pv * v.qty, 0);
  const curGainM = ventes.filter(v => ym(v.date) === curYM).reduce((s, v) => s + v.gain, 0);
  const prevGainM = ventes.filter(v => ym(v.date) === pYM).reduce((s, v) => s + v.gain, 0);

  document.getElementById('comp-current-sales').textContent = fmt(curSales);
  document.getElementById('comp-prev-sales').textContent = fmt(prevSales);
  document.getElementById('comp-current-gain').textContent = fmt(curGainM);
  document.getElementById('comp-prev-gain').textContent = fmt(prevGainM);

  setBadge('comp-badge-sales', curSales, prevSales);
  setBadge('comp-badge-gain', curGainM, prevGainM);

  // Bénéfice net
  const netProfit = totalGain - totalCharges;
  const netEl = document.getElementById('net-profit');
  netEl.textContent = fmt(netProfit);
  netEl.className = 'net-value' + (netProfit < 0 ? ' negative' : '');

  const unpaidDettes = dettes.filter(d => d.statut === 'Non payé').length;
  document.getElementById('unpaid-debts').textContent = unpaidDettes;

  // Graphiques (12 derniers mois)
  const months = getLast12Months();
  const salesByMonth = months.map(m => ventes.filter(v => ym(v.date) === m).reduce((s, v) => s + v.pv * v.qty, 0));
  const gainsByMonth = months.map(m => ventes.filter(v => ym(v.date) === m).reduce((s, v) => s + v.gain, 0));
  const labels = months.map(m => {
    const [y, mo] = m.split('-');
    return MONTHS_FR[parseInt(mo) - 1] + ' ' + y.slice(2);
  });

  renderChart('chartVentes', labels, salesByMonth, 'Ventes (GNF)', '#4f46e5', chartVentes, c => chartVentes = c);
  renderChart('chartGains', labels, gainsByMonth, 'Gains (GNF)', '#10b981', chartGains, c => chartGains = c);

  // Dernières ventes
  const recent = [...ventes].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
  const recentBody = document.getElementById('recentSalesBody');
  if (recent.length === 0) {
    recentBody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">🛒</div><p>Aucune vente enregistrée</p></div></td></tr>`;
  } else {
    recentBody.innerHTML = recent.map(v => `
      <tr>
        <td data-label="Date">${formatDate(v.date)}</td>
        <td data-label="Produit">${escHtml(v.produit)}</td>
        <td data-label="Qté">${v.qty}</td>
        <td data-label="Gain" class="${v.gain >= 0 ? 'gain-pos' : 'gain-neg'}">${fmt(v.gain)}</td>
      </tr>`).join('');
  }

  // Stock faible
  const lowBody = document.getElementById('lowStockBody');
  const lowItems = stock.filter(p => p.qty <= 10).sort((a, b) => a.qty - b.qty);
  if (lowItems.length === 0) {
    lowBody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><div class="empty-icon">✅</div><p>Aucun produit en stock faible</p></div></td></tr>`;
  } else {
    lowBody.innerHTML = lowItems.map(p => `
      <tr>
        <td data-label="Produit">${escHtml(p.nom)}</td>
        <td data-label="Qté">${p.qty}</td>
        <td data-label="Statut">${p.qty === 0
          ? '<span class="badge badge-danger">Rupture</span>'
          : '<span class="badge badge-warning">Faible</span>'}</td>
      </tr>`).join('');
  }
}

function setBadge(id, cur, prev) {
  const el = document.getElementById(id);
  if (!el) return;
  if (prev === 0 && cur === 0) { el.textContent = '0%'; el.className = 'comp-badge'; return; }
  if (prev === 0) { el.textContent = '+∞'; el.className = 'comp-badge up'; return; }
  const pct = ((cur - prev) / prev * 100).toFixed(1);
  el.textContent = (pct >= 0 ? '+' : '') + pct + '%';
  el.className = 'comp-badge ' + (pct >= 0 ? 'up' : 'down');
}

function getLast12Months() {
  const months = [];
  const d = new Date();
  for (let i = 11; i >= 0; i--) {
    const dd = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(dd.toISOString().slice(0, 7));
  }
  return months;
}

function renderChart(canvasId, labels, data, label, color, existing, setter) {
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label,
        data,
        backgroundColor: color + '33',
        borderColor: color,
        borderWidth: 2,
        borderRadius: 6,
        hoverBackgroundColor: color + '66'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: v => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v)
          },
          grid: { color: '#e2e8f0' }
        },
        x: { grid: { display: false } }
      }
    }
  });
  setter(chart);
}

// ============================================
// VENTES
// ============================================
let editVenteId = null;

function renderVentes() {
  let ventes = DB.getAll('ventes');
  const monthFilter = document.getElementById('filterVenteMonth').value;
  const searchFilter = document.getElementById('filterVenteSearch').value.toLowerCase();

  if (monthFilter) ventes = ventes.filter(v => ym(v.date) === monthFilter);
  if (searchFilter) ventes = ventes.filter(v =>
    v.produit.toLowerCase().includes(searchFilter) ||
    (v.vendeur || '').toLowerCase().includes(searchFilter)
  );

  ventes.sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalCA = ventes.reduce((s, v) => s + v.pv * v.qty, 0);
  const totalGain = ventes.reduce((s, v) => s + v.gain, 0);
  const totalQty = ventes.reduce((s, v) => s + v.qty, 0);

  document.getElementById('vente-ca-filtered').textContent = fmt(totalCA);
  document.getElementById('vente-gain-filtered').textContent = fmt(totalGain);
  document.getElementById('vente-qty-filtered').textContent = fmtNum(totalQty);

  const tbody = document.getElementById('ventesBody');
  if (ventes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🛒</div><p>Aucune vente trouvée</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = ventes.map(v => `
    <tr>
      <td data-label="Date">${formatDate(v.date)}</td>
      <td data-label="Produit">${escHtml(v.produit)}</td>
      <td data-label="Qté">${v.qty}</td>
      <td data-label="Prix Achat">${fmt(v.pa)}</td>
      <td data-label="Prix Vente">${fmt(v.pv)}</td>
      <td data-label="Gain" class="${v.gain >= 0 ? 'gain-pos' : 'gain-neg'}">${fmt(v.gain)}</td>
      <td data-label="Vendeur">${escHtml(v.vendeur || '—')}</td>
      <td data-label="Actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditVente(${v.id})">✏️ Modifier</button>
        ${AUTH.isAdmin() ? `<button class="btn btn-sm btn-danger" onclick="confirmDelete('ventes',${v.id},'la vente')">🗑️</button>` : ''}
      </td>
    </tr>`).join('');
}

function openAddVente() {
  editVenteId = null;
  document.getElementById('modalVenteTitle').textContent = 'Nouvelle Vente';
  document.getElementById('vente-date').value = today();
  document.getElementById('vente-qty').value = 1;
  document.getElementById('vente-pa').value = '';
  document.getElementById('vente-pv').value = '';
  document.getElementById('vente-gain').value = '';
  populateStockSelect('vente-produit');

  const sel = document.getElementById('vente-vendeur');
  if (!AUTH.isAdmin()) {
    // JACOB : vendeur fixé, champ désactivé
    sel.innerHTML = `<option value="${AUTH.displayName()}" selected>${AUTH.displayName()}</option>`;
    sel.disabled = true;
  } else {
    sel.disabled = false;
    populateVendeurSelect('vente-vendeur', AUTH.displayName());
  }
  showModal('modalVente');
}

function openEditVente(id) {
  const v = DB.findById('ventes', id);
  if (!v) return;
  editVenteId = id;
  document.getElementById('modalVenteTitle').textContent = 'Modifier Vente';
  document.getElementById('vente-date').value = v.date;
  document.getElementById('vente-qty').value = v.qty;
  document.getElementById('vente-pa').value = v.pa;
  document.getElementById('vente-pv').value = v.pv;
  document.getElementById('vente-gain').value = v.gain;
  populateStockSelect('vente-produit', v.produit);
  populateVendeurSelect('vente-vendeur', v.vendeur);
  showModal('modalVente');
}

function populateStockSelect(selectId, selectedNom = '') {
  const sel = document.getElementById(selectId);
  const stock = DB.getAll('stock');
  sel.innerHTML = '<option value="">-- Sélectionner --</option>';
  stock.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.nom;
    opt.textContent = `${p.nom} (stock: ${p.qty})`;
    opt.dataset.pa = p.pa;
    opt.dataset.pv = p.pv;
    if (p.nom === selectedNom) opt.selected = true;
    sel.appendChild(opt);
  });
  // Auto-fill prix on change
  sel.onchange = () => {
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.dataset.pa) {
      document.getElementById('vente-pa').value = opt.dataset.pa;
      document.getElementById('vente-pv').value = opt.dataset.pv;
      calcGain();
    }
  };
  if (selectedNom) sel.dispatchEvent(new Event('change'));
}

function populateVendeurSelect(selectId, selectedNom = '') {
  const sel = document.getElementById(selectId);
  const vendeurs = DB.getAll('vendeurs');
  sel.innerHTML = '<option value="">-- Sélectionner --</option>';
  vendeurs.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.nom;
    opt.textContent = v.nom;
    if (v.nom === selectedNom) opt.selected = true;
    sel.appendChild(opt);
  });
}

function calcGain() {
  const qty = parseFloat(document.getElementById('vente-qty').value) || 0;
  const pa = parseFloat(document.getElementById('vente-pa').value) || 0;
  const pv = parseFloat(document.getElementById('vente-pv').value) || 0;
  document.getElementById('vente-gain').value = (pv - pa) * qty;
}

function saveVente() {
  const date = document.getElementById('vente-date').value;
  const produit = document.getElementById('vente-produit').value;
  const qty = parseInt(document.getElementById('vente-qty').value);
  const pa = parseFloat(document.getElementById('vente-pa').value) || 0;
  const pv = parseFloat(document.getElementById('vente-pv').value);
  const vendeur = document.getElementById('vente-vendeur').value;

  if (!date || !produit || !qty || !pv) {
    toast('Veuillez remplir tous les champs obligatoires.', 'error'); return;
  }
  if (qty <= 0) { toast('Quantité invalide.', 'error'); return; }

  // Vérif stock (seulement pour nouvelle vente)
  if (!editVenteId) {
    const stockItem = DB.getAll('stock').find(s => s.nom === produit);
    if (stockItem && stockItem.qty < qty) {
      toast(`Stock insuffisant. Disponible : ${stockItem.qty}`, 'error'); return;
    }
    // Déduire du stock
    if (stockItem) {
      DB.update('stock', stockItem.id, { qty: stockItem.qty - qty });
    }
  }

  const gain = (pv - pa) * qty;
  const record = { date, produit, qty, pa, pv, gain, vendeur };

  if (editVenteId) {
    DB.update('ventes', editVenteId, record);
    toast('Vente modifiée avec succès.');
  } else {
    DB.insert('ventes', record);
    const who = AUTH.displayName();
    toast(`✅ ${who} a ajouté une vente — ${produit}`, 'success');
  }

  hideModal('modalVente');
  renderVentes();
}

// ============================================
// STOCK
// ============================================
let editStockId = null;

function renderStock() {
  let stock = DB.getAll('stock');
  const statusFilter = document.getElementById('filterStockStatus').value;
  const searchFilter = document.getElementById('filterStockSearch').value.toLowerCase();

  if (statusFilter) stock = stock.filter(p => {
    const s = p.qty > 0 ? 'Disponible' : 'Rupture';
    return s === statusFilter;
  });
  if (searchFilter) stock = stock.filter(p => p.nom.toLowerCase().includes(searchFilter));

  stock.sort((a, b) => a.nom.localeCompare(b.nom));

  const total = DB.getAll('stock');
  const dispo = total.filter(p => p.qty > 0).length;
  const rupture = total.filter(p => p.qty === 0).length;
  const valeur = total.reduce((s, p) => s + p.pa * p.qty, 0);

  document.getElementById('stock-dispo').textContent = fmtNum(dispo);
  document.getElementById('stock-rupture').textContent = fmtNum(rupture);
  document.getElementById('stock-valeur').textContent = fmt(valeur);

  const isAdmin = AUTH.isAdmin();
  // Afficher/masquer les colonnes financières selon le rôle
  const stockThs = document.querySelectorAll('#page-stock thead th');
  // indices: 0=Produit, 1=Qté, 2=PrixAchat, 3=PrixVente, 4=Marge, 5=Statut, 6=Actions
  [2, 3, 4, 6].forEach(i => { if (stockThs[i]) stockThs[i].style.display = isAdmin ? '' : 'none'; });

  const tbody = document.getElementById('stockBody');
  if (stock.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${isAdmin ? 7 : 3}"><div class="empty-state"><div class="empty-icon">📦</div><p>Aucun produit trouvé</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = stock.map(p => {
    const statut = p.qty === 0 ? '<span class="badge badge-danger">Rupture</span>'
      : p.qty <= 5 ? '<span class="badge badge-warning">Faible</span>'
      : '<span class="badge badge-success">Disponible</span>';
    if (!isAdmin) {
      return `<tr>
        <td data-label="Produit"><strong>${escHtml(p.nom)}</strong></td>
        <td data-label="Qté Disponible">${p.qty}</td>
        <td data-label="Statut">${statut}</td>
      </tr>`;
    }
    const marge = p.pa > 0 ? (((p.pv - p.pa) / p.pa) * 100).toFixed(1) : 0;
    return `<tr>
      <td data-label="Produit"><strong>${escHtml(p.nom)}</strong></td>
      <td data-label="Qté">${p.qty}</td>
      <td data-label="Prix Achat">${fmt(p.pa)}</td>
      <td data-label="Prix Vente">${fmt(p.pv)}</td>
      <td data-label="Marge" class="${marge >= 0 ? 'gain-pos' : 'gain-neg'}">${marge}%</td>
      <td data-label="Statut">${statut}</td>
      <td data-label="Actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditStock(${p.id})">✏️ Modifier</button>
        <button class="btn btn-sm btn-danger" onclick="confirmDelete('stock',${p.id},'le produit')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function openAddStock() {
  editStockId = null;
  document.getElementById('modalStockTitle').textContent = 'Ajouter Produit';
  document.getElementById('stock-nom').value = '';
  document.getElementById('stock-qty').value = '';
  document.getElementById('stock-pa').value = '';
  document.getElementById('stock-pv').value = '';
  showModal('modalStock');
}

function openEditStock(id) {
  const p = DB.findById('stock', id);
  if (!p) return;
  editStockId = id;
  document.getElementById('modalStockTitle').textContent = 'Modifier Produit';
  document.getElementById('stock-nom').value = p.nom;
  document.getElementById('stock-qty').value = p.qty;
  document.getElementById('stock-pa').value = p.pa;
  document.getElementById('stock-pv').value = p.pv;
  showModal('modalStock');
}

function saveStock() {
  const nom = document.getElementById('stock-nom').value.trim();
  const qty = parseInt(document.getElementById('stock-qty').value);
  const pa = parseFloat(document.getElementById('stock-pa').value);
  const pv = parseFloat(document.getElementById('stock-pv').value);

  if (!nom || isNaN(qty) || isNaN(pa) || isNaN(pv)) {
    toast('Veuillez remplir tous les champs obligatoires.', 'error'); return;
  }
  if (qty < 0) { toast('Quantité ne peut pas être négative.', 'error'); return; }
  if (pa < 0 || pv < 0) { toast('Prix invalide.', 'error'); return; }

  // Vérifier doublon nom (hors édition)
  const existing = DB.getAll('stock').find(p => p.nom.toLowerCase() === nom.toLowerCase() && p.id !== editStockId);
  if (existing) { toast('Un produit avec ce nom existe déjà.', 'error'); return; }

  if (editStockId) {
    DB.update('stock', editStockId, { nom, qty, pa, pv });
    toast('Produit modifié avec succès.');
  } else {
    DB.insert('stock', { nom, qty, pa, pv });
    toast('Produit ajouté avec succès.');
  }
  hideModal('modalStock');
  renderStock();
}

// ============================================
// VENDEURS
// ============================================
let editVendeurId = null;

function renderVendeurs() {
  const vendeurs = DB.getAll('vendeurs');
  const ventes = DB.getAll('ventes');
  const tbody = document.getElementById('vendeursBody');

  if (vendeurs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👨‍💼</div><p>Aucun vendeur enregistré</p></div></td></tr>`;
    return;
  }

  const maxCA = Math.max(1, ...vendeurs.map(v =>
    ventes.filter(s => s.vendeur === v.nom).reduce((sum, s) => sum + s.pv * s.qty, 0)
  ));

  tbody.innerHTML = vendeurs.map(v => {
    const ventesDu = ventes.filter(s => s.vendeur === v.nom);
    const produits = [...new Set(ventesDu.map(s => s.produit))].join(', ') || '—';
    const totalQty = ventesDu.reduce((s, x) => s + x.qty, 0);
    const totalCA = ventesDu.reduce((s, x) => s + x.pv * x.qty, 0);
    const perf = Math.round((totalCA / maxCA) * 100);
    return `<tr>
      <td data-label="Vendeur"><strong>${escHtml(v.nom)}</strong></td>
      <td data-label="Produits" title="${produits}">${produits.length > 40 ? produits.slice(0, 40) + '…' : produits}</td>
      <td data-label="Qtés">${fmtNum(totalQty)}</td>
      <td data-label="Montant">${fmt(totalCA)}</td>
      <td data-label="Performance">
        <div class="perf-bar">
          <div class="perf-track"><div class="perf-fill" style="width:${perf}%"></div></div>
          <span style="font-size:.8rem;color:var(--muted);min-width:30px">${perf}%</span>
        </div>
      </td>
      <td data-label="Actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditVendeur(${v.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="confirmDelete('vendeurs',${v.id},'le vendeur')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function openAddVendeur() {
  editVendeurId = null;
  document.getElementById('modalVendeurTitle').textContent = 'Ajouter Vendeur';
  document.getElementById('vendeur-nom').value = '';
  showModal('modalVendeur');
}

function openEditVendeur(id) {
  const v = DB.findById('vendeurs', id);
  if (!v) return;
  editVendeurId = id;
  document.getElementById('modalVendeurTitle').textContent = 'Modifier Vendeur';
  document.getElementById('vendeur-nom').value = v.nom;
  showModal('modalVendeur');
}

function saveVendeur() {
  const nom = document.getElementById('vendeur-nom').value.trim();
  if (!nom) { toast('Veuillez entrer un nom.', 'error'); return; }

  const existing = DB.getAll('vendeurs').find(v => v.nom.toLowerCase() === nom.toLowerCase() && v.id !== editVendeurId);
  if (existing) { toast('Ce vendeur existe déjà.', 'error'); return; }

  if (editVendeurId) {
    DB.update('vendeurs', editVendeurId, { nom });
    toast('Vendeur modifié.');
  } else {
    DB.insert('vendeurs', { nom });
    toast('Vendeur ajouté.');
  }
  hideModal('modalVendeur');
  renderVendeurs();
}

// ============================================
// CHARGES
// ============================================
let editChargeId = null;

function renderCharges() {
  let charges = DB.getAll('charges');
  const monthFilter = document.getElementById('filterChargeMonth').value;
  const typeFilter = document.getElementById('filterChargeType').value;

  const total = charges.reduce((s, c) => s + c.montant, 0);
  const thisMonth = charges.filter(c => ym(c.date) === currentYM()).reduce((s, c) => s + c.montant, 0);
  document.getElementById('charges-total').textContent = fmt(total);
  document.getElementById('charges-month').textContent = fmt(thisMonth);

  if (monthFilter) charges = charges.filter(c => ym(c.date) === monthFilter);
  if (typeFilter) charges = charges.filter(c => c.type === typeFilter);
  charges.sort((a, b) => new Date(b.date) - new Date(a.date));

  const tbody = document.getElementById('chargesBody');
  if (charges.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">💸</div><p>Aucune charge trouvée</p></div></td></tr>`;
    return;
  }
  const typeColors = { Courant: 'info', Location: 'warning', Réparation: 'danger', Salaire: 'success', Autre: '' };
  tbody.innerHTML = charges.map(c => `
    <tr>
      <td data-label="Date">${formatDate(c.date)}</td>
      <td data-label="Type"><span class="badge badge-${typeColors[c.type] || 'info'}">${escHtml(c.type)}</span></td>
      <td data-label="Montant"><strong>${fmt(c.montant)}</strong></td>
      <td data-label="Description">${escHtml(c.desc || '—')}</td>
      <td data-label="Actions">
        <button class="btn-icon" onclick="openEditCharge(${c.id})">✏️</button>
        <button class="btn-icon" onclick="confirmDelete('charges',${c.id},'la charge')">🗑️</button>
      </td>
    </tr>`).join('');
}

function openAddCharge() {
  editChargeId = null;
  document.getElementById('modalChargeTitle').textContent = 'Ajouter Charge';
  document.getElementById('charge-date').value = today();
  document.getElementById('charge-type').value = '';
  document.getElementById('charge-montant').value = '';
  document.getElementById('charge-desc').value = '';
  showModal('modalCharge');
}

function openEditCharge(id) {
  const c = DB.findById('charges', id);
  if (!c) return;
  editChargeId = id;
  document.getElementById('modalChargeTitle').textContent = 'Modifier Charge';
  document.getElementById('charge-date').value = c.date;
  document.getElementById('charge-type').value = c.type;
  document.getElementById('charge-montant').value = c.montant;
  document.getElementById('charge-desc').value = c.desc || '';
  showModal('modalCharge');
}

function saveCharge() {
  const date = document.getElementById('charge-date').value;
  const type = document.getElementById('charge-type').value;
  const montant = parseFloat(document.getElementById('charge-montant').value);
  const desc = document.getElementById('charge-desc').value.trim();

  if (!date || !type || isNaN(montant) || montant <= 0) {
    toast('Veuillez remplir tous les champs obligatoires.', 'error'); return;
  }

  if (editChargeId) {
    DB.update('charges', editChargeId, { date, type, montant, desc });
    toast('Charge modifiée.');
  } else {
    DB.insert('charges', { date, type, montant, desc });
    toast('Charge ajoutée.');
  }
  hideModal('modalCharge');
  renderCharges();
}

// ============================================
// DETTES
// ============================================
let editDetteId = null;

function renderDettes() {
  let dettes = DB.getAll('dettes');
  const typeFilter = document.getElementById('filterDetteType').value;
  const statusFilter = document.getElementById('filterDetteStatus').value;

  const clientDoit = dettes.filter(d => d.type === 'Client doit' && d.statut === 'Non payé').reduce((s, d) => s + d.montant, 0);
  const boutiqueDoit = dettes.filter(d => d.type === 'Boutique doit' && d.statut === 'Non payé').reduce((s, d) => s + d.montant, 0);
  const unpaid = dettes.filter(d => d.statut === 'Non payé').length;

  document.getElementById('dette-client').textContent = fmt(clientDoit);
  document.getElementById('dette-boutique').textContent = fmt(boutiqueDoit);
  document.getElementById('dette-unpaid').textContent = fmtNum(unpaid);

  if (typeFilter) dettes = dettes.filter(d => d.type === typeFilter);
  if (statusFilter) dettes = dettes.filter(d => d.statut === statusFilter);
  dettes.sort((a, b) => new Date(b.date) - new Date(a.date));

  const tbody = document.getElementById('dettesBody');
  if (dettes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🤝</div><p>Aucune dette trouvée</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = dettes.map(d => `
    <tr>
      <td data-label="Nom""><strong>${escHtml(d.nom)}</strong></td>
      <td data-label="Type"><span class="badge ${d.type === 'Client doit' ? 'badge-success' : 'badge-danger'}">${escHtml(d.type)}</span></td>
      <td data-label="Montant">${fmt(d.montant)}</td>
      <td data-label="Date">${formatDate(d.date)}</td>
      <td data-label="Statut">
        <span class="badge ${d.statut === 'Payé' ? 'badge-success' : 'badge-warning'}">${escHtml(d.statut)}</span>
      </td>
      <td data-label="Actions">
        ${d.statut === 'Non payé' ? `<button class="btn btn-sm btn-success" onclick="markDettePaid(${d.id})">✓ Régler</button>` : ''}
        <button class="btn-icon" onclick="printRecuDette(${d.id})">🖨️</button>
        <button class="btn-icon" onclick="openEditDette(${d.id})">✏️</button>
        <button class="btn-icon" onclick="confirmDelete('dettes',${d.id},'la dette')">🗑️</button>
      </td>
    </tr>`).join('');
}

function openAddDette() {
  editDetteId = null;
  document.getElementById('modalDetteTitle').textContent = 'Ajouter Dette';
  document.getElementById('dette-nom').value = '';
  document.getElementById('dette-type').value = '';
  document.getElementById('dette-montant').value = '';
  document.getElementById('dette-date').value = today();
  document.getElementById('dette-statut').value = 'Non payé';
  showModal('modalDette');
}

function openEditDette(id) {
  const d = DB.findById('dettes', id);
  if (!d) return;
  editDetteId = id;
  document.getElementById('modalDetteTitle').textContent = 'Modifier Dette';
  document.getElementById('dette-nom').value = d.nom;
  document.getElementById('dette-type').value = d.type;
  document.getElementById('dette-montant').value = d.montant;
  document.getElementById('dette-date').value = d.date;
  document.getElementById('dette-statut').value = d.statut;
  showModal('modalDette');
}

function saveDette() {
  const nom = document.getElementById('dette-nom').value.trim();
  const type = document.getElementById('dette-type').value;
  const montant = parseFloat(document.getElementById('dette-montant').value);
  const date = document.getElementById('dette-date').value;
  const statut = document.getElementById('dette-statut').value;

  if (!nom || !type || isNaN(montant) || montant <= 0 || !date) {
    toast('Veuillez remplir tous les champs obligatoires.', 'error'); return;
  }

  if (editDetteId) {
    DB.update('dettes', editDetteId, { nom, type, montant, date, statut });
    toast('Dette modifiée.');
  } else {
    DB.insert('dettes', { nom, type, montant, date, statut });
    toast('Dette ajoutée.');
  }
  hideModal('modalDette');
  renderDettes();
}

function markDettePaid(id) {
  DB.update('dettes', id, { statut: 'Payé' });
  toast('Dette marquée comme réglée.');
  renderDettes();
}

function printRecuDette(id) {
  const d = DB.findById('dettes', id);
  if (!d) return;
  const now = new Date();
  const printDate = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const printTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const statutColor = d.statut === 'Payé' ? '#16a34a' : '#d97706';
  const typeColor = d.type === 'Client doit' ? '#16a34a' : '#dc2626';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Reçu - ${d.nom}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; background: #fff; color: #111; }
    .receipt { width: 80mm; margin: 0 auto; padding: 10mm 6mm; }
    .header { text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 8px; margin-bottom: 12px; }
    .shop-name { font-size: 22px; font-weight: bold; letter-spacing: 3px; }
    .shop-sub { font-size: 11px; color: #555; margin-top: 2px; }
    .title { font-size: 14px; font-weight: bold; text-align: center; margin: 10px 0; text-transform: uppercase; letter-spacing: 2px; }
    .divider { border-top: 1px dashed #aaa; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
    .row .label { color: #555; }
    .row .value { font-weight: bold; text-align: right; }
    .montant-box { text-align: center; margin: 14px 0; padding: 10px; border: 2px solid #111; border-radius: 4px; }
    .montant-box .mont-label { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 1px; }
    .montant-box .mont-value { font-size: 20px; font-weight: bold; margin-top: 4px; }
    .statut-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; color: #fff; font-size: 11px; font-weight: bold; background: ${statutColor}; }
    .type-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; color: #fff; font-size: 11px; font-weight: bold; background: ${typeColor}; }
    .footer { text-align: center; border-top: 2px dashed #ccc; padding-top: 10px; margin-top: 12px; font-size: 10px; color: #888; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="receipt">
  <div class="header">
    <div class="shop-name">VENIPS</div>
    <div class="shop-sub">Gestion Commerciale</div>
  </div>

  <div class="title">Reçu de Dette</div>
  <div class="divider"></div>

  <div class="row">
    <span class="label">Client / Fournisseur</span>
    <span class="value">${d.nom}</span>
  </div>
  <div class="row">
    <span class="label">Type</span>
    <span class="value"><span class="type-badge">${d.type}</span></span>
  </div>
  <div class="row">
    <span class="label">Date de la dette</span>
    <span class="value">${formatDate(d.date)}</span>
  </div>
  <div class="row">
    <span class="label">Statut</span>
    <span class="value"><span class="statut-badge">${d.statut}</span></span>
  </div>

  <div class="divider"></div>

  <div class="montant-box">
    <div class="mont-label">Montant</div>
    <div class="mont-value">${fmt(d.montant)}</div>
  </div>

  <div class="divider"></div>

  <div class="footer">
    <p>Imprimé le ${printDate} à ${printTime}</p>
    <p style="margin-top:4px;">Merci pour votre confiance</p>
  </div>
</div>
<script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; }<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(html);
  w.document.close();
}

// ============================================
// SUPPRESSION (Confirmation Dialog)
// ============================================
let deleteTarget = null;

function confirmDelete(table, id, label) {
  deleteTarget = { table, id };
  document.getElementById('confirmMessage').textContent = `Êtes-vous sûr de vouloir supprimer ${label} ? Cette action est irréversible.`;
  showModal('modalConfirm');
}

function executeDelete() {
  if (!deleteTarget) return;
  DB.delete(deleteTarget.table, deleteTarget.id);
  toast('Élément supprimé.', 'warning');
  hideModal('modalConfirm');
  deleteTarget = null;
  // Rafraîchir la page active
  const active = document.querySelector('.page.active');
  if (active) {
    const page = active.id.replace('page-', '');
    navigateTo(page);
  }
}

// ============================================
// HELPERS
// ============================================
function formatDate(d) {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str || ''));
  return d.innerHTML;
}

// ============================================
// DATE DISPLAY
// ============================================
function updateDateDisplay() {
  const now = new Date();
  const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  document.getElementById('dateDisplay').textContent =
    now.toLocaleDateString('fr-FR', opts);
}

// ============================================
// INITIALISATION & EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  updateDateDisplay();

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });

  // Menu mobile
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  function openSidebar()  { sidebar.classList.add('open'); sidebarOverlay.classList.add('open'); }
  function closeSidebar() { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('open'); }

  menuToggle.addEventListener('click', () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
  sidebarOverlay.addEventListener('click', closeSidebar);

  // Fermer la sidebar au clic sur un nav item (mobile)
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => { if (window.innerWidth <= 480) closeSidebar(); });
  });

  // Modals - fermeture
  document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal || btn.closest('.modal-overlay')?.id;
      if (modalId) hideModal(modalId);
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) hideModal(overlay.id);
    });
  });

  // Confirmation suppression
  document.getElementById('confirmOk').addEventListener('click', executeDelete);
  document.getElementById('confirmCancel').addEventListener('click', () => hideModal('modalConfirm'));

  // Boutons ajouter
  document.getElementById('btnAddVente').addEventListener('click', openAddVente);
  document.getElementById('btnAddStock').addEventListener('click', openAddStock);
  document.getElementById('btnAddVendeur').addEventListener('click', openAddVendeur);
  document.getElementById('btnAddCharge').addEventListener('click', openAddCharge);
  document.getElementById('btnAddDette').addEventListener('click', openAddDette);

  // Boutons enregistrer
  document.getElementById('saveVente').addEventListener('click', saveVente);
  document.getElementById('saveStock').addEventListener('click', saveStock);
  document.getElementById('saveVendeur').addEventListener('click', saveVendeur);
  document.getElementById('saveCharge').addEventListener('click', saveCharge);
  document.getElementById('saveDette').addEventListener('click', saveDette);

  // Calcul gain en temps réel
  ['vente-qty', 'vente-pa', 'vente-pv'].forEach(id => {
    document.getElementById(id).addEventListener('input', calcGain);
  });

  // Filtres Ventes
  document.getElementById('filterVenteMonth').addEventListener('change', renderVentes);
  document.getElementById('filterVenteSearch').addEventListener('input', renderVentes);
  document.getElementById('filterVenteReset').addEventListener('click', () => {
    document.getElementById('filterVenteMonth').value = '';
    document.getElementById('filterVenteSearch').value = '';
    renderVentes();
  });

  // Filtres Stock
  document.getElementById('filterStockStatus').addEventListener('change', renderStock);
  document.getElementById('filterStockSearch').addEventListener('input', renderStock);
  document.getElementById('filterStockReset').addEventListener('click', () => {
    document.getElementById('filterStockStatus').value = '';
    document.getElementById('filterStockSearch').value = '';
    renderStock();
  });

  // Filtres Charges
  document.getElementById('filterChargeMonth').addEventListener('change', renderCharges);
  document.getElementById('filterChargeType').addEventListener('change', renderCharges);
  document.getElementById('filterChargeReset').addEventListener('click', () => {
    document.getElementById('filterChargeMonth').value = '';
    document.getElementById('filterChargeType').value = '';
    renderCharges();
  });

  // Filtres Dettes
  document.getElementById('filterDetteType').addEventListener('change', renderDettes);
  document.getElementById('filterDetteStatus').addEventListener('change', renderDettes);
  document.getElementById('filterDetteReset').addEventListener('click', () => {
    document.getElementById('filterDetteType').value = '';
    document.getElementById('filterDetteStatus').value = '';
    renderDettes();
  });


  // Navigation initiale + enregistrement vendeur (DB disponible ici)
  if (AUTH.isLoggedIn()) {
    const user = AUTH.currentUser();
    if (user.role === 'vendeur') {
      const nom = user.display;
      const exists = DB.getAll('vendeurs').some(v => v.nom === nom);
      if (!exists) DB.insert('vendeurs', { nom });
      const lastPage = sessionStorage.getItem('venips_last_page');
      navigateTo(lastPage === 'stock' ? 'stock' : 'ventes');
    } else {
      navigateTo('dashboard');
    }
  }
});
