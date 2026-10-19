// utils/pricing.js
// Price ka hisaab sirf yahin hota hai (cart, order, Stripe sab isi ko use karte hain).

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Shipping ka cost sirf server tay karta hai. Frontend ki list sirf dikhane ke liye hai.
const SHIPPING_METHODS = {
  "Standard Shipping": 0,
  "Express Delivery": 15,
  "Overnight Shipping": 30,
};

/**
 * Ek product + variation ki live price aur stock.
 * Variable product: variation ki price poori price hai.
 * Simple (purane) product: variation add-on hai.
 */
const getUnitPricing = (product, variationId) => {
  const isVariable = product.productType === "variable";
  const hasVariations = product.variations?.length > 0;

  let variation = null;
  if (hasVariations && variationId && variationId !== "base") {
    variation = product.variations.find((v) => String(v._id) === String(variationId)) || null;
  }

  const basePrice = Number(product.price) || 0;
  const discountPercent = Number(product.discountPercentage) || 0;
  const varPrice = variation ? Number(variation.price) || 0 : 0;

  let originalUnit;
  let unit;

  if (variation && !isVariable) {
    // Purana add-on product: discount sirf base par lagta hai, variation add-on poori jodi jati hai.
    // (ProductDetail ki display aur purane cart formula se yahi match karta hai)
    originalUnit = basePrice + varPrice;
    unit = Math.round(basePrice * (1 - discountPercent / 100)) + varPrice;
  } else {
    // Variable product ya bina variation: ek hi price par discount
    originalUnit = variation ? varPrice : basePrice;
    unit = Math.round(originalUnit * (1 - discountPercent / 100));
  }

  // Variable product mein variation zaroori hai. Na mile to item invalid hai.
  const valid = !(isVariable && !variation);

  return {
    valid,
    variation,
    discountPercent,
    originalUnit: round2(originalUnit),
    unit: round2(unit),
    stock: !valid ? 0 : variation ? Number(variation.quantity) || 0 : Number(product.quantity) || 0,
  };
};

module.exports = { getUnitPricing, round2, SHIPPING_METHODS };