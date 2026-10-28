// utils/orderEmails.js
// Order confirmation email: COD aur Stripe dono yahi function bulate hain.
const Order = require('../models/Order');
const User = require('../models/User');
const sendEmail = require('./sendEmail');

const CLIENT_URL = process.env.CLIENT_URL || 'https://technoz-a4377.web.app';
const money = (n) => `AED ${Number(n || 0).toFixed(2)}`;
// Customer ka likha text (naam, address) email mein HTML na ban sake
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const itemRow = (item) => {
  const name = item.productName || item.productId?.name || 'Product';
  const v = item.selectedVariation || {};
  const variant = [v.ram && `RAM: ${v.ram}`, v.storage && `Storage: ${v.storage}`].filter(Boolean).join(' · ') || v.label || '';
  const original = item.originalPriceAtOrder || item.priceAtOrder;
  const hasDiscount = original > item.priceAtOrder;

  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #edf2f7;">
        <div style="font-weight:600;color:#1a202c;">${esc(name)}</div>
        ${variant ? `<div style="font-size:13px;color:#718096;">${esc(variant)}</div>` : ''}
        <div style="font-size:13px;color:#718096;">Qty: ${item.quantity}</div>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #edf2f7;text-align:right;white-space:nowrap;">
        ${hasDiscount ? `<div style="font-size:12px;color:#a0aec0;text-decoration:line-through;">${money(original)}</div>` : ''}
        <strong style="color:#198754;">${money(item.priceAtOrder)}</strong>
      </td>
    </tr>`;
};

const buildHtml = (order, user) => {
  const a = order.shippingAddress || {};
  const coupon = Number(order.couponDiscount) || 0;
  const itemsSubtotal = (Number(order.subtotal) || 0) + coupon; // subtotal coupon ke baad save hota hai
  const isPaid = order.paymentMethod !== 'Cash on Delivery';
  const ref = order.orderNumber || order.trackingId || String(order._id).slice(-6).toUpperCase();

  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;background:#f4f4f7;padding:30px 12px;">
    <div style="max-width:620px;margin:0 auto;background:#fff;padding:28px;border-radius:10px;">
      <h1 style="margin:0 0 6px;color:#1a202c;font-size:22px;">Thank you for your order!</h1>
      <p style="margin:0 0 20px;color:#718096;">Hi ${esc(user.name || user.username || 'Customer')}, your order has been confirmed.</p>

      <div style="background:#f9fafb;border:1px solid #e2e8f0;border-radius:8px;padding:18px;">
        <p style="margin:0 0 4px;font-size:13px;color:#718096;"><strong>Order:</strong> #${esc(ref)}</p>
        <p style="margin:0 0 14px;font-size:13px;color:#718096;"><strong>Payment:</strong> ${esc(order.paymentMethod)} ${isPaid ? '(Paid)' : '(Pay on delivery)'}</p>

        <table width="100%" style="border-collapse:collapse;font-size:14px;color:#4a5568;">
          ${order.products.map(itemRow).join('')}
        </table>

        <table width="100%" style="border-collapse:collapse;font-size:14px;color:#4a5568;margin-top:12px;">
          <tr><td style="padding:4px 0;">Items subtotal</td><td style="text-align:right;">${money(itemsSubtotal)}</td></tr>
          ${coupon > 0 ? `<tr><td style="padding:4px 0;color:#198754;">Coupon (${esc(order.couponCode)})</td><td style="text-align:right;color:#198754;">- ${money(coupon)}</td></tr>` : ''}
          <tr><td style="padding:4px 0;">Shipping</td><td style="text-align:right;">${order.shippingCost > 0 ? money(order.shippingCost) : 'FREE'}</td></tr>
          <tr><td style="padding:12px 0 0;font-size:17px;font-weight:700;color:#1a202c;border-top:2px solid #edf2f7;">Total</td>
              <td style="padding:12px 0 0;font-size:17px;font-weight:700;color:#198754;text-align:right;border-top:2px solid #edf2f7;">${money(order.total)}</td></tr>
        </table>

        <div style="text-align:center;margin-top:20px;">
          <a href="${CLIENT_URL}/orders" style="display:inline-block;padding:12px 24px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">View your order</a>
        </div>
      </div>

      <h3 style="margin:24px 0 8px;color:#1a202c;font-size:15px;">Shipping address</h3>
      <p style="margin:0;color:#4a5568;line-height:1.6;">
        ${esc(a.fullName)}<br/>${esc(a.street)}<br/>
        ${esc([a.city, a.state].filter(Boolean).join(', '))} ${esc(a.postalCode || '')}<br/>${esc(a.country)}
        ${a.phone ? `<br/>Phone: ${esc(a.phone)}` : ''}
      </p>

      <p style="margin:28px 0 0;font-size:13px;color:#a0aec0;">This is an automated email. Please do not reply.<br/>© ${new Date().getFullYear()} TechnoZ UAE</p>
    </div>
  </div>`;
};

// Kabhi throw nahi karta: email fail ho to order par asar na pade, sirf log aaye
const sendOrderConfirmationEmail = async (orderId) => {
  try {
    const order = await Order.findById(orderId).populate('products.productId', 'name');
    if (!order) return;
    const user = await User.findById(order.userId).select('name username email');
    if (!user?.email) return;

    const ref = order.orderNumber || order.trackingId || '';
    await sendEmail(user.email, `Order Confirmed #${ref} | TechnoZ UAE`, buildHtml(order, user));
  } catch (err) {
    console.error('❌ Order confirmation email failed:', String(orderId), err.message);
  }
};

module.exports = { sendOrderConfirmationEmail };