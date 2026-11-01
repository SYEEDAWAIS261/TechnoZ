// routes/contact.js — POST /api/contact
// Message DB mein save -> foran jawab -> email background mein (Brevo, utils/sendEmail)
const express = require('express');
const router = express.Router();
const ContactMessage = require('../models/ContactMessage');
const sendEmail = require('../utils/sendEmail');

const CONTACT_TO = process.env.CONTACT_TO || process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM;
const CLIENT_URL = process.env.CLIENT_URL || 'https://technoz-a4377.web.app';
const SUPPORT_WHATSAPP = process.env.SUPPORT_WHATSAPP || '+971 55 641 5976';

// Customer ka text email mein HTML na ban sake
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

// Simple spam guard: ek IP se 10 minute mein 5 messages
const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;
const tooMany = (ip) => {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear(); // memory hamesha chhoti rahe
  return list.length > MAX_HITS;
};

const adminHtml = (m) => `
  <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;color:#334155;max-width:600px">
    <h2 style="margin:0 0 12px;color:#0f172a">New contact message</h2>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td style="color:#64748b">Name</td><td><b>${esc(m.name)}</b></td></tr>
      <tr><td style="color:#64748b">Email</td><td><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></td></tr>
      <tr><td style="color:#64748b">Topic</td><td>${esc(m.subject)}</td></tr>
      <tr><td style="color:#64748b">Received</td><td>${new Date(m.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })} (UAE)</td></tr>
    </table>
    <div style="margin-top:14px;padding:14px;background:#f8fafc;border-radius:10px;white-space:pre-wrap">${esc(m.message)}</div>
    <p style="margin-top:16px"><a href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + m.subject)}"
      style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reply to ${esc(m.name)}</a></p>
  </div>`;

const customerHtml = (m) => `
  <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;color:#334155;max-width:560px;line-height:1.6">
    <p>Hi ${esc(m.name)},</p>
    <p>Thanks for contacting <b>TechnoZ</b>. We’ve received your message about <b>${esc(m.subject)}</b> and our team will reply to this email address shortly (every day, 9 AM – 10 PM UAE time).</p>
    <p>Need a faster answer? Message us on WhatsApp:
      <a href="https://wa.me/${SUPPORT_WHATSAPP.replace(/\D/g, '')}">${esc(SUPPORT_WHATSAPP)}</a></p>
    <p style="color:#64748b;font-size:12px;margin-top:20px">Your message:<br>${esc(m.message).replace(/\n/g, '<br>')}</p>
    <p style="color:#94a3b8;font-size:12px">TechnoZ UAE · <a href="${CLIENT_URL}">${CLIENT_URL.replace(/^https?:\/\//, '')}</a></p>
  </div>`;

router.post('/', async (req, res) => {
  const name = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const subject = String(req.body.subject || '').trim();
  const message = String(req.body.textarea || '').trim();

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }
  if (message.length < 10) {
    return res.status(400).json({ success: false, message: 'Please add a few more details to your message.' });
  }
  if (tooMany(req.ip)) {
    return res.status(429).json({ success: false, message: 'Too many messages. Please try again in a few minutes or contact us on WhatsApp.' });
  }

  let saved;
  try {
    saved = await ContactMessage.create({
      name: name.slice(0, 80),
      email: email.slice(0, 120),
      subject: subject.slice(0, 120),
      message: message.slice(0, 1500),
      ip: req.ip,
    });
  } catch (err) {
    console.error('❌ Contact message save failed:', err.message);
    return res.status(500).json({ success: false, message: 'Could not send your message. Please try again.' });
  }

  // ✅ Customer ko foran jawab (email ka intezar nahi)
  res.status(200).json({ success: true, message: 'Message sent successfully' });

  // 📨 Emails background mein — fail hon to bhi message DB mein mehfooz hai
  (async () => {
    try {
      if (CONTACT_TO) {
        await sendEmail(CONTACT_TO, `New message: ${saved.subject} — ${saved.name}`, adminHtml(saved));
        await ContactMessage.updateOne({ _id: saved._id }, { emailSent: true });
      } else {
        console.warn('⚠️ CONTACT_TO / SUPPORT_EMAIL / EMAIL_FROM set nahi — admin email nahi gayi');
      }
      await sendEmail(saved.email, 'We received your message | TechnoZ UAE', customerHtml(saved));
    } catch (err) {
      console.error('❌ Contact email failed:', String(saved._id), err.message);
    }
  })();
});

module.exports = router;