const Product = require("../models/Product");
const Counter = require("../models/Counter");

const MAX_LEN = 64;

class SkuError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
  }
}

// "len loq 15 / 16gb" -> "LEN-LOQ-15-16GB" (sirf A-Z 0-9 . _ -)
const normalizeSku = (value) =>
  String(value || "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9._-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, MAX_LEN);

const brandPrefix = (brand) =>
  String(brand || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "TZ";

// Har naye product ka apna number (atomic, kabhi repeat nahi hota)
const nextProductSku = async (brand) => {
  const { seq } = await Counter.findByIdAndUpdate(
    "productSku",
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${brandPrefix(brand)}-${String(seq).padStart(5, "0")}`;
};

// 16GB + "1TB SSD" -> "16GB-1TBSSD"
const variationSuffix = (v, index) =>
  [v.ram, v.storage]
    .map((part) => normalizeSku(part).replace(/[-._]/g, ""))
    .filter(Boolean)
    .join("-") || `V${index + 1}`;

/**
 * Product + variations ke SKU tay karta hai:
 * likha hua SKU normalize hota hai, khaali ho to ban jata hai,
 * aur poore catalog mein unique hona check hota hai.
 */
const assignSkus = async ({ productId = null, brand, productType, sku, variations }) => {
  const productSku = normalizeSku(sku) || (await nextProductSku(brand));
  const list = Array.isArray(variations) ? variations : [];
  const used = new Set([productSku]);
  let resultVariations;

  if (productType !== "variable") {
    // Simple product ki variations istemal nahi hotin: un par SKU nahi rakhte
    resultVariations = list.map((v) => {
      const copy = { ...v };
      delete copy.sku;
      return copy;
    });
  } else {
    // Pehle admin ke likhe hue SKU, phir khaali walon ke liye naye
    const manual = list.map((v) => normalizeSku(v.sku));
    manual.forEach((value) => {
      if (!value) return;
      if (used.has(value)) throw new SkuError(`SKU "${value}" is used more than once in this product.`);
      used.add(value);
    });

    resultVariations = list.map((v, i) => {
      if (manual[i]) return { ...v, sku: manual[i] };
      const base = `${productSku}-${variationSuffix(v, i)}`.slice(0, MAX_LEN);
      let value = base;
      for (let n = 2; used.has(value); n += 1) value = `${base}-${n}`;
      used.add(value);
      return { ...v, sku: value };
    });
  }

  // Kisi aur product (ya us ki variation) mein to yeh SKU nahi?
  const all = [...used];
  const clash = await Product.findOne({
    ...(productId && { _id: { $ne: productId } }),
    $or: [{ sku: { $in: all } }, { "variations.sku": { $in: all } }],
  })
    .select("name sku variations.sku")
    .lean();

  if (clash) {
    const taken = [clash.sku, ...(clash.variations || []).map((v) => v.sku)].find((s) => used.has(s));
    throw new SkuError(`SKU "${taken}" is already used by "${clash.name}".`);
  }

  return { sku: productSku, variations: resultVariations };
};

module.exports = { assignSkus, normalizeSku, SkuError };