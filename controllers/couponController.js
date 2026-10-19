const Coupon = require("../models/Coupon");
const CouponUsage = require("../models/CouponUsage");
// Create Coupon
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
const validateCoupon = async (req, res) => {
  try {
    const { code, email, cartItems } = req.body;

    if (!code || !email || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({
        message: "Coupon code, email and cart items are required.",
      });
    }

    const normalizedCode = code.trim().toUpperCase();
    const normalizedEmail = email.trim().toLowerCase();

    const coupon = await Coupon.findOne({
      code: normalizedCode,
    });

    if (!coupon) {
      return res.status(404).json({
        message: "Invalid coupon code.",
      });
    }

    if (!coupon.isActive) {
      return res.status(400).json({
        message: "This coupon is inactive.",
      });
    }

    if (new Date(coupon.expiryDate) <= new Date()) {
      return res.status(400).json({
        message: "This coupon has expired.",
      });
    }

    // Check how many times this email has already used the coupon
    const usage = await CouponUsage.findOne({
      coupon: coupon._id,
      email: normalizedEmail,
    });

    const currentUsageCount = usage?.usageCount || 0;

    if (currentUsageCount >= coupon.usageLimitPerEmail) {
      return res.status(400).json({
        message: "You have reached the usage limit for this coupon.",
      });
    }

    /*
      applicableProducts empty = coupon applies to ALL products.
      Otherwise discount applies only to selected products.
    */

    let eligibleSubtotal = 0;

    for (const item of cartItems) {
      const productId = String(item.productId);
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;

      if (quantity <= 0 || price < 0) continue;

      const isEligible =
        coupon.applicableProducts.length === 0 ||
        coupon.applicableProducts.some(
          (id) => String(id) === productId
        );

      if (isEligible) {
        eligibleSubtotal += price * quantity;
      }
    }

    if (eligibleSubtotal <= 0) {
      return res.status(400).json({
        message: "This coupon does not apply to the products in your cart.",
      });
    }

    let discountAmount = 0;

    if (coupon.discountType === "percentage") {
      discountAmount =
        eligibleSubtotal * (coupon.discountValue / 100);
    } else {
      discountAmount = coupon.discountValue;
    }

    // Discount can never exceed eligible subtotal
    discountAmount = Math.min(discountAmount, eligibleSubtotal);

    const finalEligibleSubtotal =
      eligibleSubtotal - discountAmount;

    res.status(200).json({
      message: "Coupon applied successfully.",
      coupon: {
        id: coupon._id,
        code: coupon.code,
        title: coupon.title,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
      eligibleSubtotal,
      discountAmount,
      finalEligibleSubtotal,
      remainingUses:
        coupon.usageLimitPerEmail - currentUsageCount,
    });
  } catch (error) {
    console.error("Validate coupon error:", error);

    res.status(500).json({
      message: "Failed to validate coupon.",
      error: error.message,
    });
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