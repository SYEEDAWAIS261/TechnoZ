const express = require('express');
const router = express.Router();
const { addToCart, getCart, deleteCartItem, clearCart, updateCartItemQuantity } = require('../controllers/cartController');
const protect = require('../middleware/authMiddleware');

// POST /api/cart/add
router.post('/add', protect, addToCart);

// DELETE /api/cart/clear
router.delete('/clear', protect, clearCart);
// GET /api/cart/
router.get('/', protect, getCart);
router.patch('/:id', protect, updateCartItemQuantity);
// DELETE /api/cart/:id
router.delete('/:id', protect, deleteCartItem);

module.exports = router;
