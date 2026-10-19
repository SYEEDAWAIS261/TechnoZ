// Purane products ko SKU dena. Backend folder se chalayein: node scripts/backfillSkus.js
require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Product");
const { assignSkus } = require("../services/skuService");

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const products = await Product.find({})
    .select("name brand productType sku variations")
    .sort({ createdAt: 1 })
    .lean();

  let updated = 0;
  for (const p of products) {
    const missing =
      !p.sku || (p.productType === "variable" && (p.variations || []).some((v) => !v.sku));
    if (!missing) continue;

    const result = await assignSkus({
      productId: p._id,
      brand: p.brand,
      productType: p.productType,
      sku: p.sku,
      variations: p.variations,
    });
    await Product.updateOne({ _id: p._id }, { $set: result });
    updated += 1;
    console.log(`${result.sku}  ${p.name}`);
  }

  await Product.createIndexes(); // unique SKU indexes
  console.log(`Done: ${updated} of ${products.length} products updated.`);
};

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());