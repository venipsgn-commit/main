'use strict';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message manquant' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Variables Supabase manquantes' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Clé API Anthropic manquante' });

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  // Récupérer toutes les données
  async function fetchTable(table) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/records?table_name=eq.${table}&select=data`, { headers });
      const rows = await r.json();
      return Array.isArray(rows) ? rows.map(r => r.data) : [];
    } catch { return []; }
  }

  const [stock, ventes, vendeurs, charges, dettes] = await Promise.all([
    fetchTable('stock'), fetchTable('ventes'), fetchTable('vendeurs'),
    fetchTable('charges'), fetchTable('dettes')
  ]);

  // Calculer les statistiques clés
  const totalCA = ventes.reduce((s, v) => s + (v.pv || 0) * (v.qty || 1), 0);
  const totalGain = ventes.reduce((s, v) => s + ((v.pv || 0) - (v.pa || 0)) * (v.qty || 1), 0);
  const totalCharges = charges.reduce((s, c) => s + (c.montant || 0), 0);
  const beneficeNet = totalGain - totalCharges;
  const stockDisponible = stock.filter(p => (p.qty || 0) > 0).length;
  const stockRupture = stock.filter(p => (p.qty || 0) === 0).length;
  const valeurStock = stock.reduce((s, p) => s + (p.pa || 0) * (p.qty || 0), 0);
  const dettesNonReglees = dettes.filter(d => d.statut === 'Non payé');
  const clientDoivent = dettesNonReglees.filter(d => d.type === 'Client doit').reduce((s, d) => s + (d.montant || 0), 0);
  const boutiqueDoivent = dettesNonReglees.filter(d => d.type === 'Boutique doit').reduce((s, d) => s + (d.montant || 0), 0);

  const now = new Date();
  const moisActuel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ventesMois = ventes.filter(v => (v.date || '').startsWith(moisActuel));
  const caMois = ventesMois.reduce((s, v) => s + (v.pv || 0) * (v.qty || 1), 0);
  const gainMois = ventesMois.reduce((s, v) => s + ((v.pv || 0) - (v.pa || 0)) * (v.qty || 1), 0);

  const context = `Tu es l'assistant IA de la boutique VENIPS. Tu analyses les données réelles de la boutique et réponds en français de façon claire et concise.

DONNÉES DE LA BOUTIQUE (en temps réel) :

STOCK : ${stock.length} produits (${stockDisponible} disponibles, ${stockRupture} en rupture)
Valeur totale du stock : ${valeurStock.toLocaleString('fr')} GNF
Produits : ${stock.map(p => `${p.nom} (qté: ${p.qty}, PA: ${p.pa} GNF, PV: ${p.pv} GNF)`).join(', ') || 'Aucun'}

VENTES : ${ventes.length} ventes au total
Chiffre d'Affaires total : ${totalCA.toLocaleString('fr')} GNF
Gain total : ${totalGain.toLocaleString('fr')} GNF
Ventes ce mois (${moisActuel}) : CA = ${caMois.toLocaleString('fr')} GNF, Gain = ${gainMois.toLocaleString('fr')} GNF

CHARGES : ${charges.length} charges enregistrées
Total charges : ${totalCharges.toLocaleString('fr')} GNF

BÉNÉFICE NET : ${beneficeNet.toLocaleString('fr')} GNF

VENDEURS : ${vendeurs.map(v => v.nom).join(', ') || 'Aucun'}

DETTES :
- Clients doivent : ${clientDoivent.toLocaleString('fr')} GNF
- Boutique doit : ${boutiqueDoivent.toLocaleString('fr')} GNF

Réponds à la question de l'utilisateur en te basant sur ces données. Sois direct, précis et utile. Utilise des chiffres concrets.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: `${context}\n\nQuestion : ${message}` }]
    })
  });

  const data = await response.json();
  const reply = data?.content?.[0]?.text || 'Désolé, je n\'ai pas pu générer une réponse.';

  return res.status(200).json({ reply });
};
