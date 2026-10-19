const express = require('express');
const router = express.Router();
const multer = require('multer');
const { 
createArticle,
getAllArticles,
getArticleById,
updateArticle,
deleteArticle
} = require('../controllers/articleController');
const protect = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware');
const requirePermission = require('../middleware/permissionMiddleware');
// Multer Setup
const storage = multer.diskStorage({
  destination: 'uploads/articles/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// Public Routes
router.get('/', getAllArticles);
router.get('/:id', getArticleById); // Is line se 404 error solve hoga

// Admin Routes (Yahan aap apni admin middleware bhi laga sakte hain)
router.post(
  '/',
  protect,
  admin,
  requirePermission("articles.create"),
  upload.single('image'),
  createArticle
);
router.put(
  '/:id',
  protect,
  admin,
  requirePermission("articles.edit"),
  upload.single('image'),
  updateArticle
);
router.delete(
  '/:id',
  protect,
  admin,
  requirePermission("articles.delete"),
  deleteArticle
);

module.exports = router;