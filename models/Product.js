'use strict';
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: String,
  rating: { type: Number, min: 1, max: 5 },
  comment: String,
  date: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  brand: { type: String, required: true },
  category: { type: String, enum: ['Laptop', 'Desktop', 'Accessoire', 'Moniteur', 'Périphérique'], required: true },
  price: { type: Number, required: true },
  oldPrice: Number,
  description: String,
  specs: {
    processor: String,
    ram: String,
    storage: String,
    display: String,
    gpu: String,
    battery: String,
    os: String,
    weight: String
  },
  images: [String],
  stock: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  rating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  reviews: [reviewSchema],
  tags: [String],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);
