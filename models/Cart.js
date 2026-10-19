const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, default: 1, required: true },
selectedVariation: {
  id: { type: String, default: null },
  ram: { type: String, default: null },
  storage: { type: String, default: null },
  label: { type: String, default: null }, // old cart compatibility
  price: { type: Number, default: 0 }
}
}, { timestamps: true });

module.exports = mongoose.models.Cart || mongoose.model('Cart', cartSchema);