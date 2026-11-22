const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const {
  getActiveSales,
  getSaleBySlug,
  getAllSales,
  createSale,
  updateSale,
  closeSale,
  reopenSale,
  deleteSale,
} = require('../controllers/saleController');

const protect = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');

// ===== Sale image upload dir =====
const uploadDir = path.join(__dirname, '..', 'uploads', 'sales');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const fileFilter = (req, file, cb) => {
  const okExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.jfif'];
  const okMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (okExt.includes(ext) || okMime.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only image files are allowed'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// ===== PUBLIC =====
router.get('/active', getActiveSales);
router.get('/slug/:slug', getSaleBySlug);

// ===== ADMIN =====
router.get('/', protect, isAdmin, getAllSales);
router.post('/', protect, isAdmin, upload.single('image'), createSale);
router.put('/:id', protect, isAdmin, upload.single('image'), updateSale);
router.patch('/:id/close', protect, isAdmin, closeSale);
router.patch('/:id/reopen', protect, isAdmin, reopenSale);
router.delete('/:id', protect, isAdmin, deleteSale);

module.exports = router;