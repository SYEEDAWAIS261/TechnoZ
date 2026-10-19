const mongoose = require("mongoose");
const Promotion = require("../models/Promotion");
const { ensureMedia, registerUploads } = require("../services/mediaService");
const Product = require("../models/Product");

// Promotion ki expiry uske products ki sale ki expiry hai.
// Promotion se nikale gaye products ki sale usi waqt khatam ho jati hai.
const syncSaleWindow = async (promo) => {
  const ids = (promo.productIds || []).map((p) => p._id || p);
  const now = new Date();

  if (ids.length) {
    await Product.updateMany(
      { _id: { $in: ids } },
      { $set: { saleEndsAt: promo.expiryDate || null, salePromotion: promo._id } }
    );
  }
  await Product.updateMany(
    { salePromotion: promo._id, _id: { $nin: ids } },
    { $set: { saleEndsAt: now, salePromotion: null } }
  );
};

const normalize = async (req) => {
  const body = { ...req.body };

  // Banner: nayi file ya Media Library se chuni hui image
  if (req.file) {
    body.image = `/uploads/promotions/${req.file.filename}`;
    registerUploads([req.file], "promotions").catch((e) =>
      console.error("Media library register failed:", e.message)
    );
  } else if (body.image) {
    const url = await ensureMedia(body.image);
    if (url) body.image = url;
    else delete body.image;
  }

  if (typeof body.productIds === "string") {
    try { body.productIds = JSON.parse(body.productIds); } catch { body.productIds = []; }
  }
  return body;
};
// Get All Promotions
exports.getPromotions = async (req, res) => {
  try {
    const promotions = await Promotion.find()
      .populate("productIds")
      .sort({ displayOrder: 1, createdAt: -1 });

    res.json(promotions);
  } catch (err) {
    res.status(500).json({
      message: "Error fetching promotions",
      error: err.message,
    });
    console.error("Promotion fetch failed:", err);
  }
};

// Get Active Promotions
exports.getActivePromotions = async (req, res) => {
  try {
   const promotions = await Promotion.find({
  isActive: true,
  $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }]
}).populate("productIds").sort({ displayOrder: 1 });

    res.json(promotions);
  } catch (err) {
    res.status(500).json({
      message: "Error fetching active promotions",
      error: err.message,
    });
  }
};

// Create Promotion
exports.createPromotion = async (req, res) => {
  try {
        const data = await normalize(req);
    data.slug = await Promotion.generateUniqueSlug(data.slug || data.title);
    const promotion = new Promotion(data);
    await promotion.save();
    await syncSaleWindow(promotion);
    res.status(201).json(promotion);
  } catch (err) {
    res.status(400).json({ message: "Error creating promotion", error: err.message });
  }
};

// Update Promotion
exports.updatePromotion = async (req, res) => {
  try {
        const data = await normalize(req);
    const current = await Promotion.findById(req.params.id).select("slug").lean();
    if (!current) return res.status(404).json({ message: "Promotion not found" });

    // Slug jaan bujh kar stable rakha gaya hai. Title badalne par slug nahi badalta,
    // warna pehle se share ki hui aur Google mein index hui links toot jayengi.
    // Admin explicitly slug bheje to hi badlega (aur tab purani URL ka redirect
    // lagana aapki zimmedari hai).
    if (data.slug) {
      data.slug = await Promotion.generateUniqueSlug(data.slug, req.params.id);
    } else if (!current.slug) {
      data.slug = await Promotion.generateUniqueSlug(data.title || "promotion", req.params.id);
    } else {
      delete data.slug;
    }

    const promotion = await Promotion.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    await syncSaleWindow(promotion);
    res.json(promotion);
  } catch (err) {
    res.status(400).json({ message: "Error updating promotion", error: err.message });
  }
};
// Delete Promotion
exports.deletePromotion = async (req, res) => {
  try {
     const promotion = await Promotion.findByIdAndDelete(req.params.id);
    if (!promotion) return res.status(404).json({ message: "Promotion not found" });

    // Promotion delete = uski sale khatam. Expired promotion delete karne se purana discount wapas zinda nahi hoga.
    const now = new Date();
    await Product.updateMany(
      { salePromotion: promotion._id, ...Product.saleActiveFilter(now) },
      { $set: { saleEndsAt: now } }
    );
    await Product.updateMany({ salePromotion: promotion._id }, { $set: { salePromotion: null } });
    res.json({ message: "Promotion deleted successfully" });
  } catch (err) {
    console.error("Promotion delete failed:", err);
    res.status(400).json({ message: "Error deleting promotion", error: err.message });
  }
};

// Public: ek promotion + uske products (/deals/:slug page ke liye).
// Slug aur purani ObjectId dono qubool karta hai, taake pehle se share ki hui
// id-wali links 404 na dein.
exports.getPromotionPublic = async (req, res) => {
  try {
    const key = req.params.slug;

    const matchers = [{ slug: String(key).toLowerCase() }];
    if (mongoose.Types.ObjectId.isValid(key)) matchers.push({ _id: key });

    const promo = await Promotion.findOne({
      isActive: true,
      $and: [
        { $or: matchers },
        { $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }] },
      ],
    }).populate("productIds");

    if (!promo) {
      return res.status(404).json({ message: "Promotion not found or expired" });
    }
    res.json(promo);
  } catch (err) {
    res.status(400).json({ message: "Error fetching promotion", error: err.message });
  }
};