/**
 * Purani local images (Backend/uploads) ko Cloudinary par le jata hai aur
 * database mein har jagah "/uploads/..." ko Cloudinary URL se badal deta hai.
 *
 * Chalane ka tareeqa (Backend folder mein):
 *   node scripts/migrateToCloudinary.js          -> sirf report (kuch nahi badalta)
 *   node scripts/migrateToCloudinary.js --apply  -> upload + database update
 *
 * Dobara chalana safe hai: jo images pehle upload ho chuki hain wo
 * scripts/cloudinary-map.json se pehchani jati hain aur dobara upload nahi hotin.
 */
require("dotenv").config();
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");

const APPLY = process.argv.includes("--apply");
const UPLOADS_ROOT = path.join(__dirname, "..", "uploads");
const MAP_FILE = path.join(__dirname, "cloudinary-map.json");
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".jfif"];
const SKIP_COLLECTIONS = /^system\./;

// "/uploads/products/a b.webp", "uploads/products/a%20b.webp", "https://x.up.railway.app/uploads/..." sab ek key
const keyOf = (raw) => {
  let p = String(raw).replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
  try {
    p = decodeURIComponent(p);
  } catch {}
  return "/" + p.replace(/^\/+/, "");
};

// Text ke andar har "/uploads/..." dhoondta hai (HTML description/content ke andar bhi)
const UPLOAD_RX = /(?:https?:\/\/[^\s"'()<>]+?)?\/?uploads\/[^\s"'()<>]+/gi;

const cleanBase = (name) =>
  path.parse(name).name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "image";

async function walk(dir) {
  const out = [];
  for (const entry of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(abs)));
    else if (IMAGE_EXTS.includes(path.extname(entry.name).toLowerCase())) out.push(abs);
  }
  return out;
}

async function uploadAll(map) {
  const files = await walk(UPLOADS_ROOT);
  console.log(`📁 Local images mili: ${files.length}`);
  let uploaded = 0;
  let failed = 0;

  for (const abs of files) {
    const rel = path.relative(UPLOADS_ROOT, abs).split(path.sep).join("/");
    const key = `/uploads/${rel}`;
    if (map[key]) continue; // pehle ho chuki

    const sub = rel.includes("/") ? rel.split("/")[0] : "media";
    if (!APPLY) {
      map[key] = { url: `(cloudinary)${key}`, pending: true }; // sirf report ke liye, save nahi hota
      uploaded++;
      continue;
    }

    try {
      const res = await cloudinary.uploader.upload(abs, {
        folder: `technoz/${sub}`,
        public_id: cleanBase(path.basename(rel)),
        unique_filename: true, // naam takraye to Cloudinary khud alag bana de
        overwrite: false,
        resource_type: "image",
      });
      map[key] = { url: res.secure_url, publicId: res.public_id, bytes: res.bytes, width: res.width, height: res.height };
      uploaded++;
      if (uploaded % 20 === 0) {
        fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
        console.log(`   ⬆️  ${uploaded} upload ho gayin...`);
      }
    } catch (err) {
      failed++;
      console.error(`   ❌ ${key}: ${err.message}`);
    }
  }

  if (APPLY) fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
  console.log(APPLY ? `✅ Upload: ${uploaded} nayi, ${failed} fail` : `ℹ️  Upload hongi: ${uploaded}`);
}

// Kisi bhi document ke andar har string mein purane path badalta hai
function rewrite(value, map, missing) {
  if (typeof value === "string") {
    if (!value.includes("uploads/")) return value;
    return value.replace(UPLOAD_RX, (match) => {
      if (!keyOf(match).startsWith("/uploads/")) return match; // kisi aur site ka "uploads" (jaise WordPress)
      const hit = map[keyOf(match)];
      if (hit) return hit.url;
      missing.add(keyOf(match));
      return match;
    });
  }
  if (Array.isArray(value)) return value.map((v) => rewrite(v, map, missing));
  if (value && typeof value === "object" && value.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewrite(v, map, missing);
    return out;
  }
  return value; // ObjectId, Date wagaira waise hi
}

async function updateDatabase(map) {
  const db = mongoose.connection.db;
  const collections = (await db.listCollections().toArray())
    .map((c) => c.name)
    .filter((n) => !SKIP_COLLECTIONS.test(n));

  const missing = new Set();
  let changedDocs = 0;

  for (const name of collections) {
    const col = db.collection(name);
    let count = 0;
    const cursor = col.find({});
    for await (const doc of cursor) {
      const next = rewrite(doc, map, missing);
      if (JSON.stringify(next) === JSON.stringify(doc)) continue;

      // Media library: Cloudinary ID aur size bhi
      if (name === "media" && map[keyOf(doc.url)]) {
        const hit = map[keyOf(doc.url)];
        next.publicId = hit.publicId;
        next.width = hit.width;
        next.height = hit.height;
      }

      count++;
      if (APPLY) await col.replaceOne({ _id: doc._id }, next);
    }
    if (count) console.log(`   📝 ${name}: ${count} documents ${APPLY ? "update hue" : "update honge"}`);
    changedDocs += count;
  }

  console.log(`${APPLY ? "✅" : "ℹ️ "} Database: ${changedDocs} documents`);
  if (missing.size) {
    console.log(`\n⚠️  Ye ${missing.size} images database mein hain lekin aap ke uploads folder mein nahi mili:`);
    [...missing].slice(0, 50).forEach((m) => console.log("   - " + m));
    if (missing.size > 50) console.log(`   ... aur ${missing.size - 50}`);
    console.log("   In ko admin panel se dobara upload karna hoga.");
  }
}

(async () => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_SECRET) {
    console.error("❌ .env mein CLOUDINARY_* variables nahi mile.");
    process.exit(1);
  }
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ .env mein MONGO_URI nahi mila.");
    process.exit(1);
  }

  console.log(APPLY ? "🚀 APPLY mode: upload + database update\n" : "🔍 REPORT mode: kuch nahi badlega (--apply se chalayein)\n");

  const map = fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE, "utf8")) : {};
  await uploadAll(map);

  await mongoose.connect(uri);
  await updateDatabase(map);
  await mongoose.disconnect();
  console.log("\nDone.");
})().catch(async (err) => {
  console.error("❌ Migration failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});