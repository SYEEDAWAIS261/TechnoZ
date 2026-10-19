const fs = require('fs');
const multer = require('multer');
const path = require('path');

// Helper to ensure a folder exists
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Choose destination dynamically based on route
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'uploads';

    // If uploading profile image
    if (req.baseUrl.includes('auth') || req.url.includes('profile')) {
      folder = 'uploads/profile';
    } else if (req.baseUrl.includes('product')) {
      folder = 'uploads/products';
    }

    const fullPath = path.join(__dirname, '..', folder);
    ensureDir(fullPath);
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

// Is portion ko update karein
const fileFilter = (req, file, cb) => {
  // 1. Extension list mein .jfif add karein
  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.jfif']; 
  const ext = path.extname(file.originalname).toLowerCase();
  
  // 2. MIME types check karein (jfif ka mime type bhi image/jpeg hi hota hai)
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

  if (allowedExts.includes(ext) || allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// Final multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = upload;
