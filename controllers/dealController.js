const Deal = require('../models/Deal');
const mongoose = require('mongoose');
const slugify = require('slugify');
const { ensureMedia, registerUploads } = require('../services/mediaService');
const isLive = (deal) => {
  const now = Date.now();
  return (
    deal.isActive &&
    new Date(deal.startsAt).getTime() <= now &&
    new Date(deal.endsAt).getTime() > now
  );
};

const getActiveDeals = async (req, res) => {
  try {
    const now = new Date();
    const deals = await Deal.find({
      isActive: true,
      startsAt: { $lte: now },
      endsAt: { $gt: now },
    })
      .populate('productIds', 'name images price discountPercentage slug')
      .populate('product', 'name images price discountPercentage slug')
      .sort({ priority: -1, createdAt: -1 });

    res.status(200).json(deals);
  } catch (err) {
    console.error('❌ Failed to fetch active deals:', err);
    res.status(500).json({ message: 'Failed to fetch active deals', error: err.message });
  }
};

// PUBLIC: Fetch single deal by slug
const getDealBySlug = async (req, res) => {
  try {
    const deal = await Deal.findOne({ slug: req.params.slug })
      .populate('productIds', 'name images price discountPercentage slug rating')
      .populate('product', 'name images price discountPercentage slug rating');

    if (!deal) return res.status(404).json({ message: 'Deal not found' });

    res.status(200).json({ ...deal.toObject(), isLive: isLive(deal) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch deal', error: err.message });
  }
};
// ADMIN: Fetch all deals
const getAllDeals = async (req, res) => {
  try {
    const deals = await Deal.find()
      .populate('productIds', 'name images price')
      .populate('product', 'name images price')
      .sort({ createdAt: -1 });

    const withStatus = deals.map((d) => ({
      ...d.toObject(),
      isLive: isLive(d),
    }));

    res.status(200).json(withStatus);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch deals', error: err.message });
  }
};

// ADMIN: Create deal
const createDeal = async (req, res) => {
  try {
    const {
      title,
      subtitle,
      description,
      bannerImage,
      badgeText,
      startsAt,
      endsAt,
      ctaText,
      ctaLink,
      secondaryCtaText,
      secondaryCtaLink,
      productIds,
      product,
      discountPercentage,
      category,
      priority,
      metaTitle,
      metaDescription,
    } = req.body;

      if (!title || !startsAt || !endsAt) {
      return res.status(400).json({ message: 'title, startsAt and endsAt are required' });
    }

    if (new Date(startsAt) >= new Date(endsAt)) {
      return res.status(400).json({ message: 'endsAt must be after startsAt' });
    }

    // Banner: nayi file ya Media Library se chuni hui image
    let finalBannerImage = '';
    if (req.file) {
      finalBannerImage = `/uploads/deals/${req.file.filename}`;
      registerUploads([req.file], 'deals').catch((e) => console.error('Media library register failed:', e.message));
    } else if (bannerImage) {
      finalBannerImage = (await ensureMedia(bannerImage)) || '';
    }

    if (!finalBannerImage) {
      return res.status(400).json({ message: 'A banner image is required (upload one or choose from the Media Library)' });
    }

    // Slug generation
    let baseSlug = slugify(title, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;
    while (await Deal.findOne({ slug })) {
      slug = `${baseSlug}-${counter++}`;
    }

    // ✅ FIX: Purana new Deal() block hata kar direct Deal.create use kiya hai
    const deal = await Deal.create({
      slug,
      title,
      subtitle,
      description,
      bannerImage: finalBannerImage, // Multer image path yaha save hoga
      badgeText,
      startsAt,
      endsAt,
      ctaText,
      ctaLink,
      secondaryCtaText,
      secondaryCtaLink,
      productIds,
      product,
      discountPercentage,
      category,
      priority,
      metaTitle: metaTitle || title,
      metaDescription: metaDescription || description,
    });

    res.status(201).json({ message: 'Deal created', deal });
  } catch (err) {
    console.error('❌ Failed to create deal:', err);
    res.status(500).json({ message: 'Failed to create deal', error: err.message });
  }
};

// ADMIN: Update deal
// controllers/dealController.js

const updateDeal = async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ message: 'Deal not found' });

    // ✅ Slug regeneration on title change
    if (req.body.title && req.body.title !== deal.title) {
      let baseSlug = slugify(req.body.title, { lower: true, strict: true });
      let slug = baseSlug;
      let counter = 1;
      while (await Deal.findOne({ slug, _id: { $ne: deal._id } })) {
        slug = `${baseSlug}-${counter++}`;
      }
      req.body.slug = slug;
    }

    // ✅ FIX 1: Handle `product` field — could be a slug string, ObjectId, or populated object
    if (req.body.product !== undefined) {
      if (typeof req.body.product === 'object' && req.body.product !== null && req.body.product._id) {
        // Populated object came back from frontend — extract _id
        req.body.product = req.body.product._id;
      } else if (typeof req.body.product === 'string' && mongoose.Types.ObjectId.isValid(req.body.product)) {
        // Already a valid ObjectId string — keep as-is
      } else if (typeof req.body.product === 'string' && req.body.product.length > 0) {
        // It's a slug string — look up the Product to get its _id
        try {
          const Product = require('../models/Product');
          const productDoc = await Product.findOne({ slug: req.body.product });
          req.body.product = productDoc ? productDoc._id : null;
        } catch (lookupErr) {
          console.error('⚠️ Product lookup failed:', lookupErr);
          req.body.product = null;
        }
      } else {
        // Empty string or null — clear the reference
        req.body.product = null;
      }
    }

    // ✅ FIX 2: Remove fields that must not be overwritten
    delete req.body._id;
    delete req.body.__v;
    delete req.body.createdAt;
    delete req.body.updatedAt;

    // ✅ FIX 3: Remove `isLive` if frontend accidentally sends it (it's a virtual, not a schema field)
    delete req.body.isLive;
    if (req.file) {
      req.body.bannerImage = `/uploads/deals/${req.file.filename}`;
      registerUploads([req.file], 'deals').catch((e) => console.error('Media library register failed:', e.message));
    } else if (req.body.bannerImage) {
      // Library ka sahi URL ho to lagao, warna (blob preview waghera) purana banner hi rahe
      const url = await ensureMedia(req.body.bannerImage);
      if (url) req.body.bannerImage = url;
      else delete req.body.bannerImage;
    }
    Object.assign(deal, req.body);
    await deal.save();

    res.status(200).json({ message: 'Deal updated', deal });
  } catch (err) {
    console.error('❌ Failed to update deal:', err);  // ✅ Now you'll see the REAL error in terminal
    res.status(500).json({ message: 'Failed to update deal', error: err.message });
  }
};
// ADMIN: Toggle Close
const closeDeal = async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ message: 'Deal not found' });

    deal.isActive = false;
    await deal.save();
    res.json({ message: 'Deal closed successfully', deal });
  } catch (error) {
    res.status(500).json({ message: 'Error closing deal' });
  }
};

// ADMIN: Toggle Reopen
const reopenDeal = async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) return res.status(404).json({ message: 'Deal not found' });

    deal.isActive = true;
    await deal.save();
    res.json({ message: 'Deal reopened successfully', deal });
  } catch (error) {
    res.status(500).json({ message: 'Error reopening deal' });
  }
};

// ADMIN: Permanent Delete
const deleteDeal = async (req, res) => {
  try {
    const deal = await Deal.findByIdAndDelete(req.params.id);
    if (!deal) return res.status(404).json({ message: 'Deal not found' });
    res.status(200).json({ message: 'Deal deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete deal', error: err.message });
  }
};

module.exports = {
  getActiveDeals,
  getDealBySlug,
  getAllDeals,
  createDeal,
  updateDeal,
  closeDeal,
  reopenDeal,
  deleteDeal,
};