const Sale = require('../models/Sale');

// ---- chote helpers ----
const makeSlug = (str = '') =>
  str.toString().toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const toBool = (v, def = true) => {
  if (v === undefined || v === null || v === '') return def;
  return v === true || v === 'true' || v === 'on' || v === '1';
};

// productIds ko hamesha array banado (FormData string / JSON / array sab handle)
const parseProductIds = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const p = JSON.parse(val);
    return Array.isArray(p) ? p : [];
  } catch {
    return String(val).split(',').map((s) => s.trim()).filter(Boolean);
  }
};

// banner: nayi file ya URL string (DealManagement jaisa dono accept)
const bannerFrom = (req) => {
  if (req.file) return `/uploads/sales/${req.file.filename}`;
  if (req.body.bannerImage) return req.body.bannerImage;
  return undefined;
};

// ================= PUBLIC =================

// Saari live sales (abhi chal rahi)
exports.getActiveSales = async (req, res) => {
  try {
    const now = new Date();
    const sales = await Sale.find({
      isActive: true,
      startsAt: { $lte: now },
      endsAt: { $gt: now },
    })
      .sort({ priority: -1, createdAt: -1 })
      .populate('productIds');
    res.json(sales);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Slug se ek sale (landing page /sale/:slug ke liye)
exports.getSaleBySlug = async (req, res) => {
  try {
    const sale = await Sale.findOne({ slug: req.params.slug }).populate('productIds');
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    res.json(sale);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= ADMIN =================

exports.getAllSales = async (req, res) => {
  try {
    const sales = await Sale.find().sort({ createdAt: -1 }).populate('productIds');
    res.json(sales);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createSale = async (req, res) => {
  try {
    const b = req.body;
    const sale = await Sale.create({
      slug: makeSlug(b.slug || b.title),
      title: b.title,
      subtitle: b.subtitle,
      description: b.description,
      metaTitle: b.metaTitle,
      metaDescription: b.metaDescription,
      bannerImage: bannerFrom(req),
      badgeText: b.badgeText || 'BIG SALE',
      themeColor: b.themeColor || '#0E7F98',
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      showCountdown: toBool(b.showCountdown, true),
      ctaText: b.ctaText,
      ctaLink: b.ctaLink,
      productIds: parseProductIds(b.productIds),
      priority: Number(b.priority) || 0,
      isActive: toBool(b.isActive, true),
    });
    res.status(201).json(sale);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateSale = async (req, res) => {
  try {
    const b = req.body;
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });

    if (b.title !== undefined) sale.title = b.title;
    if (b.subtitle !== undefined) sale.subtitle = b.subtitle;
    if (b.description !== undefined) sale.description = b.description;
    if (b.metaTitle !== undefined) sale.metaTitle = b.metaTitle;
    if (b.metaDescription !== undefined) sale.metaDescription = b.metaDescription;
    if (b.badgeText !== undefined) sale.badgeText = b.badgeText;
    if (b.themeColor !== undefined) sale.themeColor = b.themeColor;
    if (b.startsAt !== undefined) sale.startsAt = b.startsAt;
    if (b.endsAt !== undefined) sale.endsAt = b.endsAt;
    if (b.ctaText !== undefined) sale.ctaText = b.ctaText;
    if (b.ctaLink !== undefined) sale.ctaLink = b.ctaLink;
    if (b.priority !== undefined) sale.priority = Number(b.priority) || 0;
    if (b.showCountdown !== undefined) sale.showCountdown = toBool(b.showCountdown);
    if (b.isActive !== undefined) sale.isActive = toBool(b.isActive);
    if (b.productIds !== undefined) sale.productIds = parseProductIds(b.productIds);

    // slug diya ho to update; warna purana SEO-safe rakho
    if (b.slug) sale.slug = makeSlug(b.slug);

    const banner = bannerFrom(req);
    if (banner) sale.bannerImage = banner;

    await sale.save();
    res.json(sale);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.closeSale = async (req, res) => {
  try {
    const sale = await Sale.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    res.json(sale);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.reopenSale = async (req, res) => {
  try {
    const sale = await Sale.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    res.json(sale);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findByIdAndDelete(req.params.id);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    res.json({ message: 'Sale deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};