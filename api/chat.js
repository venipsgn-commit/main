'use strict';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message manquant' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Variables Supabase manquantes' });

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

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

  const now = new Date();
  const moisActuel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const fmt = n => Number(n || 0).toLocaleString('fr') + ' GNF';

  // Calculs globaux
  const totalCA     = ventes.reduce((s, v) => s + (v.pv || 0) * (v.qty || 1), 0);
  const totalGain   = ventes.reduce((s, v) => s + ((v.pv || 0) - (v.pa || 0)) * (v.qty || 1), 0);
  const totalCharges = charges.reduce((s, c) => s + (c.montant || 0), 0);
  const beneficeNet = totalGain - totalCharges;

  const ventesMois  = ventes.filter(v => (v.date || '').startsWith(moisActuel));
  const caMois      = ventesMois.reduce((s, v) => s + (v.pv || 0) * (v.qty || 1), 0);
  const gainMois    = ventesMois.reduce((s, v) => s + ((v.pv || 0) - (v.pa || 0)) * (v.qty || 1), 0);
  const chargesMois = charges.filter(c => (c.date || '').startsWith(moisActuel))
                             .reduce((s, c) => s + (c.montant || 0), 0);

  const stockDispo   = stock.filter(p => (p.qty || 0) > 0);
  const stockRupture = stock.filter(p => (p.qty || 0) === 0);
  const valeurStock  = stock.reduce((s, p) => s + (p.pa || 0) * (p.qty || 0), 0);

  const dettesNP       = dettes.filter(d => d.statut === 'Non payé');
  const clientDoivent  = dettesNP.filter(d => d.type === 'Client doit').reduce((s, d) => s + (d.montant || 0), 0);
  const boutiqueDoivent= dettesNP.filter(d => d.type === 'Boutique doit').reduce((s, d) => s + (d.montant || 0), 0);

  // Produits les plus vendus
  const venteParProduit = {};
  ventes.forEach(v => {
    const nom = v.produit || v.nom || 'Inconnu';
    if (!venteParProduit[nom]) venteParProduit[nom] = { qty: 0, gain: 0 };
    venteParProduit[nom].qty  += (v.qty || 1);
    venteParProduit[nom].gain += ((v.pv || 0) - (v.pa || 0)) * (v.qty || 1);
  });
  const topProduits = Object.entries(venteParProduit)
    .sort((a, b) => b[1].gain - a[1].gain)
    .slice(0, 5);

  // Vendeurs performance
  const venteParVendeur = {};
  ventes.forEach(v => {
    const nom = v.vendeur || 'Inconnu';
    if (!venteParVendeur[nom]) venteParVendeur[nom] = { qty: 0, ca: 0 };
    venteParVendeur[nom].qty += (v.qty || 1);
    venteParVendeur[nom].ca  += (v.pv || 0) * (v.qty || 1);
  });

  const q = message.toLowerCase();

  // ── Détection de l'intention ──────────────────────────────────────────────

  // Analyse générale
  if (q.includes('général') || q.includes('generale') || q.includes('analyse') || q.includes('résumé') || q.includes('resume') || q.includes('tout')) {
    const reply = `📊 ANALYSE GÉNÉRALE DE LA BOUTIQUE

💰 Finances :
• Chiffre d'affaires total : ${fmt(totalCA)}
• Gain total : ${fmt(totalGain)}
• Total charges : ${fmt(totalCharges)}
• Bénéfice net : ${fmt(beneficeNet)} ${beneficeNet >= 0 ? '✅' : '⚠️'}

📅 Ce mois (${moisActuel}) :
• CA du mois : ${fmt(caMois)}
• Gain du mois : ${fmt(gainMois)}
• Charges du mois : ${fmt(chargesMois)}

📦 Stock :
• ${stockDispo.length} produits disponibles
• ${stockRupture.length} produits en rupture
• Valeur totale du stock : ${fmt(valeurStock)}

🤝 Dettes :
• Clients doivent : ${fmt(clientDoivent)}
• Boutique doit : ${fmt(boutiqueDoivent)}

👨‍💼 Vendeurs : ${vendeurs.length} enregistrés`;
    return res.json({ reply });
  }

  // Bénéfice / profit
  if (q.includes('bénéfice') || q.includes('benefice') || q.includes('profit') || q.includes('net')) {
    const reply = `📈 BÉNÉFICE NET

• Gain total (toutes ventes) : ${fmt(totalGain)}
• Total charges : ${fmt(totalCharges)}
• Bénéfice net : ${fmt(beneficeNet)} ${beneficeNet >= 0 ? '✅ Positif' : '⚠️ Négatif'}

Ce mois (${moisActuel}) :
• Gain du mois : ${fmt(gainMois)}
• Charges du mois : ${fmt(chargesMois)}
• Bénéfice ce mois : ${fmt(gainMois - chargesMois)} ${(gainMois - chargesMois) >= 0 ? '✅' : '⚠️'}`;
    return res.json({ reply });
  }

  // Chiffre d'affaires
  if (q.includes("chiffre d'affaires") || q.includes('ca') || q.includes('vente') || q.includes('revenu')) {
    const reply = `💰 CHIFFRE D'AFFAIRES

• CA total (toutes périodes) : ${fmt(totalCA)}
• CA ce mois (${moisActuel}) : ${fmt(caMois)}
• Nombre total de ventes : ${ventes.length}
• Ventes ce mois : ${ventesMois.length}`;
    return res.json({ reply });
  }

  // Stock / rupture
  if (q.includes('stock') || q.includes('rupture') || q.includes('produit')) {
    let reply = `📦 ÉTAT DU STOCK\n\n`;
    reply += `• Total produits : ${stock.length}\n`;
    reply += `• Disponibles : ${stockDispo.length}\n`;
    reply += `• En rupture : ${stockRupture.length}\n`;
    reply += `• Valeur du stock : ${fmt(valeurStock)}\n`;
    if (stockRupture.length > 0) {
      reply += `\n⚠️ Produits en rupture :\n`;
      stockRupture.forEach(p => { reply += `• ${p.nom}\n`; });
    }
    if (stockDispo.length > 0) {
      reply += `\n✅ Produits disponibles :\n`;
      stockDispo.slice(0, 10).forEach(p => { reply += `• ${p.nom} — qté: ${p.qty}\n`; });
    }
    return res.json({ reply });
  }

  // Rentabilité
  if (q.includes('rentable') || q.includes('meilleur') || q.includes('top') || q.includes('performant')) {
    let reply = `💰 PRODUITS LES PLUS RENTABLES\n\n`;
    if (topProduits.length === 0) {
      reply += 'Aucune vente enregistrée pour le moment.';
    } else {
      topProduits.forEach(([nom, stats], i) => {
        reply += `${i + 1}. ${nom}\n   Gain : ${fmt(stats.gain)} | Qté vendue : ${stats.qty}\n`;
      });
    }
    return res.json({ reply });
  }

  // Charges
  if (q.includes('charge') || q.includes('dépense') || q.includes('depense')) {
    const parType = {};
    charges.forEach(c => {
      parType[c.type || 'Autre'] = (parType[c.type || 'Autre'] || 0) + (c.montant || 0);
    });
    let reply = `💸 CHARGES\n\n• Total charges : ${fmt(totalCharges)}\n• Charges ce mois : ${fmt(chargesMois)}\n\nPar type :\n`;
    Object.entries(parType).forEach(([type, montant]) => {
      reply += `• ${type} : ${fmt(montant)}\n`;
    });
    return res.json({ reply });
  }

  // Dettes
  if (q.includes('dette') || q.includes('crédit') || q.includes('credit') || q.includes('doit')) {
    let reply = `🤝 DETTES EN COURS\n\n`;
    reply += `• Clients doivent à la boutique : ${fmt(clientDoivent)}\n`;
    reply += `• Boutique doit à d'autres : ${fmt(boutiqueDoivent)}\n\n`;
    if (dettesNP.length > 0) {
      reply += `Détails des dettes non réglées :\n`;
      dettesNP.slice(0, 10).forEach(d => {
        reply += `• ${d.nom} — ${fmt(d.montant)} (${d.type})\n`;
      });
    } else {
      reply += '✅ Aucune dette non réglée.';
    }
    return res.json({ reply });
  }

  // Vendeurs
  if (q.includes('vendeur') || q.includes('performance') || q.includes('équipe') || q.includes('equipe')) {
    let reply = `👨‍💼 PERFORMANCE DES VENDEURS\n\n`;
    if (Object.keys(venteParVendeur).length === 0) {
      reply += 'Aucune vente enregistrée pour le moment.';
    } else {
      Object.entries(venteParVendeur)
        .sort((a, b) => b[1].ca - a[1].ca)
        .forEach(([nom, stats]) => {
          reply += `• ${nom} — CA: ${fmt(stats.ca)} | Qté: ${stats.qty}\n`;
        });
    }
    return res.json({ reply });
  }

  // Par défaut — aide
  const reply = `Je peux vous aider avec :

📊 "Analyse générale" — Vue d'ensemble de la boutique
💰 "Chiffre d'affaires" — CA total et du mois
📈 "Bénéfice net" — Gains moins charges
📦 "État du stock" — Produits disponibles et ruptures
💡 "Produits rentables" — Top produits par gain
💸 "Mes charges" — Dépenses par type
🤝 "Dettes en cours" — Ce que les clients doivent
👨‍💼 "Performance vendeurs" — Classement des vendeurs

Posez votre question en utilisant ces mots-clés.`;

  return res.json({ reply });
};
