const multer = require('multer');
const path = require('path');
const cloudinary = require('../config/cloudinary');

// Route dekh kar Cloudinary folder chunein (technoz/products, technoz/profile, ...)
const folderFor = (req) => {
  const url = `${req.baseUrl}${req.url}`.toLowerCase();
  if (url.includes('auth') || url.includes('profile')) return 'profile';
  if (url.includes('product')) return 'products';
  if (url.includes('deal')) return 'deals';
  if (url.includes('promotion')) return 'promotions';
  if (url.includes('article')) return 'articles';
  return 'media';
};

// File ka saaf naam: "HP Laptop (1).jpg" -> "hp-laptop-1"
const cleanBase = (name) =>
  path.parse(name).name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';

// Multer storage jo disk ki bajaye seedha Cloudinary par bhejta hai
const cloudinaryStorage = {
  _handleFile(req, file, cb) {
    const folder = folderFor(req);
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `technoz/${folder}`,
        public_id: `${Date.now()}-${cleanBase(file.originalname)}`,
        resource_type: 'image',
        overwrite: false,
      },
      (err, result) => {
        if (err) return cb(err);
        cb(null, {
          path: result.secure_url, // poora https URL
          filename: result.public_id, // Cloudinary ID (delete ke liye)
          publicId: result.public_id,
          size: result.bytes,
          width: result.width,
          height: result.height,
          format: result.format,
          folder,
        });
      }
    );
    file.stream.pipe(stream);
  },
  _removeFile(req, file, cb) {
    if (!file.publicId) return cb(null);
    cloudinary.uploader.destroy(file.publicId).then(() => cb(null)).catch(cb);
  },
};

const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.jfif', '.avif'];
const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext) || allowedMimes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files are allowed'), false);
};

const upload = multer({
  storage: cloudinaryStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Uploaded file ka URL: Cloudinary ho to poora URL, purani local file ho to /uploads/...
upload.fileUrl = (file, folder = '') =>
  /^https?:\/\//i.test(file?.path || '')
    ? file.path
    : `/uploads/${folder ? `${folder}/` : ''}${file?.filename}`;

module.exports = upload;