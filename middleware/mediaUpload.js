const upload = require("./upload");

// Media Library: ek request mein 20 images tak (frontend bhi 20-20 ke batch bhejta hai)
const handler = upload.array("files", 20);

// Multer/Cloudinary ki ghalti saaf message ke saath 400 bane, global 500 nahi
module.exports = (req, res, next) =>
  handler(req, res, (err) => {
    if (!err) return next();

    let message = err.message || "Upload failed";
    if (err.code === "LIMIT_FILE_SIZE") message = "Each image must be 5 MB or smaller.";
    if (err.code === "LIMIT_UNEXPECTED_FILE") message = "Too many files. Upload up to 20 at a time.";
    if (err.http_code) message = "Image host rejected the upload. Please try again.";

    console.error("mediaUpload error:", err);
    res.status(err.http_code ? 502 : 400).json({ message });
  });