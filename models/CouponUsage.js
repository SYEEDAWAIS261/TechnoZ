const mongoose = require("mongoose");

const couponUsageSchema = new mongoose.Schema(
  {
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

couponUsageSchema.index(
  { coupon: 1, email: 1 },
  { unique: true }
);

module.exports = mongoose.model("CouponUsage", couponUsageSchema);