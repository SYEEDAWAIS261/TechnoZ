const express = require("express");

const router = express.Router();

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
router.post("/validate", validateCoupon);

module.exports = router;