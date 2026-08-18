'use strict';
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/products', require('./routes/products'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/orders', require('./routes/orders'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date() }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/venips-tech';

mongoose.connect(MONGO)
  .then(() => {
    console.log('✅ MongoDB connecté');
    app.listen(PORT, () => console.log(`🚀 VENIPS Tech sur http://localhost:${PORT}`));
  })
  .catch(e => {
    console.error('❌ MongoDB erreur:', e.message);
    // Démarrer quand même sans DB pour mode démo
    app.listen(PORT, () => console.log(`🚀 VENIPS Tech (sans DB) sur http://localhost:${PORT}`));
  });
