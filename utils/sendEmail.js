// utils/sendEmail.js
// Production: Brevo HTTPS API (Railway/Render par SMTP band hota hai, HTTPS hamesha chalta hai).
// Local: BREVO_API_KEY na ho to purana Gmail SMTP.
const nodemailer = require('nodemailer');

const FROM_EMAIL = process.env.EMAIL_FROM || process.env.EMAIL_USER;
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'TechnoZ';

const sendViaBrevo = async (to, subject, html) => {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(15000), // 15 second se zyada intezar nahi
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo ${res.status}: ${body}`);
  }
  return res.json();
};

// Transporter ek hi dafa banta hai (har email par naya connection nahi)
let transporter;
const sendViaSmtp = async (to, subject, html) => {
  transporter ||= nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    connectionTimeout: 15000,
  });
  return transporter.sendMail({ from: `"${FROM_NAME}" <${FROM_EMAIL}>`, to, subject, html });
};

const sendEmail = async (to, subject, html) => {
  try {
    const info = process.env.BREVO_API_KEY
      ? await sendViaBrevo(to, subject, html)
      : await sendViaSmtp(to, subject, html);
    console.log(`✅ Email sent to ${to}: ${subject}`);
    return info;
  } catch (err) {
    console.error(`❌ Email failed to ${to}:`, err.message);
    throw err; // bulane wala code ko pata chale
  }
};

module.exports = sendEmail;