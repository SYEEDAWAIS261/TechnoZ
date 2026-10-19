const express = require('express');
const router = express.Router();
const { addProduct, getProducts, getProductMeta, updateProduct, deleteProduct, getProductBySlug, getLimitedProducts, getHighestDiscountProduct, getTopSellingProducts, toggleWishlist  } = require('../controllers/productController');
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/upload'); // ✅ fixed path
const requirePermission = require("../middleware/permissionMiddleware");
const admin = require('../middleware/adminMiddleware')
const { createProductReview } = require('../controllers/createProductReview');
const multer = require('multer');


// Add product with image upload
router.post(
  '/',
  auth,
  admin,
  requirePermission("products.create"),
  upload.array('images', 8),
  addProduct
);

router.get('/limited', getLimitedProducts);

router.get('/meta', getProductMeta);
// Get all products (public)
router.get('/', getProducts);
// Long wishlist ids ke liye — query string 414 de deti hai, body nahi.
// Wahi handler, params body se aate hain.
router.post('/query', getProducts);

// 🆕 Get top 3 best-selling products for banner
router.get("/top-products", getTopSellingProducts);

router.get("/highest-discount", getHighestDiscountProduct);
router.post('/wishlist/toggle/:productId', auth, toggleWishlist);
// Add this to fix the 404 error
router.put(
  '/:id',
  auth,
  admin,
  requirePermission("products.edit"),
  upload.array('images', 8),
  updateProduct
);

router.delete(
  '/:id',
  auth,   
  admin,
  requirePermission("products.delete"),
  deleteProduct
);
router.get('/slug/:slug', getProductBySlug);
router.post('/:id/reviews', auth, createProductReview);

// router.post("/:id/reviews",  createProductReview);
module.exports = router;
