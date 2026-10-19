const mongoose = require("mongoose");
const Media = require("../models/Media");
const {
  escapeRegex,
  humanize,
  findUsage,
  removeFile,
  importExistingUploads,
} = require("../services/mediaService");

const SEO_LIMITS = { alt: 160, title: 160, caption: 300, description: 500 };

// Sirf wohi SEO fields jo request mein aaye hain
const pickSeo = (body = {}) =>
  Object.fromEntries(
    Object.entries(SEO_LIMITS)
      .filter(([key]) => body[key] !== undefined)
      .map(([key, max]) => [key, String(body[key] ?? "").trim().slice(0, max)])
  );

const isId = (id) => mongoose.Types.ObjectId.isValid(id);

// GET /api/media?search=&folder=&page=&limit=
exports.listMedia = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 40));

    const filter = {};
    if (req.query.folder && req.query.folder !== "all") filter.folder = req.query.folder;

    const q = String(req.query.search || "").trim();
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ originalName: rx }, { filename: rx }, { title: rx }, { alt: rx }];
    }

    const [items, total] = await Promise.all([
      Media.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Media.countDocuments(filter),
    ]);

    res.json({ items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    console.error("listMedia error:", err);
    res.status(500).json({ message: "Failed to load media" });
  }
};

// POST /api/media  (multipart, field: "files")
exports.uploadMedia = async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ message: "No images received" });

  try {
    const items = await Media.insertMany(
      files.map((f) => ({
        url: `/uploads/media/${f.filename}`,
        filename: f.filename,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        folder: "media",
        title: humanize(f.originalname).slice(0, 160),
        uploadedBy: req.user?._id || null,
      }))
    );
    res.status(201).json({ items });
  } catch (err) {
    // DB save fail ho to disk par adhoori files na bachein
    await Promise.all(files.map((f) => removeFile(`/uploads/media/${f.filename}`).catch(() => {})));
    console.error("uploadMedia error:", err);
    res.status(500).json({ message: "Failed to save uploaded images" });
  }
};

// PUT /api/media/:id  { alt, title, caption, description }
exports.updateMedia = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: "Image not found" });

    const media = await Media.findByIdAndUpdate(
      req.params.id,
      { $set: pickSeo(req.body) },
      { new: true, runValidators: true }
    );
    if (!media) return res.status(404).json({ message: "Image not found" });

    res.json(media);
  } catch (err) {
    console.error("updateMedia error:", err);
    res.status(400).json({ message: err.message || "Failed to update image" });
  }
};

// GET /api/media/:id/usage
exports.getMediaUsage = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: "Image not found" });

    const media = await Media.findById(req.params.id).select("url").lean();
    if (!media) return res.status(404).json({ message: "Image not found" });

    res.json({ usage: await findUsage(media.url) });
  } catch (err) {
    console.error("getMediaUsage error:", err);
    res.status(500).json({ message: "Failed to check where this image is used" });
  }
};

// DELETE /api/media/:id  (sirf administrator, aur sirf jab image kahin use na ho)
exports.deleteMedia = async (req, res) => {
  try {
    if (req.user?.role !== "administrator") {
      return res.status(403).json({ message: "Only administrators can delete media" });
    }
    if (!isId(req.params.id)) return res.status(404).json({ message: "Image not found" });

    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).json({ message: "Image not found" });

    const usage = await findUsage(media.url);
    if (usage.length) {
      return res.status(409).json({
        message: `This image is used in ${usage.length} place(s). Replace it there before deleting.`,
        usage,
      });
    }

    await removeFile(media.url);
    await media.deleteOne();
    res.json({ message: "Image deleted" });
  } catch (err) {
    console.error("deleteMedia error:", err);
    res.status(500).json({ message: "Failed to delete image" });
  }
};

// POST /api/media/import  (purani uploads ko library mein laata hai)
exports.importMedia = async (req, res) => {
  try {
    const imported = await importExistingUploads();
    res.json({ imported });
  } catch (err) {
    console.error("importMedia error:", err);
    res.status(500).json({ message: "Failed to import existing images" });
  }
};