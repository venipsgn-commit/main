'use strict';
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  customer: {
    name: String,
    email: String,
    phone: String
  },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    qty: Number
  }],
  total: Number,
  shipping: { type: Number, default: 0 },
  paymentMethod: { type: String, enum: ['orange_money', 'mtn_money', 'carte', 'livraison'] },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  status: { type: String, enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
  address: {
    street: String,
    city: String,
    country: { type: String, default: 'Guinée' }
  },
  notes: String,
  createdAt: { type: Date, default: Date.now }
});

orderSchema.pre('save', function(next) {
  if (!this.orderNumber) {
    this.orderNumber = 'VT-' + Date.now();
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
