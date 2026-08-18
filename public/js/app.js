'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  cart: JSON.parse(localStorage.getItem('vt-cart') || '[]'),
  user: JSON.parse(localStorage.getItem('vt-user') || 'null'),
  theme: localStorage.getItem('vt-theme') || 'dark',
  currentProduct: null,
  filters: { category: '', brand: '', maxPrice: 20000000, sort: 'newest', search: '' },
  page: 1,
  totalPages: 1,
  searchTimeout: null,
};

// ─── API ──────────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.user?.token) headers['Authorization'] = `Bearer ${state.user.token}`;
  const res = await fetch('/api' + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
  localStorage.setItem('vt-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 3500);
}

// ─── Price Format ─────────────────────────────────────────────────────────────
function fmt(n) {
  return n.toLocaleString('fr-GN') + ' GNF';
}

// ─── Cart ─────────────────────────────────────────────────────────────────────
function saveCart() {
  localStorage.setItem('vt-cart', JSON.stringify(state.cart));
  updateCartBadge();
}

function updateCartBadge() {
  const total = state.cart.reduce((s, i) => s + i.qty, 0);
  const badge = document.getElementById('cartBadge');
  if (badge) {
    badge.textContent = total;
    badge.style.display = total > 0 ? 'flex' : 'none';
  }
}

function addToCart(product, qty = 1) {
  const existing = state.cart.find(i => i._id === product._id);
  if (existing) {
    existing.qty += qty;
  } else {
    state.cart.push({
      _id: product._id,
      name: product.name,
      price: product.price,
      image: product.images?.[0] || '',
      qty,
    });
  }
  saveCart();
  showToast(`${product.name.slice(0, 30)}… ajouté au panier !`);
  renderCartDrawer();
}

function removeFromCart(id) {
  state.cart = state.cart.filter(i => i._id !== id);
  saveCart();
  renderCartDrawer();
}

function updateCartQty(id, delta) {
  const item = state.cart.find(i => i._id === id);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart();
  renderCartDrawer();
}

function cartTotal() {
  return state.cart.reduce((s, i) => s + i.price * i.qty, 0);
}

function renderCartDrawer() {
  const body = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');
  if (!body) return;

  if (state.cart.length === 0) {
    body.innerHTML = `<div class="cart-empty"><div style="font-size:3rem">🛒</div><p>Votre panier est vide</p></div>`;
    if (footer) footer.style.display = 'none';
    return;
  }

  body.innerHTML = state.cart.map(item => `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.name}" class="cart-item-img" onerror="this.src='https://placehold.co/70x60'">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${fmt(item.price)}</div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="updateCartQty('${item._id}', -1)">−</button>
          <span>${item.qty}</span>
          <button class="qty-btn" onclick="updateCartQty('${item._id}', 1)">+</button>
          <button class="qty-remove" onclick="removeFromCart('${item._id}')">🗑</button>
        </div>
      </div>
    </div>
  `).join('');

  if (footer) {
    footer.style.display = 'block';
    footer.innerHTML = `
      <div class="cart-total"><span>Total</span><strong id="cartTotalAmt">${fmt(cartTotal())}</strong></div>
      <button class="btn-primary btn-full" onclick="toggleCart(); showPage('checkout')">Passer la commande →</button>
    `;
  }
}

function toggleCart() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  if (!drawer) return;
  const isOpen = drawer.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open', isOpen);
  if (isOpen) renderCartDrawer();
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function productCardHTML(p) {
  const disc = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const stars = '★'.repeat(Math.round(p.rating || 0)) + '☆'.repeat(5 - Math.round(p.rating || 0));
  return `
    <div class="product-card" onclick="showProduct('${p._id}')">
      ${disc > 0 ? `<span class="product-badge">-${disc}%</span>` : ''}
      ${p.stock === 0 ? `<span class="product-badge badge-out">Rupture</span>` : p.stock <= 3 ? `<span class="product-badge badge-urgent">Derniers!</span>` : ''}
      <div class="product-img-wrap">
        <img src="${p.images?.[0] || 'https://placehold.co/300'}" alt="${p.name}" loading="lazy" onerror="this.src='https://placehold.co/300'">
      </div>
      <div class="product-info">
        <div class="product-brand">${p.brand}</div>
        <h3 class="product-name">${p.name}</h3>
        <div class="product-rating"><span class="stars">${stars}</span><span class="review-count">(${p.reviewCount || 0})</span></div>
        <div class="product-pricing">
          <span class="product-price">${fmt(p.price)}</span>
          ${p.oldPrice ? `<span class="product-old-price">${fmt(p.oldPrice)}</span>` : ''}
        </div>
        <button class="btn btn-primary btn-full add-cart-btn" onclick="event.stopPropagation(); quickAdd('${p._id}')" ${p.stock === 0 ? 'disabled' : ''}>
          ${p.stock === 0 ? 'Rupture' : '🛒 Ajouter'}
        </button>
      </div>
    </div>`;
}

async function quickAdd(id) {
  try {
    const p = await apiFetch(`/products/${id}`);
    addToCart(p);
  } catch { showToast('Erreur lors de l\'ajout', 'error'); }
}

// ─── Skeletons ────────────────────────────────────────────────────────────────
function skeletonCards(n = 4) {
  return Array(n).fill(`
    <div class="product-card skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div class="product-info">
        <div class="skeleton skeleton-text" style="width:50%"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text" style="width:60%"></div>
      </div>
    </div>`).join('');
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
async function loadHome() {
  loadFeatured();
  loadHomeProducts();
}

async function loadFeatured() {
  const grid = document.getElementById('featuredProducts');
  if (!grid) return;
  grid.innerHTML = skeletonCards(4);
  try {
    const data = await apiFetch('/products/featured');
    const products = data.products || data;
    grid.innerHTML = (Array.isArray(products) ? products : []).slice(0, 4).map(productCardHTML).join('') || '<p style="color:var(--muted)">Aucun produit</p>';
  } catch { grid.innerHTML = '<p style="color:var(--muted)">Erreur de chargement</p>'; }
}

async function loadHomeProducts() {
  const grid = document.getElementById('homeAllProducts');
  if (!grid) return;
  grid.innerHTML = skeletonCards(8);
  try {
    const data = await apiFetch('/products?limit=8&sort=newest');
    grid.innerHTML = (data.products || []).map(productCardHTML).join('') || '<p style="color:var(--muted)">Aucun produit</p>';
  } catch { grid.innerHTML = '<p style="color:var(--muted)">Erreur de chargement</p>'; }
}

// ─── SHOP PAGE ────────────────────────────────────────────────────────────────
function clearFilters() {
  state.filters = { category: '', brand: '', maxPrice: 20000000, sort: 'newest', search: '' };
  state.page = 1;
  document.querySelectorAll('.chip[data-cat]').forEach(el => el.classList.toggle('active', el.dataset.cat === ''));
  document.querySelectorAll('.chip[data-brand]').forEach(el => el.classList.remove('active'));
  const pr = document.getElementById('priceRange');
  if (pr) { pr.value = 20000000; document.getElementById('priceLabel').textContent = '20 000 000 GNF'; }
  const ss = document.getElementById('sortSelect');
  if (ss) ss.value = 'newest';
  loadShop();
}

function applyFilters() {
  state.filters.sort = document.getElementById('sortSelect')?.value || 'newest';
  state.page = 1;
  loadShop();
}

function updatePriceFilter(val) {
  state.filters.maxPrice = parseInt(val);
  const label = document.getElementById('priceLabel');
  if (label) label.textContent = parseInt(val).toLocaleString('fr-GN') + ' GNF';
}

function filterCategory(cat) {
  state.filters.category = cat;
  state.filters.search = '';
  state.page = 1;
  showPage('shop');
}

async function loadShop() {
  const grid = document.getElementById('shopProducts');
  const countEl = document.getElementById('productCount');
  if (!grid) return;
  grid.innerHTML = skeletonCards(6);

  const f = state.filters;
  const params = new URLSearchParams();
  if (f.category) params.set('category', f.category);
  if (f.brand) params.set('brand', f.brand);
  if (f.maxPrice < 20000000) params.set('maxPrice', f.maxPrice);
  if (f.sort) params.set('sort', f.sort);
  if (f.search) params.set('search', f.search);
  params.set('page', state.page);
  params.set('limit', 12);

  try {
    const data = await apiFetch(`/products?${params}`);
    const products = data.products || [];
    const total = data.total || products.length;
    state.totalPages = data.pages || 1;

    if (countEl) countEl.textContent = `${total} produit${total !== 1 ? 's' : ''}`;

    if (products.length === 0) {
      grid.innerHTML = `<div class="no-results" style="grid-column:1/-1;text-align:center;padding:60px 20px"><div style="font-size:3rem">🔍</div><p style="color:var(--text2);margin:12px 0">Aucun produit trouvé</p><button class="btn btn-ghost" onclick="clearFilters()">Effacer les filtres</button></div>`;
    } else {
      grid.innerHTML = products.map(productCardHTML).join('');
    }

    renderPagination();
  } catch (e) {
    grid.innerHTML = '<p style="color:var(--muted);padding:40px;text-align:center">Erreur de chargement</p>';
  }
}

function renderPagination() {
  const el = document.getElementById('pagination');
  if (!el) return;
  if (state.totalPages <= 1) { el.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= state.totalPages; i++) {
    html += `<button class="page-btn${state.page === i ? ' active' : ''}" onclick="goPage(${i})">${i}</button>`;
  }
  el.innerHTML = html;
}

function goPage(n) {
  state.page = n;
  loadShop();
  document.getElementById('shopProducts')?.scrollIntoView({ behavior: 'smooth' });
}

// ─── PRODUCT DETAIL ───────────────────────────────────────────────────────────
let detailQty = 1;

async function showProduct(id) {
  showPage('product');
  detailQty = 1;
  const container = document.getElementById('productDetail');
  if (!container) return;
  container.innerHTML = `<div style="padding:60px;text-align:center;color:var(--muted)">⏳ Chargement…</div>`;
  try {
    const p = await apiFetch(`/products/${id}`);
    state.currentProduct = p;
    renderDetail(p);
  } catch {
    container.innerHTML = '<p style="padding:40px;color:var(--muted);text-align:center">Produit introuvable</p>';
  }
}

function renderDetail(p) {
  const container = document.getElementById('productDetail');
  if (!container) return;

  const disc = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const stars = '★'.repeat(Math.round(p.rating || 0)) + '☆'.repeat(5 - Math.round(p.rating || 0));
  const specsHTML = p.specs ? Object.entries(p.specs).filter(([,v]) => v)
    .map(([k, v]) => `<tr><td class="spec-key">${k.charAt(0).toUpperCase() + k.slice(1)}</td><td>${v}</td></tr>`).join('') : '';

  container.innerHTML = `
    <div class="detail-grid">
      <div class="detail-gallery">
        <img id="mainImg" src="${p.images?.[0] || 'https://placehold.co/500'}" alt="${p.name}" class="main-img" onerror="this.src='https://placehold.co/500'">
        ${p.images?.length > 1 ? `<div class="thumb-row">${p.images.map((img, i) => `<img src="${img}" class="thumb${i===0?' active':''}" onclick="switchImg(this,'${img}')">`).join('')}</div>` : ''}
      </div>
      <div class="detail-info">
        <div class="detail-brand">${p.brand} · ${p.category}</div>
        <h1 class="detail-name">${p.name}</h1>
        <div class="detail-rating">
          <span class="stars">${stars}</span>
          <span>${(p.rating||0).toFixed(1)} (${p.reviewCount||0} avis)</span>
        </div>
        <div class="detail-pricing">
          <span class="detail-price">${fmt(p.price)}</span>
          ${p.oldPrice ? `<span class="detail-old-price">${fmt(p.oldPrice)}</span>` : ''}
          ${disc > 0 ? `<span class="detail-discount">-${disc}%</span>` : ''}
        </div>
        <p class="detail-description">${p.description}</p>
        ${specsHTML ? `<table class="specs-table"><tbody>${specsHTML}</tbody></table>` : ''}
        <div class="detail-stock ${p.stock===0?'out':p.stock<=5?'low':'in'}">
          ${p.stock===0 ? '❌ Rupture de stock' : p.stock<=5 ? `⚠️ Plus que ${p.stock} en stock !` : '✅ En stock'}
        </div>
        <div class="detail-actions">
          <div class="qty-control">
            <button class="qty-btn" onclick="detailQtyChange(-1)">−</button>
            <span id="detailQtyDisplay">1</span>
            <button class="qty-btn" onclick="detailQtyChange(1)">+</button>
          </div>
          <button class="btn btn-primary btn-lg" onclick="addDetailToCart()" ${p.stock===0?'disabled':''}>🛒 Ajouter au panier</button>
        </div>
        <div class="detail-badges">
          <span class="badge-item">🚚 Livraison rapide</span>
          <span class="badge-item">🔒 Paiement sécurisé</span>
          <span class="badge-item">↩️ Retour 30j</span>
        </div>
      </div>
    </div>
    <div class="reviews-section">
      <h2>Avis clients</h2>
      ${renderReviewList(p.reviews)}
      <div class="review-form-wrap">
        <h3>Laisser un avis</h3>
        <div class="star-picker" id="starPicker">${[1,2,3,4,5].map(n=>`<span class="star-pick" onclick="pickStar(${n})">☆</span>`).join('')}</div>
        <input type="text" id="reviewAuthor" placeholder="Votre nom" class="input">
        <textarea id="reviewComment" placeholder="Votre commentaire…" class="input textarea"></textarea>
        <button class="btn btn-primary" onclick="submitReview('${p._id}')">Publier l'avis</button>
      </div>
    </div>`;
}

function renderReviewList(reviews) {
  if (!reviews?.length) return '<p style="color:var(--muted)">Aucun avis pour l\'instant. Soyez le premier !</p>';
  return reviews.slice(0, 5).map(r => `
    <div class="review-card">
      <div class="review-header">
        <strong>${r.author||'Anonyme'}</strong>
        <span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
        <span class="review-date">${new Date(r.createdAt).toLocaleDateString('fr-GN')}</span>
      </div>
      <p style="color:var(--text2);font-size:.9rem;margin-top:6px">${r.comment||''}</p>
    </div>`).join('');
}

function detailQtyChange(d) {
  detailQty = Math.max(1, detailQty + d);
  const el = document.getElementById('detailQtyDisplay');
  if (el) el.textContent = detailQty;
}

function addDetailToCart() {
  if (state.currentProduct) addToCart(state.currentProduct, detailQty);
}

function switchImg(thumb, src) {
  document.getElementById('mainImg').src = src;
  document.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
  thumb.classList.add('active');
}

let pickedStar = 5;
function pickStar(n) {
  pickedStar = n;
  document.querySelectorAll('.star-pick').forEach((s, i) => {
    s.textContent = i < n ? '★' : '☆';
    s.classList.toggle('active', i < n);
  });
}

async function submitReview(productId) {
  const author = document.getElementById('reviewAuthor')?.value?.trim();
  const comment = document.getElementById('reviewComment')?.value?.trim();
  if (!author || !comment) { showToast('Remplissez tous les champs', 'error'); return; }
  try {
    await apiFetch(`/products/${productId}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ author, comment, rating: pickedStar }),
    });
    showToast('Avis publié, merci !');
    showProduct(productId);
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── CART PAGE ────────────────────────────────────────────────────────────────
function renderCartPage() {
  const itemsEl = document.getElementById('cartPageItems');
  const summaryEl = document.getElementById('cartSummary');
  if (!itemsEl) return;

  if (state.cart.length === 0) {
    itemsEl.innerHTML = `<div style="text-align:center;padding:40px">
      <div style="font-size:4rem">🛒</div>
      <h2 style="margin:16px 0 8px">Panier vide</h2>
      <p style="color:var(--text2);margin-bottom:20px">Explorez notre boutique</p>
      <button class="btn btn-primary" onclick="showPage('shop')">Voir les produits</button>
    </div>`;
    if (summaryEl) summaryEl.innerHTML = '';
    return;
  }

  itemsEl.innerHTML = state.cart.map(item => `
    <div class="cart-page-item">
      <img src="${item.image}" alt="${item.name}" onerror="this.src='https://placehold.co/90x80'">
      <div style="flex:1">
        <div style="font-weight:700;margin-bottom:4px">${item.name}</div>
        <div style="color:var(--primary-light);font-weight:700">${fmt(item.price)}</div>
      </div>
      <div class="qty-control" style="margin:0 12px">
        <button class="qty-btn" onclick="updateCartQty('${item._id}',-1);renderCartPage()">−</button>
        <span>${item.qty}</span>
        <button class="qty-btn" onclick="updateCartQty('${item._id}',1);renderCartPage()">+</button>
      </div>
      <div style="font-weight:700;min-width:80px;text-align:right">${fmt(item.price * item.qty)}</div>
      <button onclick="removeFromCart('${item._id}');renderCartPage()" style="color:var(--danger);margin-left:12px;font-size:1.1rem;background:none;border:none;cursor:pointer">✕</button>
    </div>`).join('');

  if (summaryEl) summaryEl.innerHTML = `
    <div class="checkout-summary">
      <h3>Résumé</h3>
      <div class="summary-item"><span>Sous-total</span><span>${fmt(cartTotal())}</span></div>
      <div class="summary-item"><span>Livraison</span><span style="color:var(--success)">Gratuite</span></div>
      <div class="summary-total"><span>Total</span><span class="amount">${fmt(cartTotal())}</span></div>
      <button class="btn btn-primary btn-full" style="margin-top:16px" onclick="showPage('checkout')">Passer la commande →</button>
    </div>`;
}

// ─── CHECKOUT ─────────────────────────────────────────────────────────────────
function renderCheckoutSummary() {
  const el = document.getElementById('checkoutSummary');
  if (!el) return;
  if (state.cart.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <h3>Votre commande</h3>
    ${state.cart.map(i => `
      <div class="summary-item">
        <span class="summary-item-name">${i.name}</span>
        <span class="summary-item-qty">×${i.qty}</span>
        <span>${fmt(i.price * i.qty)}</span>
      </div>`).join('')}
    <div class="summary-total"><span>Total</span><span class="amount">${fmt(cartTotal())}</span></div>
    <p style="font-size:.78rem;color:var(--muted);margin-top:12px;text-align:center">🔒 Paiement 100% sécurisé</p>`;
}

async function submitOrder(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('co-name')?.value?.trim();
  const phone = document.getElementById('co-phone')?.value?.trim();
  const email = document.getElementById('co-email')?.value?.trim();
  const city = document.getElementById('co-city')?.value;
  const address = (city ? city + ' — ' : '') + (document.getElementById('co-address')?.value?.trim() || '');
  const notes = document.getElementById('co-notes')?.value?.trim();
  const payment = document.querySelector('input[name="payment"]:checked')?.value;

  if (!name || !phone) { showToast('Nom et téléphone requis', 'error'); return; }
  if (!payment) { showToast('Choisissez un mode de paiement', 'error'); return; }
  if (state.cart.length === 0) { showToast('Panier vide', 'error'); return; }

  const btn = document.querySelector('#checkoutForm button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Traitement…'; }

  try {
    const order = await apiFetch('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer: { name, phone, email },
        items: state.cart.map(i => ({ product: i._id, name: i.name, price: i.price, qty: i.qty })),
        total: cartTotal(),
        paymentMethod: payment,
        address,
        notes,
        shipping: 0,
      }),
    });

    state.cart = [];
    saveCart();
    renderCartDrawer();

    // Show success
    const msgEl = document.getElementById('successMsg');
    const orderEl = document.getElementById('successOrder');
    if (msgEl) msgEl.textContent = `Merci ${name} ! Votre commande a été confirmée.`;
    if (orderEl) orderEl.innerHTML = `
      <div style="text-align:center">
        <p style="color:var(--text2);margin-bottom:8px">Numéro de commande</p>
        <strong style="font-size:1.4rem;color:var(--primary-light);letter-spacing:1px">${order.orderNumber || '—'}</strong>
      </div>`;
    showPage('success');
  } catch (err) {
    showToast(err.message || 'Erreur lors de la commande', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmer la commande'; }
  }
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function showAuthPanel(panel) {
  document.getElementById('loginCard').style.display = panel === 'login' ? 'block' : 'none';
  document.getElementById('registerCard').style.display = panel === 'register' ? 'block' : 'none';
}

async function login(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('loginEmail')?.value;
  const password = document.getElementById('loginPwd')?.value;
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.classList.remove('show');
  try {
    const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    state.user = data;
    localStorage.setItem('vt-user', JSON.stringify(data));
    showToast(`Bienvenue, ${data.name} !`);
    updateAccountUI();
  } catch (err) {
    if (errEl) { errEl.textContent = err.message || 'Email ou mot de passe incorrect'; errEl.classList.add('show'); }
  }
}

async function register(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('regName')?.value?.trim();
  const email = document.getElementById('regEmail')?.value?.trim();
  const phone = document.getElementById('regPhone')?.value?.trim();
  const password = document.getElementById('regPwd')?.value;
  const errEl = document.getElementById('regError');
  if (errEl) errEl.classList.remove('show');
  try {
    const data = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, phone, password }) });
    state.user = data;
    localStorage.setItem('vt-user', JSON.stringify(data));
    showToast(`Compte créé ! Bienvenue, ${data.name} !`);
    updateAccountUI();
  } catch (err) {
    if (errEl) { errEl.textContent = err.message || 'Erreur lors de l\'inscription'; errEl.classList.add('show'); }
  }
}

function updateAccountUI() {
  if (!state.user) return;
  // Replace auth card with logged-in view
  const wrap = document.querySelector('#page-account .auth-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="auth-card" style="text-align:center">
      <div style="width:72px;height:72px;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:2rem;color:#fff;font-weight:800">${state.user.name?.charAt(0).toUpperCase() || '?'}</div>
      <h2>${state.user.name}</h2>
      <p style="color:var(--muted);margin:6px 0 24px">${state.user.email}</p>
      <button class="btn btn-ghost btn-full" onclick="logout()">🚪 Se déconnecter</button>
    </div>`;
}

function logout() {
  state.user = null;
  localStorage.removeItem('vt-user');
  showToast('Déconnecté');
  // Reset account page to show auth forms
  const wrap = document.querySelector('#page-account .auth-wrap');
  if (wrap) wrap.innerHTML = `
    <div class="auth-card" id="loginCard">
      <h2>👤 Connexion</h2>
      <form onsubmit="login(event)">
        <div class="form-group"><label>Email</label><input type="email" id="loginEmail" required placeholder="votre@email.com" /></div>
        <div class="form-group"><label>Mot de passe</label><input type="password" id="loginPwd" required placeholder="••••••••" /></div>
        <div id="loginError" class="error-msg"></div>
        <button type="submit" class="btn-primary btn-full">Se connecter</button>
      </form>
      <p class="auth-switch">Pas de compte ? <a href="#" onclick="showAuthPanel('register')">Créer un compte</a></p>
    </div>
    <div class="auth-card" id="registerCard" style="display:none">
      <h2>✨ Créer un compte</h2>
      <form onsubmit="register(event)">
        <div class="form-group"><label>Nom complet</label><input type="text" id="regName" required placeholder="Votre nom" /></div>
        <div class="form-group"><label>Email</label><input type="email" id="regEmail" required placeholder="votre@email.com" /></div>
        <div class="form-group"><label>Téléphone</label><input type="tel" id="regPhone" placeholder="+224 620 000 000" /></div>
        <div class="form-group"><label>Mot de passe</label><input type="password" id="regPwd" required placeholder="••••••••" /></div>
        <div id="regError" class="error-msg"></div>
        <button type="submit" class="btn-primary btn-full">Créer mon compte</button>
      </form>
      <p class="auth-switch">Déjà un compte ? <a href="#" onclick="showAuthPanel('login')">Se connecter</a></p>
    </div>`;
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
function onSearchInput(e) {
  clearTimeout(state.searchTimeout);
  const q = e.target.value.trim();
  if (q.length < 2) { hideSearch(); return; }
  state.searchTimeout = setTimeout(() => doSearch(q), 300);
}

async function doSearch(q) {
  try {
    const results = await apiFetch(`/products/search?q=${encodeURIComponent(q)}`);
    showSearchResults(results);
  } catch { hideSearch(); }
}

function showSearchResults(results) {
  const el = document.getElementById('searchResults');
  if (!el) return;
  if (!results.length) {
    el.innerHTML = '<div class="search-no-result">Aucun résultat</div>';
    el.classList.add('active');
    return;
  }
  el.innerHTML = results.map(p => `
    <div class="search-item" onclick="hideSearch(); showProduct('${p._id}')">
      <img src="${p.images?.[0]||'https://placehold.co/42x36'}" class="search-thumb" onerror="this.src='https://placehold.co/42x36'">
      <div class="search-item-info">
        <span class="search-item-name">${p.name}</span>
        <span class="search-item-price">${fmt(p.price)}</span>
      </div>
      <span class="search-item-cat">${p.category}</span>
    </div>`).join('');
  el.classList.add('active');
}

function hideSearch() {
  document.getElementById('searchResults')?.classList.remove('active');
}

function onSearchSubmit(e) {
  e.preventDefault();
  const q = document.getElementById('searchInput')?.value?.trim();
  if (!q) return;
  hideSearch();
  state.filters.search = q;
  state.page = 1;
  showPage('shop');
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────
function toggleChat() {
  const win = document.getElementById('chatWindow');
  if (!win) return;
  const isOpen = win.style.display !== 'flex' && win.style.display !== 'block';
  win.style.display = isOpen ? 'flex' : 'none';
  if (isOpen) win.style.flexDirection = 'column';
}

function appendChatMsg(from, text) {
  const body = document.getElementById('chatMessages');
  if (!body) return;
  const div = document.createElement('div');
  div.className = `chat-msg ${from}`;
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input?.value?.trim();
  if (!msg) return;
  appendChatMsg('user', msg);
  input.value = '';
  setTimeout(() => appendChatMsg('bot', getChatResponse(msg.toLowerCase())), 600);
}

function getChatResponse(msg) {
  if (msg.includes('livraison') || msg.includes('délai')) return 'Livraison en 24-72h à Conakry, 3-7j en province. Gratuite dès 500 000 GNF. 🚚';
  if (msg.includes('orange') || msg.includes('mtn') || msg.includes('paiement')) return 'Orange Money, MTN Money, carte bancaire et paiement à la livraison. 💳';
  if (msg.includes('retour') || msg.includes('remboursement')) return 'Retour sous 30 jours si produit défectueux. Appelez le +224 620 000 000. ↩️';
  if (msg.includes('garantie')) return 'Garantie 1 à 2 ans selon fabricant sur tous nos produits. 🛡️';
  if (msg.includes('bonjour') || msg.includes('salut') || msg.includes('hello')) return 'Bonjour ! Bienvenue chez VENIPS Tech 👋 Comment puis-je vous aider ?';
  if (msg.includes('merci')) return 'De rien ! N\'hésitez pas si vous avez d\'autres questions. 😊';
  if (msg.includes('prix') || msg.includes('promo')) return 'Nos prix sont en GNF. Les badges % sur les produits indiquent les promotions ! 🏷️';
  return 'Pour une aide personnalisée, appelez-nous au 📞 +224 620 000 000 ou écrivez à contact@venipstech.gn 😊';
}

// ─── ROUTING ──────────────────────────────────────────────────────────────────
const PAGE_IDS = ['home', 'shop', 'product', 'cart', 'checkout', 'account', 'success'];

function showPage(name) {
  PAGE_IDS.forEach(id => {
    const el = document.getElementById(`page-${id}`);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById(`page-${name}`);
  if (target) target.style.display = 'block';

  window.location.hash = name === 'home' ? '' : name;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (name === 'home') loadHome();
  else if (name === 'shop') { syncShopFiltersUI(); loadShop(); }
  else if (name === 'cart') renderCartPage();
  else if (name === 'checkout') renderCheckoutSummary();
  else if (name === 'account' && state.user) updateAccountUI();
}

function syncShopFiltersUI() {
  // Sync category chip selection
  document.querySelectorAll('.chip[data-cat]').forEach(el => {
    el.classList.toggle('active', el.dataset.cat === state.filters.category);
  });
  // Sync sort
  const ss = document.getElementById('sortSelect');
  if (ss) ss.value = state.filters.sort;
}

function routeFromHash() {
  const hash = window.location.hash.replace('#', '') || 'home';
  const valid = PAGE_IDS.includes(hash) ? hash : 'home';
  showPage(valid);
}

// ─── FILTER CHIP WIRING ───────────────────────────────────────────────────────
function wireFilterChips() {
  document.querySelectorAll('.chip[data-cat]').forEach(el => {
    el.addEventListener('click', () => {
      state.filters.category = el.dataset.cat;
      state.page = 1;
      document.querySelectorAll('.chip[data-cat]').forEach(c => c.classList.toggle('active', c === el));
      loadShop();
    });
  });

  document.querySelectorAll('.chip[data-brand]').forEach(el => {
    el.addEventListener('click', () => {
      const active = el.classList.toggle('active');
      state.filters.brand = active ? el.dataset.brand : '';
      // deactivate others
      if (active) document.querySelectorAll('.chip[data-brand]').forEach(c => { if (c !== el) c.classList.remove('active'); });
      state.page = 1;
      loadShop();
    });
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);

  document.getElementById('themeToggle')?.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  // Cart
  document.querySelectorAll('.cart-btn, [onclick="toggleCart()"]').forEach(el => {
    el.addEventListener('click', toggleCart);
  });

  // Search
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', onSearchInput);
    searchInput.closest('form')?.addEventListener('submit', onSearchSubmit);
    // manual submit on Enter
    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); onSearchSubmit(e); } });
  }
  document.addEventListener('click', e => { if (!e.target.closest('.search-box')) hideSearch(); });

  // Chat enter key
  document.getElementById('chatInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

  // Mobile menu
  document.querySelector('.mobile-menu-btn')?.addEventListener('click', () => {
    document.getElementById('categoryNav')?.classList.toggle('open');
  });

  // Wire filter chips
  wireFilterChips();

  // Price range
  document.getElementById('priceRange')?.addEventListener('change', e => {
    state.filters.maxPrice = parseInt(e.target.value);
    state.page = 1;
    loadShop();
  });

  updateCartBadge();
  if (state.user) updateAccountUI();

  window.addEventListener('hashchange', routeFromHash);
  routeFromHash();
});

// ─── GLOBALS ──────────────────────────────────────────────────────────────────
window.showPage = showPage;
window.showProduct = showProduct;
window.quickAdd = quickAdd;
window.toggleCart = toggleCart;
window.updateCartQty = updateCartQty;
window.removeFromCart = removeFromCart;
window.renderCartPage = renderCartPage;
window.filterCategory = filterCategory;
window.clearFilters = clearFilters;
window.applyFilters = applyFilters;
window.updatePriceFilter = updatePriceFilter;
window.goPage = goPage;
window.detailQtyChange = detailQtyChange;
window.addDetailToCart = addDetailToCart;
window.switchImg = switchImg;
window.pickStar = pickStar;
window.submitReview = submitReview;
window.submitOrder = submitOrder;
window.login = login;
window.register = register;
window.logout = logout;
window.showAuthPanel = showAuthPanel;
window.toggleChat = toggleChat;
window.sendChat = sendChat;
window.hideSearch = hideSearch;
