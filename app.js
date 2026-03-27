/* ============================================
   VENIPS – APPLICATION JAVASCRIPT
   ============================================ */

'use strict';

// ============================================
// AUTHENTIFICATION
// ============================================
const AUTH = {
  ROLE_MAP: {
    'VENIPS': { role: 'admin',   display: 'VENIPS' },
    'JACOB':  { role: 'vendeur', display: 'JACOB'  }
  },
  KEY:          'venips_session',
  OFFLINE_KEY:  'venips_offline_creds',

  currentUser() {
    try { return JSON.parse(sessionStorage.getItem(this.KEY)); } catch { return null; }
  },
  isLoggedIn()  { return !!this.currentUser(); },
  isAdmin()     { return this.currentUser()?.role === 'admin'; },
  displayName() { return this.currentUser()?.display || ''; },

  // Hash SHA-256 du mot de passe (pour fallback offline uniquement)
  async _hash(str) {
    const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  },

  // Charger offline-creds.json (généré par le serveur) dans localStorage
  async seedOfflineCreds() {
    try {
      const r = await fetch('/offline-creds.json', { signal: AbortSignal.timeout(3000) });
      if (!r.ok) return;
      const fresh = await r.json();
      // Fusionner : les hashes issus de vraies connexions (plus fiables) ont priorité
      const existing = JSON.parse(localStorage.getItem(this.OFFLINE_KEY) || '{}');
      localStorage.setItem(this.OFFLINE_KEY, JSON.stringify({ ...fresh, ...existing }));
    } catch {}
  },

  // Sauvegarder les credentials hachés après une connexion serveur réussie
  async _saveOfflineCreds(username, password) {
    try {
      const hash  = await this._hash(password);
      const creds = JSON.parse(localStorage.getItem(this.OFFLINE_KEY) || '{}');
      creds[username] = hash;
      localStorage.setItem(this.OFFLINE_KEY, JSON.stringify(creds));
    } catch {}
  },

  // Vérifier en mode offline via le hash stocké
  async _verifyOffline(username, password) {
    try {
      // Tenter de charger depuis le cache Service Worker (fonctionne sans réseau)
      await this.seedOfflineCreds();
      const creds = JSON.parse(localStorage.getItem(this.OFFLINE_KEY) || '{}');
      if (!creds[username]) return false;
      const hash = await this._hash(password);
      return hash === creds[username];
    } catch { return false; }
  },

  async login(username, password) {
    // 1. Essayer le serveur en priorité
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(4000)
      });
      if (r.ok) {
        const { token } = await r.json();
        const profile = this.ROLE_MAP[username] || { role: 'vendeur', display: username };
        sessionStorage.setItem(this.KEY, JSON.stringify({ username, ...profile }));
        sessionStorage.setItem('venips_token', token);
        // Sauvegarder pour le fallback offline
        await this._saveOfflineCreds(username, password);
        return 'online';
      }
      return false; // Mauvais mot de passe côté serveur
    } catch {
      // 2. Serveur inaccessible → fallback offline
      const ok = await this._verifyOffline(username, password);
      if (ok) {
        const profile = this.ROLE_MAP[username] || { role: 'vendeur', display: username };
        sessionStorage.setItem(this.KEY, JSON.stringify({ username, ...profile }));
        // Pas de token valide en offline — on met un placeholder
        sessionStorage.setItem('venips_token', 'offline');
        return 'offline';
      }
      return false;
    }
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

    const btnBackup = document.getElementById('btnBackup');
    if (user.role === 'vendeur') {
      document.querySelectorAll('.nav-item').forEach(el => {
        const p = el.dataset.page;
        el.style.display = (p === 'ventes' || p === 'stock') ? '' : 'none';
      });
      if (ventesSummary) ventesSummary.style.display = 'none';
      document.getElementById('btnAddStock').style.display = 'none';
      if (stockSummaryCards[2]) stockSummaryCards[2].style.display = 'none';
      if (btnBackup) btnBackup.style.display = 'none';
    } else {
      document.querySelectorAll('.nav-item').forEach(el => el.style.display = '');
      if (btnBackup) btnBackup.style.display = '';
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

  // Pré-charger les credentials offline dès l'ouverture (même sans login)
  AUTH.seedOfflineCreds();

  eyeBtn.addEventListener('click', () => {
    const isPass = passEl.type === 'password';
    passEl.type  = isPass ? 'text' : 'password';
    eyeBtn.textContent = isPass ? '🙈' : '👁️';
  });

  async function tryLogin() {
    const user = userEl.value.trim();
    const pass = passEl.value;
    btnLogin.disabled    = true;
    btnLogin.textContent = 'Connexion...';
    errEl.classList.remove('show');

    const result = await AUTH.login(user, pass);

    if (result) {
      DB.loadFromStorage();
      showApp();
      const u        = AUTH.currentUser();
      const lastPage = sessionStorage.getItem('venips_last_page');
      const adminPages = ['dashboard','ventes','stock','vendeurs','charges','dettes','defectueux',
                          'recus','historique','fournisseurs','clients','commandes','objectifs','retours','inventaires'];
      const target = u?.role === 'vendeur'
        ? (['ventes','stock'].includes(lastPage) ? lastPage : 'ventes')
        : (adminPages.includes(lastPage) ? lastPage : 'dashboard');
      navigateTo(target);

      if (result === 'offline') {
        // Mode hors-ligne : utiliser le cache localStorage, pas de sync serveur
        toast('Mode hors-ligne — données locales chargées', 'warning', 4000);
      } else {
        await DB.fetchFromServer();
        navigateTo(sessionStorage.getItem('venips_last_page') || target);
      }
    } else {
      errEl.textContent = 'Nom d\'utilisateur ou mot de passe incorrect.';
      errEl.classList.add('show');
      passEl.value = '';
      passEl.focus();
    }
    btnLogin.disabled    = false;
    btnLogin.textContent = 'Se connecter';
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
  _cache: { stock: [], ventes: [], vendeurs: [], charges: [], dettes: [], defectueux: [] },
  _BASE: '/api',
  _serverAvailable: false,
  _QUEUE_KEY: 'venips_offline_queue',

  _enqueue(op) {
    const q = this._getQueue();
    q.push({ ...op, ts: Date.now() });
    try { localStorage.setItem(this._QUEUE_KEY, JSON.stringify(q)); } catch {}
  },

  _getQueue() {
    try { return JSON.parse(localStorage.getItem(this._QUEUE_KEY) || '[]'); } catch { return []; }
  },

  async _replayQueue() {
    const q = this._getQueue();
    if (q.length === 0) return;
    const failed = [];
    for (const op of q) {
      try {
        let ok = false;
        if (op.method === 'POST') {
          const r = await fetch(`${this._BASE}/${op.table}`, { method: 'POST', headers: this._headers(), body: JSON.stringify(op.data) });
          ok = r.ok;
        } else if (op.method === 'PUT') {
          const r = await fetch(`${this._BASE}/${op.table}/${op.id}`, { method: 'PUT', headers: this._headers(), body: JSON.stringify(op.data) });
          ok = r.ok;
        } else if (op.method === 'DELETE') {
          const r = await fetch(`${this._BASE}/${op.table}/${op.id}`, { method: 'DELETE', headers: this._headers() });
          ok = r.ok;
        }
        if (!ok) failed.push(op);
      } catch { failed.push(op); }
    }
    try { localStorage.setItem(this._QUEUE_KEY, JSON.stringify(failed)); } catch {}
    if (failed.length < q.length) {
      const synced = q.length - failed.length;
      toast(`✅ ${synced} opération(s) synchronisée(s)`, 'success');
    }
  },

  _headers(extra) {
    return { 'Content-Type': 'application/json', 'x-venips-token': AUTH.getToken(), ...extra };
  },

  // Étape 1 (sync, instantané) : charger localStorage → zéro délai, pas de page blanche
  loadFromStorage() {
    const tables = ['stock', 'ventes', 'vendeurs', 'charges', 'dettes', 'defectueux',
                    'fournisseurs', 'clients', 'commandes', 'objectifs', 'retours', 'inventaires',
                    'objectifs_perso'];
    tables.forEach(t => {
      try { this._cache[t] = JSON.parse(localStorage.getItem('bp_' + t) || '[]'); } catch { this._cache[t] = []; }
    });
  },

  // Étape 2 (async) : contacter le serveur et rafraîchir le cache
  async fetchFromServer() {
    const tables = ['stock', 'ventes', 'vendeurs', 'charges', 'dettes', 'defectueux',
                    'fournisseurs', 'clients', 'commandes', 'objectifs', 'retours', 'inventaires',
                    'objectifs_perso'];
    try {
      const test = await fetch(`${this._BASE}/stock`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(3000)
      });
      if (test.status === 401) {
        if (AUTH.isLoggedIn()) {
          AUTH.logout();
          document.getElementById('loginScreen').classList.remove('hidden');
        }
        return;
      }
      if (test.ok || test.status === 200) this._serverAvailable = true;
    } catch {
      this._serverAvailable = false;
      return;
    }
    if (this._serverAvailable) {
      // Rejouer les opérations en attente (écrites hors ligne)
      await this._replayQueue();
      if (!localStorage.getItem('venips_migrated')) {
        for (const table of tables) {
          let localData = [];
          try { localData = JSON.parse(localStorage.getItem('bp_' + table) || '[]'); } catch {}
          for (const record of localData) {
            await fetch(`${this._BASE}/${table}`, { method: 'POST', headers: this._headers(), body: JSON.stringify(record) }).catch(() => {});
          }
        }
        localStorage.setItem('venips_migrated', '1');
      }
      const results = await Promise.all(
        tables.map(t => fetch(`${this._BASE}/${t}`, { headers: this._headers() }).then(r => r.json()).catch(() => []))
      );
      tables.forEach((t, i) => { this._cache[t] = Array.isArray(results[i]) ? results[i] : []; });
      tables.forEach(t => { try { localStorage.setItem('bp_' + t, JSON.stringify(this._cache[t])); } catch {} });
    }
  },

  // Compatibilité (utilisé par tryLogin)
  async init() {
    this.loadFromStorage();
    await this.fetchFromServer();
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
    record.id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    record.createdAt = new Date().toISOString();
    this._cache[table].push(record);
    if (this._serverAvailable) {
      fetch(`${this._BASE}/${table}`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(record)
      }).catch(() => {});
    } else {
      this._enqueue({ method: 'POST', table, data: record });
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
        this._enqueue({ method: 'PUT', table, id, data: updates });
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
      this._enqueue({ method: 'DELETE', table, id });
      this._saveLocal(table);
    }
  },

  findById(table, id) {
    return this._cache[table].find(r => r.id === id) || null;
  },

  // Insertion spécialisée pour les ventes : le serveur calcule gain/stock
  insertVente(record) {
    record.id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    record.createdAt = new Date().toISOString();
    this._cache.ventes.push(record);

    if (this._serverAvailable) {
      fetch(`${this._BASE}/ventes`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(record)
      })
      .then(r => {
        if (!r.ok) return r.json().then(d => Promise.reject(d.error || 'Erreur serveur'));
        return r.json();
      })
      .then(serverRecord => {
        // Remplacer l'entrée locale par la version serveur (valeurs calculées côté DB)
        const idx = this._cache.ventes.findIndex(v => v.id === record.id);
        if (idx !== -1) {
          this._cache.ventes[idx] = serverRecord;
          try { localStorage.setItem('bp_ventes', JSON.stringify(this._cache.ventes)); } catch {}
        }
      })
      .catch(errMsg => {
        // Supprimer l'entrée optimiste si le serveur rejette (ex: stock insuffisant)
        this._cache.ventes = this._cache.ventes.filter(v => v.id !== record.id);
        try { localStorage.setItem('bp_ventes', JSON.stringify(this._cache.ventes)); } catch {}
        if (typeof errMsg === 'string') toast(`❌ ${errMsg}`, 'error');
        if (typeof renderVentes === 'function') renderVentes();
      });
    } else {
      this._enqueue({ method: 'POST', table: 'ventes', data: record });
      this._saveLocal('ventes');
    }
    return record;
  }
};

// ============================================
// UTILITAIRES
// ============================================
const fmt    = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' GNF';
const fmtNum = n => new Intl.NumberFormat('fr-FR').format(n || 0);
// Arrondi monétaire : évite les erreurs float (ex: 999.9999999 → 1000)
const round  = n => Math.round((n || 0) * 100) / 100;

const today = () => new Date().toISOString().slice(0, 10);
const ym = (d) => d ? d.slice(0, 7) : '';
const currentYM = () => today().slice(0, 7);
const prevYM = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

// Debounce : évite de surcharger le rendu lors de la saisie dans les filtres
function debounce(fn, delay = 250) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

// ============================================
// ÉTAT GLOBAL (formulaires en cours d'édition)
// ============================================
const EDIT = {
  venteId:      null,
  stockId:      null,
  vendeurId:    null,
  chargeId:     null,
  detteId:      null,
  defectueuxId: null,
};

// ============================================
// PAGINATION
// ============================================
const PAGE_SIZE = 20;
const PAGE = { ventes: 1, stock: 1, charges: 1, chargesBoutique: 1, chargesPerso: 1, dettes: 1, defectueux: 1 };

function paginate(items, table) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  PAGE[table] = Math.min(PAGE[table], pages);
  const start = (PAGE[table] - 1) * PAGE_SIZE;
  return { items: items.slice(start, start + PAGE_SIZE), total, pages, page: PAGE[table] };
}

function paginationBar(table, pages, page, total) {
  if (pages <= 1) return '';
  const start = (page - 1) * PAGE_SIZE + 1;
  const end   = Math.min(page * PAGE_SIZE, total);
  return `<div class="pagination-bar">
    <span class="pagination-info">${start}–${end} sur ${total}</span>
    <div class="pagination-btns">
      <button class="btn btn-sm btn-secondary" onclick="changePage('${table}',-1)" ${page <= 1 ? 'disabled' : ''}>&#8592; Préc</button>
      <span class="pagination-pages">Page ${page} / ${pages}</span>
      <button class="btn btn-sm btn-secondary" onclick="changePage('${table}',1)" ${page >= pages ? 'disabled' : ''}>Suiv &#8594;</button>
    </div>
  </div>`;
}

function changePage(table, dir) {
  PAGE[table] = Math.max(1, PAGE[table] + dir);
  if (table === 'ventes')     renderVentes();
  if (table === 'stock')      renderStock();
  if (table === 'charges')    renderCharges();
  if (table === 'dettes')     renderDettes();
  if (table === 'defectueux') renderDefectueux();
}

function toast(msg, type = 'success', duration = 3500) {
  const tc = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  t.innerHTML = `<span>${icons[type] || '•'}</span><span>${msg}</span>`;
  tc.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function showModal(id) {
  document.getElementById(id).classList.add('open');
}
function hideModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ============================================
// EXPORT CSV
// ============================================
function exportCSV(table, rows, columns, labels) {
  // Appelable avec juste le nom de table (les pages existantes)
  if (!Array.isArray(rows)) { rows = DB.getAll(table); }
  if (!rows || !rows.length) { toast('Aucune donnée à exporter', 'warning'); return; }
  const cols = columns || Object.keys(rows[0]).filter(k => k !== 'id');
  const heads = labels || cols;
  const escape = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [heads.join(','), ...rows.map(r => cols.map(c => escape(r[c])).join(','))].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `venips_${table}_${new Date().toISOString().slice(0,10)}.csv`
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`Export CSV : ${rows.length} ligne(s)`, 'success');
}

function exportVentesCSV() {
  const rows = DB.getAll('ventes');
  exportCSV('ventes', rows,
    ['date','produit','qty','pa','pv','remise','gain','vendeur'],
    ['Date','Produit','Qté','PA','PV','Remise%','Gain','Vendeur']);
}
function exportStockCSV() {
  const stock  = DB.getAll('stock');
  const ventes = DB.getAll('ventes');
  const rows = stock.map(p => {
    const vendu  = ventes.filter(v => v.produit === p.nom).reduce((s,v) => s+(v.qty||0), 0);
    const restant = (p.qtyInitial||0) - vendu;
    return { nom: p.nom, categorie: p.categorie||'', pa: p.pa, pv: p.pv, qtyInitial: p.qtyInitial, vendu, restant };
  });
  exportCSV('stock', rows,
    ['nom','categorie','pa','pv','qtyInitial','vendu','restant'],
    ['Produit','Catégorie','PA','PV','Qté Initiale','Vendu','Restant']);
}
function exportChargesCSV() {
  exportCSV('charges', DB.getAll('charges'),
    ['date','categorie','type','montant','desc'],
    ['Date','Catégorie','Type','Montant','Description']);
}
function exportDettesCSV() {
  exportCSV('dettes', DB.getAll('dettes'),
    ['date','nom','type','montant','statut'],
    ['Date','Nom','Type','Montant','Statut']);
}
function exportCommandesCSV() {
  exportCSV('commandes', DB.getAll('commandes'),
    ['date','produit','qte','prixUnitaire','montant','statut','dateReception','notes'],
    ['Date','Produit','Qté','Prix Unit.','Montant','Statut','Date Réception','Notes']);
}
function exportRetoursCSV() {
  exportCSV('retours', DB.getAll('retours'),
    ['date','produit','qte','type','raison','montant','statut'],
    ['Date','Produit','Qté','Type','Raison','Montant','Statut']);
}
function exportInventairesCSV() {
  exportCSV('inventaires', DB.getAll('inventaires'),
    ['date','produit','qteTheorique','qteReelle','ecart','notes'],
    ['Date','Produit','Qté Théorique','Qté Réelle','Écart','Notes']);
}
// NAVIGATION
// ============================================
const pageTitles = {
  dashboard:    'Dashboard',
  ventes:       'Gestion des Ventes',
  stock:        'Gestion du Stock',
  vendeurs:     'Gestion des Vendeurs',
  charges:      'Gestion des Charges',
  dettes:       'Gestion des Dettes',
  defectueux:   'Produits Défectueux',
  recus:        'Reçus de Vente',
  fournisseurs: 'Fournisseurs',
  clients:      'Clients',
  commandes:    'Commandes Fournisseurs',
  objectifs:    'Objectifs CA',
  retours:      'Retours Produits',
  inventaires:     'Inventaires',
  objectifs_perso: 'Mes Objectifs Personnels',
  historique:      'Historique des Modifications'
};

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  const pageEl = document.getElementById(`page-${page}`);
  if (navItem) navItem.classList.add('active');
  if (pageEl) pageEl.classList.add('active');
  document.getElementById('pageTitle').textContent = pageTitles[page] || page;
  // Mémoriser la page courante pour tous les utilisateurs
  if (AUTH.isLoggedIn()) {
    sessionStorage.setItem('venips_last_page', page);
  }
  if (page === 'dashboard')   renderDashboard();
  if (page === 'ventes')      renderVentes();
  if (page === 'stock')       renderStock();
  if (page === 'vendeurs')    renderVendeurs();
  if (page === 'charges')     renderCharges();
  if (page === 'dettes')      renderDettes();
  if (page === 'defectueux')  renderDefectueux();
  if (page === 'recus')       renderRecus();
  if (page === 'fournisseurs') renderFournisseurs();
  if (page === 'clients')     renderClients();
  if (page === 'commandes')   renderCommandes();
  if (page === 'objectifs')   renderObjectifs();
  if (page === 'retours')     renderRetours();
  if (page === 'inventaires')    renderInventaires();
  if (page === 'objectifs_perso') renderObjectifsPerso();
  if (page === 'historique')     renderHistorique();
}

// ============================================
// DASHBOARD
// ============================================
let chartVentes = null;
let chartGains = null;
let chartChargesVsGains = null;

function renderDashboard() {
  const ventes      = DB.getAll('ventes');
  const stock       = DB.getAll('stock');
  const charges     = DB.getAll('charges');
  const dettes      = DB.getAll('dettes');
  const defectueux  = DB.getAll('defectueux');

  // ── Premier lancement : cache complètement vide ────────────────────────────
  const totalItems = ventes.length + stock.length + charges.length + dettes.length;
  if (totalItems === 0 && !DB._serverAvailable) {
    const recentBody = document.getElementById('recentSalesBody');
    const lowBody    = document.getElementById('lowStockBody');
    if (recentBody) recentBody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">🚀</div><p>Bienvenue sur VENIPS !</p><p style="font-size:.85rem;color:var(--muted);margin-top:4px;">Commencez par ajouter des produits en stock.</p></div></td></tr>`;
    if (lowBody)    lowBody.innerHTML    = `<tr><td colspan="3"><div class="empty-state"><div class="empty-icon">📦</div><p>Aucun produit encore</p></div></td></tr>`;
  }

  // ── KPIs (rendus en PREMIER, indépendamment de Chart.js) ──────────────────
  const totalCA         = ventes.reduce((s, v) => s + (v.pv * v.qty), 0);
  const totalGain       = ventes.reduce((s, v) => s + v.gain, 0);
  const totalQty        = ventes.reduce((s, v) => s + v.qty, 0);
  const totalCharges    = charges.reduce((s, c) => s + c.montant, 0);
  const totalStockItems = stock.reduce((s, p) => {
    const vendu = ventes.filter(v => v.produit === p.nom).reduce((t, v) => t + (v.qty || 0), 0);
    const def   = defectueux.filter(d => d.produit === p.nom && d.statut !== 'Résolu').reduce((t, d) => t + (d.qty || 0), 0);
    return s + Math.max(0, (p.qtyInitial ?? p.qty ?? 0) - vendu - def);
  }, 0);
  const valeurStockRestant = stock.reduce((s, p) => {
    const vendu = ventes.filter(v => v.produit === p.nom).reduce((t, v) => t + (v.qty || 0), 0);
    const def   = defectueux.filter(d => d.produit === p.nom && d.statut !== 'Résolu').reduce((t, d) => t + (d.qty || 0), 0);
    const restant = Math.max(0, (p.qtyInitial ?? p.qty ?? 0) - vendu - def);
    return s + restant * (p.pa || 0);
  }, 0);
  const ruptures = stock.filter(p => {
    const vendu = ventes.filter(v => v.produit === p.nom).reduce((t, v) => t + (v.qty || 0), 0);
    const def   = defectueux.filter(d => d.produit === p.nom && d.statut !== 'Résolu').reduce((t, d) => t + (d.qty || 0), 0);
    return Math.max(0, (p.qtyInitial ?? p.qty ?? 0) - vendu - def) === 0;
  }).length;
  const totalDefectueux = defectueux.filter(d => d.statut !== 'Résolu').reduce((s, d) => s + (d.qty || 0), 0);
  const today30 = new Date(); today30.setDate(today30.getDate() - 30);
  const dettesRetard = dettes.filter(d => d.statut === 'Non payé' && new Date(d.date) < today30).length;

  document.getElementById('kpi-ca').textContent = fmt(totalCA);
  document.getElementById('kpi-gain').textContent = fmt(totalGain);
  document.getElementById('kpi-sold').textContent = fmtNum(totalQty);
  document.getElementById('kpi-charges').textContent = fmt(totalCharges);
  document.getElementById('kpi-stock').textContent = fmtNum(totalStockItems);
  const kpiValeurStock = document.getElementById('kpi-valeur-stock');
  if (kpiValeurStock) kpiValeurStock.textContent = fmt(valeurStockRestant);
  document.getElementById('kpi-rupture').textContent = fmtNum(ruptures);
  const kpiDef = document.getElementById('kpi-defectueux');
  if (kpiDef) kpiDef.textContent = fmtNum(totalDefectueux);
  const kpiRetard = document.getElementById('kpi-dettes-retard');
  if (kpiRetard) {
    kpiRetard.textContent = fmtNum(dettesRetard);
    kpiRetard.closest('.kpi-card').classList.toggle('red', dettesRetard > 0);
    kpiRetard.closest('.kpi-card').classList.toggle('orange', dettesRetard === 0);
  }

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

  // Dernières ventes
  const recent = [...ventes].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
  const recentBody = document.getElementById('recentSalesBody');
  if (recentBody) {
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
  }

  // Stock faible
  const lowBody = document.getElementById('lowStockBody');
  const lowItems = stock.filter(p => p.qty <= 10).sort((a, b) => a.qty - b.qty);
  if (lowBody) {
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

  // ── Graphiques Chart.js (chargés APRÈS les KPIs) ──────────────────────────
  if (typeof Chart === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = () => renderDashboard();
    document.head.appendChild(s);
    return; // KPIs déjà affichés, graphiques après chargement
  }

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

  // Graphique Charges vs Gains
  const chargesByMonth = months.map(m => charges.filter(c => ym(c.date) === m).reduce((s, c) => s + c.montant, 0));
  if (chartChargesVsGains) chartChargesVsGains.destroy();
  const ctxCvG = document.getElementById('chartChargesVsGains');
  if (ctxCvG) {
    chartChargesVsGains = new Chart(ctxCvG, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Gains (GNF)', data: gainsByMonth, backgroundColor: '#10b98133', borderColor: '#10b981', borderWidth: 2, borderRadius: 6 },
          { label: 'Charges (GNF)', data: chargesByMonth, backgroundColor: '#ef444433', borderColor: '#ef4444', borderWidth: 2, borderRadius: 6 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
    });
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


function renderVentes() {
  let ventes = DB.getAll('ventes');
  const monthFilter   = document.getElementById('filterVenteMonth').value;
  const searchFilter  = document.getElementById('filterVenteSearch').value.toLowerCase();
  const vendeurFilter = document.getElementById('filterVenteVendeur')?.value || '';

  // Remplir le select vendeurs
  const vendeurSel = document.getElementById('filterVenteVendeur');
  if (vendeurSel) {
    const vendeurs = [...new Set(DB.getAll('ventes').map(v => v.vendeur).filter(Boolean))].sort();
    const curVal = vendeurSel.value;
    vendeurSel.innerHTML = '<option value="">Tous les vendeurs</option>' +
      vendeurs.map(v => `<option value="${escHtml(v)}" ${v === curVal ? 'selected' : ''}>${escHtml(v)}</option>`).join('');
  }

  if (monthFilter)   ventes = ventes.filter(v => ym(v.date) === monthFilter);
  if (searchFilter)  ventes = ventes.filter(v => v.produit.toLowerCase().includes(searchFilter));
  if (vendeurFilter) ventes = ventes.filter(v => (v.vendeur || '') === vendeurFilter);

  ventes.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Stats
  const totalCA   = ventes.reduce((s, v) => s + round(v.pv * v.qty), 0);
  const totalGain = ventes.reduce((s, v) => s + (v.gain || 0), 0);
  const totalQty  = ventes.reduce((s, v) => s + (v.qty || 0), 0);

  document.getElementById('vente-ca-filtered').textContent    = fmt(totalCA);
  document.getElementById('vente-gain-filtered').textContent  = fmt(totalGain);
  document.getElementById('vente-qty-filtered').textContent   = fmtNum(totalQty);
  const countEl = document.getElementById('vente-count-filtered');
  if (countEl) countEl.textContent = fmtNum(ventes.length);

  const tbody   = document.getElementById('ventesBody');
  const paginEl = document.getElementById('ventesPageBar');
  const isAdmin = AUTH.isAdmin();

  // Afficher/masquer colonne Vendeur pour admin uniquement
  document.querySelectorAll('#ventesTable .col-admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });

  if (ventes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <p>Aucune vente trouvée</p>
        <p style="font-size:.85rem;color:var(--muted);margin-top:4px;">Modifiez les filtres ou ajoutez une nouvelle vente</p>
      </div></td></tr>`;
    if (paginEl) paginEl.innerHTML = '';
    return;
  }

  const { items, total, pages, page } = paginate(ventes, 'ventes');
  tbody.innerHTML = items.map(v => {
    // Gain badge coloré
    const gainClass = v.gain >= 0 ? 'gain-badge gain-badge-pos' : 'gain-badge gain-badge-neg';
    const gainIcon  = v.gain >= 0 ? '▲' : '▼';

    // Stock : affichage "avant → après" avec couleur
    let stockCell = '—';
    if (v.stockAvant != null && v.stockApres != null) {
      const apresColor = v.stockApres === 0 ? '#ef4444' : v.stockApres <= 5 ? '#f59e0b' : '#10b981';
      const apresIcon  = v.stockApres === 0 ? ' ⚠️' : '';
      stockCell = `<span style="color:var(--muted)">${v.stockAvant}</span>
        <span style="color:var(--muted);font-size:.8rem;margin:0 2px">→</span>
        <span style="color:${apresColor};font-weight:700">${v.stockApres}${apresIcon}</span>`;
    }

    const canEdit = isAdmin || v.vendeur === AUTH.displayName();
    return `<tr>
      <td data-label="Date"><span class="vente-date">${formatDate(v.date)}</span></td>
      <td data-label="Produit"><strong>${escHtml(v.produit)}</strong></td>
      <td data-label="Qté"><span class="qty-badge">${v.qty}</span></td>
      <td data-label="Prix Vente">${fmt(v.pv)}</td>
      <td data-label="Remise">${v.remise ? `<span class="remise-badge">-${v.remise}%</span>` : '<span style="color:var(--muted)">—</span>'}</td>
      <td data-label="Gain"><span class="${gainClass}">${gainIcon} ${fmt(Math.abs(v.gain))}</span></td>
      <td data-label="Stock">${stockCell}</td>
      <td data-label="Vendeur" class="col-admin-only" style="${isAdmin ? '' : 'display:none'}">
        <span class="vendeur-tag">${escHtml(v.vendeur || '—')}</span>
      </td>
      <td data-label="Actions">
        <div class="action-btns">
          <button class="btn-icon" onclick="openRecuVente(${v.id})" title="Imprimer reçu">🖨️</button>
          ${canEdit ? `
          <button class="btn-icon btn-icon-edit" onclick="openEditVente(${v.id})" title="Modifier">✏️</button>
          <button class="btn-icon btn-icon-del" onclick="confirmDelete('ventes',${v.id},'la vente')" title="Supprimer">🗑️</button>
          ` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
  if (paginEl) paginEl.innerHTML = paginationBar('ventes', pages, page, total);
}

function openAddVente() {
  EDIT.venteId = null;
  document.getElementById('modalVenteTitle').textContent = 'Nouvelle Vente';
  document.getElementById('vente-date').value = today();
  document.getElementById('vente-qty').value = 1;
  document.getElementById('vente-pa').value = '';
  document.getElementById('vente-pv').value = '';
  document.getElementById('vente-remise').value = '0';
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
  EDIT.venteId = id;
  document.getElementById('modalVenteTitle').textContent = 'Modifier Vente';
  document.getElementById('vente-date').value = v.date;
  document.getElementById('vente-qty').value = v.qty;
  document.getElementById('vente-pa').value = v.pa;
  document.getElementById('vente-pv').value = v.pv;
  document.getElementById('vente-remise').value = v.remise || 0;
  document.getElementById('vente-gain').value = v.gain;
  populateStockSelect('vente-produit', v.produit);
  populateVendeurSelect('vente-vendeur', v.vendeur);
  showModal('modalVente');
}

function populateStockSelect(selectId, selectedNom = '') {
  const sel = document.getElementById(selectId);
  const stock = DB.getAll('stock');
  const ventes = DB.getAll('ventes');
  const defectueuxList = DB.getAll('defectueux');
  sel.innerHTML = '<option value="">-- Sélectionner --</option>';
  stock.forEach(p => {
    const totalVendu = ventes.filter(v => v.produit === p.nom).reduce((s, v) => s + (v.qty || 0), 0);
    const totalDef   = defectueuxList.filter(d => d.produit === p.nom && d.statut !== 'Résolu').reduce((s, d) => s + (d.qty || 0), 0);
    const restant = Math.max(0, (p.qtyInitial ?? p.qty ?? 0) - totalVendu - totalDef);
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
  const qty    = parseFloat(document.getElementById('vente-qty').value) || 0;
  const pa     = parseFloat(document.getElementById('vente-pa').value) || 0;
  const pv     = parseFloat(document.getElementById('vente-pv').value) || 0;
  const remise = parseFloat(document.getElementById('vente-remise').value) || 0;
  const pvApres = pv * (1 - remise / 100);
  document.getElementById('vente-gain').value = round((pvApres - pa) * qty);
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

  // Vérification préliminaire côté client (UX uniquement — le serveur recalcule en transaction)
  const toutesVentes   = DB.getAll('ventes');
  const tousDefect     = DB.getAll('defectueux');
  const totalDejaVendu = toutesVentes
    .filter(v => v.produit === produit && v.id !== EDIT.venteId)
    .reduce((s, v) => s + (v.qty || 0), 0);
  const totalDefect    = tousDefect
    .filter(d => d.produit === produit && d.statut !== 'Résolu')
    .reduce((s, d) => s + (d.qty || 0), 0);
  const qtyInitial = stockItem ? (stockItem.qtyInitial ?? stockItem.qty ?? 0) : 0;
  const stockAvant = qtyInitial - totalDejaVendu - totalDefect;
  const stockApres = stockAvant - qty;

  if (stockApres < 0) {
    toast(`Stock insuffisant. Disponible : ${stockAvant}`, 'error'); return;
  }

  // gain/stockAvant/stockApres envoyés comme valeurs optimistes (le serveur les recalcule)
  const remise  = parseFloat(document.getElementById('vente-remise').value) || 0;
  const pvApres = pv * (1 - remise / 100);
  const gain    = round((pvApres - pa) * qty);
  const stockId = stockItem ? stockItem.id : null;
  const record = { date, produit, qty, pa, pv, remise, gain, vendeur, stockAvant, stockApres, stockId };

  if (EDIT.venteId) {
    DB.update('ventes', EDIT.venteId, { date, produit, qty, pa, pv, remise, gain, vendeur, stockId });
    toast('Vente modifiée avec succès.');
  } else {
    DB.insertVente(record);
    const stockInfo = ` | Stock : ${stockAvant} → ${stockApres}`;
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


function renderStock() {
  let stock = DB.getAll('stock');
  const statusFilter   = document.getElementById('filterStockStatus').value;
  const catFilter      = document.getElementById('filterStockCategorie').value;
  const searchFilter   = document.getElementById('filterStockSearch').value.toLowerCase();
  const toutesVentes   = DB.getAll('ventes');
  const tousDefectueux = DB.getAll('defectueux');

  // Calculer restant pour chaque produit (pour les filtres statut)
  const getRestant = (p) => {
    const initial    = p.qtyInitial ?? p.qty ?? 0;
    const totalVendu = toutesVentes.filter(v => v.produit === p.nom).reduce((s, v) => s + (v.qty || 0), 0);
    const totalDef   = tousDefectueux.filter(d => d.produit === p.nom && d.statut !== 'Résolu').reduce((s, d) => s + (d.qty || 0), 0);
    return Math.max(0, initial - totalVendu - totalDef);
  };

  if (statusFilter) stock = stock.filter(p => {
    const r = getRestant(p);
    const seuil = p.seuilAlerte ?? 5;
    if (statusFilter === 'Rupture') return r === 0;
    if (statusFilter === 'Faible')  return r > 0 && r <= seuil;
    if (statusFilter === 'Disponible') return r > seuil;
    return true;
  });
  if (catFilter)    stock = stock.filter(p => (p.categorie || '') === catFilter);
  if (searchFilter) stock = stock.filter(p => p.nom.toLowerCase().includes(searchFilter));

  _fillCategoriesList();
  stock.sort((a, b) => a.nom.localeCompare(b.nom));

  const allStock = DB.getAll('stock');
  const dispo = allStock.filter(p => p.qty > 0).length;
  const rupture = allStock.filter(p => p.qty === 0).length;
  const valeur = allStock.reduce((s, p) => s + p.pa * p.qty, 0);

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
    tbody.innerHTML = `<tr><td colspan="${isAdmin ? 10 : 5}"><div class="empty-state"><div class="empty-icon">📦</div><p>Aucun produit trouvé</p></div></td></tr>`;
    return;
  }
  const paginEl = document.getElementById('stockPageBar');
  const { items: stockPage, total: stockTotal, pages, page } = paginate(stock, 'stock');

  // Calcul de la vélocité de vente sur 30 jours pour les prévisions
  const date30 = new Date(); date30.setDate(date30.getDate() - 30);
  const date30Str = date30.toISOString().slice(0, 10);

  tbody.innerHTML = stockPage.map(p => {
    const initial    = p.qtyInitial ?? p.qty;
    const totalVendu = toutesVentes.filter(v => v.produit === p.nom).reduce((s, v) => s + (v.qty || 0), 0);
    const totalDef   = tousDefectueux.filter(d => d.produit === p.nom && d.statut !== 'Résolu').reduce((s, d) => s + (d.qty || 0), 0);
    const restant    = Math.max(0, initial - totalVendu - totalDef);
    const seuil      = p.seuilAlerte ?? 5;

    const statut = restant === 0
      ? '<span class="badge badge-danger">Rupture</span>'
      : restant <= seuil
        ? '<span class="badge badge-warning">Faible</span>'
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

    // Prévision : vélocité sur 30 jours
    const ventesMois = toutesVentes.filter(v => v.produit === p.nom && v.date >= date30Str);
    const qtyMois    = ventesMois.reduce((s, v) => s + (v.qty || 0), 0);
    const avgJour    = qtyMois / 30;
    let prevision    = '∞';
    if (avgJour > 0 && restant > 0) {
      const jours = Math.ceil(restant / avgJour);
      prevision = jours <= 7  ? `<span style="color:#ef4444;font-weight:700">~${jours}j</span>`
                : jours <= 30 ? `<span style="color:#f59e0b;font-weight:600">~${jours}j</span>`
                : `<span style="color:#10b981">~${jours}j</span>`;
    } else if (restant === 0) {
      prevision = '<span style="color:#ef4444">Épuisé</span>';
    }

    const catBadge = p.categorie ? `<span class="cat-badge">${escHtml(p.categorie)}</span>` : '<span style="color:var(--muted);font-size:.8rem">—</span>';

    if (!isAdmin) {
      return `<tr>
        <td data-label="Produit"><strong>${escHtml(p.nom)}</strong></td>
        <td data-label="Catégorie">${catBadge}</td>
        <td data-label="Stock Initial">${initial}</td>
        <td data-label="Stock Restant">${progressBar}</td>
        <td data-label="Statut">${statut}</td>
      </tr>`;
    }
    const marge = p.pa > 0 ? (((p.pv - p.pa) / p.pa) * 100).toFixed(1) : 0;
    return `<tr>
      <td data-label="Produit"><strong>${escHtml(p.nom)}</strong></td>
      <td data-label="Catégorie">${catBadge}</td>
      <td data-label="Stock Initial">${initial}</td>
      <td data-label="Stock Restant">${progressBar}</td>
      <td data-label="Prix Achat">${fmt(p.pa)}</td>
      <td data-label="Prix Vente">${fmt(p.pv)}</td>
      <td data-label="Marge" class="${marge >= 0 ? 'gain-pos' : 'gain-neg'}">${marge}%</td>
      <td data-label="Prévision">${prevision}</td>
      <td data-label="Statut">${statut}</td>
      <td data-label="Actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditStock(${p.id})">✏️ Modifier</button>
        <button class="btn btn-sm btn-danger" onclick="confirmDelete('stock',${p.id},'le produit')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
  if (paginEl) paginEl.innerHTML = paginationBar('stock', pages, page, stockTotal);
}

function _fillCategoriesList() {
  const cats = [...new Set(DB.getAll('stock').map(p => p.categorie).filter(Boolean))].sort();
  const dl = document.getElementById('categoriesList');
  if (dl) dl.innerHTML = cats.map(c => `<option value="${escHtml(c)}">`).join('');
  const sel = document.getElementById('filterStockCategorie');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">Toutes les catégories</option>' +
      cats.map(c => `<option value="${escHtml(c)}" ${c === cur ? 'selected' : ''}>${escHtml(c)}</option>`).join('');
  }
}

function openAddStock() {
  EDIT.stockId = null;
  _fillCategoriesList();
  document.getElementById('modalStockTitle').textContent = 'Ajouter Produit';
  document.getElementById('stock-nom').value = '';
  document.getElementById('stock-categorie').value = '';
  document.getElementById('stock-qty').value = '';
  document.getElementById('stock-pa').value = '';
  document.getElementById('stock-pv').value = '';
  document.getElementById('stock-seuil').value = '5';
  showModal('modalStock');
}

function openEditStock(id) {
  const p = DB.findById('stock', id);
  if (!p) return;
  EDIT.stockId = id;
  _fillCategoriesList();
  document.getElementById('modalStockTitle').textContent = 'Modifier Produit';
  document.getElementById('stock-nom').value = p.nom;
  document.getElementById('stock-categorie').value = p.categorie || '';
  document.getElementById('stock-qty').value = p.qtyInitial ?? p.qty;
  document.getElementById('stock-pa').value = p.pa;
  document.getElementById('stock-pv').value = p.pv;
  document.getElementById('stock-seuil').value = p.seuilAlerte ?? 5;
  showModal('modalStock');
}

function saveStock() {
  const nom        = document.getElementById('stock-nom').value.trim();
  const categorie  = document.getElementById('stock-categorie').value.trim();
  const qty        = parseInt(document.getElementById('stock-qty').value);
  const pa         = parseFloat(document.getElementById('stock-pa').value);
  const pv         = parseFloat(document.getElementById('stock-pv').value);
  const seuilAlerte = parseInt(document.getElementById('stock-seuil').value) || 5;

  if (!nom || isNaN(qty) || isNaN(pa) || isNaN(pv)) {
    toast('Veuillez remplir tous les champs obligatoires.', 'error'); return;
  }
  if (qty < 0) { toast('Quantité ne peut pas être négative.', 'error'); return; }
  if (pa < 0 || pv < 0) { toast('Prix invalide.', 'error'); return; }

  const existing = DB.getAll('stock').find(p => p.nom.toLowerCase() === nom.toLowerCase() && p.id !== EDIT.stockId);
  if (existing) { toast('Un produit avec ce nom existe déjà.', 'error'); return; }

  if (EDIT.stockId) {
    DB.update('stock', EDIT.stockId, { nom, pa, pv, qtyInitial: qty, categorie, seuilAlerte });
    toast('Produit modifié avec succès.');
  } else {
    DB.insert('stock', { nom, pa, pv, qtyInitial: qty, categorie, seuilAlerte });
    toast('Produit ajouté avec succès.');
  }
  hideModal('modalStock');
  renderStock();
}

// ============================================
// VENDEURS
// ============================================


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
  EDIT.vendeurId = null;
  document.getElementById('modalVendeurTitle').textContent = 'Ajouter Vendeur';
  document.getElementById('vendeur-nom').value = '';
  showModal('modalVendeur');
}

function openEditVendeur(id) {
  const v = DB.findById('vendeurs', id);
  if (!v) return;
  EDIT.vendeurId = id;
  document.getElementById('modalVendeurTitle').textContent = 'Modifier Vendeur';
  document.getElementById('vendeur-nom').value = v.nom;
  showModal('modalVendeur');
}

function saveVendeur() {
  const nom = document.getElementById('vendeur-nom').value.trim();
  if (!nom) { toast('Veuillez entrer un nom.', 'error'); return; }

  const existing = DB.getAll('vendeurs').find(v => v.nom.toLowerCase() === nom.toLowerCase() && v.id !== EDIT.vendeurId);
  if (existing) { toast('Ce vendeur existe déjà.', 'error'); return; }

  if (EDIT.vendeurId) {
    DB.update('vendeurs', EDIT.vendeurId, { nom });
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


const BUDGET_PERSO = 3500000;

function renderCharges() {
  let allCharges = DB.getAll('charges');
  const monthFilter = document.getElementById('filterChargeMonth').value;

  // Totaux globaux (tous mois)
  const totalBoutique = allCharges.filter(c => c.categorie !== 'Personnelle').reduce((s, c) => s + c.montant, 0);
  const totalPerso    = allCharges.filter(c => c.categorie === 'Personnelle').reduce((s, c) => s + c.montant, 0);
  document.getElementById('charges-boutique-total').textContent = fmt(totalBoutique);
  document.getElementById('charges-perso-total').textContent    = fmt(totalPerso);

  // Budget personnel : basé sur le mois affiché (ou mois courant)
  const budgetMonth = monthFilter || currentYM();
  const depenseMois = allCharges
    .filter(c => c.categorie === 'Personnelle' && ym(c.date) === budgetMonth)
    .reduce((s, c) => s + c.montant, 0);
  const restant = BUDGET_PERSO - depenseMois;
  const pct     = Math.min(100, Math.round((depenseMois / BUDGET_PERSO) * 100));

  document.getElementById('charges-budget-restant').textContent = fmt(Math.max(0, restant));
  document.getElementById('budget-used-lbl').textContent        = fmt(depenseMois);

  const fill  = document.getElementById('budgetBarFill');
  const badge = document.getElementById('budgetStatusBadge');
  const card  = document.getElementById('budget-summary-card');
  fill.style.width = pct + '%';
  if (pct >= 100) {
    fill.className  = 'budget-bar-fill danger';
    badge.className = 'budget-status-badge badge-danger';
    badge.textContent = '🔴 Budget épuisé !';
    card.className  = 'summary-card red';
  } else if (pct >= 75) {
    fill.className  = 'budget-bar-fill warning';
    badge.className = 'budget-status-badge badge-warning';
    badge.textContent = '⚠️ Presque épuisé';
    card.className  = 'summary-card orange';
  } else {
    fill.className  = 'budget-bar-fill ok';
    badge.textContent = '';
    card.className  = 'summary-card green';
  }

  // Filtre par mois
  let charges = monthFilter ? allCharges.filter(c => ym(c.date) === monthFilter) : allCharges;
  charges.sort((a, b) => new Date(b.date) - new Date(a.date));

  const typeColors = { Courant: 'info', Location: 'warning', Réparation: 'danger', Salaire: 'success', Autre: '' };
  function buildRows(list, tbodyId, pageBarId, pageKey) {
    const tbody   = document.getElementById(tbodyId);
    const paginEl = document.getElementById(pageBarId);
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">💸</div><p>Aucune charge</p></div></td></tr>`;
      if (paginEl) paginEl.innerHTML = '';
      return;
    }
    const { items, total: tot, pages, page } = paginate(list, pageKey);
    tbody.innerHTML = items.map(c => `
      <tr>
        <td data-label="Date">${formatDate(c.date)}</td>
        <td data-label="Type"><span class="badge badge-${typeColors[c.type] || 'info'}">${escHtml(c.type || '—')}</span></td>
        <td data-label="Montant"><strong>${fmt(c.montant)}</strong></td>
        <td data-label="Description">${escHtml(c.desc || '—')}</td>
        <td data-label="Actions">
          <button class="btn-icon" onclick="openEditCharge(${c.id})">✏️</button>
          <button class="btn-icon" onclick="confirmDelete('charges',${c.id},'la charge')">🗑️</button>
        </td>
      </tr>`).join('');
    if (paginEl) paginEl.innerHTML = paginationBar(pageKey, pages, page, tot);
  }

  buildRows(charges.filter(c => c.categorie !== 'Personnelle'), 'chargesBoutiqueBody', 'chargesBoutiquePageBar', 'chargesBoutique');
  buildRows(charges.filter(c => c.categorie === 'Personnelle'),  'chargesPersoBody',    'chargesPersoPageBar',    'chargesPerso');
}

function openAddCharge() {
  EDIT.chargeId = null;
  document.getElementById('modalChargeTitle').textContent = 'Ajouter Charge';
  document.getElementById('charge-categorie').value = 'Boutique';
  document.getElementById('charge-date').value = today();
  document.getElementById('charge-type').value = '';
  document.getElementById('charge-montant').value = '';
  document.getElementById('charge-desc').value = '';
  showModal('modalCharge');
}

function openEditCharge(id) {
  const c = DB.findById('charges', id);
  if (!c) return;
  EDIT.chargeId = id;
  document.getElementById('modalChargeTitle').textContent = 'Modifier Charge';
  document.getElementById('charge-categorie').value = c.categorie || 'Boutique';
  document.getElementById('charge-date').value = c.date;
  document.getElementById('charge-type').value = c.type;
  document.getElementById('charge-montant').value = c.montant;
  document.getElementById('charge-desc').value = c.desc || '';
  showModal('modalCharge');
}

function saveCharge() {
  const categorie = document.getElementById('charge-categorie').value;
  const date      = document.getElementById('charge-date').value;
  const type      = document.getElementById('charge-type').value;
  const montant   = parseFloat(document.getElementById('charge-montant').value);
  const desc      = document.getElementById('charge-desc').value.trim();

  if (!date || !type || isNaN(montant) || montant <= 0) {
    toast('Veuillez remplir tous les champs obligatoires.', 'error'); return;
  }

  if (EDIT.chargeId) {
    DB.update('charges', EDIT.chargeId, { date, type, montant, desc, categorie });
    toast('Charge modifiée.');
  } else {
    DB.insert('charges', { date, type, montant, desc, categorie });
    toast('Charge ajoutée.');
  }
  hideModal('modalCharge');
  renderCharges();
}

// ============================================
// DETTES
// ============================================


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
  const paginEl = document.getElementById('dettesPageBar');
  if (dettes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🤝</div><p>Aucune dette trouvée</p></div></td></tr>`;
    if (paginEl) paginEl.innerHTML = '';
    return;
  }
  const limit30 = new Date(); limit30.setDate(limit30.getDate() - 30);
  const { items: dettesPage, total: tot, pages, page } = paginate(dettes, 'dettes');
  tbody.innerHTML = dettesPage.map(d => {
    const enRetard = d.statut === 'Non payé' && new Date(d.date) < limit30;
    return `
    <tr${enRetard ? ' style="background:rgba(239,68,68,.06)"' : ''}>
      <td data-label="Nom"><strong>${escHtml(d.nom)}</strong>${enRetard ? ' <span class="badge badge-danger">⏰ Retard</span>' : ''}</td>
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
    </tr>`;
  }).join('');
  if (paginEl) paginEl.innerHTML = paginationBar('dettes', pages, page, tot);
}

function openAddDette() {
  EDIT.detteId = null;
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
  EDIT.detteId = id;
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

  if (EDIT.detteId) {
    DB.update('dettes', EDIT.detteId, { nom, type, montant, date, statut });
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

// ============================================
// DÉFECTUEUX
// ============================================

function renderDefectueux() {
  let items = DB.getAll('defectueux');

  // Résumé global
  const totalQty    = items.reduce((s, d) => s + (d.qty || 0), 0);
  const enAttente   = items.filter(d => d.statut === 'En attente').length;
  const resolus     = items.filter(d => d.statut === 'Résolu').length;
  document.getElementById('def-total-qty').textContent = fmtNum(totalQty);
  document.getElementById('def-en-attente').textContent = fmtNum(enAttente);
  document.getElementById('def-resolus').textContent    = fmtNum(resolus);

  // Filtres
  const monthFilter  = document.getElementById('filterDefMonth').value;
  const statutFilter = document.getElementById('filterDefStatut').value;
  const searchFilter = document.getElementById('filterDefSearch').value.toLowerCase();
  if (monthFilter)  items = items.filter(d => ym(d.date) === monthFilter);
  if (statutFilter) items = items.filter(d => d.statut === statutFilter);
  if (searchFilter) items = items.filter(d => d.produit.toLowerCase().includes(searchFilter));
  items.sort((a, b) => new Date(b.date) - new Date(a.date));

  const tbody   = document.getElementById('defectueuxBody');
  const paginEl = document.getElementById('defectueuxPageBar');

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">✅</div><p>Aucun produit défectueux trouvé</p></div></td></tr>`;
    if (paginEl) paginEl.innerHTML = '';
    return;
  }

  const { items: page, total, pages, page: pg } = paginate(items, 'defectueux');
  const STATUT_CLASS = { 'En attente': 'badge-warning', 'Résolu': 'badge-success', 'Irréparable': 'badge-danger' };

  tbody.innerHTML = page.map(d => `
    <tr>
      <td data-label="Date">${formatDate(d.date)}</td>
      <td data-label="Produit"><strong>${escHtml(d.produit)}</strong></td>
      <td data-label="Qté" style="font-weight:700;color:#ef4444;">${d.qty}</td>
      <td data-label="Problème" style="max-width:200px;white-space:normal;">${escHtml(d.probleme)}</td>
      <td data-label="Solution" style="max-width:200px;white-space:normal;">${escHtml(d.solution || '—')}</td>
      <td data-label="Statut"><span class="badge ${STATUT_CLASS[d.statut] || ''}">${escHtml(d.statut)}</span></td>
      <td data-label="Actions">
        <button class="btn btn-sm btn-secondary" onclick="openEditDefectueux(${d.id})">✏️ Modifier</button>
        <button class="btn btn-sm btn-danger" onclick="confirmDelete('defectueux',${d.id},'le défaut')">🗑️</button>
      </td>
    </tr>`).join('');
  if (paginEl) paginEl.innerHTML = paginationBar('defectueux', pages, pg, total);
}

function openAddDefectueux() {
  EDIT.defectueuxId = null;
  document.getElementById('modalDefTitle').textContent = 'Signaler un Défaut';
  document.getElementById('def-date').value    = today();
  document.getElementById('def-qty').value     = 1;
  document.getElementById('def-statut').value  = 'En attente';
  document.getElementById('def-probleme').value = '';
  document.getElementById('def-solution').value = '';
  // Remplir la liste des produits
  const sel = document.getElementById('def-produit');
  sel.innerHTML = '<option value="">-- Sélectionner --</option>';
  DB.getAll('stock').forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.nom;
    opt.textContent = p.nom;
    sel.appendChild(opt);
  });
  showModal('modalDefectueux');
}

function openEditDefectueux(id) {
  const d = DB.findById('defectueux', id);
  if (!d) return;
  EDIT.defectueuxId = id;
  document.getElementById('modalDefTitle').textContent = 'Modifier Défaut';
  document.getElementById('def-date').value     = d.date;
  document.getElementById('def-qty').value      = d.qty;
  document.getElementById('def-statut').value   = d.statut;
  document.getElementById('def-probleme').value = d.probleme;
  document.getElementById('def-solution').value = d.solution || '';
  const sel = document.getElementById('def-produit');
  sel.innerHTML = '<option value="">-- Sélectionner --</option>';
  DB.getAll('stock').forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.nom;
    opt.textContent = p.nom;
    if (p.nom === d.produit) opt.selected = true;
    sel.appendChild(opt);
  });
  showModal('modalDefectueux');
}

function saveDefectueux() {
  const date     = document.getElementById('def-date').value;
  const produit  = document.getElementById('def-produit').value;
  const qty      = parseInt(document.getElementById('def-qty').value);
  const statut   = document.getElementById('def-statut').value;
  const probleme = document.getElementById('def-probleme').value.trim();
  const solution = document.getElementById('def-solution').value.trim();

  if (!date || !produit || !qty || !probleme) {
    toast('Veuillez remplir tous les champs obligatoires.', 'error'); return;
  }
  if (qty <= 0) { toast('Quantité invalide.', 'error'); return; }

  const record = { date, produit, qty, probleme, solution, statut };

  if (EDIT.defectueuxId) {
    DB.update('defectueux', EDIT.defectueuxId, record);
    toast('Défaut modifié avec succès.');
  } else {
    DB.insert('defectueux', record);
    toast(`⚠️ Défaut signalé — ${produit} (${qty} unité${qty > 1 ? 's' : ''})`, 'warning');
  }

  hideModal('modalDefectueux');
  renderDefectueux();
  renderStock();
  renderDashboard();
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
  const { table, id } = deleteTarget;
  DB.delete(table, id);
  toast('Élément supprimé.', 'warning');
  hideModal('modalConfirm');
  deleteTarget = null;
  // Si c'est une vente, rafraîchir aussi stock et dashboard (stock restant recalculé)
  if (table === 'ventes') {
    renderVentes();
    renderStock();
    renderDashboard();
    return;
  }
  // Rafraîchir la page active
  const active = document.querySelector('.page.active');
  if (active) navigateTo(active.id.replace('page-', ''));
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
// EXPORT CSV
// ============================================
function exportCSV(table) {
  const HEADERS = {
    ventes:   ['Date', 'Produit', 'Qté', 'Prix Achat', 'Prix Vente', 'Gain', 'Vendeur', 'Stock Avant', 'Stock Après'],
    stock:    ['Produit', 'Stock Initial', 'Prix Achat', 'Prix Vente'],
    charges:  ['Date', 'Catégorie', 'Type', 'Montant', 'Description'],
    dettes:      ['Nom', 'Type', 'Montant', 'Date', 'Statut'],
    vendeurs:    ['Nom'],
    defectueux:  ['Date', 'Produit', 'Qté', 'Problème', 'Solution', 'Statut'],
  };
  const ROWS = {
    ventes:      d => [d.date, d.produit, d.qty, d.pa, d.pv, d.gain, d.vendeur || '', d.stockAvant ?? '', d.stockApres ?? ''],
    stock:       d => [d.nom, d.qtyInitial ?? d.qty, d.pa, d.pv],
    charges:     d => [d.date, d.categorie || 'Boutique', d.type || '', d.montant, d.desc || ''],
    dettes:      d => [d.nom, d.type || '', d.montant, d.date || '', d.statut],
    vendeurs:    d => [d.nom],
    defectueux:  d => [d.date, d.produit, d.qty, d.probleme, d.solution || '', d.statut],
  };

  const data = DB.getAll(table);
  const headers = HEADERS[table] || Object.keys(data[0] || {});
  const rowFn = ROWS[table] || (d => Object.values(d));

  const csvContent = [
    headers.join(';'),
    ...data.map(d => rowFn(d).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `venips-${table}-${today()}.csv`);
  toast(`Export ${table} téléchargé.`, 'success');
}

// ============================================
// BACKUP BASE DE DONNÉES
// ============================================
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

async function downloadBackup() {
  const filename = `venips-backup-${today()}.json`;

  if (!DB._serverAvailable) {
    const backup = {};
    ['stock', 'ventes', 'vendeurs', 'charges', 'dettes', 'defectueux'].forEach(t => { backup[t] = DB.getAll(t); });
    triggerDownload(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), filename);
    toast('Backup téléchargé (mode local).', 'success');
    return;
  }

  try {
    const r = await fetch('/api/backup/download', { headers: DB._headers() });
    if (r.status === 401 || r.status === 403) {
      // Token absent ou invalide → fallback sur le cache en mémoire
      const backup = {};
      ['stock', 'ventes', 'vendeurs', 'charges', 'dettes', 'defectueux'].forEach(t => { backup[t] = DB.getAll(t); });
      triggerDownload(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), filename);
      toast('Backup téléchargé depuis le cache.', 'success');
      return;
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      toast(`Erreur backup : ${err.error || r.status}`, 'error');
      return;
    }
    const blob = await r.blob();
    triggerDownload(blob, filename);
    toast('Backup téléchargé avec succès.', 'success');
  } catch (e) {
    // Réseau indisponible → fallback cache
    const backup = {};
    ['stock', 'ventes', 'vendeurs', 'charges', 'dettes', 'defectueux'].forEach(t => { backup[t] = DB.getAll(t); });
    triggerDownload(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), filename);
    toast('Backup téléchargé depuis le cache.', 'success');
  }
}

// ============================================
// RAPPORT MENSUEL
// ============================================
async function openRapportMensuel() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const ym    = `${year}-${month}`;
  const moisFr = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][now.getMonth()];

  let data;
  if (DB._serverAvailable) {
    try {
      const r = await fetch(`/api/rapport/${year}/${month}`, { headers: DB._headers() });
      if (r.ok) data = await r.json();
    } catch {}
  }

  // Fallback client-side si serveur indisponible
  if (!data) {
    const ventes   = DB.getAll('ventes');
    const charges  = DB.getAll('charges');
    const dettes   = DB.getAll('dettes');
    const defect   = DB.getAll('defectueux');
    const stock    = DB.getAll('stock');
    const ventesMois   = ventes.filter(v => v.date && v.date.startsWith(ym));
    const chargesMois  = charges.filter(c => c.date && c.date.startsWith(ym));
    const ca    = ventesMois.reduce((s, v) => s + (v.pv * v.qty), 0);
    const gain  = ventesMois.reduce((s, v) => s + (v.gain || 0), 0);
    const chargesTotal = chargesMois.reduce((s, c) => s + (c.montant || 0), 0);
    const prodMap = {};
    ventesMois.forEach(v => {
      if (!prodMap[v.produit]) prodMap[v.produit] = { qty: 0, ca: 0, gain: 0 };
      prodMap[v.produit].qty += v.qty || 0; prodMap[v.produit].ca += v.pv * v.qty; prodMap[v.produit].gain += v.gain || 0;
    });
    data = {
      periode: ym, ca, gain, caPrev: 0, gainPrev: 0, chargesTotal, benefice: gain - chargesTotal,
      nbVentes: ventesMois.length,
      topProduits: Object.entries(prodMap).sort((a,b)=>b[1].ca-a[1].ca).slice(0,5),
      vendeurs: [], ruptures: [], dettesImpayees: dettes.filter(d=>d.statut==='Non payé').length,
      defEnAttente: defect.filter(d=>d.statut==='En attente').length,
    };
  }

  const f = n => new Intl.NumberFormat('fr-FR').format(Math.round(n||0)) + ' GNF';
  const pct = (a, b) => b ? ((a - b) / b * 100).toFixed(1) : '—';
  const arrow = (a, b) => a >= b ? '▲' : '▼';
  const col   = (a, b) => a >= b ? '#10b981' : '#ef4444';

  const topRows = data.topProduits.map(([nom, d]) =>
    `<tr><td>${escHtml(nom)}</td><td style="text-align:center">${d.qty}</td><td style="text-align:right">${f(d.ca)}</td><td style="text-align:right;color:#10b981">${f(d.gain)}</td></tr>`
  ).join('') || '<tr><td colspan="4" style="color:#999;text-align:center">Aucune vente ce mois</td></tr>';

  const vendRows = data.vendeurs.map(([nom, d]) =>
    `<tr><td>${escHtml(nom)}</td><td style="text-align:center">${d.qty}</td><td style="text-align:right">${f(d.ca)}</td></tr>`
  ).join('') || '<tr><td colspan="3" style="color:#999;text-align:center">—</td></tr>';

  const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><title>Rapport ${moisFr} ${year}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;padding:32px;color:#1e293b;background:#fff;max-width:800px;margin:auto}
  h1{font-size:1.6rem;margin-bottom:4px;color:#003530}
  .subtitle{color:#64748b;margin-bottom:28px;font-size:.95rem}
  .kpi-row{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:28px}
  .kpi{background:#f8fafc;border-radius:10px;padding:16px;border-left:4px solid #00d4c4}
  .kpi label{font-size:.75rem;color:#64748b;display:block;margin-bottom:4px}
  .kpi strong{font-size:1.15rem;color:#1e293b}
  .kpi .delta{font-size:.78rem;margin-top:4px}
  .section{margin-bottom:24px}
  h2{font-size:1.05rem;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #e2e8f0}
  table{width:100%;border-collapse:collapse;font-size:.875rem}
  th{background:#f1f5f9;padding:8px 12px;text-align:left;font-weight:600;color:#475569}
  td{padding:8px 12px;border-bottom:1px solid #e2e8f0}
  .alerts{display:flex;flex-wrap:wrap;gap:8px}
  .alert{padding:6px 12px;border-radius:6px;font-size:.82rem;font-weight:600}
  .alert-warn{background:#fef3c7;color:#92400e}
  .alert-ok{background:#d1fae5;color:#065f46}
  footer{margin-top:32px;text-align:center;color:#94a3b8;font-size:.78rem;border-top:1px solid #e2e8f0;padding-top:16px}
  @media print{button{display:none}}
</style>
</head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start">
  <div>
    <h1>📊 Rapport Mensuel — ${moisFr} ${year}</h1>
    <p class="subtitle">Généré le ${new Date().toLocaleDateString('fr-FR')} · VENIPS Gestion Commerciale</p>
  </div>
  <button onclick="window.print()" style="padding:8px 16px;background:#00d4c4;border:none;border-radius:8px;cursor:pointer;font-weight:600;color:#fff">🖨️ Imprimer</button>
</div>

<div class="kpi-row">
  <div class="kpi" style="border-color:#00d4c4">
    <label>Chiffre d'Affaires</label>
    <strong>${f(data.ca)}</strong>
    ${data.caPrev ? `<div class="delta" style="color:${col(data.ca,data.caPrev)}">${arrow(data.ca,data.caPrev)} ${Math.abs(pct(data.ca,data.caPrev))}% vs mois préc.</div>` : ''}
  </div>
  <div class="kpi" style="border-color:#10b981">
    <label>Gain Net</label>
    <strong style="color:#10b981">${f(data.gain)}</strong>
    ${data.gainPrev ? `<div class="delta" style="color:${col(data.gain,data.gainPrev)}">${arrow(data.gain,data.gainPrev)} ${Math.abs(pct(data.gain,data.gainPrev))}% vs mois préc.</div>` : ''}
  </div>
  <div class="kpi" style="border-color:#6366f1">
    <label>Bénéfice Net</label>
    <strong style="color:${data.benefice>=0?'#10b981':'#ef4444'}">${f(data.benefice)}</strong>
    <div style="font-size:.75rem;color:#64748b;margin-top:2px">Charges : ${f(data.chargesTotal)}</div>
  </div>
</div>

<div class="kpi-row" style="grid-template-columns:repeat(4,1fr)">
  <div class="kpi" style="border-color:#f59e0b"><label>Ventes</label><strong>${data.nbVentes}</strong></div>
  <div class="kpi" style="border-color:#ef4444"><label>Ruptures stock</label><strong>${data.ruptures.length}</strong></div>
  <div class="kpi" style="border-color:#f59e0b"><label>Dettes impayées</label><strong>${data.dettesImpayees}</strong></div>
  <div class="kpi" style="border-color:#8b5cf6"><label>Défectueux</label><strong>${data.defEnAttente}</strong></div>
</div>

<div class="section">
  <h2>🏆 Top 5 Produits</h2>
  <table><thead><tr><th>Produit</th><th style="text-align:center">Qté</th><th style="text-align:right">CA</th><th style="text-align:right">Gain</th></tr></thead>
  <tbody>${topRows}</tbody></table>
</div>

${data.vendeurs.length ? `<div class="section">
  <h2>👨‍💼 Performance Vendeurs</h2>
  <table><thead><tr><th>Vendeur</th><th style="text-align:center">Qté</th><th style="text-align:right">CA</th></tr></thead>
  <tbody>${vendRows}</tbody></table>
</div>` : ''}

${data.ruptures.length ? `<div class="section">
  <h2>⚠️ Produits en Rupture</h2>
  <div class="alerts">${data.ruptures.map(n=>`<span class="alert alert-warn">🔴 ${escHtml(n)}</span>`).join('')}</div>
</div>` : ''}

<footer>VENIPS · Rapport ${moisFr} ${year} · ${new Date().toLocaleString('fr-FR')}</footer>
</body></html>`;

  const w = window.open('', '_blank', 'width=850,height=750');
  if (w) { w.document.write(html); w.document.close(); }
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
  DB.loadFromStorage(); // sync, instantané — pas de page blanche
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
  document.getElementById('btnAddDefectueux').addEventListener('click', openAddDefectueux);

  // Boutons enregistrer
  document.getElementById('saveVente').addEventListener('click', saveVente);
  document.getElementById('btnPrintRecuVente').addEventListener('click', printRecuVente);
  document.getElementById('saveStock').addEventListener('click', saveStock);
  document.getElementById('saveVendeur').addEventListener('click', saveVendeur);
  document.getElementById('saveCharge').addEventListener('click', saveCharge);
  document.getElementById('saveDette').addEventListener('click', saveDette);
  document.getElementById('saveDefectueux').addEventListener('click', saveDefectueux);

  // Calcul gain en temps réel
  ['vente-qty', 'vente-pa', 'vente-pv', 'vente-remise'].forEach(id => {
    document.getElementById(id).addEventListener('input', calcGain);
  });

  // Filtres Ventes
  document.getElementById('filterVenteMonth').addEventListener('change', renderVentes);
  document.getElementById('filterVenteSearch').addEventListener('input', debounce(renderVentes));
  document.getElementById('filterVenteVendeur')?.addEventListener('change', renderVentes);
  document.getElementById('filterVenteReset').addEventListener('click', () => {
    document.getElementById('filterVenteMonth').value = '';
    document.getElementById('filterVenteSearch').value = '';
    const vendeurSel = document.getElementById('filterVenteVendeur');
    if (vendeurSel) vendeurSel.value = '';
    renderVentes();
  });

  // Filtres Stock
  document.getElementById('filterStockStatus').addEventListener('change', renderStock);
  document.getElementById('filterStockCategorie').addEventListener('change', renderStock);
  document.getElementById('filterStockSearch').addEventListener('input', debounce(renderStock));
  document.getElementById('filterStockReset').addEventListener('click', () => {
    document.getElementById('filterStockStatus').value = '';
    document.getElementById('filterStockCategorie').value = '';
    document.getElementById('filterStockSearch').value = '';
    renderStock();
  });

  // Filtres Charges
  document.getElementById('filterChargeMonth').addEventListener('change', renderCharges);
  document.getElementById('filterChargeReset').addEventListener('click', () => {
    document.getElementById('filterChargeMonth').value = '';
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

  // Filtres Défectueux
  document.getElementById('filterDefMonth').addEventListener('change', renderDefectueux);
  document.getElementById('filterDefStatut').addEventListener('change', renderDefectueux);
  document.getElementById('filterDefSearch').addEventListener('input', debounce(renderDefectueux));
  document.getElementById('filterDefReset').addEventListener('click', () => {
    document.getElementById('filterDefMonth').value = '';
    document.getElementById('filterDefStatut').value = '';
    document.getElementById('filterDefSearch').value = '';
    renderDefectueux();
  });


  // Historique filters
  const filterLogAction = document.getElementById('filterLogAction');
  const filterLogTable  = document.getElementById('filterLogTable');
  const filterLogReset  = document.getElementById('filterLogReset');
  if (filterLogAction) filterLogAction.addEventListener('change', renderHistorique);
  if (filterLogTable)  filterLogTable.addEventListener('change', renderHistorique);
  if (filterLogReset)  filterLogReset.addEventListener('click', () => {
    filterLogAction.value = '';
    filterLogTable.value  = '';
    renderHistorique();
  });

  // Recherche globale
  const gSearch = document.getElementById('globalSearch');
  if (gSearch) {
    gSearch.addEventListener('input', debounce(() => globalSearch(gSearch.value)));
    document.addEventListener('click', e => {
      if (!e.target.closest('.global-search-wrap')) {
        document.getElementById('globalSearchResults')?.classList.remove('open');
      }
    });
  }

  // Masquer nav items admin-only pour les vendeurs
  if (!AUTH.isAdmin()) {
    document.querySelectorAll('.nav-admin-only').forEach(el => el.style.display = 'none');
  }

  // Navigation immédiate avec données localStorage (pas d'attente réseau)
  if (AUTH.isLoggedIn()) {
    const user = AUTH.currentUser();
    const lastPage = sessionStorage.getItem('venips_last_page');
    const adminPages = ['dashboard','ventes','stock','vendeurs','charges','dettes','defectueux','recus','historique'];
    const target = user.role === 'vendeur'
      ? (['ventes','stock'].includes(lastPage) ? lastPage : 'ventes')
      : (adminPages.includes(lastPage) ? lastPage : 'dashboard');
    navigateTo(target);
    renderNotifications();
  }

  // Indicateur sync : en cours
  const syncEl = document.getElementById('syncIndicator');
  if (syncEl) { syncEl.className = 'sync-indicator syncing'; syncEl.title = 'Synchronisation…'; }

  // Récupérer les données fraîches du serveur en arrière-plan
  await DB.fetchFromServer();

  // Indicateur sync : résultat
  if (syncEl) {
    if (DB._serverAvailable) {
      syncEl.className = 'sync-indicator online';
      syncEl.title = 'Données synchronisées';
    } else {
      syncEl.className = 'sync-indicator offline';
      syncEl.title = 'Serveur non joignable — données locales';
    }
  }

  // Re-rendre la page courante avec les données serveur
  if (AUTH.isLoggedIn()) {
    const user = AUTH.currentUser();
    const lastPage = sessionStorage.getItem('venips_last_page');
    if (user.role === 'vendeur') {
      const exists = DB.getAll('vendeurs').some(v => v.nom === user.display);
      if (!exists) DB.insert('vendeurs', { nom: user.display });
    }
    const adminPages = ['dashboard','ventes','stock','vendeurs','charges','dettes','defectueux','recus','historique'];
    const target = user.role === 'vendeur'
      ? (['ventes','stock'].includes(lastPage) ? lastPage : 'ventes')
      : (adminPages.includes(lastPage) ? lastPage : 'dashboard');
    navigateTo(target);
    renderNotifications();
  }
});

// ============================================
// HISTORIQUE
// ============================================
const PAGE_LOGS = { logs: 1 };

async function renderHistorique() {
  if (!AUTH.isAdmin()) return;
  const tbody   = document.getElementById('logsBody');
  const paginEl = document.getElementById('logsPageBar');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">Chargement…</td></tr>`;
  try {
    const res  = await fetch('/api/logs', { headers: { 'x-venips-token': AUTH.getToken() } });
    let logs   = await res.json();
    const actionFilter = document.getElementById('filterLogAction')?.value || '';
    const tableFilter  = document.getElementById('filterLogTable')?.value  || '';
    if (actionFilter) logs = logs.filter(l => l.action === actionFilter);
    if (tableFilter)  logs = logs.filter(l => l.tableName === tableFilter);

    const actionColors = { AJOUT: 'badge-success', MODIFICATION: 'badge-warning', SUPPRESSION: 'badge-danger' };
    const tableNames   = { ventes: 'Ventes', stock: 'Stock', charges: 'Charges', dettes: 'Dettes', defectueux: 'Défectueux', vendeurs: 'Vendeurs' };

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📋</div><p>Aucune entrée dans l'historique</p></div></td></tr>`;
      if (paginEl) paginEl.innerHTML = '';
      return;
    }
    tbody.innerHTML = logs.slice(0, 200).map(l => {
      const dt = new Date(l.timestamp);
      const dtStr = dt.toLocaleDateString('fr-FR') + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      return `<tr>
        <td data-label="Date/Heure" style="white-space:nowrap">${dtStr}</td>
        <td data-label="Utilisateur"><strong>${escHtml(l.username)}</strong></td>
        <td data-label="Action"><span class="badge ${actionColors[l.action] || ''}">${escHtml(l.action)}</span></td>
        <td data-label="Table">${tableNames[l.tableName] || escHtml(l.tableName)}</td>
        <td data-label="ID">${l.recordId || '—'}</td>
        <td data-label="Détails" style="font-size:.75rem;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(l.details || '')}">${escHtml(l.details || '—')}</td>
      </tr>`;
    }).join('');
    if (paginEl) paginEl.innerHTML = '';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger);text-align:center">Erreur chargement historique</td></tr>`;
  }
}

// ============================================
// RECHERCHE GLOBALE
// ============================================
function globalSearch(query) {
  const q = query.trim().toLowerCase();
  const container = document.getElementById('globalSearchResults');
  if (!container) return;
  if (q.length < 2) { container.classList.remove('open'); return; }

  const results = [];
  const add = (label, icon, page, sub) => results.push({ label, icon, page, sub });

  DB.getAll('stock').filter(p => p.nom.toLowerCase().includes(q))
    .forEach(p => add(p.nom, '📦', 'stock', `Prix vente: ${fmt(p.pv)}`));
  DB.getAll('ventes').filter(v => v.produit.toLowerCase().includes(q) || (v.vendeur||'').toLowerCase().includes(q))
    .slice(0, 5).forEach(v => add(v.produit, '🛒', 'ventes', `${formatDate(v.date)} – ${fmt(v.pv * v.qty)}`));
  DB.getAll('dettes').filter(d => d.nom.toLowerCase().includes(q))
    .forEach(d => add(d.nom, '🤝', 'dettes', `${fmt(d.montant)} – ${d.statut}`));
  DB.getAll('charges').filter(c => (c.desc||'').toLowerCase().includes(q) || (c.type||'').toLowerCase().includes(q))
    .slice(0, 5).forEach(c => add(c.type || c.desc, '💸', 'charges', `${formatDate(c.date)} – ${fmt(c.montant)}`));
  DB.getAll('defectueux').filter(d => d.produit.toLowerCase().includes(q) || (d.probleme||'').toLowerCase().includes(q))
    .forEach(d => add(d.produit, '⚠️', 'defectueux', d.probleme));

  if (results.length === 0) {
    container.innerHTML = `<div class="search-no-result">Aucun résultat pour "${escHtml(q)}"</div>`;
  } else {
    container.innerHTML = results.slice(0, 10).map((r, i) => `
      <div class="search-result-item" data-page="${r.page}" data-idx="${i}">
        <span class="search-result-icon">${r.icon}</span>
        <div class="search-result-text">
          <div class="search-result-label">${escHtml(r.label)}</div>
          <div class="search-result-sub">${escHtml(r.sub)}</div>
        </div>
      </div>`).join('');
    container.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        navigateTo(el.dataset.page);
        container.classList.remove('open');
        document.getElementById('globalSearch').value = '';
      });
    });
  }
  container.classList.add('open');
}

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

// ============================================
// NOTIFICATIONS (cloche + badge + dropdown)
// ============================================
function renderNotifications() {
  if (!AUTH.isLoggedIn()) return;
  const stock      = DB.getAll('stock');
  const dettes     = DB.getAll('dettes');
  const ventes     = DB.getAll('ventes');
  const defectueux = DB.getAll('defectueux');

  const alertes = [];

  // Ruptures et stock faible
  stock.forEach(p => {
    const totalVendu = ventes.filter(v => v.produit === p.nom).reduce((s, v) => s + (v.qty || 0), 0);
    const totalDef   = defectueux.filter(d => d.produit === p.nom && d.statut !== 'Résolu').reduce((s, d) => s + (d.qty || 0), 0);
    const restant = Math.max(0, (p.qtyInitial ?? p.qty ?? 0) - totalVendu - totalDef);
    const seuil = p.seuilAlerte ?? 5;
    if (restant === 0)        alertes.push({ type: 'danger',  icon: '🔴', msg: `Rupture de stock : ${p.nom}` });
    else if (restant <= seuil) alertes.push({ type: 'warning', icon: '🟡', msg: `Stock faible (${restant}/${seuil}) : ${p.nom}` });
  });

  // Dettes impayées depuis +30 jours
  const limit30 = new Date(); limit30.setDate(limit30.getDate() - 30);
  dettes.filter(d => d.statut === 'Non payé' && d.date && new Date(d.date) < limit30)
    .forEach(d => alertes.push({ type: 'warning', icon: '⏰', msg: `Dette en retard : ${d.nom} (${fmt(d.montant)})` }));

  // Défectueux non résolus
  const defEnCours = defectueux.filter(d => d.statut === 'En attente');
  if (defEnCours.length > 0)
    alertes.push({ type: 'info', icon: '⚠️', msg: `${defEnCours.length} produit(s) défectueux en attente` });

  // Mettre à jour le badge
  const badge   = document.getElementById('notifBadge');
  const list    = document.getElementById('notifList');
  const btnNotif = document.getElementById('btnNotif');

  if (badge) {
    if (alertes.length > 0) {
      badge.textContent = alertes.length > 9 ? '9+' : alertes.length;
      badge.style.display = '';
      const hasDanger = alertes.some(a => a.type === 'danger');
      badge.className = 'notif-badge' + (hasDanger ? ' danger' : '');
    } else {
      badge.style.display = 'none';
    }
  }

  // Mettre à jour la liste du dropdown
  if (list) {
    if (alertes.length === 0) {
      list.innerHTML = '<div class="notif-empty">✅ Aucune alerte</div>';
    } else {
      list.innerHTML = alertes.map(a => `
        <div class="notif-item notif-${a.type}">
          <span class="notif-icon">${a.icon}</span>
          <span class="notif-msg">${escHtml(a.msg)}</span>
        </div>`).join('');
    }
  }

  // Toast au premier chargement si ruptures critiques
  const shownKey = 'venips_notif_shown';
  if (!sessionStorage.getItem(shownKey) && alertes.length > 0) {
    const dangers = alertes.filter(a => a.type === 'danger');
    if (dangers.length > 0) toast(`🔴 ${dangers.length} rupture(s) de stock`, 'error');
    else toast(`⚠️ ${alertes.length} alerte(s) en attente`, 'warning');
    sessionStorage.setItem(shownKey, '1');
  }
}

// ============================================
// RECHERCHE MOBILE (overlay)
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  const mobileSearchBtn     = document.getElementById('mobileSearchBtn');
  const mobileSearchOverlay = document.getElementById('mobileSearchOverlay');
  const mobileSearchClose   = document.getElementById('mobileSearchClose');
  const mobileSearchInput   = document.getElementById('mobileSearchInput');
  const mobileSearchResults = document.getElementById('mobileSearchResults');

  if (!mobileSearchBtn || !mobileSearchOverlay) return;

  function openMobileSearch() {
    mobileSearchOverlay.classList.add('open');
    mobileSearchInput.value = '';
    mobileSearchResults.innerHTML = '';
    setTimeout(() => mobileSearchInput.focus(), 50);
  }

  function closeMobileSearch() {
    mobileSearchOverlay.classList.remove('open');
  }

  mobileSearchBtn.addEventListener('click', openMobileSearch);
  mobileSearchClose.addEventListener('click', closeMobileSearch);

  mobileSearchInput.addEventListener('input', debounce(() => {
    const q = mobileSearchInput.value.trim().toLowerCase();
    if (q.length < 2) { mobileSearchResults.innerHTML = ''; return; }

    const results = [];
    const add = (label, icon, page, sub) => results.push({ label, icon, page, sub });
    DB.getAll('stock').filter(p => p.nom.toLowerCase().includes(q))
      .forEach(p => add(p.nom, '📦', 'stock', `Prix vente: ${fmt(p.pv)}`));
    DB.getAll('ventes').filter(v => v.produit.toLowerCase().includes(q) || (v.vendeur||'').toLowerCase().includes(q))
      .slice(0, 5).forEach(v => add(v.produit, '🛒', 'ventes', `${formatDate(v.date)} – ${fmt(v.pv * v.qty)}`));
    DB.getAll('dettes').filter(d => d.nom.toLowerCase().includes(q))
      .forEach(d => add(d.nom, '🤝', 'dettes', `${fmt(d.montant)} – ${d.statut}`));
    DB.getAll('charges').filter(c => (c.desc||'').toLowerCase().includes(q) || (c.type||'').toLowerCase().includes(q))
      .slice(0, 5).forEach(c => add(c.type || c.desc, '💸', 'charges', `${formatDate(c.date)} – ${fmt(c.montant)}`));
    DB.getAll('defectueux').filter(d => d.produit.toLowerCase().includes(q) || (d.probleme||'').toLowerCase().includes(q))
      .forEach(d => add(d.produit, '⚠️', 'defectueux', d.probleme));

    if (results.length === 0) {
      mobileSearchResults.innerHTML = `<div class="search-no-result">Aucun résultat pour "${escHtml(q)}"</div>`;
    } else {
      mobileSearchResults.innerHTML = results.slice(0, 10).map((r, i) => `
        <div class="search-result-item" data-page="${r.page}" data-idx="${i}">
          <span class="search-result-icon">${r.icon}</span>
          <div class="search-result-text">
            <div class="search-result-label">${escHtml(r.label)}</div>
            <div class="search-result-sub">${escHtml(r.sub)}</div>
          </div>
        </div>`).join('');
      mobileSearchResults.querySelectorAll('.search-result-item').forEach(el => {
        el.addEventListener('click', () => {
          navigateTo(el.dataset.page);
          closeMobileSearch();
        });
      });
    }
  }, 250));

  // Fermer sur Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && mobileSearchOverlay.classList.contains('open')) closeMobileSearch();
  });
});

// ============================================
// SWIPE SIDEBAR (touch events)
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar || !overlay) return;

  let startX = 0;
  let startY = 0;
  let isDragging = false;

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('open');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  }

  document.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging = false;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = Math.abs(e.touches[0].clientY - startY);
    // Seulement si le swipe est plutôt horizontal
    if (Math.abs(dx) > dy && Math.abs(dx) > 10) isDragging = true;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    if (!isDragging) return;
    const dx = e.changedTouches[0].clientX - startX;
    const isSmall = window.innerWidth <= 768;
    if (!isSmall) return;

    // Swipe right depuis le bord gauche (≤40px) → ouvrir
    if (dx > 60 && startX < 40 && !sidebar.classList.contains('open')) {
      openSidebar();
    }
    // Swipe left sur sidebar ouverte → fermer
    if (dx < -60 && sidebar.classList.contains('open')) {
      closeSidebar();
    }
    isDragging = false;
  }, { passive: true });
});

// ============================================
// RACCOURCIS CLAVIER
// ============================================
document.addEventListener('keydown', e => {
  if (!AUTH.isLoggedIn()) return;
  // Ignorer si focus dans un input/textarea/select
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  // Ignorer si un modal est ouvert
  if (document.querySelector('.modal-overlay.open')) return;

  const page = sessionStorage.getItem('venips_last_page');

  switch (e.key) {
    case 'n': case 'N':
      if (page === 'ventes' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.getElementById('btnAddVente')?.click();
      } else if (page === 'stock' && AUTH.isAdmin() && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.getElementById('btnAddStock')?.click();
      }
      break;
    case '1': navigateTo('dashboard'); break;
    case '2': navigateTo('ventes');    break;
    case '3': navigateTo('stock');     break;
    case '?':
      toast('Raccourcis : N = Nouveau · 1=Dashboard · 2=Ventes · 3=Stock', 'info', 4000);
      break;
  }
});

// Toggle dropdown notifications
document.addEventListener('DOMContentLoaded', () => {
  const btnNotif = document.getElementById('btnNotif');
  const dropdown = document.getElementById('notifDropdown');
  const clearBtn = document.getElementById('notifClear');

  if (btnNotif) {
    btnNotif.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      sessionStorage.setItem('venips_notif_shown', '1');
      const list = document.getElementById('notifList');
      if (list) list.innerHTML = '<div class="notif-empty">✅ Aucune alerte</div>';
      const badge = document.getElementById('notifBadge');
      if (badge) badge.style.display = 'none';
      dropdown.classList.remove('open');
    });
  }
  document.addEventListener('click', e => {
    if (dropdown && !e.target.closest('.notif-wrap')) dropdown.classList.remove('open');
  });
});

// ============================================
// FOURNISSEURS
// ============================================
let _editFournisseurId = null;

function renderFournisseurs() {
  const all    = DB.getAll('fournisseurs');
  const search = (document.getElementById('filterFournisseur')?.value || '').toLowerCase();
  const tbody  = document.getElementById('fournisseursBody');
  if (!tbody) return;
  const list = search ? all.filter(f => (f.nom || '').toLowerCase().includes(search)) : all;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🏭</div><p>Aucun fournisseur</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(f => `
    <tr>
      <td><strong>${f.nom}</strong></td>
      <td>${f.contact || '—'}</td>
      <td>${f.telephone || '—'}</td>
      <td>${f.email || '—'}</td>
      <td>${f.adresse || '—'}</td>
      <td class="actions-col">
        <button class="btn btn-sm btn-secondary" onclick="openEditFournisseur(${f.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteFournisseur(${f.id})">🗑️</button>
      </td>
    </tr>`).join('');
}

document.getElementById('filterFournisseur')?.addEventListener('input', renderFournisseurs);

function openAddFournisseur() {
  _editFournisseurId = null;
  document.getElementById('modalFournisseurTitle').textContent = 'Ajouter Fournisseur';
  ['fourn-nom','fourn-contact','fourn-telephone','fourn-email','fourn-adresse'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('modalFournisseur').classList.add('open');
}

function openEditFournisseur(id) {
  const f = DB.getAll('fournisseurs').find(x => x.id === id);
  if (!f) return;
  _editFournisseurId = id;
  document.getElementById('modalFournisseurTitle').textContent = 'Modifier Fournisseur';
  document.getElementById('fourn-nom').value       = f.nom       || '';
  document.getElementById('fourn-contact').value   = f.contact   || '';
  document.getElementById('fourn-telephone').value = f.telephone || '';
  document.getElementById('fourn-email').value     = f.email     || '';
  document.getElementById('fourn-adresse').value   = f.adresse   || '';
  document.getElementById('modalFournisseur').classList.add('open');
}

document.getElementById('saveFournisseur')?.addEventListener('click', async () => {
  const nom = document.getElementById('fourn-nom').value.trim();
  if (!nom) { toast('Nom requis', 'error'); return; }
  const record = {
    nom,
    contact:   document.getElementById('fourn-contact').value.trim() || null,
    telephone: document.getElementById('fourn-telephone').value.trim() || null,
    email:     document.getElementById('fourn-email').value.trim() || null,
    adresse:   document.getElementById('fourn-adresse').value.trim() || null,
    createdAt: new Date().toISOString()
  };
  if (_editFournisseurId) {
    DB.update('fournisseurs', _editFournisseurId, record);
  } else {
    record.id = Date.now();
    DB.insert('fournisseurs', record);
  }
  hideModal('modalFournisseur');
  renderFournisseurs();
  toast(_editFournisseurId ? 'Fournisseur modifié' : 'Fournisseur ajouté', 'success');
});

function deleteFournisseur(id) {
  confirmDelete('fournisseurs', id, 'ce fournisseur');
}

// ============================================
// CLIENTS
// ============================================
let _editClientId = null;

function renderClients() {
  const all    = DB.getAll('clients');
  const search = (document.getElementById('filterClient')?.value || '').toLowerCase();
  const tbody  = document.getElementById('clientsBody');
  if (!tbody) return;
  const list = search ? all.filter(c => (c.nom || '').toLowerCase().includes(search)) : all;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👥</div><p>Aucun client</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${c.nom}</strong></td>
      <td>${c.telephone || '—'}</td>
      <td>${c.email || '—'}</td>
      <td>${c.adresse || '—'}</td>
      <td>${c.notes || '—'}</td>
      <td class="actions-col">
        <button class="btn btn-sm btn-secondary" onclick="openEditClient(${c.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteClient(${c.id})">🗑️</button>
      </td>
    </tr>`).join('');
}

document.getElementById('filterClient')?.addEventListener('input', renderClients);

function openAddClient() {
  _editClientId = null;
  document.getElementById('modalClientTitle').textContent = 'Ajouter Client';
  ['client-nom','client-telephone','client-email','client-adresse','client-notes'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('modalClient').classList.add('open');
}

function openEditClient(id) {
  const c = DB.getAll('clients').find(x => x.id === id);
  if (!c) return;
  _editClientId = id;
  document.getElementById('modalClientTitle').textContent = 'Modifier Client';
  document.getElementById('client-nom').value       = c.nom       || '';
  document.getElementById('client-telephone').value = c.telephone || '';
  document.getElementById('client-email').value     = c.email     || '';
  document.getElementById('client-adresse').value   = c.adresse   || '';
  document.getElementById('client-notes').value     = c.notes     || '';
  document.getElementById('modalClient').classList.add('open');
}

document.getElementById('saveClient')?.addEventListener('click', async () => {
  const nom = document.getElementById('client-nom').value.trim();
  if (!nom) { toast('Nom requis', 'error'); return; }
  const record = {
    nom,
    telephone: document.getElementById('client-telephone').value.trim() || null,
    email:     document.getElementById('client-email').value.trim() || null,
    adresse:   document.getElementById('client-adresse').value.trim() || null,
    notes:     document.getElementById('client-notes').value.trim() || null,
    createdAt: new Date().toISOString()
  };
  if (_editClientId) {
    DB.update('clients', _editClientId, record);
  } else {
    record.id = Date.now();
    DB.insert('clients', record);
  }
  hideModal('modalClient');
  renderClients();
  toast(_editClientId ? 'Client modifié' : 'Client ajouté', 'success');
});

function deleteClient(id) {
  confirmDelete('clients', id, 'ce client');
}

// ============================================
// COMMANDES
// ============================================
let _editCommandeId = null;

function _cmdParseProduits(c) {
  if (c.produits) { try { return JSON.parse(c.produits); } catch {} }
  if (c.produit) return [{ produit: c.produit, qte: c.qte || 1, prixUnitaire: c.prixUnitaire || 0 }];
  return [];
}

function renderCommandes() {
  const all    = DB.getAll('commandes');
  const fourn  = DB.getAll('fournisseurs');
  const statut = document.getElementById('filterCommandeStatut')?.value || '';
  const search = (document.getElementById('filterCommande')?.value || '').toLowerCase();
  const tbody  = document.getElementById('commandesBody');
  if (!tbody) return;
  const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' GNF';
  let list = all;
  if (statut) list = list.filter(c => c.statut === statut);
  if (search) list = list.filter(c => {
    const lignes = _cmdParseProduits(c);
    return lignes.some(l => (l.produit || '').toLowerCase().includes(search)) ||
           (c.produit || '').toLowerCase().includes(search);
  });
  list = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📋</div><p>Aucune commande</p></div></td></tr>`;
    return;
  }
  const statutColor = { 'En attente': 'orange', 'Reçue': 'green', 'Annulée': 'red' };
  tbody.innerHTML = list.map(c => {
    const fournisseurNom = fourn.find(f => f.id === c.fournisseurId)?.nom || '—';
    const lignes = _cmdParseProduits(c);
    const modelesHtml = lignes.length
      ? lignes.map(l => `<div style="font-size:0.8rem;"><strong>${l.produit}</strong> × ${l.qte} <span style="color:#888;">@ ${fmt(l.prixUnitaire)}</span></div>`).join('')
      : `<span style="color:#888;">${c.produit || '—'}</span>`;
    const totalCommande = lignes.reduce((s, l) => s + (l.qte * l.prixUnitaire), 0) || (c.montant || 0);
    const reste = totalCommande - (c.montantEnvoye || 0);
    const col = statutColor[c.statut] || 'gray';
    return `<tr>
      <td>${c.date || '—'}</td>
      <td><strong>${fournisseurNom}</strong></td>
      <td>${modelesHtml}</td>
      <td style="font-weight:600;">${fmt(totalCommande)}</td>
      <td>
        <span style="color:${(c.montantEnvoye||0)>0?'var(--success)':'#888'};">${fmt(c.montantEnvoye||0)}</span>
        ${reste > 0 ? `<div style="font-size:0.75rem;color:var(--danger);">Reste : ${fmt(reste)}</div>` : ''}
      </td>
      <td style="font-size:0.82rem;">${c.dateEnvoi || '—'}</td>
      <td><span class="badge badge-${col}">${c.statut}</span></td>
      <td class="actions-col">
        <button class="btn btn-sm btn-secondary" onclick="openEditCommande(${c.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteCommande(${c.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('filterCommandeStatut')?.addEventListener('change', renderCommandes);
document.getElementById('filterCommande')?.addEventListener('input', renderCommandes);

// Lignes produits en cours dans le modal
let _cmdLignes = [];

function _cmdStockOptions() {
  return DB.getAll('stock').map(p => `<option value="${p.nom}">${p.nom}</option>`).join('');
}

function cmdAddLigne(ligne) {
  const opts = _cmdStockOptions();
  const i = _cmdLignes.length;
  _cmdLignes.push(ligne || { produit: '', qte: 1, prixUnitaire: 0 });
  const tbody = document.getElementById('cmdLignesBody');
  const tr = document.createElement('tr');
  tr.id = `cmd-ligne-${i}`;
  tr.innerHTML = `
    <td><select onchange="_cmdLigneChange(${i},'produit',this.value)" style="width:100%;">
      <option value="">-- Produit --</option>${opts}
    </select></td>
    <td><input type="number" min="1" value="${_cmdLignes[i].qte}" onchange="_cmdLigneChange(${i},'qte',+this.value)" style="width:70px;" /></td>
    <td><input type="number" min="0" value="${_cmdLignes[i].prixUnitaire}" onchange="_cmdLigneChange(${i},'prixUnitaire',+this.value)" style="width:120px;" /></td>
    <td id="cmd-sous-${i}" style="font-weight:600;">0 GNF</td>
    <td><button type="button" class="btn btn-sm btn-danger" onclick="_cmdRemoveLigne(${i})">×</button></td>`;
  tbody.appendChild(tr);
  // Pré-sélectionner si édition
  if (ligne?.produit) {
    tr.querySelector('select').value = ligne.produit;
  }
  cmdUpdateTotal();
}

function _cmdLigneChange(i, key, val) {
  if (_cmdLignes[i]) {
    _cmdLignes[i][key] = val;
    cmdUpdateTotal();
  }
}

function _cmdRemoveLigne(i) {
  _cmdLignes[i] = null;
  const tr = document.getElementById(`cmd-ligne-${i}`);
  if (tr) tr.remove();
  cmdUpdateTotal();
}

function cmdUpdateTotal() {
  const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' GNF';
  let total = 0;
  _cmdLignes.forEach((l, i) => {
    if (!l) return;
    const sous = (l.qte || 0) * (l.prixUnitaire || 0);
    total += sous;
    const el = document.getElementById(`cmd-sous-${i}`);
    if (el) el.textContent = fmt(sous);
  });
  const el = document.getElementById('cmdTotalAffiche');
  if (el) el.textContent = `Total commande : ${fmt(total)}`;
}

function _fillCommandeFournisseur() {
  const foSel = document.getElementById('cmd-fournisseur');
  if (foSel) {
    const fourn = DB.getAll('fournisseurs');
    foSel.innerHTML = '<option value="">-- Sélectionner --</option>' +
      fourn.map(f => `<option value="${f.id}">${f.nom}</option>`).join('');
  }
}

function openAddCommande() {
  _editCommandeId = null;
  _cmdLignes = [];
  document.getElementById('modalCommandeTitle').textContent = 'Nouvelle Commande';
  _fillCommandeFournisseur();
  document.getElementById('cmd-date').value           = new Date().toISOString().slice(0, 10);
  document.getElementById('cmd-fournisseur').value    = '';
  document.getElementById('cmd-statut').value         = 'En attente';
  document.getElementById('cmd-dateReception').value  = '';
  document.getElementById('cmd-montantEnvoye').value  = '0';
  document.getElementById('cmd-dateEnvoi').value      = '';
  document.getElementById('cmd-notes').value          = '';
  document.getElementById('cmdLignesBody').innerHTML  = '';
  cmdAddLigne();
  document.getElementById('modalCommande').classList.add('open');
}

function openEditCommande(id) {
  const c = DB.getAll('commandes').find(x => x.id === id);
  if (!c) return;
  _editCommandeId = id;
  _cmdLignes = [];
  document.getElementById('modalCommandeTitle').textContent = 'Modifier Commande';
  _fillCommandeFournisseur();
  document.getElementById('cmd-date').value           = c.date          || '';
  document.getElementById('cmd-fournisseur').value    = c.fournisseurId || '';
  document.getElementById('cmd-statut').value         = c.statut        || 'En attente';
  document.getElementById('cmd-dateReception').value  = c.dateReception || '';
  document.getElementById('cmd-montantEnvoye').value  = c.montantEnvoye || 0;
  document.getElementById('cmd-dateEnvoi').value      = c.dateEnvoi     || '';
  document.getElementById('cmd-notes').value          = c.notes         || '';
  document.getElementById('cmdLignesBody').innerHTML  = '';
  const lignes = _cmdParseProduits(c);
  if (lignes.length) {
    lignes.forEach(l => cmdAddLigne(l));
  } else {
    cmdAddLigne();
  }
  document.getElementById('modalCommande').classList.add('open');
}

document.getElementById('saveCommande')?.addEventListener('click', async () => {
  const date          = document.getElementById('cmd-date').value;
  const fournisseurId = Number(document.getElementById('cmd-fournisseur').value) || null;
  const nouveauStatut = document.getElementById('cmd-statut').value;
  const dateReception = document.getElementById('cmd-dateReception').value || null;
  const montantEnvoye = Number(document.getElementById('cmd-montantEnvoye').value) || 0;
  const dateEnvoi     = document.getElementById('cmd-dateEnvoi').value || null;

  // Récupérer les lignes valides
  const lignesValides = _cmdLignes.filter(l => l && l.produit && l.qte > 0);
  if (!date || !fournisseurId) { toast('Date et fournisseur obligatoires', 'error'); return; }
  if (!lignesValides.length)   { toast('Ajoutez au moins un produit', 'error'); return; }

  const montantTotal = lignesValides.reduce((s, l) => s + (l.qte * l.prixUnitaire), 0);
  // Pour compatibilité : produit/qte/prixUnitaire = première ligne
  const premiere = lignesValides[0];
  const record = {
    date,
    produit:       premiere.produit,
    fournisseurId,
    qte:           premiere.qte,
    prixUnitaire:  premiere.prixUnitaire,
    montant:       montantTotal,
    produits:      JSON.stringify(lignesValides),
    montantEnvoye,
    dateEnvoi,
    statut:        nouveauStatut,
    dateReception: nouveauStatut === 'Reçue' ? (dateReception || new Date().toISOString().slice(0,10)) : dateReception,
    notes:         document.getElementById('cmd-notes').value.trim() || null,
    createdAt:     new Date().toISOString()
  };

  // Pour la mise à jour stock (tous les produits reçus)
  const produit = premiere.produit;
  const qte     = premiere.qte;

  // Détecter si le statut passe à "Reçue" pour la première fois → incrémenter le stock
  let ancienStatut = null;
  if (_editCommandeId) {
    const ancienne = DB.getAll('commandes').find(c => c.id === _editCommandeId);
    ancienStatut = ancienne?.statut || null;
    DB.update('commandes', _editCommandeId, record);
  } else {
    record.id = Date.now();
    DB.insert('commandes', record);
  }

  if (nouveauStatut === 'Reçue' && ancienStatut !== 'Reçue') {
    const nomsRecus = lignesValides.map(l => `${l.produit} (+${l.qte})`).join(', ');
    toast(`✅ Commande reçue — Stock mis à jour : ${nomsRecus}`, 'success', 5000);
    if (DB._serverAvailable) {
      fetch(`${DB._BASE}/stock`, { headers: DB._headers() })
        .then(r => r.json())
        .then(rows => {
          if (Array.isArray(rows)) {
            DB._cache.stock = rows;
            try { localStorage.setItem('bp_stock', JSON.stringify(rows)); } catch {}
          }
          renderStock();
          renderDashboard();
        })
        .catch(() => { renderStock(); renderDashboard(); });
    } else {
      lignesValides.forEach(l => {
        const stockItem = DB.getAll('stock').find(p => p.nom === l.produit);
        if (stockItem) DB.update('stock', stockItem.id, { qtyInitial: (stockItem.qtyInitial || 0) + l.qte });
      });
      renderStock();
      renderDashboard();
    }
  } else if (ancienStatut === 'Reçue' && nouveauStatut !== 'Reçue') {
    // Annulation d'une commande reçue → recharger le stock
    toast('Statut modifié — stock recalculé', 'warning');
    if (DB._serverAvailable) {
      fetch(`${DB._BASE}/stock`, { headers: DB._headers() })
        .then(r => r.json())
        .then(rows => {
          if (Array.isArray(rows)) {
            DB._cache.stock = rows;
            try { localStorage.setItem('bp_stock', JSON.stringify(rows)); } catch {}
          }
          renderStock();
          renderDashboard();
        }).catch(() => {});
    }
  } else {
    toast(_editCommandeId ? 'Commande modifiée' : 'Commande ajoutée', 'success');
  }

  hideModal('modalCommande');
  renderCommandes();
});

function deleteCommande(id) {
  confirmDelete('commandes', id, 'cette commande');
}

// ============================================
// OBJECTIFS
// ============================================
let _editObjectifId = null;

function renderObjectifs() {
  const all     = DB.getAll('objectifs');
  const ventes  = DB.getAll('ventes');
  const periode = document.getElementById('filterObjectifPeriode')?.value || '';
  const tbody   = document.getElementById('objectifsBody');
  if (!tbody) return;
  const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' GNF';
  const list = [...(periode ? all.filter(o => o.periode === periode) : all)]
                 .sort((a, b) => b.periode.localeCompare(a.periode));
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🎯</div><p>Aucun objectif défini</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(o => {
    const ca    = ventes.filter(v => v.date && v.date.startsWith(o.periode) && (!o.vendeur || v.vendeur === o.vendeur))
                        .reduce((s, v) => s + (v.pv * v.qty), 0);
    const pct   = o.cibleCA > 0 ? Math.min(100, Math.round((ca / o.cibleCA) * 100)) : 0;
    const pctReal = o.cibleCA > 0 ? Math.round((ca / o.cibleCA) * 100) : 0;
    const barColor = pct >= 100 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';
    const badgeClass = pct >= 100 ? 'badge-success' : pct >= 70 ? 'badge-warning' : 'badge-danger';
    return `<tr>
      <td>${o.periode}</td>
      <td>${o.vendeur || 'Tous'}</td>
      <td>${fmt(o.cibleCA)}</td>
      <td>${fmt(ca)}</td>
      <td style="min-width:140px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;background:var(--border);border-radius:99px;height:8px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:99px;transition:width .4s"></div>
          </div>
          <span class="badge ${badgeClass}" style="min-width:42px;text-align:center">${pctReal}%</span>
        </div>
      </td>
      <td class="actions-col">
        <button class="btn btn-sm btn-secondary" onclick="openEditObjectif(${o.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteObjectif(${o.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('filterObjectifPeriode')?.addEventListener('change', renderObjectifs);

function _fillObjVendeurSelect() {
  const sel = document.getElementById('obj-vendeur');
  if (!sel) return;
  const vendeurs = DB.getAll('vendeurs');
  sel.innerHTML = '<option value="">-- Sélectionner --</option>' +
    vendeurs.map(v => `<option value="${v.nom}">${v.nom}</option>`).join('');
}

function openAddObjectif() {
  _editObjectifId = null;
  document.getElementById('modalObjectifTitle').textContent = 'Définir Objectif';
  _fillObjVendeurSelect();
  document.getElementById('obj-periode').value = new Date().toISOString().slice(0, 7);
  document.getElementById('obj-vendeur').value = '';
  document.getElementById('obj-cible').value   = '';
  document.getElementById('modalObjectif').classList.add('open');
}

function openEditObjectif(id) {
  const o = DB.getAll('objectifs').find(x => x.id === id);
  if (!o) return;
  _editObjectifId = id;
  document.getElementById('modalObjectifTitle').textContent = 'Modifier Objectif';
  _fillObjVendeurSelect();
  document.getElementById('obj-periode').value = o.periode  || '';
  document.getElementById('obj-vendeur').value = o.vendeur  || '';
  document.getElementById('obj-cible').value   = o.cibleCA  || '';
  document.getElementById('modalObjectif').classList.add('open');
}

document.getElementById('saveObjectif')?.addEventListener('click', async () => {
  const periode = document.getElementById('obj-periode').value;
  const vendeur = document.getElementById('obj-vendeur').value;
  const cibleCA = Number(document.getElementById('obj-cible').value);
  if (!periode || !vendeur || isNaN(cibleCA) || cibleCA < 0) { toast('Champs obligatoires manquants', 'error'); return; }
  const record = { periode, vendeur, cibleCA, createdAt: new Date().toISOString() };
  if (_editObjectifId) {
    DB.update('objectifs', _editObjectifId, record);
  } else {
    record.id = Date.now();
    DB.insert('objectifs', record);
  }
  hideModal('modalObjectif');
  renderObjectifs();
  toast(_editObjectifId ? 'Objectif modifié' : 'Objectif défini', 'success');
});

function deleteObjectif(id) {
  confirmDelete('objectifs', id, 'cet objectif');
}

// ============================================
// RETOURS
// ============================================
let _editRetourId = null;

function renderRetours() {
  const all    = DB.getAll('retours');
  const statut = document.getElementById('filterRetourStatut')?.value || '';
  const search = (document.getElementById('filterRetour')?.value || '').toLowerCase();
  const tbody  = document.getElementById('retoursBody');
  if (!tbody) return;
  const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' GNF';
  let list = all;
  if (statut) list = list.filter(r => r.statut === statut);
  if (search) list = list.filter(r => (r.produit || '').toLowerCase().includes(search));
  list = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">↩️</div><p>Aucun retour</p></div></td></tr>`;
    return;
  }
  const statutColor = { 'En attente': 'orange', 'Traité': 'green', 'Refusé': 'red' };
  tbody.innerHTML = list.map(r => `
    <tr>
      <td>${r.date || '—'}</td>
      <td><strong>${r.produit}</strong></td>
      <td>${r.qte}</td>
      <td>${r.type || '—'}</td>
      <td>${r.raison || '—'}</td>
      <td>${fmt(r.montant)}</td>
      <td><span class="badge badge-${statutColor[r.statut] || 'gray'}">${r.statut}</span></td>
      <td class="actions-col">
        <button class="btn btn-sm btn-secondary" onclick="openEditRetour(${r.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteRetour(${r.id})">🗑️</button>
      </td>
    </tr>`).join('');
}

document.getElementById('filterRetourStatut')?.addEventListener('change', renderRetours);
document.getElementById('filterRetour')?.addEventListener('input', renderRetours);

function _fillRetourProduitSelect() {
  const sel = document.getElementById('ret-produit');
  if (!sel) return;
  const stock = DB.getAll('stock');
  sel.innerHTML = '<option value="">-- Sélectionner --</option>' +
    stock.map(p => `<option value="${p.nom}">${p.nom}</option>`).join('');
}

function openAddRetour() {
  _editRetourId = null;
  document.getElementById('modalRetourTitle').textContent = 'Nouveau Retour';
  _fillRetourProduitSelect();
  document.getElementById('ret-date').value    = new Date().toISOString().slice(0, 10);
  document.getElementById('ret-produit').value = '';
  document.getElementById('ret-qte').value     = '1';
  document.getElementById('ret-type').value    = 'Remboursement';
  document.getElementById('ret-statut').value  = 'En attente';
  document.getElementById('ret-montant').value = '0';
  document.getElementById('ret-raison').value  = '';
  document.getElementById('modalRetour').classList.add('open');
}

function openEditRetour(id) {
  const r = DB.getAll('retours').find(x => x.id === id);
  if (!r) return;
  _editRetourId = id;
  document.getElementById('modalRetourTitle').textContent = 'Modifier Retour';
  _fillRetourProduitSelect();
  document.getElementById('ret-date').value    = r.date    || '';
  document.getElementById('ret-produit').value = r.produit || '';
  document.getElementById('ret-qte').value     = r.qte     || 1;
  document.getElementById('ret-type').value    = r.type    || 'Remboursement';
  document.getElementById('ret-statut').value  = r.statut  || 'En attente';
  document.getElementById('ret-montant').value = r.montant || 0;
  document.getElementById('ret-raison').value  = r.raison  || '';
  document.getElementById('modalRetour').classList.add('open');
}

document.getElementById('saveRetour')?.addEventListener('click', async () => {
  const date    = document.getElementById('ret-date').value;
  const produit = document.getElementById('ret-produit').value;
  const qte     = Number(document.getElementById('ret-qte').value);
  if (!date || !produit || qte <= 0) { toast('Champs obligatoires manquants', 'error'); return; }
  const record = {
    date, produit, qte,
    type:      document.getElementById('ret-type').value,
    statut:    document.getElementById('ret-statut').value,
    montant:   Number(document.getElementById('ret-montant').value) || 0,
    raison:    document.getElementById('ret-raison').value.trim() || null,
    createdAt: new Date().toISOString()
  };
  if (_editRetourId) {
    DB.update('retours', _editRetourId, record);
  } else {
    record.id = Date.now();
    DB.insert('retours', record);
  }
  hideModal('modalRetour');
  renderRetours();
  toast(_editRetourId ? 'Retour modifié' : 'Retour enregistré', 'success');
});

function deleteRetour(id) {
  confirmDelete('retours', id, 'ce retour');
}

// ============================================
// INVENTAIRES
// ============================================
let _editInventaireId = null;

function renderInventaires() {
  const all    = DB.getAll('inventaires');
  const search = (document.getElementById('filterInventaire')?.value || '').toLowerCase();
  const dateF  = document.getElementById('filterInventaireDate')?.value || '';
  const tbody  = document.getElementById('inventairesBody');
  if (!tbody) return;
  let list = all;
  if (dateF)  list = list.filter(i => i.date === dateF);
  if (search) list = list.filter(i => (i.produit || '').toLowerCase().includes(search));
  list = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🔍</div><p>Aucun inventaire</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(i => {
    const ecart = i.ecart;
    const ecartEl = ecart > 0 ? `<span style="color:#22c55e">+${ecart}</span>` :
                    ecart < 0 ? `<span style="color:#ef4444">${ecart}</span>` : `<span>0</span>`;
    return `<tr>
      <td>${i.date}</td>
      <td><strong>${i.produit}</strong></td>
      <td>${i.qteTheorique}</td>
      <td>${i.qteReelle}</td>
      <td>${ecartEl}</td>
      <td>${i.notes || '—'}</td>
      <td class="actions-col">
        <button class="btn btn-sm btn-secondary" onclick="openEditInventaire(${i.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteInventaire(${i.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('filterInventaireDate')?.addEventListener('change', renderInventaires);
document.getElementById('filterInventaire')?.addEventListener('input', renderInventaires);

function _calcQteTheorique(produitNom) {
  const stock  = DB.getAll('stock').find(p => p.nom === produitNom);
  if (!stock) return 0;
  const ventes = DB.getAll('ventes').filter(v => v.produit === produitNom);
  const vendus = ventes.reduce((s, v) => s + (v.qty || 0), 0);
  const defect = DB.getAll('defectueux').filter(d => d.produit === produitNom && d.statut !== 'Résolu')
                   .reduce((s, d) => s + (d.qty || 0), 0);
  return (stock.qtyInitial || 0) - vendus - defect;
}

function _fillInvProduitSelect() {
  const sel = document.getElementById('inv-produit');
  if (!sel) return;
  const stock = DB.getAll('stock');
  sel.innerHTML = '<option value="">-- Sélectionner --</option>' +
    stock.map(p => `<option value="${p.nom}">${p.nom}</option>`).join('');
  sel.onchange = () => {
    const theorique = _calcQteTheorique(sel.value);
    const el = document.getElementById('inv-theorique');
    if (el) el.value = theorique;
  };
}

function openAddInventaire() {
  _editInventaireId = null;
  document.getElementById('modalInventaireTitle').textContent = 'Nouvel Inventaire';
  _fillInvProduitSelect();
  document.getElementById('inv-date').value     = new Date().toISOString().slice(0, 10);
  document.getElementById('inv-produit').value  = '';
  document.getElementById('inv-theorique').value = '';
  document.getElementById('inv-reelle').value   = '';
  document.getElementById('inv-notes').value    = '';
  document.getElementById('modalInventaire').classList.add('open');
}

function openEditInventaire(id) {
  const inv = DB.getAll('inventaires').find(x => x.id === id);
  if (!inv) return;
  _editInventaireId = id;
  document.getElementById('modalInventaireTitle').textContent = 'Modifier Inventaire';
  _fillInvProduitSelect();
  document.getElementById('inv-date').value      = inv.date         || '';
  document.getElementById('inv-produit').value   = inv.produit      || '';
  document.getElementById('inv-theorique').value = inv.qteTheorique || 0;
  document.getElementById('inv-reelle').value    = inv.qteReelle    || 0;
  document.getElementById('inv-notes').value     = inv.notes        || '';
  document.getElementById('modalInventaire').classList.add('open');
}

document.getElementById('saveInventaire')?.addEventListener('click', async () => {
  const date    = document.getElementById('inv-date').value;
  const produit = document.getElementById('inv-produit').value;
  const reelle  = Number(document.getElementById('inv-reelle').value);
  if (!date || !produit || isNaN(reelle) || reelle < 0) { toast('Champs obligatoires manquants', 'error'); return; }
  const theorique = _calcQteTheorique(produit);
  const record = {
    date, produit,
    qteTheorique: theorique,
    qteReelle:    reelle,
    ecart:        reelle - theorique,
    notes:        document.getElementById('inv-notes').value.trim() || null,
    createdAt:    new Date().toISOString()
  };
  if (_editInventaireId) {
    DB.update('inventaires', _editInventaireId, record);
  } else {
    record.id = Date.now();
    DB.insert('inventaires', record);
  }
  hideModal('modalInventaire');
  renderInventaires();
  toast(_editInventaireId ? 'Inventaire modifié' : 'Inventaire enregistré', 'success');
});

function deleteInventaire(id) {
  confirmDelete('inventaires', id, 'cet inventaire');
}

// ============================================
// OBJECTIFS PERSONNELS
// ============================================
let _editObjPersoId = null;

const OBJP_CATEGORIES = ['Personnel', 'Professionnel', 'Financier', 'Santé', 'Famille', 'Autre'];
const OBJP_EMOJIS = {
  'Personnel': '🙋', 'Professionnel': '💼', 'Financier': '💰',
  'Santé': '💪', 'Famille': '👨‍👩‍👧', 'Autre': '🎯'
};

function renderObjectifsPerso() {
  const all      = DB.getAll('objectifs_perso');
  const annee    = document.getElementById('filterObjPersoAnnee')?.value || '';
  const statut   = document.getElementById('filterObjPersoStatut')?.value || '';
  const categorie = document.getElementById('filterObjPersoCategorie')?.value || '';

  // Remplir le sélecteur d'années
  const anneesSel = document.getElementById('filterObjPersoAnnee');
  if (anneesSel && anneesSel.options.length <= 1) {
    const annees = [...new Set(all.map(o => o.annee))].sort((a, b) => b - a);
    annees.forEach(a => {
      if (![...anneesSel.options].some(o => o.value == a)) {
        const opt = document.createElement('option');
        opt.value = a; opt.textContent = a;
        anneesSel.appendChild(opt);
      }
    });
  }

  let list = all;
  if (annee)    list = list.filter(o => String(o.annee) === annee);
  if (statut)   list = list.filter(o => o.statut === statut);
  if (categorie) list = list.filter(o => o.categorie === categorie);
  list = [...list].sort((a, b) => {
    // En cours en premier, puis Atteint, puis Abandonné
    const order = { 'En cours': 0, 'Atteint': 1, 'Abandonné': 2 };
    return (order[a.statut] ?? 3) - (order[b.statut] ?? 3) || b.annee - a.annee;
  });

  // Stats rapides
  const statsEl = document.getElementById('objPersoStats');
  if (statsEl) {
    const total    = all.length;
    const atteints = all.filter(o => o.statut === 'Atteint').length;
    const enCours  = all.filter(o => o.statut === 'En cours').length;
    const pct      = total > 0 ? Math.round((atteints / total) * 100) : 0;
    statsEl.innerHTML = `
      <div class="kpi-card green"><div class="kpi-icon">✅</div><div class="kpi-body"><div class="kpi-label">Atteints</div><div class="kpi-value">${atteints}</div></div></div>
      <div class="kpi-card blue"><div class="kpi-icon">🔄</div><div class="kpi-body"><div class="kpi-label">En cours</div><div class="kpi-value">${enCours}</div></div></div>
      <div class="kpi-card purple"><div class="kpi-icon">📊</div><div class="kpi-body"><div class="kpi-label">Taux de réussite</div><div class="kpi-value">${pct}%</div></div></div>
      <div class="kpi-card orange"><div class="kpi-icon">🌟</div><div class="kpi-body"><div class="kpi-label">Total objectifs</div><div class="kpi-value">${total}</div></div></div>
    `;
  }

  const listEl = document.getElementById('objPersoList');
  if (!listEl) return;
  if (!list.length) {
    listEl.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-icon">🌟</div><p>Aucun objectif pour le moment</p><p style="font-size:.85rem;color:var(--muted)">Ajoute tes premiers objectifs !</p></div></div>`;
    return;
  }

  // Grouper par année
  const parAnnee = {};
  list.forEach(o => { (parAnnee[o.annee] = parAnnee[o.annee] || []).push(o); });

  listEl.innerHTML = Object.entries(parAnnee)
    .sort(([a], [b]) => b - a)
    .map(([year, items]) => {
      const nbAtteints = items.filter(o => o.statut === 'Atteint').length;
      const pctAnnee   = items.length > 0 ? Math.round((nbAtteints / items.length) * 100) : 0;
      const barColor   = pctAnnee === 100 ? '#22c55e' : pctAnnee >= 50 ? '#f59e0b' : '#3b82f6';
      return `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <h3 style="margin:0">📅 ${year}</h3>
            <div style="display:flex;align-items:center;gap:10px;min-width:200px">
              <div style="flex:1;background:var(--border);border-radius:99px;height:8px;overflow:hidden">
                <div style="width:${pctAnnee}%;height:100%;background:${barColor};border-radius:99px;transition:width .4s"></div>
              </div>
              <span style="font-size:.85rem;color:var(--muted);white-space:nowrap">${nbAtteints}/${items.length} atteints</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;padding:8px 0">
            ${items.map(o => _renderObjPersoCard(o)).join('')}
          </div>
        </div>`;
    }).join('');
}

function _renderObjPersoCard(o) {
  const isAtteint   = o.statut === 'Atteint';
  const isAbandonne = o.statut === 'Abandonné';
  const emoji       = OBJP_EMOJIS[o.categorie] || '🎯';
  const bgColor     = isAtteint ? 'rgba(34,197,94,.08)' : isAbandonne ? 'rgba(107,114,128,.08)' : 'var(--card)';
  const borderColor = isAtteint ? '#22c55e' : isAbandonne ? 'var(--border)' : 'var(--primary)';
  const dateAtteinte = o.dateAtteinte ? ` · Atteint le ${o.dateAtteinte}` : '';

  return `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;background:${bgColor};border-left:3px solid ${borderColor};border-radius:8px">
      <button onclick="toggleObjPerso(${o.id})"
        title="${isAtteint ? 'Marquer comme En cours' : 'Marquer comme Atteint'}"
        style="flex-shrink:0;width:28px;height:28px;border-radius:50%;border:2px solid ${isAtteint ? '#22c55e' : 'var(--border)'};background:${isAtteint ? '#22c55e' : 'transparent'};cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">
        ${isAtteint ? '✓' : ''}
      </button>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:.75rem;background:var(--bg);padding:2px 8px;border-radius:99px;color:var(--muted)">${emoji} ${o.categorie}</span>
          ${isAtteint ? `<span class="badge badge-success">✅ Atteint${dateAtteinte}</span>` : ''}
          ${isAbandonne ? `<span class="badge badge-danger">Abandonné</span>` : ''}
        </div>
        <p style="margin:6px 0 2px;font-weight:600;${isAtteint ? 'text-decoration:line-through;opacity:.7' : ''}">${o.titre}</p>
        ${o.description ? `<p style="margin:0;font-size:.85rem;color:var(--muted)">${o.description}</p>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${!isAtteint && !isAbandonne ? `<button class="btn btn-sm btn-secondary" onclick="abandonObjPerso(${o.id})" title="Abandonner">✕</button>` : ''}
        <button class="btn btn-sm btn-secondary" onclick="openEditObjPerso(${o.id})" title="Modifier">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteObjPerso(${o.id})" title="Supprimer">🗑️</button>
      </div>
    </div>`;
}

document.getElementById('filterObjPersoAnnee')?.addEventListener('change', renderObjectifsPerso);
document.getElementById('filterObjPersoStatut')?.addEventListener('change', renderObjectifsPerso);
document.getElementById('filterObjPersoCategorie')?.addEventListener('change', renderObjectifsPerso);

function openAddObjectifPerso() {
  _editObjPersoId = null;
  document.getElementById('modalObjPersoTitle').textContent = 'Nouvel Objectif';
  document.getElementById('objp-titre').value       = '';
  document.getElementById('objp-annee').value       = new Date().getFullYear();
  document.getElementById('objp-categorie').value   = 'Personnel';
  document.getElementById('objp-description').value = '';
  showModal('modalObjectifPerso');
}

function openEditObjPerso(id) {
  const o = DB.getAll('objectifs_perso').find(x => x.id === id);
  if (!o) return;
  _editObjPersoId = id;
  document.getElementById('modalObjPersoTitle').textContent = 'Modifier Objectif';
  document.getElementById('objp-titre').value       = o.titre       || '';
  document.getElementById('objp-annee').value       = o.annee       || new Date().getFullYear();
  document.getElementById('objp-categorie').value   = o.categorie   || 'Personnel';
  document.getElementById('objp-description').value = o.description || '';
  showModal('modalObjectifPerso');
}

document.getElementById('saveObjectifPerso')?.addEventListener('click', () => {
  const titre = document.getElementById('objp-titre').value.trim();
  const annee = Number(document.getElementById('objp-annee').value);
  if (!titre) { toast('Titre requis', 'error'); return; }
  if (!annee || annee < 2000) { toast('Année invalide', 'error'); return; }
  const record = {
    titre,
    annee,
    categorie:   document.getElementById('objp-categorie').value,
    description: document.getElementById('objp-description').value.trim() || null,
    statut:      _editObjPersoId ? (DB.getAll('objectifs_perso').find(x => x.id === _editObjPersoId)?.statut || 'En cours') : 'En cours',
    createdAt:   new Date().toISOString()
  };
  if (_editObjPersoId) {
    DB.update('objectifs_perso', _editObjPersoId, record);
    toast('Objectif modifié', 'success');
  } else {
    DB.insert('objectifs_perso', record);
    toast('Objectif ajouté ! Bonne chance 💪', 'success');
  }
  hideModal('modalObjectifPerso');
  // Rafraîchir le sélecteur d'années
  const sel = document.getElementById('filterObjPersoAnnee');
  if (sel) sel.innerHTML = '<option value="">Toutes les années</option>';
  renderObjectifsPerso();
});

function toggleObjPerso(id) {
  const o = DB.getAll('objectifs_perso').find(x => x.id === id);
  if (!o) return;
  if (o.statut === 'Atteint') {
    // Remettre En cours
    DB.update('objectifs_perso', id, { statut: 'En cours', dateAtteinte: null });
    toast('Objectif remis en cours', 'info');
  } else {
    // Marquer Atteint
    const today = new Date().toISOString().slice(0, 10);
    DB.update('objectifs_perso', id, { statut: 'Atteint', dateAtteinte: today });
    toast('🎉 Félicitations ! Objectif atteint !', 'success', 4000);
  }
  renderObjectifsPerso();
}

function abandonObjPerso(id) {
  DB.update('objectifs_perso', id, { statut: 'Abandonné' });
  toast('Objectif abandonné', 'warning');
  renderObjectifsPerso();
}

function deleteObjPerso(id) {
  confirmDelete('objectifs_perso', id, 'cet objectif');
}
