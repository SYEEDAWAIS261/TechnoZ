// models/Order.js
const mongoose = require('mongoose');
const Counter = require('./Counter');

const orderSchema = new mongoose.Schema({
    orderNumber: { type: String, unique: true, sparse: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  products: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },

      // Order ke waqt ka snapshot: baad mein product badle ya delete ho to bhi order sahi rahe
      productName: { type: String },
      productImage: { type: String },

      quantity: { type: Number, required: true },
      partNumber: { type: String, default: "" },
      serialNumbers: [{ type: String, trim: true }],
      // Order ke waqt ki poori unit price (discount ke baad, variation samet)
      priceAtOrder: { type: Number, required: true },

      // Discount se pehle ki unit price (email / invoice ki savings ke liye)
      originalPriceAtOrder: { type: Number, default: 0 },

      selectedVariation: {
  id: { type: String },
  ram: { type: String, default: null },
  storage: { type: String, default: null },
  label: { type: String, default: null }, // old orders compatibility
  price: { type: Number, default: 0 },
},
    },
  ],
  subtotal: { type: Number, default: 0 },

// Coupon details
couponCode: { type: String, default: null },
couponDiscount: { type: Number, default: 0 },

total: { type: Number, required: true },
  stripeSessionId: {
    type: String,
    unique: true,
    sparse: true,
  },

  // SHIPPING DETAILS
  shippingMethod: { type: String, default: 'Standard Shipping' },
  shippingCost: { type: Number, default: 0 },
  paymentMethod: { type: String, default: 'Cash on Delivery' },
  trackingId: { type: String, unique: true, index: true },

  status: {
    type: String,
        enum: ['Placed', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
    default: 'Placed',
  },

  // Status History (Great for tracking progress)
  statusHistory: [
    {
      status: String,
      timestamp: { type: Date, default: Date.now },
      comment: String,
    },
  ],

  // Important Timestamps
  deliveredAt: { type: Date },
  cancelledAt: { type: Date },
  cancelledBy: { type: String, enum: ['customer', 'admin'] },
  statusUpdatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },

  shippingAddress: {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String },
    postalCode: { type: String }, // UAE mein postal code aam nahi hota, is liye optional
    country: { type: String, required: true },
  },
    billingAddress: {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String },
    postalCode: { type: String },
    country: { type: String, required: true },
  },
  // RETURN REQUEST (poore order ki wapsi)
  returnRequest: {
    status: { type: String, enum: ['Requested', 'Approved', 'Rejected', 'Received', 'Refunded'] },
    reason: { type: String },
    comment: { type: String },
    adminNote: { type: String },
    refundAmount: { type: Number },
    requestedAt: { type: Date },
    updatedAt: { type: Date },
    refundedAt: { type: Date },
  },
  // Soft delete for users
  hiddenForUser: {
    type: Boolean,
    default: false,
  },
});
orderSchema.pre('save', async function (next) {
  if (!this.isNew || this.orderNumber) return next();
  try {
    const counter = await Counter.findByIdAndUpdate(
      'order',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.orderNumber = `TZ-${counter.seq}`;
    next();
  } catch (err) {
    next(err);
  }
});
module.exports = mongoose.model('Order', orderSchema);