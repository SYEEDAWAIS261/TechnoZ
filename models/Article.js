const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({

  // =========================
  // ARTICLE
  // =========================

  title: {
    type: String,
    required: true,
    trim: true
  },

  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  content: {
    type: String,
    required: true
  },

  category: {
    type: String,
    required: true,
    enum: ['Laptops', 'Tech News', 'Buying Guide', 'Reviews']
  },

  author: {
    type: String,
    default: 'Admin',
    trim: true
  },


  // =========================
  // FEATURED IMAGE
  // =========================

  image: {
    type: String,
    required: true
  },

  imageAlt: {
    type: String,
    trim: true,
    maxlength: 160
  },

  imageTitle: {
    type: String,
    trim: true,
    maxlength: 160
  },

  imageCaption: {
    type: String,
    trim: true,
    maxlength: 300
  },

  imageDescription: {
    type: String,
    trim: true,
    maxlength: 500
  },


  // =========================
  // SEO
  // =========================

  focusKeyword: {
    type: String,
    trim: true,
    maxlength: 100
  },

  seoTitle: {
    type: String,
    trim: true,
    maxlength: 60
  },

  metaDescription: {
    type: String,
    trim: true,
    maxlength: 160
  },


  // =========================
  // OTHER
  // =========================

  views: {
    type: Number,
    default: 0
  },

  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'published'
  }

}, { timestamps: true });


// Search optimization
articleSchema.index({
  title: 'text',
  content: 'text'
});

module.exports = mongoose.model('Article', articleSchema);