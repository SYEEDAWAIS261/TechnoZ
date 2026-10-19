// utils/orderBuilder.js
// Order ka poora hisaab yahin hota hai (COD aur Stripe dono isi ko use karte hain).
// Client se kabhi price, total ya shippingCost nahi liya jata.

const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { getUnitPricing, round2, SHIPPING_METHODS } = require('./pricing');

/**
 * User ka cart DB se padh kar order ke items, subtotal, tax aur total banata hai.
 * Stock sirf check hota hai (kam nahi hota). Kam karne ke liye reserveStock() use karein.
 * Kuch galat ho to { error: "message" } wapas aata hai.
 */
const buildOrderFromCart = async (userId, shippingMethod) => {
  if (!Object.prototype.hasOwnProperty.call(SHIPPING_METHODS, shippingMethod)) {
    return { error: 'Invalid shipping method' };
  }

  const cartDocs = await Cart.find({ user: userId }).populate('product');
  if (cartDocs.length === 0) return { error: 'Your cart is empty' };

  const items = [];
  let subtotal = 0;

  for (const doc of cartDocs) {
    if (!doc.product) {
      return { error: 'A product in your cart is no longer available. Please refresh your cart.' };
    }

      // Sale khatam ho chuki ho to discount nahi lagega (sirf memory mein, product save nahi hota)
    if (Product.isSaleOver(doc.product)) {
      doc.product.discountPercentage = 0;
      doc.product.discountPrice = null;
    }

    const p = getUnitPricing(doc.product, doc.selectedVariation?.id);
    const name = doc.product.name;

    if (!p.valid) {
      return { error: `${name}: please select the variation again` };
    }
    if (doc.quantity > p.stock) {
      const label = p.variation ? ` (${p.variation.label})` : '';
      return { error: `${name}${label}: only ${p.stock} left in stock` };
    }

    subtotal += p.unit * doc.quantity;

    items.push({
      productId: doc.product._id,
      productName: name,
      productImage: doc.product.image,
      quantity: doc.quantity,
      priceAtOrder: p.unit,                 // discount ke baad poori unit price (variation samet)
      originalPriceAtOrder: p.originalUnit, // discount se pehle
     selectedVariation: p.variation
  ? {
      id: String(p.variation._id),
      ram: p.variation.ram || null,
      storage: p.variation.storage || null,
      label: p.variation.label || null,
      price: Number(p.variation.price) || 0,
    }
  : undefined,
      variationId: p.variation ? p.variation._id : null, // sirf stock ke liye, order mein save nahi hota
    });
  }

  subtotal = round2(subtotal);
  const shippingCost = SHIPPING_METHODS[shippingMethod];
  const total = round2(subtotal + shippingCost);

  return { items, subtotal, shippingCost, shippingMethod, total };
};

/**
 * Stock atomic tareeqe se kam karta hai. Do log ek saath aakhri piece nahi khareed sakte.
 * Kisi ek item mein masla ho to pehle kam kiya hua stock wapas kar deta hai.
 */
const reserveStock = async (items) => {
  const done = [];

  for (const it of items) {
    const qty = Number(it.quantity);
    const filter = { _id: it.productId, quantity: { $gte: qty } };
    const update = { $inc: { quantity: -qty } };

    if (it.variationId) {
      filter.variations = { $elemMatch: { _id: it.variationId, quantity: { $gte: qty } } };
      update.$inc['variations.$.quantity'] = -qty;
    }

    const result = await Product.updateOne(filter, update);

    if (result.modifiedCount !== 1) {
      await releaseStock(done);
      return { ok: false, error: `${it.productName} just went out of stock` };
    }
    done.push(it);
  }

  return { ok: true, done };
};

/** reserveStock ka undo (order save fail ho ya payment refund ho to). */
const releaseStock = async (items) => {
  for (const it of items) {
    const qty = Number(it.quantity);
    const filter = { _id: it.productId };
    const inc = { quantity: qty };

    if (it.variationId) {
      filter['variations._id'] = it.variationId;
      inc['variations.$.quantity'] = qty;
    }
    await Product.updateOne(filter, { $inc: inc });
  }
};

/**
 * Address ke zaroori fields check karta hai. Stripe se PEHLE aur stock reserve karne se PEHLE
 * chalana zaroori hai, warna paisa kat jata hai aur order save nahi hota.
 * postalCode zaroori nahi (UAE mein aam taur par nahi hota).
 */
const REQUIRED_ADDRESS_FIELDS = [
  ['fullName', 'full name'],
  ['phone', 'phone number'],
  ['street', 'street address'],
  ['city', 'city'],
  ['country', 'country'],
];

const validateShippingAddress = (addr) => {
  if (!addr || typeof addr !== 'object') return 'Shipping address is required';
  for (const [key, label] of REQUIRED_ADDRESS_FIELDS) {
    if (!String(addr[key] ?? '').trim()) return `Please enter your ${label}`;
  }
  return null;
};

module.exports = { buildOrderFromCart, reserveStock, releaseStock, validateShippingAddress };