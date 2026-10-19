const mongoose = require("mongoose");
require("dotenv").config();

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.collection("products");

  const r = await col.deleteMany({});
  console.log(`🗑️  ${r.deletedCount} products deleted`);

  try {
    await col.dropIndexes();
    console.log("🧹 Indexes dropped");
  } catch (e) {
    console.log("Index drop skipped:", e.message);
  }

  process.exit(0);
})();