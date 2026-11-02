const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema(
  {
    // Cloudinary: "https://res.cloudinary.com/<cloud>/image/upload/v.../technoz/media/x.webp"
    // Purani local: "/uploads/media/x.webp"
    url: { type: String, required: true, unique: true, trim: true },
    publicId: { type: String, default: "", trim: true }, // Cloudinary ID (delete ke liye)
    filename: { type: String, required: true, trim: true },
    originalName: { type: String, default: "", trim: true },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 }, // bytes
    width: { type: Number, default: null },
    height: { type: Number, default: null },

    // Image kis folder mein hai
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