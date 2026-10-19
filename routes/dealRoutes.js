const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const {
  getActiveDeals,
  getDealBySlug,
  getAllDeals,
  createDeal,
  updateDeal,
  closeDeal,
  reopenDeal,
  deleteDeal,
} = require('../controllers/dealController');

const protect = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');
const requirePermission = require("../middleware/permissionMiddleware");
// ==========================================
// DEAL IMAGE UPLOAD DIRECTORY
// ==========================================

const uploadDir = path.join(
  __dirname,
  '..',
  'uploads',
  'deals'
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ==========================================
// DEAL IMAGE MULTER STORAGE
// ==========================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const safeFilename = file.originalname.replace(/\s+/g, '_');

    cb(
      null,
      `${Date.now()}-${safeFilename}`
    );
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExts = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.jfif',
  ];

  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];

  const ext = path.extname(file.originalname).toLowerCase();

  if (
    allowedExts.includes(ext) ||
    allowedMimes.includes(file.mimetype)
  ) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// ==========================================
// PUBLIC ROUTES
// ==========================================

router.get('/active', getActiveDeals);

router.get('/slug/:slug', getDealBySlug);

// ==========================================
// ADMIN ROUTES
// ==========================================

router.get(
  '/',
  protect,
  isAdmin,
  getAllDeals
);

router.post(
  '/',
  protect,
  isAdmin,
  requirePermission("deals.create"),
  upload.single('image'),
  createDeal
);

router.put(
  '/:id',
  protect,
  isAdmin,
  requirePermission("deals.edit"),
  upload.single('image'),
  updateDeal
);

router.patch(
  '/:id/close',
  protect,
  isAdmin,
  requirePermission("deals.edit"),
  closeDeal
);

router.patch(
  '/:id/reopen',
  protect,
  isAdmin,
  requirePermission("deals.edit"),
  reopenDeal
);

router.delete(
  '/:id',
  protect,
  isAdmin,
  requirePermission("deals.delete"),
  deleteDeal
);

module.exports = router;