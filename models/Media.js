const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema(
  {
    // "/uploads/media/lenovo-loq-15-lq8x2k.webp" — hamesha "/" se shuru
    url: { type: String, required: true, unique: true, trim: true },
    filename: { type: String, required: true, trim: true },
    originalName: { type: String, default: "", trim: true },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 }, // bytes

    // Image kis folder mein hai (purani images apne purane folder mein hi rehti hain)
    folder: {
      type: String,
      enum: ["media", "products", "deals", "promotions", "articles"],
      default: "media",
      index: true,
    },

    // Default SEO: library se select karte waqt form mein pre-fill hota hai
    alt: { type: String, default: "", trim: true, maxlength: 160 },
    title: { type: String, default: "", trim: true, maxlength: 160 },
    caption: { type: String, default: "", trim: true, maxlength: 300 },
    description: { type: String, default: "", trim: true, maxlength: 500 },

    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

mediaSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Media", mediaSchema);