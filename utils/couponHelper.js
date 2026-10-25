// utils/couponHelper.js
// Coupon ka poora hisaab SIRF yahin hota hai.
// Cart page, Checkout, COD order aur Stripe sab isi file ko use karte hain.

const Cart = require("../models/Cart");
const Coupon = require("../models/Coupon");
const CouponUsage = require("../models/CouponUsage");
const User = require("../models/User");
const { getUnitPricing, round2 } = require("./pricing");

const normCode = (code) => String(code || "").trim().toUpperCase();
const normEmail = (email) => String(email || "").trim().toLowerCase();

// usageLimitPerEmail khali ya 0 ho = koi had nahi
const getLimit = (coupon) => {
  const n = Number(coupon.usageLimitPerEmail);
  return n > 0 ? n : Infinity;
};

const getUserEmail = async (userId) => {
  const user = await User.findById(userId).select("email").lean();
  return normEmail(user?.email);
};

// Customer ki DB wali cart, server ki prices ke saath (frontend ki price kabhi nahi)
const loadPricedCart = async (userId) => {
  const docs = await Cart.find({ user: userId }).populate("product");
  const items = [];
  for (const doc of docs) {
    if (!doc.product) continue; // product delete ho chuka
    const p = getUnitPricing(doc.product, doc.selectedVariation?.id);
    if (!p.valid) continue;
    items.push({
      productId: doc.product._id,
      priceAtOrder: p.unit,
      quantity: Number(doc.quantity) || 0,
    });
  }
  return items;
};

/**
 * Coupon check + discount ka hisaab.
 * items = server ke banaye items ({ productId, priceAtOrder, quantity })
 * Wapas: { error } ya { coupon, couponCode, couponDiscount, eligibleSubtotal, remainingUses }
 */
const computeCouponDiscount = async ({ code, userId, items }) => {
  const couponCode = normCode(code);
  if (!couponCode) return { couponCode: null, couponDiscount: 0 };
  if (couponCode.length > 40) return { error: "Invalid coupon code." };

  const email = await getUserEmail(userId);
  if (!email) return { error: "Please log in to use a coupon." };

  const coupon = await Coupon.findOne({ code: couponCode }).lean();
  if (!coupon) return { error: "Invalid coupon code." };
  if (!coupon.isActive) return { error: "This coupon is inactive." };
  if (coupon.expiryDate && new Date(coupon.expiryDate) <= new Date()) {
    return { error: "This coupon has expired." };
  }

  const usage = await CouponUsage.findOne({ coupon: coupon._id, email })
    .select("usageCount")
    .lean();
  const used = usage?.usageCount || 0;
  const limit = getLimit(coupon);
  if (used >= limit) {
    return { error: "You have reached the usage limit for this coupon." };
  }

  // Sirf wo products jin par coupon lagta hai (list khali = sab products)
  const allowed = new Set((coupon.applicableProducts || []).map(String));
  let eligibleSubtotal = 0;
  for (const it of items || []) {
    if (allowed.size === 0 || allowed.has(String(it.productId))) {
      eligibleSubtotal += Number(it.priceAtOrder) * Number(it.quantity);
    }
  }
  eligibleSubtotal = round2(eligibleSubtotal);
  if (eligibleSubtotal <= 0) {
    return { error: "This coupon does not apply to the products in your cart." };
  }

  const value = Number(coupon.discountValue) || 0;
  let discount =
    coupon.discountType === "percentage"
      ? eligibleSubtotal * (Math.min(value, 100) / 100)
      : value;
  discount = round2(Math.max(0, Math.min(discount, eligibleSubtotal)));

  return {
    coupon,
    couponCode,
    couponDiscount: discount,
    eligibleSubtotal,
    remainingUses: limit === Infinity ? null : limit - used,
  };
};

/**
 * Coupon ka istemal +1, ATOMIC tareeqe se.
 * Do orders ek hi waqt aayein to had se zyada kabhi nahi barhega.
 * Wapas: { ok: true } ya { ok: false, error }
 */
const claimCouponUsage = async ({ code, userId }) => {
  const couponCode = normCode(code);
  if (!couponCode) return { ok: true };

  const [coupon, email] = await Promise.all([
    Coupon.findOne({ code: couponCode }).select("_id usageLimitPerEmail").lean(),
    getUserEmail(userId),
  ]);
  if (!coupon || !email) return { ok: false, error: "Invalid coupon code." };

  const limit = getLimit(coupon);
  const filter = { coupon: coupon._id, email };
  if (limit !== Infinity) filter.usageCount = { $lt: limit };

  try {
    await CouponUsage.findOneAndUpdate(
      filter,
      { $inc: { usageCount: 1 } },
      { upsert: true, new: true }
    );
    return { ok: true };
  } catch (err) {
    // Had poori: filter match nahi hua, upsert ne duplicate banana chaha, unique index ne roka
    if (err.code === 11000) {
      return { ok: false, error: "You have reached the usage limit for this coupon." };
    }
    throw err;
  }
};

// Order fail ya cancel ho to istemal wapas (-1, kabhi 0 se neeche nahi)
const releaseCouponUsage = async ({ code, userId }) => {
  const couponCode = normCode(code);
  if (!couponCode) return;

  const [coupon, email] = await Promise.all([
    Coupon.findOne({ code: couponCode }).select("_id").lean(),
    getUserEmail(userId),
  ]);
  if (!coupon || !email) return;

  await CouponUsage.updateOne(
    { coupon: coupon._id, email, usageCount: { $gt: 0 } },
    { $inc: { usageCount: -1 } }
  );
};

module.exports = {
  loadPricedCart,
  computeCouponDiscount,
  claimCouponUsage,
  releaseCouponUsage,
};