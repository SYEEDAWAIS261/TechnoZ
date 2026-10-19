const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { getUnitPricing, round2 } = require('../utils/pricing');

const addToCart = async (req, res) => {
  const { productId, quantity, selectedVariation } = req.body;
  const userId = req.user._id;
  const qty = Number(quantity);

  try {
    if (!productId || !qty || qty < 1) {
      return res.status(400).json({ message: 'Invalid product or quantity' });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Variation ki price, label aur stock DB se lein, client par bharosa na karein
    let variationId = 'base';
    let variationRam = null;
    let variationStorage = null;
    let variationLabel = null;
    let variationPrice = 0;
    let availableStock = Number(product.quantity) || 0;

      if (
  product.productType === 'variable' &&
  product.variations?.length > 0
) {
      const noChoice =
        !selectedVariation?.id || selectedVariation.id === "base";

      // Sirf ek hi variation ho aur client ne na bheji ho to wahi le lein
      const found =
        product.variations.length === 1 && noChoice
          ? product.variations[0]
          : product.variations.find(
              (v) => String(v._id) === String(selectedVariation?.id)
            );
      if (!found) {
        return res.status(400).json({ message: 'Please select a valid variation' });
      }
      variationId = String(found._id);
      variationRam = found.ram || null;
      variationStorage = found.storage || null;
      variationLabel = found.label || null;
      variationPrice = Number(found.price) || 0;
      availableStock = Number(found.quantity) || 0;
    }

    let cartItem = await Cart.findOne({
      user: userId,
      product: productId,
      'selectedVariation.id': variationId,
    });

    const alreadyInCart = cartItem ? cartItem.quantity : 0;
    if (alreadyInCart + qty > availableStock) {
      return res.status(400).json({
        message: availableStock > 0
          ? `Only ${availableStock} available in stock`
          : 'This item is out of stock',
      });
    }

    if (cartItem) {
      cartItem.quantity += qty;
      await cartItem.save();
    } else {
      cartItem = new Cart({
        user: userId,
        product: productId,
        quantity: qty,
       selectedVariation: {
        id: variationId,
        ram: variationRam,
        storage: variationStorage,
        label: variationLabel,
        price: variationPrice,
}
      });
      await cartItem.save();
    }

    const populatedItem = await Cart.findById(cartItem._id).populate('product');
    res.status(200).json({ message: 'Added to cart', cartItem: populatedItem });
  } catch (err) {
    console.error('❌ Backend Error:', err);
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
};
// ✅ Get Cart Items (Updated)
const getCart = async (req, res) => {
  try {
    const docs = await Cart.find({ user: req.user._id }).populate('product');
    const cart = [];

    for (const doc of docs) {
      if (!doc.product) continue; // product delete ho chuka hai

      const item = doc.toObject();
      const p = getUnitPricing(item.product, item.selectedVariation?.id);

      item.pricing = {
        unitPrice: p.unit,
        originalUnitPrice: p.originalUnit,
        discountPercent: p.discountPercent,
        lineTotal: round2(p.unit * item.quantity),
        originalLineTotal: round2(p.originalUnit * item.quantity),
        stock: p.stock,
      };
      cart.push(item);
    }

    res.status(200).json(cart);
  } catch (err) {
    console.error('❌ Get cart failed:', err);
    res.status(500).json({ message: 'Failed to fetch cart', error: err.message });
  }
};
// ✅ Delete Item from Cart
const deleteCartItem = async (req, res) => {
  try {
    const cartItem = await Cart.findById(req.params.id);

    if (!cartItem) return res.status(404).json({ message: 'Item not found' });

    if (cartItem.user.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Unauthorized' });

    await cartItem.deleteOne();
    res.status(200).json({ message: 'Item removed from cart' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete item', error: err.message });
  }
};
// ✅ Clear Full Cart
const clearCart = async (req, res) => {
  try {
    await Cart.deleteMany({ user: req.user._id });

    res.status(200).json({
      message: "Cart cleared successfully"
    });

  } catch (err) {
    res.status(500).json({
      message: "Failed to clear cart",
      error: err.message
    });
  }
};

// ✅ Update quantity of an existing cart item
const updateCartItemQuantity = async (req, res) => {
  try {
    const { quantity } = req.body;
    const qty = Number(quantity);

    if (!qty || qty < 1) {
      return res.status(400).json({ message: 'Quantity must be at least 1' });
    }

    const cartItem = await Cart.findById(req.params.id);
    if (!cartItem) return res.status(404).json({ message: 'Item not found' });

    if (cartItem.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const product = await Product.findById(cartItem.product);
if (product) {
  let limit = Number(product.quantity) || 0;
  const varId = cartItem.selectedVariation?.id;

  if (product.variations?.length > 0 && varId && varId !== 'base') {
    const found = product.variations.find((v) => String(v._id) === String(varId));
    if (found) limit = Number(found.quantity) || 0;
  }

  if (qty > limit) {
    return res.status(400).json({ message: `Only ${limit} available in stock` });
  }
}

    cartItem.quantity = qty;
    await cartItem.save();

    const populatedItem = await Cart.findById(cartItem._id).populate('product');
    res.status(200).json({ message: 'Quantity updated', cartItem: populatedItem });
  } catch (err) {
    console.error('❌ Update quantity failed:', err);
    res.status(500).json({ message: 'Failed to update quantity', error: err.message });
  }
};

module.exports = { addToCart, getCart, deleteCartItem, clearCart, updateCartItemQuantity };
