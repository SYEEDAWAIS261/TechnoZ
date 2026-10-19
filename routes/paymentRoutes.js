// routes/stripeRoutes.js  (purani file ki jagah poori paste karein)
require("dotenv").config();

const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Cart = require("../models/Cart");
const Order = require("../models/Order");
const crypto = require("crypto");
const auth = require("../middleware/authMiddleware");
const {
  buildOrderFromCart,
  reserveStock,
  releaseStock,
  validateShippingAddress,
} = require("../utils/orderBuilder");
const { computeCouponDiscount, recordCouponUsage } = require("../utils/couponHelper");

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// Ek hi Stripe session ko do baar ek saath process hone se rokta hai
const processingSessions = new Map();

// Stripe metadata ki limit 500 chars per value hai, is liye sirf zaroori fields
const pickAddress = (a = {}) => ({
  fullName: a.fullName,
  phone: a.phone,
  street: a.street,
  city: a.city,
  state: a.state,
  postalCode: a.postalCode,
  country: a.country,
});

// ============================================================================
// CREATE STRIPE CHECKOUT SESSION
// Client sirf shippingAddress aur shippingMethod bhejta hai.
// Price, VAT, shipping sab server cart DB se banata hai.
// ============================================================================
router.post("/create-checkout-session", auth, async (req, res) => {
  try {
       const { shippingAddress, billingAddress, shippingMethod } = req.body;

    // Paisa katne se PEHLE address check: baad mein order save fail na ho
    const addressError = validateShippingAddress(shippingAddress);
    if (addressError) return res.status(400).json({ error: addressError });

    // Billing address: poora bhara ho to wohi, warna shipping wala hi billing ban jaye
    const billing = validateShippingAddress(billingAddress) ? shippingAddress : billingAddress;

    const built = await buildOrderFromCart(req.user._id, shippingMethod);
    if (built.error) return res.status(400).json({ error: built.error });

    const line_items = built.items.map((it) => ({
      price_data: {
        currency: "aed",
        product_data: {
          name: it.productName,
          description: it.selectedVariation?.label || "Standard Model",
        },
        unit_amount: Math.round(it.priceAtOrder * 100),
      },
      quantity: it.quantity,
    }));

    if (built.shippingCost > 0) {
      line_items.push({
        price_data: {
          currency: "aed",
          product_data: { name: `Shipping (${built.shippingMethod})` },
          unit_amount: Math.round(built.shippingCost * 100),
        },
        quantity: 1,
      });
    }

    // 🎟️ Coupon: server par check (COD jaisa hi). Ghalat ho to paisa katne se pehle hi rok do
    const couponResult = await computeCouponDiscount({
      code: req.body.coupon || req.body.couponCode,
      userId: req.user._id,
      items: built.items,
    });
    if (couponResult.error) return res.status(400).json({ error: couponResult.error });

    const { couponCode, couponDiscount } = couponResult;

    // Stripe par discount: ek dafa ka coupon jo sirf isi session par lagta hai
    let discounts;
    if (couponDiscount > 0) {
      const stripeCoupon = await stripe.coupons.create({
        amount_off: Math.round(couponDiscount * 100),
        currency: "aed",
        duration: "once",
        max_redemptions: 1,
        name: `Coupon ${couponCode}`,
      });
      discounts = [{ coupon: stripeCoupon.id }];
    }

    const token = req.headers.authorization.split(" ")[1];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items,
      ...(discounts ? { discounts } : {}),
      mode: "payment",
      success_url: `${CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}&t=${token}`,
      cancel_url: `${CLIENT_URL}/checkout`,
      billing_address_collection: "required",
           metadata: {
        userId: req.user._id.toString(),
        shippingAddress: JSON.stringify(pickAddress(shippingAddress)),
        billingAddress: JSON.stringify(pickAddress(billing)),
        shippingMethod: built.shippingMethod,
        // Server ne nikala hua discount (customer metadata badal nahi sakta)
        couponCode: couponCode || "",
        couponDiscount: String(couponDiscount || 0),
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe session error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// CONFIRM STRIPE ORDER
// ============================================================================
router.post("/confirm", auth, async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "Session ID is required" });
  }

  if (processingSessions.get(sessionId)) {
    return res.status(200).json({
      message: "Order confirmation is already in progress.",
      processing: true,
    });
  }
  processingSessions.set(sessionId, true);

  try {
    // 1. Order pehle se ban chuka hai?
    const existingOrder = await Order.findOne({ stripeSessionId: sessionId });
    if (existingOrder) {
      return res.json({ message: "Order already confirmed", order: existingOrder });
    }

    // 2. Stripe se session lein aur verify karein
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      return res.status(400).json({ error: "Invalid stripe session" });
    }

    if (req.user._id.toString() !== String(session.metadata?.userId)) {
      return res.status(403).json({ error: "Unauthorized session confirmation" });
    }

    // 🔒 Sab se zaroori check: paisa waqai mila hai?
    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "Payment not completed" });
    }

    // 3. Order server par dobara banayein (cart DB se)
    const built = await buildOrderFromCart(session.metadata.userId, session.metadata.shippingMethod);
    if (built.error) {
      // Cart khali hai to shayad koi aur request order bana chuki ho
      const dbOrderCheck = await Order.findOne({ stripeSessionId: sessionId });
      if (dbOrderCheck) {
        return res.json({ message: "Order already saved by concurrent process", order: dbOrderCheck });
      }
      console.error("⚠️ PAID SESSION, ORDER NOT BUILT:", sessionId, built.error);
      return res.status(409).json({
        error: `${built.error}. If money was deducted, contact support with reference ${sessionId}.`,
      });
    }

    // Coupon jo session banate waqt server ne lagaya tha
    const couponCode = session.metadata.couponCode || null;
    const couponDiscount = round2(Number(session.metadata.couponDiscount) || 0);
    const finalSubtotal = round2(built.subtotal - couponDiscount);
    const finalTotal = round2(finalSubtotal + built.shippingCost);

    // 4. Jo Stripe ne charge kiya wo hamare total se match karta hai? (1 cent tak ka farq theek)
    if (Math.abs(Math.round(finalTotal * 100) - session.amount_total) > 1) {
      console.error("⚠️ AMOUNT MISMATCH:", sessionId, "stripe:", session.amount_total, "server:", finalTotal * 100);
      return res.status(409).json({
        error: `Your cart changed after payment. Contact support with reference ${sessionId}.`,
      });
    }

    // 5. Stock atomic kam karein. Khatam ho chuka ho to paisa wapas
    const reserved = await reserveStock(built.items);
    if (!reserved.ok) {
      try {
        await stripe.refunds.create({ payment_intent: session.payment_intent });
      } catch (refundErr) {
        console.error("❌ REFUND FAILED, refund manually:", sessionId, refundErr.message);
      }
      return res.status(409).json({
        error: `${reserved.error}. Your payment has been refunded.`,
      });
    }

    // 6. Order save karein (fail ho to stock wapas)
    const order = new Order({
      userId: session.metadata.userId,
      stripeSessionId: session.id,
      products: built.items.map(({ variationId, ...rest }) => rest),
      subtotal: finalSubtotal,
      total: finalTotal,
      couponCode,
      couponDiscount,
      shippingCost: built.shippingCost,
      shippingMethod: built.shippingMethod,
      paymentMethod: "Stripe",
           shippingAddress: JSON.parse(session.metadata.shippingAddress),
      // Purane sessions mein billing nahi thi: unke liye shipping hi billing
      billingAddress: JSON.parse(
        session.metadata.billingAddress || session.metadata.shippingAddress
      ),
      status: "Placed",
      trackingId: "ORD-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    });

    try {
      await order.save();
    } catch (dbErr) {
      await releaseStock(reserved.done);

      if (dbErr.code === 11000) {
        const duplicateOrder = await Order.findOne({ stripeSessionId: session.id });
        return res.json({ message: "Order already created", order: duplicateOrder });
      }

      // Paisa kat chuka hai magar order save nahi hua: paisa wapas karein
      console.error("❌ ORDER SAVE FAILED AFTER PAYMENT:", sessionId, dbErr.message);
      let refunded = false;
      try {
        await stripe.refunds.create({ payment_intent: session.payment_intent });
        refunded = true;
      } catch (refundErr) {
        console.error("❌ REFUND FAILED, refund manually:", sessionId, refundErr.message);
      }
      return res.status(500).json({
        error: refunded
          ? "Your order could not be saved. Your payment has been refunded."
          : `Your order could not be saved. Contact support with reference ${sessionId}.`,
      });
    }

    // Coupon ka istemal +1 (fail ho to order par asar na pade)
    try {
      await recordCouponUsage({ code: couponCode, userId: session.metadata.userId });
    } catch (couponErr) {
      console.error("⚠️ Coupon usage not recorded:", sessionId, couponErr.message);
    }

    // 7. Cart khali
    await Cart.deleteMany({ user: session.metadata.userId });

    res.json({ message: "Stripe order confirmed", order });
    req.app.get("io")?.emit("order:new"); // Admin panel ko signal
  } catch (error) {
    console.error("!!! CRITICAL STRIPE BACKEND ERROR !!!", error);
    res.status(500).json({ error: "Order confirmation failed. Please contact support." });
  } finally {
    // Har raste par lock khul jata hai
    processingSessions.delete(sessionId);
  }
});

module.exports = router;