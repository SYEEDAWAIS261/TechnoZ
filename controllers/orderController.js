// controllers/orderController.js  (purani file ki jagah poori paste karein)
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const CouponUsage = require('../models/CouponUsage');
const sendEmail = require('../utils/sendEmail');
const User = require('../models/User');
const Cart = require('../models/Cart');
const moment = require('moment');
const crypto = require('crypto'); // For unique tracking IDs
const mongoose = require('mongoose');
const {
  buildOrderFromCart,
  reserveStock,
  releaseStock,
  validateShippingAddress,
} = require('../utils/orderBuilder');
// Order ke items ko stock wapas karne ke format mein badlein
// (variation id sirf tab jab asli ObjectId ho, purane orders mein 'base' ho sakta hai)
const toRestockItems = (order) =>
  order.products.map((p) => {
    const varId = p.selectedVariation?.id;
    return {
      productId: p.productId?._id || p.productId,
      quantity: p.quantity,
      variationId: varId && mongoose.Types.ObjectId.isValid(varId) ? varId : null,
    };
  });
  
// Order item ka SKU: pehle order mein saved wala, warna product/variation se
const resolveItemSku = (item) => {
  if (item.sku) return item.sku;
  const product = item.productId;
  if (!product || typeof product !== "object") return "";
  const varId = item.selectedVariation?.id;
  const variation = varId
    ? product.variations?.find((v) => String(v._id) === String(varId))
    : null;
  return variation?.sku || product.sku || "";
};
  const RETURN_WINDOW_DAYS = 14;
// ✅ Create New Order (COD): sab kuch server par, cart DB se
exports.createOrder = async (req, res) => {
  // Price, total, shippingCost, products kabhi nahi.
const { shippingAddress, billingAddress, shippingMethod } = req.body;

  // Ye route sirf COD ke liye hai. Client "Stripe" likh kar khud ko "Paid" nahi bana sakta.
  const paymentMethod = "Cash on Delivery";

  try {
    // 0. Address pehle check karein (stock reserve hone se pehle)
    const addressError = validateShippingAddress(shippingAddress);
    if (addressError) return res.status(400).json({ message: addressError });

    // 1. Cart DB se padh kar price, tax, total banayein aur stock check karein
 const built = await buildOrderFromCart(req.user.id, shippingMethod);

if (built.error) return res.status(400).json({ message: built.error });

// Coupon discount
let couponCode = null;
let couponDiscount = 0;

if (req.body.couponCode) {
  const user = await User.findById(req.user.id);

  if (!user?.email) {
    return res.status(400).json({
      message: "User email is required to apply coupon.",
    });
  }

  couponCode = req.body.couponCode.trim().toUpperCase();

  const coupon = await Coupon.findOne({
    code: couponCode,
  });

  if (!coupon) {
    return res.status(400).json({
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

  const usage = await CouponUsage.findOne({
    coupon: coupon._id,
    email: user.email.trim().toLowerCase(),
  });

  const currentUsageCount = usage?.usageCount || 0;

  if (currentUsageCount >= coupon.usageLimitPerEmail) {
    return res.status(400).json({
      message: "You have reached the usage limit for this coupon.",
    });
  }

  // Check eligible products using SERVER-SIDE cart prices
  let eligibleSubtotal = 0;

  for (const item of built.items) {
    const isEligible =
      coupon.applicableProducts.length === 0 ||
      coupon.applicableProducts.some(
        (id) => String(id) === String(item.productId)
      );

    if (isEligible) {
      eligibleSubtotal +=
        Number(item.priceAtOrder) * Number(item.quantity);
    }
  }

  eligibleSubtotal = Number(eligibleSubtotal.toFixed(2));

  if (eligibleSubtotal <= 0) {
    return res.status(400).json({
      message: "This coupon does not apply to the products in your cart.",
    });
  }

  if (coupon.discountType === "percentage") {
    couponDiscount =
      eligibleSubtotal * (coupon.discountValue / 100);
  } else {
    couponDiscount = coupon.discountValue;
  }

  couponDiscount = Math.min(couponDiscount, eligibleSubtotal);
  couponDiscount = Number(couponDiscount.toFixed(2));
}

    // 2. Stock atomic tareeqe se kam karein
    const reserved = await reserveStock(built.items);
    if (!reserved.ok) return res.status(400).json({ message: reserved.error });

    // 3. Order save karein. Fail ho to stock wapas
    let order;
    try {
      order = new Order({
        userId: req.user.id,
        products: built.items.map(({ variationId, ...rest }) => rest),
        subtotal: built.subtotal - couponDiscount,
total: Number(
  (
    (built.subtotal - couponDiscount) +
    built.shippingCost
  ).toFixed(2)
),
couponCode,
couponDiscount,
        paymentMethod,
        shippingAddress,
        billingAddress,
        shippingMethod: built.shippingMethod,
        shippingCost: built.shippingCost,
        status: "Placed",
        trackingId: "ORD-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
      });
      await order.save();
   // Record coupon usage after successful order
if (couponCode) {
  const user = await User.findById(req.user.id);

  if (user?.email) {
    const coupon = await Coupon.findOne({
      code: couponCode,
    });

    if (coupon) {
      await CouponUsage.findOneAndUpdate(
        {
          coupon: coupon._id,
          email: user.email.trim().toLowerCase(),
        },
        {
          $inc: { usageCount: 1 },
        },
        {
          upsert: true,
          new: true,
        }
      );
    }
  }
}
    } catch (saveErr) {
      await releaseStock(reserved.done);
      throw saveErr;
    }

    // 4. Cart khali karein
    await Cart.deleteMany({ user: req.user.id });

    // Neeche wala email code in variables ko use karta hai
const subTotalItems = order.subtotal;
const shippingCost = order.shippingCost;
const finalTotal = order.total;

       // 🚀 5. SEND SUCCESS RESPONSE IMMEDIATELY
    res.status(201).json(order);
    req.app.get("io")?.emit("order:new"); // Admin panel ko signal

    // 🚀 6. BACKGROUND EMAIL PROCESSING (Fire and Forget)
    const sendBackgroundEmail = async () => {
      try {
        const user = await User.findById(req.user.id);
        if (!user?.email) return;

        const populatedOrder = await Order.findById(order._id).populate('products.productId');

        // Calculations for Email
        const totalOriginalPrice = populatedOrder.products.reduce((acc, item) =>
          acc + ((item.originalPriceAtOrder || item.priceAtOrder) * item.quantity), 0
        );
        const savings = totalOriginalPrice - subTotalItems;

        const productList = populatedOrder.products.map((item) => {
          const baseName = item.productName || item.productId?.name || item.productId?.brand || "Product";
          const variation = item.selectedVariation;

const variationParts = [
  variation?.ram,
  variation?.storage,
].filter(Boolean);

const variationText =
  variationParts.length > 0
    ? variationParts.join(" / ")
    : variation?.label || "";

const productName = variationText
  ? `${baseName} (${variationText})`
  : baseName;
          const originalPrice = (item.originalPriceAtOrder || item.priceAtOrder).toFixed(2);
          const hasDiscount = (item.originalPriceAtOrder || 0) > item.priceAtOrder;

          return `
  <li style="margin-bottom: 12px; border-bottom: 1px solid #edf2f7; padding-bottom: 10px; list-style: none;">
    <span style="font-weight: 600; color: #2d3748;">
      ${baseName}
    </span><br/>

    ${
      item.selectedVariation?.ram
        ? `<span style="font-size: 13px; color: #718096;">RAM: ${item.selectedVariation.ram}</span><br/>`
        : ""
    }

    ${
      item.selectedVariation?.storage
        ? `<span style="font-size: 13px; color: #718096;">Storage: ${item.selectedVariation.storage}</span><br/>`
        : ""
    }

    <span style="font-size: 13px; color: #718096;">
      Qty: ${item.quantity}
    </span> —

    ${
      hasDiscount
        ? `<span style="text-decoration: line-through; color: #a0aec0; font-size: 12px; margin-right: 5px;">
            AED ${originalPrice}
          </span>`
        : ""
    }

    <strong style="color: #198754;">
      AED ${item.priceAtOrder.toFixed(2)}
    </strong>
  </li>`;
        }).join("");

        const emailContent = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; background:#f4f4f7; padding:30px;">
            <div style="max-width:650px; margin:0 auto; background:#ffffff; padding:30px; border-radius:10px; box-shadow:0 4px 15px rgba(0,0,0,0.08);">
              <div style="text-align:center; margin-bottom:25px;">
                <h1 style="color:#198754; margin:0;">🎉 Congratulations!</h1>
             ${savings > 0 ? `
              <p style="color:#4a5568; font-size:16px; margin-top:8px;">
                You just saved <strong>AED ${savings.toFixed(2)}</strong> on your order!
              </p>
              ` : ""}
              </div>
              <div style="text-align:center; margin-bottom:25px;">
                <h1 style="color:#2d3748; margin:0;">🛍️ Thank You for Your Order!</h1>
                <p style="color:#718096; font-size:14px; margin-top:8px;">Your order has been successfully confirmed.</p>
              </div>
              <p style="font-size:15px; color:#2d3748;">Hi <strong>${user.name || "Customer"}</strong>,</p>
              <p style="font-size:15px; color:#4a5568;">We are processing your order and will notify you once it ships. Below is a summary of your purchase:</p>
              <div style="background:#f9fafb; padding:20px; border-radius:8px; margin-top:20px; border: 1px solid #e2e8f0;">
              <p style="font-size:13px; color:#718096; margin:0 0 12px 0;"><strong>Order ID:</strong> ${order.orderNumber}</p>
                <h3 style="color:#2d3748; margin:0 0 15px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">📦 Order Summary</h3>
                <table width="100%" style="font-size: 14px; color: #4a5568; border-collapse: collapse;">
                  <tr><td style="padding: 5px 0;">Items Subtotal:</td><td style="text-align: right; padding: 5px 0;">AED ${subTotalItems.toFixed(2)}</td></tr>
                  <tr><td style="padding: 5px 0;">Shipping Fee:</td><td style="text-align: right; padding: 5px 0;">AED ${Number(shippingCost).toFixed(2)}</td></tr>
                  <tr><td style="padding: 15px 0 5px 0; font-size: 18px; font-weight: bold; color: #2d3748; border-top: 2px solid #edf2f7;">Grand Total:</td><td style="padding: 15px 0 5px 0; font-size: 18px; font-weight: bold; color: #198754; text-align: right; border-top: 2px solid #edf2f7;">AED ${finalTotal.toFixed(2)}</td></tr>
                </table>
                <p style="font-size:13px; margin:12px 0 0 0; color:#718096;"><strong>Payment Method:</strong> ${paymentMethod}</p>
                <div style="text-align: center; margin-top: 20px;">
                  <a href="https://ai-ecommerce-4a2c6.web.app/orders" style="display:inline-block; padding:12px 25px; background:#198754; color:white; text-decoration:none; border-radius:6px; font-size:14px; font-weight: bold;">Track Your Order Details</a>
                </div>
              </div>
              <div style="margin-top:25px;">
                <h3 style="color:#2d3748; margin-bottom:10px;">🚚 Shipping Address</h3>
                <p style="font-size:15px; color:#4a5568; line-height:1.7;">
                  ${shippingAddress?.fullName}<br/>${shippingAddress?.street}<br/>
                  ${shippingAddress?.city}, ${shippingAddress?.state || ""} ${shippingAddress?.postalCode || ""}<br/>${shippingAddress?.country}
                </p>
              </div>
              <div style="margin-top:25px;">
                <h3 style="color:#2d3748; margin-bottom:10px;">🛒 Items in Your Order</h3>
                <ul style="font-size:15px; color:#4a5568; line-height:1.7; padding-left:20px;">${productList}</ul>
              </div>
              <p style="font-size:14px; color:#718096; margin-top:30px;"><em>This is an automated generated email. Please do not reply to this email.</em></p>
              <p style="font-size:15px; color:#2d3748; margin-top:25px;">Best Regards,<br/><strong>TechnoZ Team</strong></p>
            </div>
            <p style="text-align:center; font-size:12px; color:#a0aec0; margin-top:15px;">© ${new Date().getFullYear()} TechnoZ. All rights reserved.</p>
          </div>`;

        await sendEmail(user.email, "🛒 Order Confirmation", emailContent);
        console.log("✅ Confirmation email sent in background");
      } catch (err) {
        console.error("❌ Background email processing failed:", err.message);
      }
    };

    // Trigger background process without awaiting it
    sendBackgroundEmail();

  } catch (err) {
    console.error("❌ Error creating order:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to create order" });
    }
  }
};

// ✅ Get logged-in user's orders
exports.getUserOrders = async (req, res) => {
  try {
        // Customer ne jo cancelled order "delete" kiya, wo uski list mein na aaye
    const orders = await Order.find({ userId: req.user.id, hiddenForUser: { $ne: true } })
      .populate("products.productId")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user orders" });
  }
};

// ✅ Admin: Get all orders
exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("userId", "username email")
      .populate("products.productId")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch all orders" });
  }
};

// ✅ Admin: Update order status
const ADMIN_STATUSES = ['Placed', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status, comment } = req.body;

    if (!ADMIN_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Issue 2: Cancelled/Returned ka stock wapas ho chuka, ab ye dobara nahi khulega
    if (["Cancelled", "Returned"].includes(order.status)) {
      return res.status(400).json({ error: `This order is ${order.status} and can no longer be changed.` });
    }
        // Return chal raha ho to status Return wale buttons se hi badlega
    if (order.returnRequest?.status && order.returnRequest.status !== "Rejected") {
      return res.status(400).json({ error: "This order has an active return. Use the return actions instead." });
    }
    if (order.status === status) return res.json({ message: "No change", order });

    const now = new Date();
    const set = { status, statusUpdatedAt: now };
    if (status === "Delivered") set.deliveredAt = now; // Issue 3
       if (status === "Cancelled") {
      set.cancelledAt = now;
      set.cancelledBy = "admin";
    }

    // Atomic: do admin ek saath badlein to stock do baar wapas na ho
    const updatedOrder = await Order.findOneAndUpdate(
      { _id: order._id, status: order.status },
      {
        $set: set,
        // Issue 3: admin ka note history mein save
        $push: { statusHistory: { status, comment: comment || `Status updated to ${status}`, timestamp: now } },
      },
      { new: true, runValidators: false }
    );
    if (!updatedOrder) {
      return res.status(409).json({ error: "Order was just changed by someone else. Please refresh." });
    }

    // Issue 1: admin cancel kare to bhi stock wapas
    if (status === "Cancelled") await releaseStock(toRestockItems(order));

    res.json({ message: "Order status updated", order: updatedOrder });
  } catch (err) {
    console.error("❌ Error in updateOrderStatus:", err.message);
    res.status(500).json({ error: "Failed to update order status" });
  }
};

// ✅ New: Customer can track order progress by tracking ID
exports.trackOrder = async (req, res) => {
  try {
    const { trackingId } = req.params;

    const order = await Order.findOne({ trackingId }).populate("products.productId");
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const steps = ["Placed", "Pending", "Processing", "Shipped", "Delivered"];
    const currentStep = steps.indexOf(order.status);

    res.json({
      trackingId: order.trackingId,
      status: order.status,
      currentStep,
      steps,
      createdAt: order.createdAt,
      estimatedDelivery:
        order.status === "Delivered"
          ? null
          : moment(order.createdAt).add(3, "days").format("MMM DD, YYYY"),
    });
  } catch (err) {
    console.error("❌ Tracking error:", err);
    res.status(500).json({ message: "Failed to fetch tracking info" });
  }
};

// ✅ Soft Delete Cancelled Order (Customer)
exports.deleteCancelledOrder = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized action" });
    }

    if (order.status !== "Cancelled") {
      return res.status(400).json({
        message: "Only cancelled orders can be hidden.",
      });
    }

    order.hiddenForUser = true;
    await order.save();

    res.json({ message: "Cancelled order hidden from your view.", order });
  } catch (err) {
    console.error("❌ Hide cancelled order error:", err);
    res.status(500).json({ message: "Error hiding cancelled order" });
  }
};

// ✅ Delete Order (Admin): sirf Cancelled ya Delivered
exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== "Cancelled" && order.status !== "Delivered") {
      return res.status(400).json({
        message: "Only Cancelled or Delivered orders can be deleted.",
      });
    }

    await order.deleteOne();

    res.json({ message: "Order deleted successfully" });
  } catch (err) {
    console.error("❌ Delete order error:", err);
    res.status(500).json({ message: "Error deleting order" });
  }
};

// GET /api/orders/:orderId/invoice
exports.downloadInvoice = async (req, res) => {
  const PDFDocument = require('pdfkit');
  const Order = require('../models/Order');
  const User = require('../models/User');
  const QRCode = require('qrcode');
  const path = require('path');

  try {
    const order = await Order.findById(req.params.orderId).populate('products.productId');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // 🔒 Security check: sirf order ka owner ya admin/editor hi access kar sake
    const requesterId = String(req.user._id || req.user.id);
    const requester = await User.findById(requesterId).select("role isBlocked");

    const isOwner = order.userId?.toString() === requesterId;
    const isAdmin =
      !!requester &&
      !requester.isBlocked &&
      ["administrator", "editor"].includes(requester.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Not authorized to access this invoice' });
    }

    const user = await User.findById(order.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      bufferPages: true,
    });

    const watermarkPath = path.join(__dirname, '../public/logo.jpeg');
    const watermarkOpacity = 0.12;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderNumber || order._id}.pdf`);
    doc.pipe(res);

    // ---------------- COMPANY INFO (header ke right side) ----------------
    // Yahan apni details badal sakte hain. Koi field khali ho to wo line nahi aayegi.
    const COMPANY = {
      email: 'z.techno.service@gmail.com',
      phone: '+92-334-9094849',
      street: '12-B Main Street',
      city: 'Al-Ain',
      state: 'Abu Dhabi',
      country: 'United Arab Emirates',
      postalCode: '', // P.O. Box / postal code yahan likhein
    };

    const HEADER_BOTTOM = 150; // header ke neeche wali line ki position
    const ACCENT = '#1094e0';

    // HELPER: Har page par watermark
    const addWatermark = () => {
      const watermarkSize = 400;
      const centerX = pageWidth / 2;
      const centerY = pageHeight / 2;

      doc.save();
      doc.translate(centerX, centerY);
      doc.rotate(-45);
      doc.opacity(watermarkOpacity);
      doc.image(watermarkPath, -watermarkSize / 2, -watermarkSize / 2, {
        width: watermarkSize,
        align: 'center',
        valign: 'center',
      });
      doc.restore();
    };

    // HELPER: Header (har page ke liye): logo left, company details right
       // HELPER: Upar aur neeche ki waves (har page par)
    const NAVY = '#0b2a4a';
    const drawWaves = () => {
      const W = pageWidth;
      const H = pageHeight;
      doc.save();

      // Upar: left par gehra, right par patla (logo se na takraye)
      doc.moveTo(0, 0).lineTo(W, 0).lineTo(W, 16)
        .bezierCurveTo(W * 0.62, 16, W * 0.38, 54, 0, 48).closePath().fill(ACCENT);
      doc.moveTo(0, 0).lineTo(W, 0).lineTo(W, 10)
        .bezierCurveTo(W * 0.65, 10, W * 0.35, 46, 0, 40).closePath().fill(NAVY);

      // Neeche: ulti taraf se, right par gehra
      doc.moveTo(0, H).lineTo(0, H - 16)
        .bezierCurveTo(W * 0.38, H - 16, W * 0.62, H - 54, W, H - 48).lineTo(W, H).closePath().fill(ACCENT);
      doc.moveTo(0, H).lineTo(0, H - 10)
        .bezierCurveTo(W * 0.35, H - 10, W * 0.65, H - 46, W, H - 40).lineTo(W, H).closePath().fill(NAVY);
      doc.restore();
    };

    // HELPER: Header (har page ke liye): waves, logo right, company details left
    const addHeader = () => {
      drawWaves();
      const logoPath = path.join(__dirname, '../public/logo.jpeg');
      doc.image(logoPath, 432, 20, { width: 128, height: 128 });

      const companyLines = [
        `Email: ${COMPANY.email}`,
        `Phone: ${COMPANY.phone}`,
        COMPANY.street,
        [COMPANY.city, COMPANY.state].filter(Boolean).join(', '),
        COMPANY.country,
        COMPANY.postalCode ? `Postal Code: ${COMPANY.postalCode}` : null,
      ].filter(Boolean);

      let lineY = 58;
      doc.font('Helvetica').fontSize(9).fillColor('#555');
      companyLines.forEach((line) => {
        doc.text(line, 40, lineY, { width: 255, align: 'left', lineBreak: false });
        lineY += 14;
      });

      doc.strokeColor('#cccccc').lineWidth(1).moveTo(40, HEADER_BOTTOM).lineTo(555, HEADER_BOTTOM).stroke();
    };

    // FIRST PAGE SETUP
    addWatermark();
    addHeader();

    // ---------------- INVOICE DATA (pehle jaisa) ----------------
    const orderRef = order.orderNumber || order._id.toString().slice(-6).toUpperCase();
    const invoiceNo = `INV-${new Date().getFullYear()}-${orderRef}`;
    const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
    const qrData = `${CLIENT_URL}/orders`;
    const qrImage = await QRCode.toDataURL(qrData);

    // Online (Stripe) payment = Paid. COD = abhi pending.
    const isPaidOnline =
      order.isPaid === true ||
      String(order.paymentStatus || '').toLowerCase() === 'paid' ||
      (order.paymentMethod && order.paymentMethod !== 'Cash on Delivery');

    const paymentStatus = isPaidOnline ? 'Paid' : 'Pending (COD)';

    // Billing address na ho (purane orders) to shipping wala hi dikhayein
    const billingAddress = order.billingAddress?.street ? order.billingAddress : order.shippingAddress;

    // ---------------- SHIP TO | BILL TO | INVOICE DETAILS ----------------
    const sectionTop = HEADER_BOTTOM + 18;

    const drawHeading = (title, x, width, y) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(ACCENT)
        .text(title, x, y, { width, lineBreak: false });
      return y + 21;
    };

    const drawAddress = (title, a = {}, x, width) => {
      let y = drawHeading(title, x, width, sectionTop);
      const lines = [
        a.fullName,
        a.street,
        a.addressLine,
        [a.city, a.state].filter(Boolean).join(', '),
        [a.country, a.postalCode].filter(Boolean).join(' - '),
        a.phone ? `Phone: ${a.phone}` : null,
      ].filter(Boolean);
      if (!lines.length) lines.push('N/A');

      lines.forEach((line) => {
        doc.font(line === a.fullName ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000');
        doc.text(line, x, y, { width });
        y += doc.heightOfString(line, { width }) + 2;
      });
      return y;
    };

    const shipEndY = drawAddress('Ship To', order.shippingAddress, 40, 165);
    const billEndY = drawAddress('Bill To', billingAddress, 220, 160);

    // Right: invoice details + QR
    const detailsX = 385;
    const detailsW = 170;
    const labelW = 88;
    let detailsY = drawHeading('Invoice Details', detailsX, detailsW, sectionTop);

    const details = [
      ['Invoice No:', invoiceNo],
      ['Order ID:', orderRef],
      ['Order Date:', new Date(order.createdAt).toLocaleDateString()],
      ['Payment Method:', order.paymentMethod],
      ['Payment Status:', paymentStatus],
    ];

    details.forEach(([label, value]) => {
      const text = String(value ?? 'N/A');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000')
        .text(label, detailsX, detailsY, { width: labelW, lineBreak: false });
      doc.font('Helvetica').fontSize(9)
        .text(text, detailsX + labelW, detailsY, { width: detailsW - labelW });
      detailsY += Math.max(14, doc.heightOfString(text, { width: detailsW - labelW }) + 3);
    });

    // ---------------- TABLE SETUP ----------------
    let tableTop = Math.max(shipEndY, billEndY, detailsY) + 18;
    const colX = {
      no: 40,
      name: 70,
      qty: 255,
      price: 305,
      total: 380,
      variation: 450
    };

    if (tableTop > 500) {
      doc.addPage();
      addWatermark();
      addHeader();
      tableTop = HEADER_BOTTOM + 25;
    }

    const drawTableHeader = (y) => {
      doc.font('Helvetica-Bold').fontSize(9);
      doc.fillColor(ACCENT).rect(40, y - 5, 515, 20).fill();
      doc.fillColor('#fff');
      doc.text('No.', colX.no, y);
      doc.text('Product', colX.name, y);
      doc.text('Qty', colX.qty, y);
      doc.text('Price', colX.price, y);
      doc.text('Total', colX.total, y);
      doc.text('Variation', colX.variation, y);
    };

    drawTableHeader(tableTop);

    let yPosition = tableTop + 20;
    let alternate = false;
    const rowHeight = 22;

    order.products.forEach((item, index) => {
      const product = item.productId;
      const name = item.productName || product?.name || product?.brand || 'Unnamed Product';
      const variation = item.selectedVariation;

      const variationParts = [
        variation?.ram,
        variation?.storage,
      ].filter(Boolean);

      const variationName =
        variationParts.length > 0
          ? variationParts.join(" / ")
          : variation?.label || '';

      // priceAtOrder mein variation pehle se shamil hai, alag se add nahi hoti
      const price = item.priceAtOrder && item.priceAtOrder > 0 ? item.priceAtOrder : product?.price || 0;
      const quantity = item.quantity || 1;
      const total = price * quantity;

      // PAGE BREAK CHECK
            // Part No / Serial No (admin ne packing par likhe hon to)
      const serials = (item.serialNumbers || []).filter(Boolean);
      const sku = resolveItemSku(item);
            // Har identifier apni line par, sirf Product column ke andar
      const idWidth = colX.qty - colX.name - 10;
      const idLine = [
        sku ? `SKU: ${sku}` : null,
        item.partNumber ? `P/N: ${item.partNumber}` : null,
        serials.length ? `S/N: ${serials.join(', ')}` : null,
      ].filter(Boolean).join('\n');
      doc.font('Helvetica').fontSize(7.5);
      const idHeight = idLine ? doc.heightOfString(idLine, { width: idWidth, lineGap: 1 }) + 4 : 0;
      const thisRowHeight = rowHeight + idHeight;

      // PAGE BREAK CHECK
      if (yPosition + thisRowHeight > 720) {
        doc.addPage();
        addWatermark();
        addHeader();
        drawTableHeader(HEADER_BOTTOM + 25);
        yPosition = HEADER_BOTTOM + 45;
        alternate = false;
      }

      if (alternate) {
        doc.fillColor('#f8f9fa').rect(40, yPosition - 3, 515, thisRowHeight).fill();
      }
      alternate = !alternate;

      doc.fillColor('#000').fontSize(8.5).font('Helvetica');

      const displayName = name.length > 35 ? name.substring(0, 35) + '...' : name;

      doc.text(index + 1, colX.no, yPosition);
      doc.text(displayName, colX.name, yPosition, { width: 200 });
      doc.text(quantity.toString(), colX.qty, yPosition);
      doc.text(`AED ${price.toFixed(2)}`, colX.price, yPosition);
      doc.text(`AED ${total.toFixed(2)}`, colX.total, yPosition);
      doc.text(variationName || '-', colX.variation, yPosition, {
        width: 105,
        height: 24,
        lineBreak: true
      });

             if (idLine) {
        doc.font('Helvetica').fontSize(7.5).fillColor('#555')
          .text(idLine, colX.name, yPosition + 12, { width: idWidth, lineGap: 1 });
      }

      yPosition += thisRowHeight;
    });

    // ---------------- TOTALS SECTION (right side) ----------------
    if (yPosition > 650) {
      doc.addPage();
      addWatermark();
      addHeader();
      yPosition = HEADER_BOTTOM + 30;
    }

    doc.strokeColor(ACCENT).lineWidth(1).moveTo(40, yPosition + 5).lineTo(555, yPosition + 5).stroke();

    const grandTotal = order.total || 0;
    const shipping = order.shippingCost || 0;
    const subTotalSaved = order.subtotal || 0;

    let totalY = yPosition + 20;
    const labelX = 350;
    const totalValueX = 445; // AED ke saath lambe number wrap na hon

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');

    doc.text('Subtotal:', labelX, totalY);
    doc.text(`AED ${subTotalSaved.toFixed(2)}`, totalValueX, totalY, { align: 'right', width: 110 });
    totalY += 16;

    totalY += 16;
    doc.text('Shipping:', labelX, totalY);
    doc.text(`AED ${shipping.toFixed(2)}`, totalValueX, totalY, { align: 'right', width: 110 });

    totalY += 20;
    doc.fontSize(12).fillColor(ACCENT);
    doc.text('Grand Total:', labelX, totalY);
    doc.text(`AED ${grandTotal.toFixed(2)}`, totalValueX, totalY, { align: 'right', width: 110 });

    // ✅ PAID STAMP: asli rubber stamp jaisa (sirf online/Stripe payment par)
    if (isPaidOnline) {
      const W = 190;                       // stamp ki chaurai
      const H = 96;                        // stamp ki unchai
      const cx = 185;                      // totals ke left side
      const cy = yPosition + 62;
      const ink = '#1d7a3a';               // stamp ki syahi (green)
      const paidOn = new Date(order.paidAt || order.createdAt)
        .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase();

      // Har order ka apna (lekin hamesha ek jaisa) texture: same invoice dobara download karo to same dikhe
      let seed = 0;
      for (const ch of String(order._id)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      const rand = () => {
        seed = (seed + 0x6d2b79f5) >>> 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const between = (a, b) => a + rand() * (b - a);

      // Stamp ka design (dx/dy = halka sa khiska hua doosra impression, syahi phailne jaisa)
      const drawStampBody = (dx, dy, alpha) => {
        doc.fillOpacity(alpha).strokeOpacity(alpha).fillColor(ink).strokeColor(ink);

        // Bahar ka mota border + andar ka patla border
        doc.lineWidth(3.6).roundedRect(-W / 2 + dx, -H / 2 + dy, W, H, 9).stroke();
        doc.lineWidth(1.3).roundedRect(-W / 2 + 7 + dx, -H / 2 + 7 + dy, W - 14, H - 14, 6).stroke();

        // Upar company ka naam
        doc.font('Helvetica-Bold').fontSize(7.5)
          .text('TECHNOZ  •  UAE', -W / 2 + dx, -H / 2 + 14 + dy, {
            width: W, align: 'center', characterSpacing: 2.5, lineBreak: false,
          });
        doc.lineWidth(0.9)
          .moveTo(-W / 2 + 20 + dx, -H / 2 + 25 + dy)
          .lineTo(W / 2 - 20 + dx, -H / 2 + 25 + dy)
          .stroke();

        // Bara PAID
        doc.font('Helvetica-Bold').fontSize(40)
          .text('PAID', -W / 2 + dx, -20 + dy, {
            width: W, align: 'center', characterSpacing: 10, lineBreak: false,
          });

        // Neeche syahi ki patti (is par tareekh likhi jayegi)
        doc.rect(-W / 2 + 20 + dx, H / 2 - 26 + dy, W - 40, 13).fill();
      };

      doc.save();
      doc.translate(cx, cy);
      doc.rotate(-12);

      drawStampBody(0.5, 0.4, 0.25); // halka ghost impression
      drawStampBody(0, 0, 0.9);      // asli impression

      // Patti par safed tareekh
      doc.fillOpacity(1).fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
        .text(`ONLINE PAYMENT  •  ${paidOn}`, -W / 2 + 20, H / 2 - 22.5, {
          width: W - 40, align: 'center', characterSpacing: 0.8, lineBreak: false,
        });

      // ---- Asli stamp ka texture ----
      // 1) Syahi kahin kam kahin zyada (bade halke safed dhabbe)
      for (let i = 0; i < 22; i++) {
        doc.fillOpacity(between(0.05, 0.13)).fillColor('#ffffff')
          .circle(between(-W / 2, W / 2), between(-H / 2, H / 2), between(6, 16)).fill();
      }

      // 2) Bareek daane (grain). Ek side par syahi kam lagi ho, jaise stamp tircha daba ho
      for (let i = 0; i < 2600; i++) {
        const x = between(-W / 2 - 3, W / 2 + 3);
        const y = between(-H / 2 - 3, H / 2 + 3);
        const fade = Math.min(1, Math.max(0, (x + W / 2) / W)); // right side zyada ghisa hua
        if (rand() > 0.2 + 0.7 * Math.pow(fade, 1.5)) continue;
        const r = rand() < 0.93 ? between(0.12, 0.45) : between(0.6, 1.3);
        doc.fillOpacity(between(0.6, 1)).fillColor('#ffffff').circle(x, y, r).fill();
      }

      // 3) Chhoti kharashein (ghisi hui rubber)
      for (let i = 0; i < 14; i++) {
        const x = between(-W / 2, W / 2);
        const y = between(-H / 2, H / 2);
        const len = between(6, 22);
        const ang = between(-0.4, 0.4);
        doc.strokeOpacity(between(0.5, 0.9)).strokeColor('#ffffff').lineWidth(between(0.4, 1.1))
          .moveTo(x, y).lineTo(x + len * Math.cos(ang), y + len * Math.sin(ang)).stroke();
      }

      doc.restore();
      doc.fillOpacity(1).strokeOpacity(1).fillColor('#000').strokeColor('#000').lineWidth(1);
    }

    // ---------------- SIGNATURE (left side) ----------------
    // Stamp ho to signature us ke neeche, warna totals ke neeche
    let signatureY = isPaidOnline ? yPosition + 140 : totalY + 50;
    if (signatureY > 710) {
      doc.addPage();
      addWatermark();
      addHeader();
      signatureY = HEADER_BOTTOM + 40;
    }

    doc.fillColor('#000').fontSize(10).font('Helvetica');
    doc.text('Signature: ___________________________', 40, signatureY);
    // QR code: signature ke saamne right side par
    const qrSize = 70;
    const qrX = 555 - qrSize;
    const qrY = Math.max(signatureY - 40, totalY + 22); // Grand Total se na takraye
    doc.image(qrImage, qrX, qrY, { width: qrSize });
    doc.font('Helvetica').fontSize(7.5).fillColor('#777')
      .text('Scan to view your orders', qrX - 20, qrY + qrSize + 3, {
        width: qrSize + 40, align: 'center', lineBreak: false,
      });
    // ---------------- FOOTER (page ke neeche, center) ----------------
    const footerY = pageHeight - 80;

    doc.font('Helvetica').fontSize(8).fillColor('#666');
    doc.text(`Thank you for shopping at TechnoZ!`, 40, footerY, { width: 515, align: 'center', lineBreak: false });
    doc.text(`This is a computer-generated invoice. No signature required.`, 40, footerY + 12, { width: 515, align: 'center', lineBreak: false });

    doc.end();
  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({ message: 'Error generating invoice', error: error.message });
  }
};
// Cancel order (customer)
exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // 🔒 Sirf order ka malik ya admin cancel kar sakta hai
    const isOwner = order.userId.toString() === req.user.id;
    if (!isOwner && !req.user.isAdmin) {
      return res.status(403).json({ message: "Not authorized to cancel this order" });
    }

    // Atomic: do baar cancel dabane par stock do baar wapas nahi hoga
    const cancelled = await Order.findOneAndUpdate(
            { _id: order._id, status: { $nin: ["Cancelled", "Delivered", "Returned"] } },
            { $set: { status: "Cancelled", cancelledAt: new Date(), statusUpdatedAt: new Date(), cancelledBy: isOwner ? "customer" : "admin" } },
      { new: true }
    );
    if (!cancelled) {
      return res.status(400).json({ message: "This order can no longer be cancelled" });
    }

    // Stock wapas (variation id sirf tab jab wo asli ObjectId ho, purane orders mein 'base' ho sakta hai)
    await releaseStock(toRestockItems(order));
    res.json({ message: "Order cancelled successfully", order: cancelled });
    req.app.get("io")?.emit("order:new"); // Admin panel ko signal
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ message: "Server error" });
  }
};
// ✅ Customer: return request (delivered order, 14 din ke andar)
exports.requestReturn = async (req, res) => {
  try {
    const { reason, comment } = req.body;
    if (!reason?.trim()) return res.status(400).json({ message: "Please select a reason for return." });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }
    if (order.status !== "Delivered") {
      return res.status(400).json({ message: "Only delivered orders can be returned." });
    }

    const deliveredAt = new Date(order.deliveredAt || order.statusUpdatedAt);
    const daysSince = (Date.now() - deliveredAt.getTime()) / 86400000;
    if (daysSince > RETURN_WINDOW_DAYS) {
      return res.status(400).json({ message: `The ${RETURN_WINDOW_DAYS}-day return window has ended.` });
    }

    const now = new Date();
    // Atomic: ek order par sirf ek return request
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: "Delivered", "returnRequest.status": null },
      {
        $set: {
          returnRequest: {
            status: "Requested",
            reason: reason.trim(),
            comment: comment?.trim() || "",
            requestedAt: now,
            updatedAt: now,
          },
        },
        $push: { statusHistory: { status: "Return Requested", comment: reason.trim(), timestamp: now } },
      },
      { new: true, runValidators: false }
    );
    if (!updated) {
      return res.status(400).json({ message: "A return has already been requested for this order." });
    }

    res.json({ message: "Return request submitted", order: updated });
    req.app.get("io")?.emit("order:new"); // Admin panel ko signal
  } catch (err) {
    console.error("❌ Return request error:", err);
    res.status(500).json({ message: "Failed to submit return request" });
  }
};
const RETURN_FLOW = {
  approve: ["Requested", "Approved"],
  reject: ["Requested", "Rejected"],
  receive: ["Approved", "Received"],
  refund: ["Received", "Refunded"],
};
// ✅ Admin: return ka agla step (approve / reject / receive / refund)
exports.updateReturnStatus = async (req, res) => {
  try {
    const { action, note, refundAmount } = req.body;
    const step = RETURN_FLOW[action];
    if (!step) return res.status(400).json({ message: "Invalid return action" });
    const [from, to] = step;

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const now = new Date();
    const set = { "returnRequest.status": to, "returnRequest.updatedAt": now, statusUpdatedAt: now };
    if (note?.trim()) set["returnRequest.adminNote"] = note.trim();

    // Maal wapas aa gaya: order "Returned"
    if (action === "receive") set.status = "Returned";

    if (action === "refund") {
      const amount = Number(refundAmount ?? order.total);
      if (!(amount > 0) || amount > order.total) {
        return res.status(400).json({ message: `Refund must be between 0 and AED ${order.total}` });
      }
      set["returnRequest.refundAmount"] = amount;
      set["returnRequest.refundedAt"] = now;
    }

    // Atomic: sirf sahi pichle step se hi aage jaye (stock do baar wapas na ho)
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, "returnRequest.status": from },
      {
        $set: set,
        $push: { statusHistory: { status: `Return ${to}`, comment: note?.trim() || `Return ${to.toLowerCase()}`, timestamp: now } },
      },
      { new: true, runValidators: false }
    );
    if (!updated) {
      return res.status(400).json({ message: `This return is not in "${from}" state.` });
    }

    // Maal godown mein wapas: stock bhi wapas
    if (action === "receive") await releaseStock(toRestockItems(order));

    res.json({ message: `Return ${to.toLowerCase()}`, order: updated });
  } catch (err) {
    console.error("❌ Update return error:", err);
    res.status(500).json({ message: "Failed to update return" });
  }
};

// ✅ Admin: packing ke waqt har product ka Part No + Serial No(s)
exports.updateItemSerials = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ message: "Items are required." });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "Cancelled") {
      return res.status(400).json({ message: "Cancelled orders cannot be updated." });
    }

    const clean = (v) => String(v || "").trim().toUpperCase().slice(0, 60);
    const set = {};

    for (const { itemId, partNumber, serialNumbers } of items) {
      const idx = order.products.findIndex((p) => String(p._id) === String(itemId));
      if (idx === -1) continue;

      const qty = order.products[idx].quantity;
      const serials = (Array.isArray(serialNumbers) ? serialNumbers : []).map(clean).filter(Boolean);

      if (serials.length > qty) {
        return res.status(400).json({ message: `Only ${qty} serial number(s) allowed for one item.` });
      }
      if (new Set(serials).size !== serials.length) {
        return res.status(400).json({ message: "The same serial number is entered twice." });
      }

      set[`products.${idx}.partNumber`] = clean(partNumber);
      set[`products.${idx}.serialNumbers`] = serials;
    }

    const updated = await Order.findByIdAndUpdate(order._id, { $set: set }, { new: true, runValidators: false });
    res.json({ message: "Serial numbers saved", order: updated });
  } catch (err) {
    console.error("❌ Save serials error:", err);
    res.status(500).json({ message: "Failed to save serial numbers" });
  }
};