// models/ContactMessage.js — har contact form message yahan save hota hai
const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 1500 },
    status: { type: String, enum: ['new', 'replied', 'closed'], default: 'new' },
    emailSent: { type: Boolean, default: false },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ContactMessage', contactMessageSchema);