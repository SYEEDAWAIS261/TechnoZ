const Coupon = require("../models/Coupon");
const CouponUsage = require("../models/CouponUsage");
// Create Coupon
const { loadPricedCart, computeCouponDiscount } = require("../utils/couponHelper");
const { round2 } = require("../utils/pricing");
const createCoupon = async (req, res) => {
  try {
    const {
      code,
      title,
      description,
      discountType,
      discountValue,
      expiryDate,
      usageLimitPerEmail,
      applicableProducts,
    } = req.body;

    if (
      !code ||
      !title ||
      !discountType ||
      discountValue === undefined ||
      !expiryDate
    ) {
      return res.status(400).json({
        message: "Please provide all required coupon fields.",
      });
    }

    const existingCoupon = await Coupon.findOne({
      code: code.trim().toUpperCase(),
    });

    if (existingCoupon) {
      return res.status(400).json({
        message: "Coupon code already exists.",
      });
    }

    if (!["percentage", "fixed"].includes(discountType)) {
      return res.status(400).json({
        message: "Invalid discount type.",
      });
    }

    if (discountValue < 0) {
      return res.status(400).json({
        message: "Discount value cannot be negative.",
      });
    }

    if (discountType === "percentage" && discountValue > 100) {
      return res.status(400).json({
        message: "Percentage discount cannot exceed 100%.",
      });
    }

    const coupon = await Coupon.create({
      code: code.trim().toUpperCase(),
      title: title.trim(),
      description: description?.trim() || "",
      discountType,
      discountValue,
      expiryDate,
      usageLimitPerEmail: usageLimitPerEmail || 1,
      applicableProducts: applicableProducts || [],
    });

    res.status(201).json({
      message: "Coupon created successfully.",
      coupon,
    });
  } catch (error) {
    console.error("Create coupon error:", error);

    res.status(500).json({
      message: "Failed to create coupon.",
      error: error.message,
    });
  }
};

// Get All Coupons
const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .populate("applicableProducts", "name price")
      .sort({ createdAt: -1 });

    res.status(200).json({
      coupons,
    });
  } catch (error) {
    console.error("Get coupons error:", error);

    res.status(500).json({
      message: "Failed to fetch coupons.",
      error: error.message,
    });
  }
};

// Get Single Coupon
const getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id).populate(
      "applicableProducts",
      "name price"
    );

    if (!coupon) {
      return res.status(404).json({
        message: "Coupon not found.",
      });
    }

    res.status(200).json({
      coupon,
    });
  } catch (error) {
    console.error("Get coupon error:", error);

    res.status(500).json({
      message: "Failed to fetch coupon.",
      error: error.message,
    });
  }
};

// Update Coupon
const updateCoupon = async (req, res) => {
  try {
    const {
      code,
      title,
      description,
      discountType,
      discountValue,
      expiryDate,
      usageLimitPerEmail,
      applicableProducts,
      isActive,
    } = req.body;

    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        message: "Coupon not found.",
      });
    }

    if (code) {
      const existingCoupon = await Coupon.findOne({
        code: code.trim().toUpperCase(),
        _id: { $ne: req.params.id },
      });

      if (existingCoupon) {
        return res.status(400).json({
          message: "Coupon code already exists.",
        });
      }

      coupon.code = code.trim().toUpperCase();
    }

    if (title !== undefined) coupon.title = title.trim();
    if (description !== undefined) coupon.description = description.trim();

    if (discountType !== undefined) {
      if (!["percentage", "fixed"].includes(discountType)) {
        return res.status(400).json({
          message: "Invalid discount type.",
        });
      }

      coupon.discountType = discountType;
    }

    if (discountValue !== undefined) {
      if (discountValue < 0) {
        return res.status(400).json({
          message: "Discount value cannot be negative.",
        });
      }

      if (
        (discountType || coupon.discountType) === "percentage" &&
        discountValue > 100
      ) {
        return res.status(400).json({
          message: "Percentage discount cannot exceed 100%.",
        });
      }

      coupon.discountValue = discountValue;
    }

    if (expiryDate !== undefined) coupon.expiryDate = expiryDate;

    if (usageLimitPerEmail !== undefined) {
      if (usageLimitPerEmail < 1) {
        return res.status(400).json({
          message: "Usage limit must be at least 1.",
        });
      }

      coupon.usageLimitPerEmail = usageLimitPerEmail;
    }

    if (applicableProducts !== undefined) {
      coupon.applicableProducts = applicableProducts;
    }

    if (isActive !== undefined) {
      coupon.isActive = isActive;
    }

    await coupon.save();

    res.status(200).json({
      message: "Coupon updated successfully.",
      coupon,
    });
  } catch (error) {
    console.error("Update coupon error:", error);

    res.status(500).json({
      message: "Failed to update coupon.",
      error: error.message,
    });
  }
};

// Validate / Apply Coupon
exports.validateCoupon = async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) return res.status(400).json({ message: "Please enter a coupon code." });

    // Cart aur prices DB se. Frontend ki bheji price ignore
    const items = await loadPricedCart(req.user._id);
    if (!items.length) return res.status(400).json({ message: "Your cart is empty." });

    const result = await computeCouponDiscount({ code, userId: req.user._id, items });
    if (result.error) return res.status(400).json({ message: result.error });

    const { coupon, couponDiscount, eligibleSubtotal, remainingUses } = result;

    res.json({
      coupon: {
        id: coupon._id,
        code: coupon.code,
        title: coupon.title,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
      eligibleSubtotal,
      discountAmount: couponDiscount,
      finalEligibleSubtotal: round2(eligibleSubtotal - couponDiscount),
      remainingUses, // null = koi had nahi
    });
  } catch (err) {
    console.error("❌ Validate coupon error:", err.message);
    res.status(500).json({ message: "Could not validate coupon. Please try again." });
  }
};
// Delete Coupon
const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({
        message: "Coupon not found.",
      });
    }

    await Coupon.findByIdAndDelete(req.params.id);

    res.status(200).json({
      message: "Coupon deleted successfully.",
    });
  } catch (error) {
    console.error("Delete coupon error:", error);

    res.status(500).json({
      message: "Failed to delete coupon.",
      error: error.message,
    });
  }
};

module.exports = {
  createCoupon,
  getCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
};