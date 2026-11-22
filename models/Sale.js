const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
  {
    // SEO
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true },
    description: { type: String, trim: true },
    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },

    // Visuals / theme
    bannerImage: { type: String },
    badgeText: { type: String, default: 'BIG SALE' },
    themeColor: { type: String, default: '#0E7F98' }, // teal default

    // Countdown
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    showCountdown: { type: Boolean, default: true },

    // Sirf manually selected products (discount wale Outlet mein hi rahenge)
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

    // CTA + control
    ctaText: { type: String, default: 'Shop the Sale' },
    ctaLink: { type: String, default: '/products' },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
  },
  { timestamps: true }
);

saleSchema.methods.isLive = function () {
  const now = Date.now();
  return (
    this.isActive &&
    new Date(this.startsAt).getTime() <= now &&
    new Date(this.endsAt).getTime() > now
  );
};

saleSchema.index({ isActive: 1, endsAt: 1 });

module.exports = mongoose.models.Sale || mongoose.model('Sale', saleSchema);