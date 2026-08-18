'use strict';
const router = require('express').Router();
const Order = require('../models/Order');

router.post('/', async (req, res) => {
  try {
    const { customer, items, total, shipping, paymentMethod, address, notes } = req.body;
    if (!items?.length || !customer?.name || !customer?.phone) {
      return res.status(400).json({ error: 'Informations manquantes' });
    }
    const order = await Order.create({ customer, items, total, shipping, paymentMethod, address, notes });
    res.status(201).json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/track/:orderNumber', async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber }).populate('items.product', 'name images');
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
