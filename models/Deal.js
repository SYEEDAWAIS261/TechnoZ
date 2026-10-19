const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema(
  {
    // SEO essentials
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true },
    description: { type: String, trim: true },
    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },

    // Visuals
    bannerImage: { type: String, required: true },
    badgeText: { type: String, default: 'DEAL' },

    // Countdown
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },

    // Linked content
    ctaText: { type: String, default: 'Shop Now' },
    ctaLink: { type: String, default: '/products' },
    secondaryCtaText: { type: String },
    secondaryCtaLink: { type: String },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    discountPercentage: { type: Number, default: 0 },
    category: { type: String },

    // Admin control
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
  },
  { timestamps: true }
);

dealSchema.methods.isLive = function () {
  const now = Date.now();
  return (
    this.isActive &&
    new Date(this.startsAt).getTime() <= now &&
    new Date(this.endsAt).getTime() > now
  );
};

dealSchema.index({ isActive: 1, endsAt: 1 });

module.exports = mongoose.models.Deal || mongoose.model('Deal', dealSchema);