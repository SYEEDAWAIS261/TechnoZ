const mongoose = require('mongoose');
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');

// Card dikhane ke liye sirf zaroori fields
const CARD_FIELDS =
  'name slug image price discountPercentage discountPrice saleEndsAt productType quantity brand category rating numReviews';

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const toIds = (list = []) => list.map((id) => String(id));

// GET /api/wishlist  → poore products (Wishlist page ke liye)
exports.getWishlist = async (req, res) => {
  try {
    const wl = await Wishlist.findOne({ user: req.user._id }).populate({
      path: 'products',
      select: CARD_FIELDS,
    });

    if (!wl) return res.json({ products: [], ids: [], count: 0 });

    const products = wl.products.filter(Boolean);

    // Admin ne koi product delete kar diya ho to wishlist se bhi saaf karo
    const original = wl.populated('products') || [];
    if (original.length !== products.length) {
      await Wishlist.updateOne(
        { _id: wl._id },
        { $set: { products: products.map((p) => p._id) } }
      );
    }

    const newestFirst = [...products].reverse();
    res.json({
      products: newestFirst,
      ids: toIds(products.map((p) => p._id)),
      count: products.length,
    });
  } catch (err) {
    console.error('getWishlist error:', err);
    res.status(500).json({ message: 'Failed to load wishlist' });
  }
};

// GET /api/wishlist/ids  → sirf IDs (heart icons aur count ke liye, bohat halka)
exports.getWishlistIds = async (req, res) => {
  try {
    const wl = await Wishlist.findOne({ user: req.user._id }).select('products').lean();
    const ids = toIds(wl?.products);
    res.json({ ids, count: ids.length });
  } catch (err) {
    console.error('getWishlistIds error:', err);
    res.status(500).json({ message: 'Failed to load wishlist' });
  }
};

// POST /api/wishlist/:productId  → add (dobara add karne par duplicate nahi banta)
exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!isValidId(productId)) return res.status(400).json({ message: 'Invalid product id' });

    const exists = await Product.exists({ _id: productId });
    if (!exists) return res.status(404).json({ message: 'Product not found' });

    const wl = await Wishlist.findOneAndUpdate(
      { user: req.user._id },
      { $addToSet: { products: productId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    const ids = toIds(wl.products);
    res.json({ message: 'Added to wishlist', ids, count: ids.length });
  } catch (err) {
    console.error('addToWishlist error:', err);
    res.status(500).json({ message: 'Failed to update wishlist' });
  }
};

// DELETE /api/wishlist/:productId  → remove
exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!isValidId(productId)) return res.status(400).json({ message: 'Invalid product id' });

    const wl = await Wishlist.findOneAndUpdate(
      { user: req.user._id },
      { $pull: { products: productId } },
      { new: true }
    ).lean();

    const ids = toIds(wl?.products);
    res.json({ message: 'Removed from wishlist', ids, count: ids.length });
  } catch (err) {
    console.error('removeFromWishlist error:', err);
    res.status(500).json({ message: 'Failed to update wishlist' });
  }
};

// DELETE /api/wishlist  → poori wishlist khaali
exports.clearWishlist = async (req, res) => {
  try {
    await Wishlist.updateOne({ user: req.user._id }, { $set: { products: [] } });
    res.json({ message: 'Wishlist cleared', ids: [], count: 0 });
  } catch (err) {
    console.error('clearWishlist error:', err);
    res.status(500).json({ message: 'Failed to clear wishlist' });
  }
};