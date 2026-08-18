'use strict';
const router = require('express').Router();
const Product = require('../models/Product');
const auth = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const { category, brand, minPrice, maxPrice, search, sort, featured, limit = 20, page = 1 } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (brand) filter.brand = new RegExp(brand, 'i');
    if (search) filter.name = new RegExp(search, 'i');
    if (featured) filter.featured = true;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    const sortMap = {
      'price_asc': { price: 1 }, 'price_desc': { price: -1 },
      'newest': { createdAt: -1 }, 'rating': { rating: -1 }
    };
    const skip = (Number(page) - 1) * Number(limit);
    const [products, total] = await Promise.all([
      Product.find(filter).sort(sortMap[sort] || { createdAt: -1 }).skip(skip).limit(Number(limit)),
      Product.countDocuments(filter)
    ]);
    res.json({ products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/featured', async (req, res) => {
  try {
    const products = await Product.find({ featured: true }).limit(8);
    res.json(products);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const products = await Product.find({
      $or: [{ name: new RegExp(q, 'i') }, { brand: new RegExp(q, 'i') }, { tags: new RegExp(q, 'i') }]
    }).limit(8).select('name brand price images category');
    res.json(products);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    res.json(product);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/reviews', async (req, res) => {
  try {
    const { user, rating, comment } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    product.reviews.push({ user, rating, comment });
    const avg = product.reviews.reduce((s, r) => s + r.rating, 0) / product.reviews.length;
    product.rating = Math.round(avg * 10) / 10;
    product.reviewCount = product.reviews.length;
    await product.save();
    res.json({ rating: product.rating, reviewCount: product.reviewCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
