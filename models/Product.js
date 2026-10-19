const mongoose = require("mongoose");

// Sale ki tareekh guzar chuki ho to true (saleEndsAt khaali = sale ki koi expiry nahi)
const isSaleOver = (p, now = Date.now()) =>
  !!p?.saleEndsAt && new Date(p.saleEndsAt).getTime() <= now;

// ✅ Review Schema
const reviewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    comment: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userImage: { type: String, default: "" },
    isFeatured: { type: Boolean, default: false },

    // Overall rating (yeh required hai)
    rating: { type: Number, required: true, min: 1, max: 5 },

    // Sub-criteria (optional — user chahe to skip kar sakta hai)
    ratings: {
      value:      { type: Number, min: 0, max: 5, default: 0 }, // Value for money
      durability: { type: Number, min: 0, max: 5, default: 0 }, // Build quality
      delivery:   { type: Number, min: 0, max: 5, default: 0 }, // Delivery speed
    },
        pros: { type: String, default: "", maxlength: 300 },
    cons: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: true }
);

// ✅ Main Product Schema
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    brand: { type: String, required: true }, // required kar diya dropdown ke liye
    description: { type: String, required: true },
    category: { type: String, required: true }, // dropdown ke liye required
   price: { type: Number, required: true, default: 0, min: 0 },
    quantity: { type: Number, required: true, default: 0, min: 0 },
    
    returnPolicy: {
    type: String,
    default: "14 Days" // Aap default value bhi set kar sakte hain
  },
  shippingDetails: {
    type: String,
    default: "Free in UAE"
  },

  // Images + SEO Metadata
image: { type: String },

images: [
  {
    url: { type: String, required: true },
    alt: { type: String, default: "", trim: true },
    title: { type: String, default: "", trim: true },
    caption: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
  }
],
    // ✅ Technical Details (Dropdown selections)
    processor: { type: String },
    partNumber: { type: String, default: "", trim: true }, // ek model ka ek P/N
    sku: { type: String, trim: true, uppercase: true }, // poore catalog mein unique
    ram: { type: String },
    storage: { type: String },
    display: { type: String },

    // ✅ Specifications Table
    specifications: [
      {
        label: { type: String }, 
        value: { type: String }  
      }
    ],

    // ✅ FAQs Section
    faqs: [
      {
        question: { type: String },
        answer: { type: String }
      }
    ],

    // ✅ Variations (e.g., RAM/SSD upgrades)
   variations: [
    {
    sku: { type: String, trim: true, uppercase: true }, // har variation ka apna
    ram: { type: String, trim: true },
    storage: { type: String, trim: true },
    label: { type: String, trim: true }, // Keep for old products/cart compatibility
    price: { type: Number, min: 0 },
    quantity: { type: Number, default: 0, min: 0 }
  }
],

    flashSale: {
    isActive: { type: Boolean, default: false },
    discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
    endsAt: { type: Date, default: null },
},

    // ✅ Key Features (Bullet points)
    keyFeatures: [{ type: String }], // Array of strings

    productType: { type: String, enum: ["simple", "variable"], default: "simple" },
    // ✅ Product Condition
    condition: { 
      type: String, 
     enum: ['new', 'open box', 'refurbished', 'used', 'renewed'],
      lowercase: true, // 👈 Automatic lowercase handles all variations
      default: 'new' 
    },

    // 💰 Discount System
    discountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    discountPrice: { type: Number, default: null },

    // ✨ Banner/Hero Product Info
    isBannerProduct: { type: Boolean, default: false },
    bannerTitle: { type: String, default: "" },
     expiryDate: { type: Date }, // Countdown timer ke liye

    // ⏳ Discount kab tak chalega (promotion se aata hai). null = koi expiry nahi
    saleEndsAt: { type: Date, default: null },
    salePromotion: { type: mongoose.Schema.Types.ObjectId, ref: "Promotion", default: null },

    // 🌟 Ratings & Reviews
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    numReviews: {
      type: Number,
      default: 0,
    },
        ratingBreakdown: {
      value:      { type: Number, default: 0 },
      durability: { type: Number, default: 0 },
      delivery:   { type: Number, default: 0 },
    },
        ratingDistribution: {
      star5: { type: Number, default: 0 },
      star4: { type: Number, default: 0 },
      star3: { type: Number, default: 0 },
      star2: { type: Number, default: 0 },
      star1: { type: Number, default: 0 },
    },
    reviews: [reviewSchema],

        slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    productTags: [
  {
    type: String,
    trim: true,
    lowercase: true,
  }
],
    seoTitle: { type: String, default: "", trim: true, maxlength: 120 },
    seoDescription: { type: String, default: "", trim: true, maxlength: 200 },
    focusKeyword: { type: String, default: "", trim: true, lowercase: true },
    // 🎯 Sale info
    offerMessage: { type: String, default: "" },
    onSale: { type: Boolean, default: false },

  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      // Sale khatam ho chuki ho to API discount 0 bheje: card, product page, cart, deal page sab regular price dikhayenge
      transform: (doc, ret) => {
        if (isSaleOver(ret)) {
          ret.discountPercentage = 0;
          ret.discountPrice = null;
        }
        return ret;
      },
    },
    toObject: { virtuals: true }
  },
);

// 🧮 Virtual field: Final Price Calculation
productSchema.virtual("finalPrice").get(function () {
  if (isSaleOver(this)) return this.price;
  if (this.discountPercentage > 0) {
    return parseFloat((this.price - (this.price * this.discountPercentage) / 100).toFixed(2));
  }
  return this.discountPrice || this.price;
});
// 🧮 Ratings recalculation (reviews add/update/delete hone par chalta hai)
productSchema.methods.recalculateRatings = function () {
  const reviews = this.reviews || [];
  this.numReviews = reviews.length;

    if (!reviews.length) {
    this.rating = 0;
    this.ratingBreakdown = { value: 0, durability: 0, delivery: 0 };
    this.ratingDistribution = { star5: 0, star4: 0, star3: 0, star2: 0, star1: 0 };
    return;
  }

  // Sirf un reviews ka average jinme wo criteria diya gaya ho (0 wale skip)
  const avg = (pick) => {
    const list = reviews.map(pick).filter((v) => Number(v) > 0);
    if (!list.length) return 0;
    return +(list.reduce((a, b) => a + Number(b), 0) / list.length).toFixed(2);
  };

  this.rating = avg((r) => r.rating);
  this.ratingBreakdown = {
    value:      avg((r) => r.ratings?.value),
    durability: avg((r) => r.ratings?.durability),
    delivery:   avg((r) => r.ratings?.delivery),
  };

   const dist = { star5: 0, star4: 0, star3: 0, star2: 0, star1: 0 };
  reviews.forEach((r) => {
    const key = `star${Math.round(Number(r.rating))}`;
    if (dist[key] !== undefined) dist[key] += 1;
  });
  this.ratingDistribution = dist;
};

// 🔗 Unique slug generator
const { slugify } = require("../utils/slugify");

productSchema.statics.generateUniqueSlug = async function (name, excludeId = null) {
  const base = slugify(name) || "product";
  let slug = base;
  let counter = 2;

  while (true) {
    const query = { slug };
    if (excludeId) query._id = { $ne: excludeId };

    const exists = await this.findOne(query).select("_id").lean();
    if (!exists) return slug;

    slug = `${base}-${counter}`;
    counter += 1;
  }
};

// 🔎 Indexes — facet aggregation aur filtering in fields par chalti hai.
// Inke bina 500+ products par har filter click slow ho jayega.
productSchema.index({ brand: 1 });
productSchema.index({ category: 1 });
productSchema.index({ condition: 1 });
productSchema.index({ price: 1 });
productSchema.index({ discountPercentage: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ quantity: 1 });
productSchema.index({ focusKeyword: 1 });
productSchema.index({ productTags: 1 });
productSchema.index({ saleEndsAt: 1 });
productSchema.index({ salePromotion: 1 });

productSchema.statics.isSaleOver = isSaleOver;
// Query filter: sirf wo products jinki sale abhi chal rahi hai
productSchema.statics.saleActiveFilter = (now = new Date()) => ({
  $or: [{ saleEndsAt: null }, { saleEndsAt: { $gt: now } }],
});
// SKU unique: product aur variations dono (khaali SKU index mein nahi aata)
productSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: { sku: { $gt: "" } } });
productSchema.index(
  { "variations.sku": 1 },
  { unique: true, partialFilterExpression: { "variations.sku": { $gt: "" } } }
);
module.exports = mongoose.model("Product", productSchema);
