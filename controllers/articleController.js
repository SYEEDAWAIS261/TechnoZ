const mongoose = require('mongoose');
const Article = require('../models/Article');
const { ensureMedia, registerUploads } = require('../services/mediaService');

// Featured image: nayi file ya Media Library se chuni hui.
// Articles mein path bina "/" ke save hota hai ("uploads/articles/x.webp"), wahi format rakha hai.
const resolveArticleImage = async (req) => {
  if (req.file) {
    registerUploads([req.file], 'articles', () => ({
      alt: req.body.imageAlt,
      title: req.body.imageTitle,
      caption: req.body.imageCaption,
      description: req.body.imageDescription,
    })).catch((err) => console.error('Media library register failed:', err.message));
    return `uploads/articles/${req.file.filename}`;
  }
  if (req.body.image) {
    const url = await ensureMedia(req.body.image);
    return url ? url.slice(1) : null;
  }
  return null;
};

// 1. Create Article
exports.createArticle = async (req, res) => {
  try {
    const {
      title,
      slug: customSlug,
      content,
      category,
      author,

      // Image SEO
      imageAlt,
      imageTitle,
      imageCaption,
      imageDescription,

      // SEO
      focusKeyword,
      seoTitle,
      metaDescription
    } = req.body;


    // =========================
    // UNIQUE SLUG GENERATOR
    // =========================

   const createSlug = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};


// =========================
// CUSTOM OR AUTO SLUG
// =========================

let slug = customSlug?.trim()
  ? createSlug(customSlug)
  : createSlug(title);


// =========================
// UNIQUE SLUG
// =========================

const existing = await Article.findOne({ slug });

if (existing) {
  slug = `${slug}-${Date.now()}`;
}


    // =========================
    // CREATE ARTICLE
    // =========================

       const featuredImage = await resolveArticleImage(req);
    if (!featuredImage) {
      return res.status(400).json({ success: false, error: "Featured image is required" });
    }

    const newArticle = new Article({
      title,
      slug,
      content,
      category,

      author: author || "Admin",

      // Featured Image
      image: featuredImage,

      // Image SEO
      imageAlt,
      imageTitle,
      imageCaption,
      imageDescription,

      // SEO
      focusKeyword,
      seoTitle,
      metaDescription
    });


    await newArticle.save();

    res.status(201).json({
      success: true,
      article: newArticle
    });

  } catch (err) {

    console.error("Error creating article:", err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// 2. Get All Articles (With Pagination & Category Filter)
exports.getAllArticles = async (req, res) => {
  try {
    const { page = 1, limit = 9, category } = req.query;
    const query = category
  ? { category, status: "published" }
  : { status: "published" };

    const articles = await Article.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Article.countDocuments(query);

    res.json({
      articles,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getArticleById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if the id is a valid MongoDB ObjectId format
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { _id: id } : { slug: id };

    const article = await Article.findOne(query);
    
    if (!article) return res.status(404).json({ message: "Article not found" });

    article.views += 1;
    await article.save();

    res.json(article);
  } catch (err) {
  console.error("Error fetching article:", err);

  res.status(500).json({
    error: err.message
  });
}
};
// 4. Delete Article
exports.deleteArticle = async (req, res) => {
  try {
    await Article.findByIdAndDelete(req.params.id);
    res.json({ message: "Article deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 5. Update Article
exports.updateArticle = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      title,
      slug: customSlug,
      content,
      category,
      author,

      imageAlt,
      imageTitle,
      imageCaption,
      imageDescription,

      focusKeyword,
      seoTitle,
      metaDescription
    } = req.body;

    const article = await Article.findById(id);

    if (!article) {
      return res.status(404).json({
        message: "Article not found"
      });
    }

    const createSlug = (text) => {
      return text
        .toLowerCase()
        .trim()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    };

    let slug = customSlug?.trim()
      ? createSlug(customSlug)
      : createSlug(title);

    const existing = await Article.findOne({
      slug,
      _id: { $ne: id }
    });

    if (existing) {
      slug = `${slug}-${Date.now()}`;
    }

    article.title = title;
    article.slug = slug;
    article.content = content;
    article.category = category;
    article.author = author || "Admin";

    article.imageAlt = imageAlt;
    article.imageTitle = imageTitle;
    article.imageCaption = imageCaption;
    article.imageDescription = imageDescription;

    article.focusKeyword = focusKeyword;
    article.seoTitle = seoTitle;
    article.metaDescription = metaDescription;

        // Nayi file ya library ki image aayi to badlo, warna purani rahe
    const newImage = await resolveArticleImage(req);
    if (newImage) article.image = newImage;

    await article.save();

    res.json({
      success: true,
      message: "Article updated successfully.",
      article
    });

  } catch (err) {
    console.error("Error updating article:", err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};