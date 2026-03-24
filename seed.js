/* ============================================
   BOUTIQUE PRO – SEED DATA
   Initialisation de la base de données
   ============================================ */

(function () {
  'use strict';

  // Ne pas réinitialiser si des données existent déjà
  const existingVentes = localStorage.getItem('bp_ventes');
  if (existingVentes && JSON.parse(existingVentes).length > 0) return;

  /* ------ Helper ------ */
  function makeId() {
    return Date.now() + Math.floor(Math.random() * 100000);
  }
  function iso(ddmmyyyy) {
    const [d, m, y] = ddmmyyyy.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  /* ==========================================
     VENDEURS
  ========================================== */
  const vendeurs = [
    { id: makeId(), nom: 'Propriétaire', createdAt: new Date().toISOString() }
  ];
  localStorage.setItem('bp_vendeurs', JSON.stringify(vendeurs));

  /* ==========================================
     STOCK  (produits avec prix habituels)
  ========================================== */
  const stockProduits = [
    { nom: 'Notebook Boom',           qty: 0, pa: 950000,   pv: 1000000  },
    { nom: 'Projecteur',              qty: 0, pa: 700000,   pv: 800000   },
    { nom: 'Modio M40',               qty: 0, pa: 950000,   pv: 1000000  },
    { nom: 'modio sm3',               qty: 0, pa: 280000,   pv: 380000   },
    { nom: 'NOTEBOOK GALAXY',         qty: 0, pa: 850000,   pv: 1000000  },
    { nom: 'NOTEBOOK CORE',           qty: 0, pa: 850000,   pv: 950000   },
    { nom: 'NOTEBOOK ACTION',         qty: 0, pa: 850000,   pv: 1000000  },
    { nom: 'HP 840 G3',               qty: 0, pa: 1800000,  pv: 2000000  },
    { nom: 'HP 840 G4',               qty: 0, pa: 2000000,  pv: 2200000  },
    { nom: 'HP 840 G5',               qty: 0, pa: 2300000,  pv: 2500000  },
    { nom: 'LENOVO T470',             qty: 0, pa: 1800000,  pv: 2000000  },
    { nom: 'LENOVO YOGA X1',          qty: 0, pa: 2200000,  pv: 2400000  },
    { nom: 'LENOVO 11e I5',           qty: 0, pa: 1700000,  pv: 1800000  },
    { nom: 'LENOVO 11e 1',            qty: 0, pa: 1300000,  pv: 1500000  },
    { nom: 'LENOVO I7',               qty: 0, pa: 2200000,  pv: 2400000  },
    { nom: 'LENOVO L13',              qty: 0, pa: 1900000,  pv: 2100000  },
    { nom: 'DELL 3190',               qty: 0, pa: 1200000,  pv: 1300000  },
    { nom: 'Dell 3190 2 in 1 i7',     qty: 0, pa: 2350000,  pv: 2500000  },
    { nom: 'DELL 5400',               qty: 0, pa: 2000000,  pv: 2200000  },
    { nom: 'DELL 5480',               qty: 0, pa: 1800000,  pv: 2000000  },
    { nom: 'DELL 7390 2 IN 1',        qty: 0, pa: 2200000,  pv: 2400000  },
    { nom: 'DELL 7450 i5',            qty: 0, pa: 1650000,  pv: 1800000  },
    { nom: 'DELL 3380',               qty: 0, pa: 1800000,  pv: 2000000  },
    { nom: 'Dell 3150',               qty: 0, pa: 1550000,  pv: 1700000  },
    { nom: 'HPX360',                  qty: 0, pa: 1300000,  pv: 1400000  },
    { nom: 'HP RAZYN 5',              qty: 0, pa: 2200000,  pv: 2400000  },
    { nom: 'HP 1040 i7',              qty: 0, pa: 2200000,  pv: 2400000  },
    { nom: 'HP 430 i7',               qty: 0, pa: 1700000,  pv: 1900000  },
    { nom: 'hp 840 G3 i7',            qty: 0, pa: 2200000,  pv: 2400000  },
    { nom: 'Surface I5',              qty: 0, pa: 2500000,  pv: 2700000  },
    { nom: 'Surface dual',            qty: 0, pa: 1700000,  pv: 1900000  },
    { nom: 'NOTEBOOK MAC',            qty: 0, pa: 850000,   pv: 1000000  },
    { nom: 'SUPPORT PC',              qty: 0, pa: 90000,    pv: 100000   },
    { nom: 'SAC PC',                  qty: 0, pa: 80000,    pv: 100000   },
    { nom: 'cle USB',                 qty: 0, pa: 90000,    pv: 100000   },
    { nom: 'TYPE HDMI',               qty: 0, pa: 160000,   pv: 200000   },
    { nom: 'SOURIS SANS FIL',         qty: 0, pa: 90000,    pv: 100000   },
    { nom: 'HP 840 G3 - Stock',       qty: 0, pa: 1800000,  pv: 2000000  },
    { nom: 'MICRO CRAVATE',           qty: 0, pa: 200000,   pv: 250000   },
    { nom: 'TAPIS PC',                qty: 0, pa: 60000,    pv: 70000    },
    { nom: 'HP RAZYN 5 - i5',        qty: 0, pa: 1800000,  pv: 2100000  },
    { nom: 'HP 430 i7 - alt',         qty: 0, pa: 1700000,  pv: 1900000  },
  ];

  const stock = stockProduits.map((p, i) => ({
    id: makeId() + i,
    ...p,
    createdAt: new Date().toISOString()
  }));
  localStorage.setItem('bp_stock', JSON.stringify(stock));

  /* ==========================================
     VENTES  – ajoutées une par une
     Format : { date:'DD/MM/YYYY', produit, qty, pv, pa, gain, vendeur }
  ========================================== */
  const rawVentes = [
    // ── JUILLET 2025 ──────────────────────────
    // Entrez les données ici :
  ];

  const ventes = rawVentes.map((v, i) => ({
    id: makeId() + 100000 + i,
    date:      iso(v.date),
    produit:   v.produit,
    qty:       v.qty,
    pa:        v.pa,
    pv:        v.pv,
    gain:      v.gain !== undefined ? v.gain : (v.pv - v.pa) * v.qty,
    vendeur:   v.vendeur || 'Propriétaire',
    createdAt: new Date().toISOString()
  }));

  localStorage.setItem('bp_ventes',  JSON.stringify(ventes));
  localStorage.setItem('bp_charges', JSON.stringify([]));
  localStorage.setItem('bp_dettes',  JSON.stringify([]));

  console.log(`✅ Boutique Pro – Seed OK: ${ventes.length} ventes chargées.`);
})();
