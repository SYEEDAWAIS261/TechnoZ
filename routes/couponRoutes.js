const express = require("express");
const { rateLimit } = require("express-rate-limit");

const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

// Coupon codes ka andaza lagane (brute force) se bachao: 1 minute mein 10 koshishein
const couponLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many coupon attempts. Please wait a minute and try again." },
});

const {
  createCoupon,
  getCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  validateCoupon,

} = require("../controllers/couponController");

const adminMiddleware = require("../middleware/adminMiddleware");
const requirePermission = require("../middleware/permissionMiddleware");
// Admin: Create Coupon
router.post(
  "/",
  adminMiddleware,
  requirePermission("coupons.create"),
  createCoupon
);

// Admin: Get All Coupons
router.get(
  "/",
  adminMiddleware,
  requirePermission("coupons.view"),
  getCoupons
);

// Admin: Get Single Coupon
router.get(
  "/:id",
  adminMiddleware,
  requirePermission("coupons.view"),
  getCouponById
);


// Admin: Update Coupon
router.put(
  "/:id",
  adminMiddleware,
  requirePermission("coupons.edit"),
  updateCoupon
);

// Admin: Delete Coupon
router.delete(
  "/:id",
  adminMiddleware,
  requirePermission("coupons.delete"),
  deleteCoupon
);

// Customer: Validate / Apply Coupon
router.post("/validate", authMiddleware, couponLimiter, validateCoupon);

module.exports = router;