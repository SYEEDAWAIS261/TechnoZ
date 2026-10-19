const mongoose = require("mongoose");

const promotionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    subtitle: {
      type: String,
      required: true,
    },

    badge: {
      type: String,
      default: "Featured Promotion",
    },

    theme: {
      type: String,
      enum: ["purple", "blue", "light", "dark", "gaming"],
      default: "blue",
    },

    image: {
      type: String,
      required: true,
    },

    link: {
      type: String,
      default: "/products",
    },

    displayOrder: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    productIds: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: "Product",
}],
    expiryDate:{
      type: Date,
      default: null
    },
        slug: {
      type: String,
      unique: true,
      sparse: true,   // purani promotions (jinke paas slug nahi) duplicate-key error na dein
      index: true,
      lowercase: true,
      trim: true,
    },
  },
  { timestamps: true }
);

const { slugify } = require("../utils/slugify");

// Product model jaisa hi — agar "black-friday" pehle se hai to "black-friday-2" ban jayega.
promotionSchema.statics.generateUniqueSlug = async function (name, excludeId = null) {
  const base = slugify(name) || "promotion";
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

module.exports = mongoose.model("Promotion", promotionSchema);