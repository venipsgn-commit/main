'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

const products = [
  {
    name: 'MacBook Pro 14" M3 Pro', brand: 'Apple', category: 'Laptop',
    price: 12500000, oldPrice: 14000000,
    description: 'Le MacBook Pro le plus puissant avec la puce M3 Pro. Idéal pour les professionnels créatifs.',
    specs: { processor: 'Apple M3 Pro 12 cœurs', ram: '18 Go RAM unifiée', storage: '512 Go SSD', display: '14.2" Liquid Retina XDR', gpu: 'GPU 18 cœurs', battery: 'Jusqu\'à 18h', os: 'macOS Sonoma', weight: '1.6 kg' },
    images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500'],
    stock: 15, featured: true, rating: 4.8, reviewCount: 124,
    tags: ['apple', 'macbook', 'pro', 'm3', 'laptop']
  },
  {
    name: 'Dell XPS 15 OLED', brand: 'Dell', category: 'Laptop',
    price: 9800000, oldPrice: 11000000,
    description: 'Design ultra-fin avec écran OLED 4K spectaculaire. Performance professionnelle.',
    specs: { processor: 'Intel Core i7-13700H', ram: '16 Go DDR5', storage: '1 To SSD NVMe', display: '15.6" OLED 4K Touch', gpu: 'NVIDIA RTX 4060 8Go', battery: 'Jusqu\'à 12h', os: 'Windows 11 Pro', weight: '1.86 kg' },
    images: ['https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=500'],
    stock: 8, featured: true, rating: 4.6, reviewCount: 89,
    tags: ['dell', 'xps', 'oled', '4k', 'laptop']
  },
  {
    name: 'ASUS ROG Strix G16 Gaming', brand: 'ASUS', category: 'Laptop',
    price: 8500000, oldPrice: 9500000,
    description: 'PC gaming ultime avec RTX 4070 et écran 165Hz. Dominez vos adversaires.',
    specs: { processor: 'Intel Core i9-13980HX', ram: '32 Go DDR5', storage: '1 To SSD', display: '16" QHD 165Hz', gpu: 'NVIDIA RTX 4070 8Go', battery: 'Jusqu\'à 8h', os: 'Windows 11 Home', weight: '2.5 kg' },
    images: ['https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=500'],
    stock: 12, featured: true, rating: 4.7, reviewCount: 203,
    tags: ['asus', 'rog', 'gaming', 'rtx4070', 'laptop']
  },
  {
    name: 'HP Spectre x360 14"', brand: 'HP', category: 'Laptop',
    price: 7200000,
    description: 'Élégance et polyvalence avec design 2-en-1 convertible. Stylet inclus.',
    specs: { processor: 'Intel Core Ultra 7', ram: '16 Go LPDDR5', storage: '512 Go SSD', display: '14" OLED 2.8K Touch', gpu: 'Intel Arc', battery: 'Jusqu\'à 17h', os: 'Windows 11 Home', weight: '1.58 kg' },
    images: ['https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500'],
    stock: 6, featured: false, rating: 4.5, reviewCount: 67,
    tags: ['hp', 'spectre', '2en1', 'convertible']
  },
  {
    name: 'Lenovo ThinkPad X1 Carbon Gen 11', brand: 'Lenovo', category: 'Laptop',
    price: 8900000,
    description: 'La référence professionnelle. Léger, solide et certifié MIL-SPEC.',
    specs: { processor: 'Intel Core i7-1365U', ram: '16 Go LPDDR5', storage: '512 Go SSD', display: '14" IPS 2.8K', gpu: 'Intel Iris Xe', battery: 'Jusqu\'à 15h', os: 'Windows 11 Pro', weight: '1.12 kg' },
    images: ['https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=500'],
    stock: 10, featured: false, rating: 4.7, reviewCount: 156,
    tags: ['lenovo', 'thinkpad', 'professionnel', 'business']
  },
  {
    name: 'PC Gamer RTX 4090 Titan', brand: 'Custom', category: 'Desktop',
    price: 18000000,
    description: 'La bête ultime du gaming. RTX 4090 + i9 pour une expérience sans compromis.',
    specs: { processor: 'Intel Core i9-14900K', ram: '64 Go DDR5 6000MHz', storage: '2 To NVMe SSD', display: 'Non inclus', gpu: 'NVIDIA RTX 4090 24Go', os: 'Windows 11 Pro', weight: '15 kg' },
    images: ['https://images.unsplash.com/photo-1587202372583-49330a15584d?w=500'],
    stock: 3, featured: true, rating: 4.9, reviewCount: 42,
    tags: ['gaming', 'rtx4090', 'desktop', 'ultra']
  },
  {
    name: 'Mac Mini M2 Pro', brand: 'Apple', category: 'Desktop',
    price: 6500000, oldPrice: 7200000,
    description: 'Petit format, grande puissance. Parfait pour studio créatif.',
    specs: { processor: 'Apple M2 Pro 10 cœurs', ram: '16 Go RAM unifiée', storage: '512 Go SSD', gpu: 'GPU 16 cœurs', os: 'macOS Sonoma' },
    images: ['https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=500'],
    stock: 20, featured: false, rating: 4.6, reviewCount: 88,
    tags: ['apple', 'mac mini', 'm2', 'desktop']
  },
  {
    name: 'Moniteur Samsung Odyssey G7 32"', brand: 'Samsung', category: 'Moniteur',
    price: 3200000, oldPrice: 3800000,
    description: 'Écran gaming incurvé 1440p 240Hz. Immersion totale garantie.',
    specs: { display: '32" VA 1440p 240Hz', gpu: 'G-Sync + FreeSync' },
    images: ['https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500'],
    stock: 25, featured: true, rating: 4.7, reviewCount: 312,
    tags: ['samsung', 'moniteur', 'gaming', '240hz', 'incurvé']
  },
  {
    name: 'Clavier Mécanique Corsair K100', brand: 'Corsair', category: 'Accessoire',
    price: 850000,
    description: 'Clavier mécanique premium avec switches OPX optiques ultra-rapides.',
    specs: { processor: 'Switches OPX Optiques', display: 'RGB par touche' },
    images: ['https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500'],
    stock: 30, featured: false, rating: 4.5, reviewCount: 189,
    tags: ['corsair', 'clavier', 'mécanique', 'gaming', 'rgb']
  },
  {
    name: 'Souris Logitech MX Master 3S', brand: 'Logitech', category: 'Accessoire',
    price: 420000,
    description: 'La meilleure souris de productivité. Ergonomique et multi-appareils.',
    specs: { processor: '8000 DPI MagSpeed', ram: 'Batterie 70 jours' },
    images: ['https://images.unsplash.com/photo-1527814050087-3793815479db?w=500'],
    stock: 50, featured: false, rating: 4.8, reviewCount: 567,
    tags: ['logitech', 'souris', 'productivité', 'ergonomique']
  },
  {
    name: 'SSD Samsung 990 Pro 2To', brand: 'Samsung', category: 'Accessoire',
    price: 580000,
    description: 'SSD NVMe Gen 4 ultra-rapide. 7450 Mo/s en lecture.',
    specs: { storage: '2 To NVMe Gen4', processor: '7450 Mo/s lecture, 6900 Mo/s écriture' },
    images: ['https://images.unsplash.com/photo-1597852074816-d933c7d2b988?w=500'],
    stock: 40, featured: false, rating: 4.9, reviewCount: 234,
    tags: ['samsung', 'ssd', 'nvme', 'stockage']
  },
  {
    name: 'Casque Sony WH-1000XM5', brand: 'Sony', category: 'Accessoire',
    price: 620000, oldPrice: 750000,
    description: 'Réduction de bruit leader du marché. Son Hi-Res exceptionnel.',
    specs: { battery: '30h avec ANC', processor: 'Réduction bruit V1' },
    images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500'],
    stock: 22, featured: true, rating: 4.7, reviewCount: 445,
    tags: ['sony', 'casque', 'anc', 'sans fil', 'audio']
  }
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/venips-tech');
  await Product.deleteMany({});
  await Product.insertMany(products);
  console.log(`✅ ${products.length} produits insérés`);
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
