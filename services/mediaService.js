const fs = require("fs/promises");
const path = require("path");
const Media = require("../models/Media");
const Product = require("../models/Product");
const Deal = require("../models/Deal");
const Promotion = require("../models/Promotion");
const Article = require("../models/Article");

const UPLOADS_ROOT = path.join(__dirname, "..", "uploads");
const FOLDERS = ["media", "products", "deals", "promotions", "articles"];
const IMAGE_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "uploads/a.webp" aur "/uploads/a.webp" ek hi file hain (articles bina "/" ke save hote thay)
const normalizeUrl = (url) => "/" + String(url || "").trim().replace(/^\/+/, "");
const urlVariants = (url) => {
  const u = normalizeUrl(url);
  return [u, u.slice(1)];
};

// "lenovo-loq-15-lq8x2k9a.webp" -> "lenovo loq 15"
const humanize = (filename) =>
  path
    .parse(String(filename || ""))
    .name.replace(/[-_]+/g, " ")
    .replace(/\b(?=[a-z]*\d)[a-z0-9]{8,}\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const clip = (v, max) => String(v || "").trim().slice(0, max);

// Yeh image kahan kahan use ho rahi hai (featured image + description/content ke andar)
async function findUsage(url) {
  const variants = urlVariants(url);
  const inHtml = { $regex: escapeRegex(path.basename(normalizeUrl(url))) };

  const [products, deals, promotions, articles] = await Promise.all([
    Product.find({
      $or: [{ image: { $in: variants } }, { "images.url": { $in: variants } }, { description: inHtml }],
    }).select("name").lean(),
    Deal.find({ bannerImage: { $in: variants } }).select("title").lean(),
    Promotion.find({ image: { $in: variants } }).select("title").lean(),
    Article.find({ $or: [{ image: { $in: variants } }, { content: inHtml }] }).select("title").lean(),
  ]);

  return [
    ...products.map((d) => ({ type: "product", id: d._id, label: d.name })),
    ...deals.map((d) => ({ type: "deal", id: d._id, label: d.title })),
    ...promotions.map((d) => ({ type: "promotion", id: d._id, label: d.title })),
    ...articles.map((d) => ({ type: "article", id: d._id, label: d.title })),
  ];
}

// File sirf "uploads" folder ke andar se hi delete ho sakti hai
async function removeFile(url) {
  const relative = normalizeUrl(url).replace(/^\/uploads\//, "");
  const abs = path.resolve(UPLOADS_ROOT, relative);
  if (!abs.startsWith(UPLOADS_ROOT + path.sep)) return;
  await fs.unlink(abs).catch((err) => {
    if (err.code !== "ENOENT") throw err;
  });
}

// uploads/* mein pari purani images ko library mein register karta hai (dobara chalana safe hai)
async function importExistingUploads() {
  // Jo SEO details pehle se likhi hain unhein saath le aao
  const metaByUrl = new Map();

  const products = await Product.find({ "images.0": { $exists: true } }).select("images").lean();
  products.forEach((p) =>
    (p.images || []).forEach((img) => {
      if (img?.url) metaByUrl.set(normalizeUrl(img.url), img);
    })
  );

  const articles = await Article.find({ image: { $nin: [null, ""] } })
    .select("image imageAlt imageTitle imageCaption imageDescription")
    .lean();
  articles.forEach((a) =>
    metaByUrl.set(normalizeUrl(a.image), {
      alt: a.imageAlt,
      title: a.imageTitle,
      caption: a.imageCaption,
      description: a.imageDescription,
    })
  );

  const existing = new Set((await Media.find().select("url").lean()).map((m) => m.url));
  const docs = [];

  for (const folder of FOLDERS) {
    let files = [];
    try {
      files = await fs.readdir(path.join(UPLOADS_ROOT, folder));
    } catch {
      continue; // folder maujood nahi
    }

    for (const filename of files) {
      const mimeType = IMAGE_TYPES[path.extname(filename).toLowerCase()];
      const url = `/uploads/${folder}/${filename}`;
      if (!mimeType || existing.has(url)) continue;

      const stat = await fs.stat(path.join(UPLOADS_ROOT, folder, filename));
      if (!stat.isFile()) continue;

      const meta = metaByUrl.get(url) || {};
      docs.push({
        url,
        filename,
        originalName: filename,
        mimeType,
        size: stat.size,
        folder,
        alt: clip(meta.alt, 160),
        title: clip(meta.title, 160) || clip(humanize(filename), 160),
        caption: clip(meta.caption, 300),
        description: clip(meta.description, 500),
        createdAt: stat.mtime,
      });
    }
  }

  if (docs.length) await Media.insertMany(docs, { ordered: false });
  return docs.length;
}

// Form se aaya URL check karta hai: sirf hamari "uploads" ki asli image qubool.
// File disk par hai magar library mein nahi, to library mein register kar deta hai.
async function ensureMedia(url) {
  if (!url || typeof url !== "string") return null;

  const clean = normalizeUrl(url.replace(/^https?:\/\/[^/]+/i, "")); // full URL -> path
  if (!clean.startsWith("/uploads/")) return null;
  if (await Media.exists({ url: clean })) return clean;

  const folder = clean.split("/")[2];
  if (!FOLDERS.includes(folder)) return null;

  const abs = path.resolve(UPLOADS_ROOT, clean.replace(/^\/uploads\//, ""));
  if (!abs.startsWith(UPLOADS_ROOT + path.sep)) return null;

  const mimeType = IMAGE_TYPES[path.extname(abs).toLowerCase()];
  const stat = await fs.stat(abs).catch(() => null);
  if (!mimeType || !stat?.isFile()) return null;

  const filename = path.basename(abs);
  await Media.updateOne(
    { url: clean },
    {
      $setOnInsert: {
        url: clean,
        filename,
        originalName: filename,
        mimeType,
        size: stat.size,
        folder,
        title: clip(humanize(filename), 160),
      },
    },
    { upsert: true }
  );
  return clean;
}

// Products/Deals/Promotions/Articles ke forms se upload hui files ko library mein daalta hai
async function registerUploads(files = [], folder, metaFor = () => ({})) {
  if (!files.length) return;

  const ops = files.map((f, i) => {
    const meta = metaFor(f, i) || {};
    const url = `/uploads/${folder}/${f.filename}`;
    return {
      updateOne: {
        filter: { url },
        update: {
          $setOnInsert: {
            url,
            filename: f.filename,
            originalName: f.originalname,
            mimeType: f.mimetype,
            size: f.size,
            folder,
            alt: clip(meta.alt, 160),
            title: clip(meta.title, 160) || clip(humanize(f.originalname), 160),
            caption: clip(meta.caption, 300),
            description: clip(meta.description, 500),
          },
        },
        upsert: true,
      },
    };
  });

  await Media.bulkWrite(ops, { ordered: false });
}

module.exports = {
  escapeRegex,
  normalizeUrl,
  humanize,
  findUsage,
  removeFile,
  importExistingUploads,
  ensureMedia,
  registerUploads,
};