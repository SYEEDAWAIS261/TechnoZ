// utils/orderEmails.js
// Order confirmation email: COD aur Stripe dono yahi function bulate hain.
const Order = require('../models/Order');
const User = require('../models/User');
const sendEmail = require('./sendEmail');

const CLIENT_URL = process.env.CLIENT_URL || 'https://technoz-a4377.web.app';
const API_URL = process.env.API_PUBLIC_URL || 'https://technoz-production.up.railway.app';
const SUPPORT_WHATSAPP = process.env.SUPPORT_WHATSAPP || '+971 55 641 5976';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'z.techno.service@gmail.com';

// Design: Template E (Pastel Header). Sirf ek accent rang.
const ACCENT = '#4f7cac';
const BAND = '#eef4fa';
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const money = (n) =>
  `AED ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Customer ka likha text (naam, address) email mein HTML na ban sake
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Email mein image sirf poore public URL se dikhti hai
const imgUrl = (src) => (!src ? '' : /^https?:\/\//.test(src) ? src : `${API_URL}/${String(src).replace(/^\/+/, '')}`);
const waLink = `https://wa.me/${SUPPORT_WHATSAPP.replace(/\D/g, '')}`;
const label = (t) =>
  `<div style="font-size:12px;font-weight:600;color:#94a3b8;letter-spacing:1px;">${t}</div>`;

const itemRow = (item) => {
  const name = item.productName || item.productId?.name || 'Product';
  const v = item.selectedVariation || {};
  const variant = [v.ram && `RAM ${v.ram}`, v.storage && `SSD ${v.storage}`].filter(Boolean).join(' · ') || v.label || '';
  const img = imgUrl(item.productImage || item.productId?.image);
  const qty = Number(item.quantity) || 1;
  const price = Number(item.priceAtOrder) || 0;
  const original = Number(item.originalPriceAtOrder) || price;
  const saved = (original - price) * qty;

  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:14px;">
    <tr>
      ${img ? `<td width="72" valign="top">
        <img src="${esc(img)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:contain;border-radius:12px;background:#f5f6f8;border:0;">
      </td>` : ''}
      <td valign="top" style="padding-left:${img ? '14px' : '0'};">
        <div style="font-size:14px;font-weight:600;color:#1e293b;line-height:1.4;">${esc(name)}</div>
        ${variant ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px;">${esc(variant)}</div>` : ''}
        <div style="font-size:12px;color:#94a3b8;margin-top:2px;">Quantity: ${qty}</div>
      </td>
      <td valign="top" align="right" style="white-space:nowrap;padding-left:8px;">
        <div style="font-size:14px;font-weight:600;color:#1e293b;">${money(price * qty)}</div>
        ${saved > 0 ? `<div style="font-size:11px;color:#6aa58a;margin-top:3px;">You save ${money(saved)}</div>` : ''}
      </td>
    </tr>
  </table>`;
};

const buildHtml = (order, user) => {
  const a = order.shippingAddress || {};
  const coupon = Number(order.couponDiscount) || 0;
  const itemsSubtotal = (Number(order.subtotal) || 0) + coupon; // subtotal coupon ke baad save hota hai
  const shipping = Number(order.shippingCost) || 0;
  const isCod = order.paymentMethod === 'Cash on Delivery';
  const ref = order.orderNumber || order.trackingId || String(order._id).slice(-6).toUpperCase();
  const date = new Date(order.createdAt || Date.now())
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const customer = esc(user.name || user.username || a.fullName || 'there');
  const address = [a.fullName, a.street, [a.city, a.state].filter(Boolean).join(', '), a.country, a.phone]
    .filter(Boolean).map(esc).join('<br>');
  const payNote = isCod
    ? 'Cash on Delivery · please keep the amount ready at delivery'
    : `Paid online (${esc(order.paymentMethod)})`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order #${esc(ref)} confirmed</title>
<style>
  @media (max-width:600px){
    .px{padding-left:20px!important;padding-right:20px!important}
    .stack{display:block!important;width:100%!important}
    .h1{font-size:22px!important}
  }
</style></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:${FONT};color:#334155;">
<!-- Inbox mein subject ke saath dikhne wala chhota text -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Order #${esc(ref)} confirmed · Total ${money(order.total)}</div>

<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:28px 12px;">
<table width="600" cellpadding="0" cellspacing="0" role="presentation"
  style="max-width:600px;width:100%;border:1px solid #e8eef4;border-radius:16px;overflow:hidden;">

  <!-- Header -->
  <tr><td class="px" style="background:${BAND};padding:26px 36px 30px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td><a href="${CLIENT_URL}" style="text-decoration:none;font-size:19px;font-weight:800;font-style:italic;color:#334155;">TECHNO<span style="color:${ACCENT};">Z</span></a></td>
      <td align="right" style="font-size:12px;color:#7c93ab;">#${esc(ref)}</td>
    </tr></table>
    <div class="h1" style="font-size:26px;font-weight:700;color:#1e293b;margin-top:26px;">Thanks, your order is confirmed</div>
    <div style="font-size:15px;color:#5f7489;margin-top:8px;line-height:1.6;">
      Hi ${customer}, thanks for choosing TechnoZ. Here's a summary of what you ordered on ${date}.
    </div>
  </td></tr>

  <!-- Items -->
  <tr><td class="px" style="padding:28px 36px 6px;">
    <div style="margin-bottom:14px;">${label('ITEMS IN YOUR ORDER')}</div>
    ${order.products.map(itemRow).join('')}
  </td></tr>

  <!-- Totals -->
  <tr><td class="px" style="padding:4px 36px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f8fafc;border-radius:12px;">
      <tr><td style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:14px;color:#64748b;">
          <tr><td style="padding:4px 0;">Subtotal</td><td align="right">${money(itemsSubtotal)}</td></tr>
          ${coupon > 0 ? `<tr><td style="padding:4px 0;">Coupon ${esc(order.couponCode)}</td><td align="right">&minus;${money(coupon)}</td></tr>` : ''}
          <tr><td style="padding:4px 0;">${esc(order.shippingMethod || 'Shipping')}</td><td align="right">${shipping > 0 ? money(shipping) : 'Free'}</td></tr>
          <tr>
            <td style="padding:12px 0 2px;border-top:1px solid #e8eef4;font-size:15px;font-weight:700;color:#1e293b;">Total</td>
            <td align="right" style="padding:12px 0 2px;border-top:1px solid #e8eef4;font-size:17px;font-weight:700;color:#1e293b;">${money(order.total)}</td>
          </tr>
          <tr><td colspan="2" style="padding-top:4px;font-size:12px;color:#94a3b8;">${payNote}</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Address + Next steps -->
  <tr><td class="px" style="padding:24px 36px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td class="stack" width="50%" valign="top" style="padding:0 10px 18px 0;">
        ${label('DELIVER TO')}
        <div style="font-size:14px;color:#475569;line-height:1.65;margin-top:6px;">${address}</div>
      </td>
      <td class="stack" width="50%" valign="top" style="padding:0 0 18px;">
        ${label('WHAT HAPPENS NEXT')}
        <div style="font-size:14px;color:#475569;line-height:1.65;margin-top:6px;">
          We check and pack your order, then our courier delivers it within 1–2 business days.
          We'll email you when it ships.
        </div>
      </td>
    </tr></table>
  </td></tr>

  <!-- Button -->
  <tr><td class="px" align="center" style="padding:6px 36px 30px;">
    <a href="${CLIENT_URL}/orders" style="display:inline-block;border:1.5px solid ${ACCENT};color:${ACCENT};text-decoration:none;font-size:14px;font-weight:600;padding:12px 30px;border-radius:10px;">Track my order</a>
  </td></tr>

  <!-- Footer -->
  <tr><td class="px" align="center" style="background:#fafbfc;border-top:1px solid #eef2f6;padding:22px 36px;font-size:12px;color:#94a3b8;line-height:1.9;">
    Questions? WhatsApp <a href="${waLink}" style="color:${ACCENT};text-decoration:none;">${esc(SUPPORT_WHATSAPP)}</a>
    &middot; <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${esc(SUPPORT_EMAIL)}</a><br>
    <a href="${CLIENT_URL}/products" style="color:#64748b;text-decoration:none;">Shop</a> &middot;
    <a href="${CLIENT_URL}/orders" style="color:#64748b;text-decoration:none;">My Orders</a> &middot;
    <a href="${CLIENT_URL}/contact" style="color:#64748b;text-decoration:none;">Contact</a><br>
    Genuine products &middot; Official warranty &middot; Fast UAE delivery<br>
    TechnoZ UAE &middot; Al-Ain, Abu Dhabi, United Arab Emirates<br>
    You received this email because you placed an order at TechnoZ. &copy; ${new Date().getFullYear()} TechnoZ
  </td></tr>

</table></td></tr></table>
</body></html>`;
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