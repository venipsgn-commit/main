'use strict';
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const makeToken = (user) => jwt.sign(
  { id: user._id, email: user.email, role: user.role },
  process.env.JWT_SECRET || 'venips-secret',
  { expiresIn: '7d' }
);

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email déjà utilisé' });
    const user = await User.create({ name, email, password, phone });
    res.status(201).json({ token: makeToken(user), user: { id: user._id, name: user.name, email: user.email } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    res.json({ token: makeToken(user), user: { id: user._id, name: user.name, email: user.email } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
