const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { slugify } = require("../utils/slugify");

const MEDIA_DIR = path.join(__dirname, "..", "uploads", "media");
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// SVG jaan bujh kar allowed nahi (us ke andar script chal sakti hai)
const ALLOWED = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MEDIA_DIR),
  // SEO-friendly naam: "Lenovo LOQ 15.webp" -> "lenovo-loq-15-lq8x2k9a.webp"
  filename: (req, file, cb) => {
    const base = slugify(path.parse(file.originalname).name).slice(0, 80) || "image";
    const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    cb(null, `${base}-${unique}${ALLOWED[file.mimetype]}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED[file.mimetype]) return cb(null, true);
    const err = new Error("Only JPG, PNG, WEBP, GIF or AVIF images are allowed");
    err.code = "INVALID_TYPE";
    cb(err);
  },
});

// Multer ki errors ko saaf 400 JSON message mein badalta hai
const mediaUpload = (req, res, next) =>
  upload.array("files", 20)(req, res, (err) => {
    if (!err) return next();
    const messages = {
      LIMIT_FILE_SIZE: "Each image must be 5 MB or smaller",
      LIMIT_FILE_COUNT: "You can upload up to 20 images at once",
      LIMIT_UNEXPECTED_FILE: "Images must be sent in the 'files' field",
    };
    res.status(400).json({ message: messages[err.code] || err.message });
  });

module.exports = mediaUpload;