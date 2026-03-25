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

  async login(username, password) {
    const u = this.USERS.find(x => x.username === username && x.password === password);
    if (!u) return false;
    sessionStorage.setItem(this.KEY, JSON.stringify(u));
    // Obtenir le token sécurisé depuis le serveur
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await r.json();
      if (data.token) sessionStorage.setItem('venips_token', data.token);
    } catch {}
    return true;
  },
  logout() {
    sessionStorage.removeItem(this.KEY);
    sessionStorage.removeItem('venips_token');
  },
  getToken() { return sessionStorage.getItem('venips_token') || ''; }
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

  async function tryLogin() {
    const user = userEl.value.trim();
    const pass = passEl.value;
    if (await AUTH.login(user, pass)) {
      errEl.classList.remove('show');
      // Relancer DB.init() avec le nouveau token pour connecter Supabase
      await DB.init();
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
// BASE DE DONNÉES (SQLite via serveur Node.js, fallback localStorage)
// ============================================
const DB = {
  _cache: { stock: [], ventes: [], vendeurs: [], charges: [], dettes: [] },
  _BASE: '/api',
  _serverAvailable: false,

  _headers(extra) {
    return { 'Content-Type': 'application/json', 'x-venips-token': AUTH.getToken(), ...extra };
  },

  // Chargement initial : tente le serveur, sinon localStorage
  async init() {
    const tables = ['stock', 'ventes', 'vendeurs', 'charges', 'dettes'];

    // Vérifier si le serveur est disponible
    try {
      const test = await fetch(`${this._BASE}/stock`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(3000)
      });
      if (test.status === 401) {
        // Token manquant ou expiré → forcer re-connexion seulement si pas en train de login
        if (AUTH.isLoggedIn()) {
          AUTH.logout();
          document.getElementById('loginScreen').classList.remove('hidden');
        }
        return;
      }
      if (test.ok || test.status === 200) {
        this._serverAvailable = true;
      }
    } catch {
      this._serverAvailable = false;
    }

    if (this._serverAvailable) {
      // Migration unique depuis localStorage (si données existantes)
      if (!localStorage.getItem('venips_migrated')) {
        for (const table of tables) {
          let localData = [];
          try { localData = JSON.parse(localStorage.getItem('bp_' + table) || '[]'); } catch {}
          for (const record of localData) {
            await fetch(`${this._BASE}/${table}`, {
              method: 'POST',
              headers: this._headers(),
              body: JSON.stringify(record)
            }).catch(() => {});
          }
        }
        localStorage.setItem('venips_migrated', '1');
      }
      // Charger toutes les tables depuis le serveur
      const results = await Promise.all(
        tables.map(t => fetch(`${this._BASE}/${t}`, { headers: this._headers() }).then(r => r.json()).catch(() => []))
      );
      tables.forEach((t, i) => { this._cache[t] = Array.isArray(results[i]) ? results[i] : []; });
    } else {
      // Fallback : localStorage
      tables.forEach(t => {
        try { this._cache[t] = JSON.parse(localStorage.getItem('bp_' + t) || '[]'); } catch { this._cache[t] = []; }
      });
    }
  },

  _saveLocal(table) {
    if (!this._serverAvailable) {
      localStorage.setItem('bp_' + table, JSON.stringify(this._cache[table]));
    }
  },

  getAll(table) {
    return [...this._cache[table]];
  },

  insert(table, record) {
    record.id = Date.now() + Math.floor(Math.random() * 1000);
    record.createdAt = new Date().toISOString();
    this._cache[table].push(record);
    if (this._serverAvailable) {
      fetch(`${this._BASE}/${table}`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(record)
      }).catch(() => {});
    } else {
      this._saveLocal(table);
    }
    return record;
  },

  update(table, id, updates) {
    const idx = this._cache[table].findIndex(r => r.id === id);
    if (idx !== -1) {
      this._cache[table][idx] = { ...this._cache[table][idx], ...updates, updatedAt: new Date().toISOString() };
      if (this._serverAvailable) {
        fetch(`${this._BASE}/${table}/${id}`, {
          method: 'PUT',
          headers: this._headers(),
          body: JSON.stringify(updates)
        }).catch(() => {});
      } else {
        this._saveLocal(table);
      }
      return this._cache[table][idx];
    }
    return null;
  },

  delete(table, id) {
    this._cache[table] = this._cache[table].filter(r => r.id !== id);
    if (this._serverAvailable) {
      fetch(`${this._BASE}/${table}/${id}`, { method: 'DELETE', headers: this._headers() }).catch(() => {});
    } else {
      this._saveLocal(table);
    }
  },

  findById(table, id) {
    return this._cache[table].find(r => r.id === id) || null;
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
  dettes: 'Gestion des Dettes',
  recus: 'Reçus de Vente'
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
  if (page === 'recus') renderRecus();
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
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">🛒</div><p>Aucune vente trouvée</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = ventes.map(v => {
    const stockAvant = v.stockAvant != null ? v.stockAvant : '—';
    const stockApres = v.stockApres != null ? v.stockApres : '—';
    const stockApresClass = v.stockApres === 0 ? 'style="color:#ef4444;font-weight:700;"' : v.stockApres <= 5 ? 'style="color:#f59e0b;font-weight:700;"' : '';
    return `<tr>
      <td data-label="Date">${formatDate(v.date)}</td>
      <td data-label="Produit">${escHtml(v.produit)}</td>
      <td data-label="Qté">${v.qty}</td>
      <td data-label="Stock Avant">${stockAvant}</td>
      <td data-label="Stock Après" ${stockApresClass}>${stockApres}${v.stockApres === 0 ? ' ⚠️' : ''}</td>
      <td data-label="Prix Achat">${fmt(v.pa)}</td>
      <td data-label="Prix Vente">${fmt(v.pv)}</td>
      <td data-label="Gain" class="${v.gain >= 0 ? 'gain-pos' : 'gain-neg'}">${fmt(v.gain)}</td>
      <td data-label="Vendeur">${escHtml(v.vendeur || '—')}</td>
      <td data-label="Actions">
        <button class="btn-icon" onclick="openRecuVente(${v.id})">🖨️</button>
        <button class="btn btn-sm btn-secondary" onclick="openEditVente(${v.id})">✏️ Modifier</button>
        ${AUTH.isAdmin() ? `<button class="btn btn-sm btn-danger" onclick="confirmDelete('ventes',${v.id},'la vente')">🗑️</button>` : ''}
      </td>
    </tr>`;
  }).join('');
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

let recuVenteId = null;

function openRecuVente(id) {
  recuVenteId = id;
  document.getElementById('recu-client-nom').value = '';
  showModal('modalRecuVente');
  setTimeout(() => document.getElementById('recu-client-nom').focus(), 100);
}

function printRecuVente() {
  const clientNom = document.getElementById('recu-client-nom').value.trim();
  if (!clientNom) { toast('Veuillez saisir le nom du client.', 'error'); return; }
  const v = DB.findById('ventes', recuVenteId);
  if (!v) return;
  hideModal('modalRecuVente');

  const now = new Date();
  const printDate = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const printTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const totalVente = v.pv * v.qty;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Reçu Vente - ${clientNom}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; background: #fff; color: #111; }
    .receipt { width: 80mm; margin: 0 auto; padding: 10mm 6mm; }
    .header { text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 8px; margin-bottom: 12px; }
    .logo-wrap { display:inline-block; background:#040e3b; border-radius:10px; padding:8px 14px; margin-bottom:4px; }
    .shop-sub { font-size: 11px; color: #555; margin-top: 4px; }
    .title { font-size: 14px; font-weight: bold; text-align: center; margin: 10px 0; text-transform: uppercase; letter-spacing: 2px; }
    .divider { border-top: 1px dashed #aaa; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
    .row .label { color: #555; }
    .row .value { font-weight: bold; text-align: right; }
    .total-box { text-align: center; margin: 14px 0; padding: 10px; border: 2px solid #111; border-radius: 4px; }
    .total-box .tot-label { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 1px; }
    .total-box .tot-value { font-size: 20px; font-weight: bold; margin-top: 4px; }
    .footer { text-align: center; border-top: 2px dashed #ccc; padding-top: 10px; margin-top: 12px; font-size: 10px; color: #888; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="receipt">
  <div class="header">
    <div class="logo-wrap">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205 52" width="130" height="34">
        <defs>
          <linearGradient id="rg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00d4c4"/><stop offset="100%" stop-color="#004a38"/></linearGradient>
          <linearGradient id="rg2" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#00f0e0"/><stop offset="100%" stop-color="#006050"/></linearGradient>
        </defs>
        <polygon points="2,4 11,4 21,47 12,47" fill="url(#rg1)"/>
        <polygon points="11,4 21,4 17,22 7,22" fill="url(#rg2)" opacity="0.9"/>
        <polygon points="17,4 30,4 21,47 11,47" fill="url(#rg2)"/>
        <polygon points="12,32 21,47 13,47" fill="#003530" opacity="0.6"/>
        <circle cx="33" cy="7" r="2.8" fill="#00c8b8"/>
        <text x="42" y="39" font-family="Trebuchet MS,Arial Black,Arial,sans-serif" font-size="28" font-weight="900" fill="#fff" letter-spacing="2">VENIPS</text>
        <circle cx="120" cy="11" r="3.2" fill="#00c8b8"/>
      </svg>
    </div>
    <div class="shop-sub">Gestion Commerciale</div>
  </div>

  <div class="title">Reçu de Vente</div>
  <div class="divider"></div>

  <div class="row">
    <span class="label">Client</span>
    <span class="value">${clientNom}</span>
  </div>
  <div class="row">
    <span class="label">Date</span>
    <span class="value">${formatDate(v.date)}</span>
  </div>
  <div class="row">
    <span class="label">Vendeur</span>
    <span class="value">${v.vendeur || '—'}</span>
  </div>

  <div class="divider"></div>

  <div class="row">
    <span class="label">Produit</span>
    <span class="value">${v.produit}</span>
  </div>
  <div class="row">
    <span class="label">Quantité</span>
    <span class="value">${v.qty}</span>
  </div>
  <div class="row">
    <span class="label">Prix Unitaire</span>
    <span class="value">${new Intl.NumberFormat('fr-FR').format(v.pv)} GNF</span>
  </div>

  <div class="divider"></div>

  <div class="total-box">
    <div class="tot-label">Total à Payer</div>
    <div class="tot-value">${new Intl.NumberFormat('fr-FR').format(totalVente)} GNF</div>
  </div>

  <div class="divider"></div>

  <div class="footer">
    <p>Imprimé le ${printDate} à ${printTime}</p>
    <p style="margin-top:4px;">Merci pour votre achat !</p>
  </div>
</div>
<script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; }<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=400,height=650');
  w.document.write(html);
  w.document.close();
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
  const ventes = DB.getAll('ventes');
  sel.innerHTML = '<option value="">-- Sélectionner --</option>';
  stock.forEach(p => {
    const totalVendu = ventes.filter(v => v.produit === p.nom).reduce((s, v) => s + (v.qty || 0), 0);
    const restant = Math.max(0, (p.qtyInitial ?? p.qty ?? 0) - totalVendu);
    const opt = document.createElement('option');
    opt.value = p.nom;
    opt.textContent = `${p.nom} (restant: ${restant})`;
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

  const stockItem = DB.getAll('stock').find(s => s.nom === produit);
  const gain = (pv - pa) * qty;

  // Calculer le stock restant dynamiquement
  const toutesVentes = DB.getAll('ventes');
  const totalDejaVendu = toutesVentes
    .filter(v => v.produit === produit && v.id !== editVenteId)
    .reduce((s, v) => s + (v.qty || 0), 0);
  const qtyInitial = stockItem ? (stockItem.qtyInitial ?? stockItem.qty ?? 0) : 0;
  const stockAvant = qtyInitial - totalDejaVendu;
  const stockApres = stockAvant - qty;

  if (stockApres < 0) {
    toast(`Stock insuffisant. Disponible : ${stockAvant}`, 'error'); return;
  }

  const record = { date, produit, qty, pa, pv, gain, vendeur, stockAvant, stockApres };

  if (editVenteId) {
    DB.update('ventes', editVenteId, record);
    toast('Vente modifiée avec succès.');
  } else {
    DB.insert('ventes', record);
    const who = AUTH.displayName();
    const stockInfo = stockAvant !== null ? ` | Stock : ${stockAvant} → ${stockApres}` : '';
    toast(`✅ Vente enregistrée — ${produit}${stockInfo}`, 'success');
  }

  hideModal('modalVente');
  renderVentes();
  renderStock();
  renderDashboard();
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
  [3, 4, 5, 7].forEach(i => { if (stockThs[i]) stockThs[i].style.display = isAdmin ? '' : 'none'; });

  const tbody = document.getElementById('stockBody');
  if (stock.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${isAdmin ? 8 : 4}"><div class="empty-state"><div class="empty-icon">📦</div><p>Aucun produit trouvé</p></div></td></tr>`;
    return;
  }
  const toutesVentes = DB.getAll('ventes');
  tbody.innerHTML = stock.map(p => {
    const initial = p.qtyInitial ?? p.qty;
    const totalVendu = toutesVentes.filter(v => v.produit === p.nom).reduce((s, v) => s + (v.qty || 0), 0);
    const restant = Math.max(0, initial - totalVendu);
    const statut = restant === 0 ? '<span class="badge badge-danger">Rupture</span>'
      : restant <= 5 ? '<span class="badge badge-warning">Faible</span>'
      : '<span class="badge badge-success">Disponible</span>';
    const pctRestant = initial > 0 ? Math.round((restant / initial) * 100) : 0;
    const barColor = pctRestant > 50 ? '#10b981' : pctRestant > 20 ? '#f59e0b' : '#ef4444';
    const progressBar = `<div style="display:flex;align-items:center;gap:6px;">
      <span>${restant}</span>
      <div style="flex:1;background:#e2e8f0;border-radius:4px;height:6px;min-width:50px;">
        <div style="width:${pctRestant}%;background:${barColor};height:6px;border-radius:4px;transition:width .3s;"></div>
      </div>
      <span style="font-size:.75rem;color:#64748b">${pctRestant}%</span>
    </div>`;
    if (!isAdmin) {
      return `<tr>
        <td data-label="Produit"><strong>${escHtml(p.nom)}</strong></td>
        <td data-label="Stock Initial">${initial}</td>
        <td data-label="Stock Restant">${progressBar}</td>
        <td data-label="Statut">${statut}</td>
      </tr>`;
    }
    const marge = p.pa > 0 ? (((p.pv - p.pa) / p.pa) * 100).toFixed(1) : 0;
    return `<tr>
      <td data-label="Produit"><strong>${escHtml(p.nom)}</strong></td>
      <td data-label="Stock Initial">${initial}</td>
      <td data-label="Stock Restant">${progressBar}</td>
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
  document.getElementById('stock-qty').value = p.qtyInitial ?? p.qty;
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
    // qty saisie = nouveau stock initial, le restant se recalcule auto depuis les ventes
    DB.update('stock', editStockId, { nom, pa, pv, qtyInitial: qty });
    toast('Produit modifié avec succès.');
  } else {
    DB.insert('stock', { nom, pa, pv, qtyInitial: qty });
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
    .logo-wrap { display:inline-block; background:#040e3b; border-radius:10px; padding:8px 14px; margin-bottom:4px; }
    .shop-sub { font-size: 11px; color: #555; margin-top: 4px; }
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
    <div class="logo-wrap">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205 52" width="130" height="34">
        <defs>
          <linearGradient id="rg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00d4c4"/><stop offset="100%" stop-color="#004a38"/></linearGradient>
          <linearGradient id="rg2" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#00f0e0"/><stop offset="100%" stop-color="#006050"/></linearGradient>
        </defs>
        <polygon points="2,4 11,4 21,47 12,47" fill="url(#rg1)"/>
        <polygon points="11,4 21,4 17,22 7,22" fill="url(#rg2)" opacity="0.9"/>
        <polygon points="17,4 30,4 21,47 11,47" fill="url(#rg2)"/>
        <polygon points="12,32 21,47 13,47" fill="#003530" opacity="0.6"/>
        <circle cx="33" cy="7" r="2.8" fill="#00c8b8"/>
        <text x="42" y="39" font-family="Trebuchet MS,Arial Black,Arial,sans-serif" font-size="28" font-weight="900" fill="#fff" letter-spacing="2">VENIPS</text>
        <circle cx="120" cy="11" r="3.2" fill="#00c8b8"/>
      </svg>
    </div>
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
// RECUS DE VENTE
// ============================================
let recuLignes = [];

function genRecuNumero() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `VNP-${ymd}-${seq}`;
}

function renderRecus() {
  document.getElementById('recu-date').value = today();
  document.getElementById('recu-numero').value = genRecuNumero();
  recuLignes = [{ produit: '', qty: 1, pu: 0 }];
  renderRecuLignes();
}

function renderRecuLignes() {
  const stock = DB.getAll('stock');
  const options = stock.map(s => `<option value="${escHtml(s.nom)}" data-pu="${s.pv}">${escHtml(s.nom)}</option>`).join('');
  const tbody = document.getElementById('recuLignesBody');
  tbody.innerHTML = recuLignes.map((l, i) => `
    <tr>
      <td data-label="Produit">
        <select class="filter-input" onchange="recuSetProduit(${i}, this)" style="width:100%">
          <option value="">-- Produit --</option>
          ${options}
        </select>
      </td>
      <td data-label="Qté">
        <input type="number" class="filter-input" min="1" value="${l.qty}"
          onchange="recuSetQty(${i}, this)" style="width:70px" />
      </td>
      <td data-label="Prix Unitaire">
        <input type="number" class="filter-input" min="0" value="${l.pu}"
          onchange="recuSetPu(${i}, this)" style="width:110px" />
      </td>
      <td data-label="Total">${new Intl.NumberFormat('fr-FR').format((l.qty || 0) * (l.pu || 0))} GNF</td>
      <td>
        ${recuLignes.length > 1 ? `<button class="btn-icon" onclick="recuRemoveLigne(${i})">🗑️</button>` : ''}
      </td>
    </tr>`).join('');
  const total = recuLignes.reduce((s, l) => s + (l.qty || 0) * (l.pu || 0), 0);
  document.getElementById('recuTotal').textContent = new Intl.NumberFormat('fr-FR').format(total) + ' GNF';
  // Re-sélectionner les produits déjà choisis
  const rows = tbody.querySelectorAll('tr');
  recuLignes.forEach((l, i) => {
    if (l.produit) rows[i].querySelector('select').value = l.produit;
  });
}

function recuSetProduit(i, sel) {
  recuLignes[i].produit = sel.value;
  const opt = sel.options[sel.selectedIndex];
  recuLignes[i].pu = parseFloat(opt.dataset.pu || 0);
  renderRecuLignes();
}

function recuSetQty(i, inp) {
  recuLignes[i].qty = parseInt(inp.value) || 1;
  renderRecuLignes();
}

function recuSetPu(i, inp) {
  recuLignes[i].pu = parseFloat(inp.value) || 0;
  renderRecuLignes();
}

function recuRemoveLigne(i) {
  recuLignes.splice(i, 1);
  renderRecuLignes();
}

function printRecu() {
  const clientNom = document.getElementById('recu-nom').value.trim();
  const date = document.getElementById('recu-date').value;
  const paiement = document.getElementById('recu-paiement').value;
  const numero = document.getElementById('recu-numero').value;
  if (!clientNom) { toast('Veuillez saisir le nom du client.', 'error'); return; }
  if (!date) { toast('Veuillez saisir la date.', 'error'); return; }
  const lignesValides = recuLignes.filter(l => l.produit && l.qty > 0 && l.pu >= 0);
  if (lignesValides.length === 0) { toast('Ajoutez au moins un produit.', 'error'); return; }

  const total = lignesValides.reduce((s, l) => s + l.qty * l.pu, 0);
  const fmt = n => new Intl.NumberFormat('fr-FR').format(n);
  const now = new Date();
  const printDate = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const printTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const lignesHtml = lignesValides.map((l, idx) => `
    <tr class="${idx % 2 === 1 ? 'alt' : ''}">
      <td class="td-left">${escHtml(l.produit)}</td>
      <td class="td-center">${l.qty}</td>
      <td class="td-right">${fmt(l.pu)}</td>
      <td class="td-right td-bold">${fmt(l.qty * l.pu)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reçu ${numero}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Courier New',Courier,monospace;background:#f0f0f0;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;padding:16px 0;}
    .receipt{width:80mm;background:#fff;padding:10mm 6mm 8mm;box-shadow:0 2px 12px rgba(0,0,0,.15);}

    /* HEADER */
    .hd{text-align:center;padding-bottom:8px;border-bottom:3px double #222;margin-bottom:10px;}
    .hd-logo-wrap{display:inline-block;background:#040e3b;border-radius:10px;padding:8px 14px;margin-bottom:5px;}
    .hd-info{font-size:10.5px;color:#444;margin-top:3px;line-height:1.6;}

    /* TITLE BADGE */
    .title-badge{text-align:center;margin:10px 0 8px;}
    .title-badge span{display:inline-block;background:#111;color:#fff;font-size:12px;font-weight:bold;letter-spacing:2px;padding:4px 12px;text-transform:uppercase;}

    /* META INFO */
    .meta{margin-bottom:8px;}
    .meta-row{display:flex;justify-content:space-between;padding:2px 0;font-size:11.5px;}
    .meta-row .lbl{color:#666;}
    .meta-row .val{font-weight:bold;color:#111;}

    .divider{border:none;border-top:1px dashed #bbb;margin:8px 0;}
    .divider-solid{border:none;border-top:1.5px solid #555;margin:6px 0;}

    /* TABLE */
    table{width:100%;border-collapse:collapse;}
    thead tr{border-bottom:1.5px solid #444;}
    thead th{font-size:10px;text-transform:uppercase;padding:4px 2px;color:#333;letter-spacing:.5px;}
    thead th:first-child{text-align:left;}
    .td-left{text-align:left;padding:5px 2px;font-size:11.5px;word-break:break-word;}
    .td-center{text-align:center;padding:5px 2px;font-size:11.5px;}
    .td-right{text-align:right;padding:5px 2px;font-size:11.5px;}
    .td-bold{font-weight:bold;}
    tr.alt{background:#f9f9f9;}

    /* TOTAL */
    .total-box{margin-top:10px;border-top:2px solid #111;border-bottom:2px solid #111;padding:7px 2px;display:flex;justify-content:space-between;align-items:center;}
    .total-label{font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;}
    .total-value{font-size:15px;font-weight:900;}

    /* PAYMENT */
    .pay-row{display:flex;justify-content:space-between;padding:5px 0;font-size:11.5px;margin-top:6px;}
    .pay-row .lbl{color:#666;}
    .pay-row .val{font-weight:bold;}

    /* SIGNATURE */
    .sig-section{margin-top:14px;display:flex;justify-content:flex-end;}
    .sig-box{text-align:center;font-size:10.5px;color:#444;}
    .sig-line{width:90px;border-bottom:1px solid #444;height:36px;margin-bottom:3px;}

    /* FOOTER */
    .footer{margin-top:14px;text-align:center;border-top:2px dashed #bbb;padding-top:10px;}
    .thank-msg{font-size:13px;font-weight:bold;letter-spacing:1px;margin-bottom:4px;}
    .footer-sub{font-size:9.5px;color:#888;line-height:1.6;}

    @media print{
      body{background:#fff;padding:0;}
      .receipt{box-shadow:none;width:100%;padding:4mm 4mm;}
    }
  </style>
</head>
<body>
<div class="receipt">

  <!-- En-tête -->
  <div class="hd">
    <div class="hd-logo-wrap">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205 52" width="130" height="34">
        <defs>
          <linearGradient id="rg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00d4c4"/><stop offset="100%" stop-color="#004a38"/></linearGradient>
          <linearGradient id="rg2" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#00f0e0"/><stop offset="100%" stop-color="#006050"/></linearGradient>
        </defs>
        <polygon points="2,4 11,4 21,47 12,47" fill="url(#rg1)"/>
        <polygon points="11,4 21,4 17,22 7,22" fill="url(#rg2)" opacity="0.9"/>
        <polygon points="17,4 30,4 21,47 11,47" fill="url(#rg2)"/>
        <polygon points="12,32 21,47 13,47" fill="#003530" opacity="0.6"/>
        <circle cx="33" cy="7" r="2.8" fill="#00c8b8"/>
        <text x="42" y="39" font-family="Trebuchet MS,Arial Black,Arial,sans-serif" font-size="28" font-weight="900" fill="#fff" letter-spacing="2">VENIPS</text>
        <circle cx="120" cy="11" r="3.2" fill="#00c8b8"/>
      </svg>
    </div>
    <div class="hd-info">
      📍 Bailo Baya Marché<br>
      📞 628 880 354 / 625 185 910
    </div>
  </div>

  <!-- Badge titre -->
  <div class="title-badge"><span>✦ Reçu de Vente ✦</span></div>

  <!-- Infos reçu -->
  <div class="meta">
    <div class="meta-row"><span class="lbl">N° Reçu</span><span class="val">${numero}</span></div>
    <div class="meta-row"><span class="lbl">Date</span><span class="val">${formatDate(date)}</span></div>
    <div class="meta-row"><span class="lbl">Client</span><span class="val">${escHtml(clientNom)}</span></div>
  </div>

  <hr class="divider">

  <!-- Tableau des articles -->
  <table>
    <thead>
      <tr>
        <th style="text-align:left;width:42%">Désignation</th>
        <th style="text-align:center;width:10%">Qté</th>
        <th style="text-align:right;width:24%">P.U (GNF)</th>
        <th style="text-align:right;width:24%">Total (GNF)</th>
      </tr>
    </thead>
    <tbody>${lignesHtml}</tbody>
  </table>

  <hr class="divider-solid">

  <!-- Total -->
  <div class="total-box">
    <span class="total-label">Total à Payer</span>
    <span class="total-value">${fmt(total)} GNF</span>
  </div>

  <!-- Mode de paiement -->
  <div class="pay-row">
    <span class="lbl">Mode de paiement</span>
    <span class="val">${escHtml(paiement)}</span>
  </div>

  <hr class="divider">

  <!-- Signature vendeur -->
  <div class="sig-section">
    <div class="sig-box">
      <div class="sig-line"></div>
      Signature du Vendeur
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="thank-msg">Merci pour votre confiance !</div>
    <div class="footer-sub">
      Imprimé le ${printDate} à ${printTime}<br>
      Conservez ce reçu comme preuve d'achat.<br>
      <strong style="color:#111;">⚠️ Garantie produit : 72 heures</strong>
    </div>
  </div>

</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=460,height:720');
  w.document.write(html);
  w.document.close();
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
// DARK MODE
// ============================================
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    document.body.classList.add('dark');
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = '☀️';
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

// ============================================
// INITIALISATION & EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await DB.init();
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

  // Dark mode toggle
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

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
  document.getElementById('btnAddRecuLigne').addEventListener('click', () => { recuLignes.push({ produit: '', qty: 1, pu: 0 }); renderRecuLignes(); });
  document.getElementById('btnPrintRecu').addEventListener('click', printRecu);

  // Boutons enregistrer
  document.getElementById('saveVente').addEventListener('click', saveVente);
  document.getElementById('btnPrintRecuVente').addEventListener('click', printRecuVente);
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

// ============================================
// CHATBOT IA
// ============================================
(function initChatbot() {
  const window_  = document.getElementById('chatbotWindow');
  const input    = document.getElementById('chatInput');
  const sendBtn  = document.getElementById('chatSendBtn');

  function addMessage(text, role) {
    const div = document.createElement('div');
    div.className = `chat-message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;
    div.appendChild(bubble);
    window_.appendChild(div);
    window_.scrollTop = window_.scrollHeight;
    return div;
  }

  async function sendMessage(text) {
    if (!text.trim()) return;
    addMessage(text, 'user');
    input.value = '';
    sendBtn.disabled = true;

    const typing = addMessage('En train d\'analyser vos données...', 'typing');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: DB._headers(),
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      typing.remove();
      addMessage(data.reply || 'Désolé, une erreur s\'est produite.', 'bot');
    } catch {
      typing.remove();
      addMessage('Erreur de connexion. Vérifiez votre connexion internet.', 'bot');
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', () => sendMessage(input.value));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(input.value); });
  }

  document.querySelectorAll('.suggestion-btn').forEach(btn => {
    btn.addEventListener('click', () => sendMessage(btn.dataset.q));
  });
})();
