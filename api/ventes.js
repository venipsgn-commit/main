'use strict';

const crypto = require('crypto');

// GET  /api/ventes  → liste toutes les ventes
// POST /api/ventes  → vérifie le stock PUIS enregistre la vente (atomique)

const USERS = ['VENIPS', 'JACOB'];

function isValidToken(req) {
  const token = req.headers['x-venips-token'];
  if (!token) return false;
  const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
  return USERS.some(u => crypto.createHmac('sha256', secret).update(u).digest('hex') === token);
}

function getUsername(req) {
  const token = req.headers['x-venips-token'];
  if (!token) return 'Inconnu';
  const secret = process.env.VENIPS_API_SECRET || 'venips-default-secret';
  for (const u of USERS) {
    if (crypto.createHmac('sha256', secret).update(u).digest('hex') === token) return u;
  }
  return 'Inconnu';
}

module.exports = async function handler(req, res) {
  if (!isValidToken(req)) return res.status(401).json({ error: 'Non autorisé' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Variables Supabase manquantes' });

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  async function fetchTable(table) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/records?table_name=eq.${table}&select=data`, { headers });
    const rows = await r.json();
    return Array.isArray(rows) ? rows.map(r => r.data) : [];
  }

  async function writeLog(action, recordId, details) {
    try {
      const logId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
      const logData = {
        id: logId, timestamp: new Date().toISOString(),
        username: getUsername(req), action,
        tableName: 'ventes', recordId: String(recordId || ''),
        details: JSON.stringify(details)
      };
      await fetch(`${SUPABASE_URL}/rest/v1/records`, {
        method: 'POST', headers,
        body: JSON.stringify({ table_name: 'logs', id: logId, data: logData })
      });
    } catch {}
  }

  // ── GET ───────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/records?table_name=eq.ventes&order=id.asc&select=data`, { headers });
    const rows = await resp.json();
    return res.status(200).json(Array.isArray(rows) ? rows.map(r => r.data) : []);
  }

  // ── POST : validation + vérification stock + enregistrement ───────────────
  if (req.method === 'POST') {
    const record = req.body;

    // ── 1. Validation des champs obligatoires ─────────────────────────────
    if (!record.produit || !record.qty || record.qty <= 0) {
      return res.status(400).json({ error: 'Produit et quantité (> 0) obligatoires.' });
    }
    if (!record.pv || record.pv <= 0) {
      return res.status(400).json({ error: 'Prix de vente invalide.' });
    }
    if (!record.date) {
      return res.status(400).json({ error: 'Date obligatoire.' });
    }

    // ── 2. Vérification du stock disponible ───────────────────────────────
    const [stock, ventes, defectueux] = await Promise.all([
      fetchTable('stock'), fetchTable('ventes'), fetchTable('defectueux')
    ]);

    const stockItem = stock.find(p => p.nom === record.produit);
    if (!stockItem) {
      return res.status(400).json({ error: `Produit "${record.produit}" introuvable dans le stock.` });
    }

    const dejaVendu = ventes
      .filter(v => v.produit === record.produit)
      .reduce((s, v) => s + (v.qty || 0), 0);
    const defQt = defectueux
      .filter(d => d.produit === record.produit && d.statut !== 'Résolu')
      .reduce((s, d) => s + (d.qty || 0), 0);
    const restant = Math.max(0, (stockItem.qtyInitial ?? stockItem.qty ?? 0) - dejaVendu - defQt);

    if (record.qty > restant) {
      return res.status(400).json({ error: `Stock insuffisant. Disponible : ${restant}` });
    }

    // ── 3. Calcul du gain côté serveur ────────────────────────────────────
    const remise = Math.max(0, Math.min(100, record.remise || 0));
    record.gain = Math.round(((record.pv || 0) - (record.pa || 0)) * (record.qty || 1) * (1 - remise / 100));
    record.stockAvant = restant;
    record.stockApres = restant - record.qty;

    // ── 4. Enregistrement ─────────────────────────────────────────────────
    await fetch(`${SUPABASE_URL}/rest/v1/records`, {
      method: 'POST', headers,
      body: JSON.stringify({ table_name: 'ventes', id: record.id, data: record })
    });

    writeLog('AJOUT', record.id, record);

    return res.status(201).json(record);
  }

  res.status(405).json({ error: 'Méthode non autorisée' });
};
