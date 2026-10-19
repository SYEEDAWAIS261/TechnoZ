// utils/couponHelper.js
// Coupon ka hisaab server par (COD wale createOrder jaisa hi). Client ki bheji price kabhi use nahi hoti.

const Coupon = require("../models/Coupon");
const CouponUsage = require("../models/CouponUsage");
const User = require("../models/User");

/**
 * Coupon check karke discount nikalta hai.
 * items = buildOrderFromCart() ke items (server-side priceAtOrder ke saath)
 * Wapas: { couponCode, couponDiscount }  ya  { error: "message" }
 * Coupon na diya ho to { couponCode: null, couponDiscount: 0 }
 */
const computeCouponDiscount = async ({ code, userId, items }) => {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return { couponCode: null, couponDiscount: 0 };

  const user = await User.findById(userId).select("email");
  if (!user?.email) return { error: "User email is required to apply coupon." };

  const coupon = await Coupon.findOne({ code: clean });
  if (!coupon) return { error: "Invalid coupon code." };
  if (!coupon.isActive) return { error: "This coupon is inactive." };
  if (new Date(coupon.expiryDate) <= new Date()) return { error: "This coupon has expired." };

  const usage = await CouponUsage.findOne({
    coupon: coupon._id,
    email: user.email.trim().toLowerCase(),
  });
  if ((usage?.usageCount || 0) >= coupon.usageLimitPerEmail) {
    return { error: "You have reached the usage limit for this coupon." };
  }

  // Sirf eligible products ka subtotal (server ki prices se)
  let eligibleSubtotal = 0;
  for (const item of items) {
    const eligible =
      !coupon.applicableProducts?.length ||
      coupon.applicableProducts.some((id) => String(id) === String(item.productId));
    if (eligible) eligibleSubtotal += Number(item.priceAtOrder) * Number(item.quantity);
  }
  eligibleSubtotal = Number(eligibleSubtotal.toFixed(2));

  if (eligibleSubtotal <= 0) {
    return { error: "This coupon does not apply to the products in your cart." };
  }

  let discount =
    coupon.discountType === "percentage"
      ? eligibleSubtotal * (coupon.discountValue / 100)
      : coupon.discountValue;

  discount = Math.min(discount, eligibleSubtotal);
  discount = Number(discount.toFixed(2));

  return { couponCode: clean, couponDiscount: discount };
};

/** Order save hone ke BAAD coupon ka istemal +1 karta hai */
const recordCouponUsage = async ({ code, userId }) => {
  if (!code) return;
  const user = await User.findById(userId).select("email");
  if (!user?.email) return;
  const coupon = await Coupon.findOne({ code });
  if (!coupon) return;

  await CouponUsage.findOneAndUpdate(
    { coupon: coupon._id, email: user.email.trim().toLowerCase() },
    { $inc: { usageCount: 1 } },
    { upsert: true, new: true }
  );
};

module.exports = { computeCouponDiscount, recordCouponUsage };