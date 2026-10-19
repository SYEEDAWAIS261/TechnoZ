const mongoose = require('mongoose');
const Product = require('../models/Product');
const Subscriber = require('../models/Subscriber');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const Order = require("../models/Order");
const Wishlist = require('../models/Wishlist');
const { ensureMedia, registerUploads } = require('../services/mediaService');
const { assignSkus } = require('../services/skuService');


// 🧹 Paste kiye gaye description se &nbsp; aur inline styles saaf karta hai
const cleanDescription = (html) =>
  String(html || '')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/\s*style="[^"]*"/gi, '')
    .replace(/\s*class="[^"]*"/gi, '')
    .replace(/<span\s*>|<\/span>/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

   // 💸 Discount (AED): kitne AED kam karne hain. Isay discount % mein badalta hai
// taakay card, product page, cart aur order sab sahi price lagayein.
const applyDiscountPrice = (data) => {
  if (data.productType === "variable") return;

  const price = Number(data.price) || 0;
  const discountAmount = Number(data.discountPrice) || 0; // e.g. 201 = AED 201 off
  if (discountAmount <= 0) return; // khaali hai to jo % likha hai wohi chalega

  if (price > 0 && discountAmount < price) {
    data.discountPercentage = Number(((discountAmount / price) * 100).toFixed(4));
  } else {
    // Discount price se zyada ya barabar hai to discount nahi
        data.discountPercentage = 0;
    data.discountPrice = null;
  }
};

// 🖼️ Gallery: library ki images + nayi files, admin ki di hui tarteeb mein.
// galleryImages = [{ url, alt, title, caption, description } | { fileIndex, alt, ... }]
const IMAGE_SEO_KEYS = ['alt', 'title', 'caption', 'description'];
const pickImageSeo = (m = {}) =>
  Object.fromEntries(IMAGE_SEO_KEYS.map((k) => [k, String(m[k] || '').trim()]));

const buildGallery = async (raw, files = []) => {
  if (raw === undefined) return null; // purana form: galleryImages nahi bheja

  let list;
  try {
    list = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;

  const images = [];
  const fileMeta = {};

  for (const item of list) {
    let url = null;
    if (Number.isInteger(item?.fileIndex) && files[item.fileIndex]) {
      url = `/uploads/products/${files[item.fileIndex].filename}`;
      fileMeta[item.fileIndex] = item;
    } else if (item?.url) {
      url = await ensureMedia(item.url);
    }
    if (url && !images.some((img) => img.url === url)) {
      images.push({ url, ...pickImageSeo(item) });
    }
  }

  return { images, fileMeta };
};

const logMediaError = (err) => console.error('Media library register failed:', err.message);
// ✅ ADD NEW PRODUCT & NOTIFY SUBSCRIBERS
exports.addProduct = async (req, res) => {
  try {
  const {
  name, brand, description, price, category,
  condition, processor, partNumber, ram, storage, display,
  quantity, discountPercentage, discountPrice,
  faqs, specifications, variations, keyFeatures,
  isBannerProduct, bannerTitle, expiryDate,
  seoTitle, seoDescription, productTags, focusKeyword, slug: manualSlug,
  productType,
} = req.body;
    // logic: Agar ye product banner hai, toh baaki sab ko false kar do
    if (isBannerProduct === 'true' || isBannerProduct === true) {
            await Product.updateMany({}, { isBannerProduct: false });
    }

    // 🖼️ Gallery: library ki images + nayi files, admin ki di hui tarteeb mein
    const gallery = await buildGallery(req.body.galleryImages, req.files || []);
    if (!gallery?.images.length) {
      return res.status(400).json({ message: 'At least one product image is required.' });
    }
    const finalImages = gallery.images;
    registerUploads(req.files || [], 'products', (f, i) => gallery.fileMeta[i]).catch(logMediaError);

    // 🆕 Key Features Parsing
    let parsedKeyFeatures = [];
    try {
      parsedKeyFeatures = typeof keyFeatures === 'string' ? JSON.parse(keyFeatures) : keyFeatures;
    } catch (e) {
      console.error("Key Features parsing failed");
    }
    // Safe JSON Parsing for Specifications
    let parsedSpecs = [];
    try {
      
      parsedSpecs = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
    } catch (e) {
      console.error("Specs parsing failed, using empty array");
    }

    let parsedFaqs = [];
    try {
      parsedFaqs = typeof faqs === 'string' ? JSON.parse(faqs) : faqs;
    } catch (e) {
      console.error("FAQ parsing failed, using empty array");
    }

    let parsedVariations = [];
    try {
      parsedVariations = typeof variations === 'string' ? JSON.parse(variations) : variations;
    } catch (e) {
      console.error("Variations parsing failed, using empty array");
    }
       // Admin manual slug de sakta hai; warna naam se ban jayega.
    const slug = await Product.generateUniqueSlug(manualSlug || name);
    let parsedTags = [];
    // Variable product: price = sab se kam variation price, quantity = total stock
let finalPrice = price;
let finalQuantity = quantity;

if (productType === "variable") {
  const prices = (parsedVariations || [])
    .map((v) => Number(v.price))
    .filter((p) => p > 0);

  if (!prices.length) {
    return res.status(400).json({
      message: "Variable product needs at least one variation with a price.",
    });
  }
  finalPrice = Math.min(...prices);
  finalQuantity = parsedVariations.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0);
}

try {
  parsedTags =
    typeof productTags === "string"
      ? JSON.parse(productTags)
      : productTags || [];
} catch (err) {
  console.error("Tags Parse Error:", err);
}
       // 🏷️ SKU: product aur har variation ka (khaali ho to khud banta hai)
    const skus = await assignSkus({ brand, productType, sku: req.body.sku, variations: parsedVariations });

    const disc = { productType, price: finalPrice, discountPrice, discountPercentage };
    applyDiscountPrice(disc);
    const product = new Product({
      name,
      slug,
      brand,
      description: cleanDescription(description),
      price,
      category,
            image: finalImages[0]?.url || '',
      images: finalImages,
      processor,
      partNumber: partNumber || '',
      sku: skus.sku,
      ram,
      storage,
      display,
      quantity: Number(quantity) || 0,
      discountPercentage: Math.min(100, Math.max(0, Number(disc.discountPercentage) || 0)),
      discountPrice: disc.discountPrice || null,
      specifications: parsedSpecs, // ✅ Database mein save ho raha hai
      faqs: parsedFaqs,
      variations: skus.variations,
      keyFeatures: parsedKeyFeatures,
      isBannerProduct: isBannerProduct === 'true' || isBannerProduct === true,
      bannerTitle: bannerTitle || '',
      expiryDate: expiryDate || null,
      seoTitle: seoTitle || '',
      seoDescription: seoDescription || '',
      focusKeyword: focusKeyword || '',
      productTags: parsedTags,
      price: finalPrice,
      quantity: Number(finalQuantity) || 0,
      productType: productType || "simple",
    });

    await product.save();

    // 3. Notify Subscribers
    const subscribers = await Subscriber.find();

    if (subscribers.length > 0) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.SMTP_EMAIL,
          pass: process.env.SMTP_PASS,
        },
      });

      // ✅ Email ke liye Table Rows taiyar karna
      const specRows = parsedSpecs.map(s => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee; color: #555;"><b>${s.label}</b></td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; color: #777;">${s.value}</td>
        </tr>
      `).join('');

      const emailPromises = subscribers.map((s) => {
        const mailOptions = {
          from: `"TechnoZ" <${process.env.SMTP_EMAIL}>`,
          to: s.email,
          subject: `🆕 New Arrival: ${product.name}`,
          html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
              <div style="background-color: #007bffd7; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">New Product Launch!</h1>
              </div>
              
              <div style="padding: 25px;">
                <h2 style="color: #333; margin-top: 0;">${product.name}</h2>
                
                <p style="color: #666; line-height: 1.6; font-size: 15px;">
                  ${description}
                </p>
                <h3 style="border-bottom: 2px solid #007bffe7; padding-bottom: 5px; color: #333;">Product Details</h3>
                // <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                //   <tr>
                //     <td style="padding: 8px; border-bottom: 1px solid #eee; color: #555;"><b>Brand</b></td>
                //     <td style="padding: 8px; border-bottom: 1px solid #eee; color: #777;">${brand}</td>
                //   </tr>
                //   <tr>
                //     <td style="padding: 8px; border-bottom: 1px solid #eee; color: #555;"><b>Processor</b></td>
                //     <td style="padding: 8px; border-bottom: 1px solid #eee; color: #777;">${processor}</td>
                //   </tr>
                //   ${specRows} </table>

                <div style="text-align: center; margin-top: 30px;">
                   <p style="font-size: 20px; color: #28a745; font-weight: bold;">Special Price: $${price}</p>
                   <a href="${process.env.CLIENT_URL}/products/${product._id}" 
                      style="display:inline-block; padding:15px 30px; background:#007bff; color:#fff; text-decoration:none; border-radius:50px; font-weight: bold;">
                      Check it Out
                   </a>
                </div>
              </div>
            </div>
          `,
        };
        return transporter.sendMail(mailOptions);
      });

      Promise.all(emailPromises)
        .then(() => console.log(`✅ Emails sent`))
        .catch((e) => console.error("📧 Email failed:", e.message));
    }

    res.status(201).json(product);

  } catch (err) {
        if (err.status) return res.status(err.status).json({ message: err.message }); // jaise duplicate SKU
    console.error('❌ Failed:', err);
    res.status(500).json({ message: 'Failed to add product', error: err.message });
  }
};
// ✅ GET PRODUCT BY ID
exports.getProductBySlug = async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug.toLowerCase() });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ✅ UPDATE PRODUCT (Updated with Specifications, FAQ, Variations & KeyFeatures)

exports.getProducts = async (req, res) => {
  try {
    // The POST /products/query route shares this handler, so params can arrive
    // in either place. Body wins because that route exists precisely for the
    // cases where the query string would be too long.
    const q = { ...(req.query || {}), ...(req.body || {}) };
 
    const {
      search,
      min,
      max,
      sort,
      ids,
      inStock,
      onSale,
      page = 1,
      limit = 12,
    } = q;
 
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 12));
    const minNum = Number(min) || 0;
    const maxNum = Number(max) || Number.MAX_SAFE_INTEGER;
 
    // Multi-select: each of these can now hold several values.
    const brands = csv(q.brand).filter((b) => b !== 'All');
    const categories = csv(q.category).filter((c) => c !== 'All');
    const conditions = csv(q.condition).filter((c) => c !== 'all');
 const rams = csv(q.ram).filter((r) => r !== 'All');
const storages = csv(q.storage).filter((s) => s !== 'All');
const screenSizes = csv(q.screenSize).filter((s) => s !== 'All');
    /* Each field's condition is kept SEPARATE on purpose.
       A facet must not filter by its own field, otherwise selecting "Dell"
       would make every other brand vanish from the sidebar instead of showing
       how many results each one would give. This is how Amazon/Noon behave. */
    const brandCond = brands.length ? { brand: matchAnyOf(brands) } : {};
    const categoryCond = categories.length ? { category: matchAnyOf(categories) } : {};
    const conditionCond = conditions.length ? { condition: matchAnyOf(conditions) } : {};
    const ramCond = rams.length
  ? {
      variations: {
        $elemMatch: {
          ram: matchAnyOf(rams),
        },
      },
    }
  : {};

const storageCond = storages.length
  ? {
      variations: {
        $elemMatch: {
          storage: matchAnyOf(storages),
        },
      },
    }
  : {};
 const variationCond =
  rams.length || storages.length
    ? {
        variations: {
          $elemMatch: {
            ...(rams.length ? { ram: matchAnyOf(rams) } : {}),
            ...(storages.length ? { storage: matchAnyOf(storages) } : {}),
          },
        },
      }
    : {};

const screenSizeCond = screenSizes.length
  ? {
      display: {
        $in: screenSizes.map(
          (s) => new RegExp(escapeRegex(s), 'i')
        ),
      },
    }
  : {};
    // Applies to every branch, including the facets.
    const baseCond = {};
 
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: 'i' };
      baseCond.$or = [
        { name: regex },
        { brand: regex },
        { category: regex },
        { processor: regex },
        { sku: regex },
        { 'variations.sku': regex },
      ];
    }
 
    if (String(inStock) === 'true') baseCond.quantity = { $gt: 0 };
    if (String(onSale) === 'true') baseCond.discountPercentage = { $gt: 0 };
 
    // "Wishlist only" view. "__none__" is the sentinel the frontend sends when
    // the wishlist is empty — match nothing rather than accidentally match all.
    if (ids) {
      if (ids === '__none__') {
        return res.json({
          data: [],
          totalItems: 0,
          totalPages: 1,
          currentPage: 1,
          facets: EMPTY_FACETS,
        });
      }
      const idList = csv(ids)
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      baseCond._id = { $in: idList };
    }
 
    const priceCond = { effectivePrice: { $gte: minNum, $lte: maxNum } };
 
    const sortMap = {
      'price-asc': { effectivePrice: 1 },
      'price-desc': { effectivePrice: -1 },
      'rating-desc': { rating: -1 },
      'discount-desc': { discountPercentage: -1 },
      newest: { createdAt: -1 },
    };
    const sortStage = sortMap[sort] || { createdAt: -1 };
 
    const selectedCond = allOf(
  brandCond,
  categoryCond,
  conditionCond,
  variationCond,
  screenSizeCond,
  priceCond
);
 
    /* Effective price (post-discount) is computed inside the aggregation, so
       price filtering and sorting happen in the database — the whole catalogue
       is never loaded into Node memory. */
    // Sale khatam ho chuki ho to discount 0 (price filter, sort, onSale sab isi par chalein)
    const saleOver = {
      $and: [
        { $ne: [{ $ifNull: ['$saleEndsAt', null] }, null] },
        { $lte: ['$saleEndsAt', new Date()] },
      ],
    };

    const pipeline = [
      {
        $set: {
          discountPercentage: { $cond: [saleOver, 0, '$discountPercentage'] },
          discountPrice: { $cond: [saleOver, null, '$discountPrice'] },
        },
      },
      {
        $addFields: {
          effectivePrice: {
            $cond: [
              { $gt: ['$discountPercentage', 0] },
              {
                $multiply: [
                  '$price',
                  { $subtract: [1, { $divide: ['$discountPercentage', 100] }] },
                ],
              },
              '$price',
            ],
          },
        },
      },
      { $match: baseCond },
      {
        $facet: {
          data: [
            { $match: selectedCond },
            { $sort: sortStage },
            { $skip: (pageNum - 1) * limitNum },
            { $limit: limitNum },
          ],
          totalCount: [{ $match: selectedCond }, { $count: 'count' }],
 
          // Each facet skips its own field (see comment above).
          brandFacet: [
            { $match: allOf(categoryCond, conditionCond, variationCond, screenSizeCond, priceCond) },
            ...countsByField('brand'),
          ],
          categoryFacet: [
            { $match: allOf(brandCond, conditionCond, variationCond, screenSizeCond, priceCond) },
            ...countsByField('category'),
          ],
          conditionFacet: [
           { $match: allOf(brandCond, categoryCond, variationCond, screenSizeCond, priceCond) },
            ...countsByField('condition'),
          ],
 ramFacet: [
  {
    $match: allOf(
      brandCond,
      categoryCond,
      conditionCond,
      storageCond,
      screenSizeCond,
      priceCond
    ),
  },
  { $unwind: "$variations" },
  {
    $group: {
      _id: "$variations.ram",
      count: { $sum: 1 },
    },
  },
  { $match: { _id: { $nin: [null, ""] } } },
  { $project: { _id: 0, value: "$_id", count: 1 } },
  { $sort: { value: 1 } },
],
storageFacet: [
  {
    $match: allOf(
      brandCond,
      categoryCond,
      conditionCond,
      ramCond,
      screenSizeCond,
      priceCond
    ),
  },
  { $unwind: "$variations" },
  {
    $group: {
      _id: "$variations.storage",
      count: { $sum: 1 },
    },
  },
  { $match: { _id: { $nin: [null, ""] } } },
  { $project: { _id: 0, value: "$_id", count: 1 } },
  { $sort: { value: 1 } },
],
screenSizeFacet: [
  {
    $match: allOf(
      brandCond,
      categoryCond,
      conditionCond,
      variationCond,
      priceCond
    ),
  },
  {
    $group: {
      _id: "$display",
      count: { $sum: 1 },
    },
  },
  { $match: { _id: { $nin: [null, ""] } } },
  { $project: { _id: 0, value: "$_id", count: 1 } },
  { $sort: { value: 1 } },
],
          // Slider bounds ignore the price filter itself, so dragging the
          // handles never shrinks the track the user is dragging on.
          priceStats: [
            { $match: allOf(brandCond, categoryCond, conditionCond, variationCond, screenSizeCond) },
            {
              $group: {
                _id: null,
                min: { $min: '$effectivePrice' },
                max: { $max: '$effectivePrice' },
              },
            },
          ],
        },
      },
    ];
 
    const result = await Product.aggregate(pipeline);
    const bucket = result[0] || {};
 
    const data = bucket.data || [];
    const totalItems = bucket.totalCount?.[0]?.count || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / limitNum));
    const stats = bucket.priceStats?.[0] || {};
 
    res.json({
      data,
      totalItems,
      totalPages,
      currentPage: pageNum,
     facets: {
  brands: bucket.brandFacet || [],
  categories: bucket.categoryFacet || [],
  conditions: bucket.conditionFacet || [],
  rams: bucket.ramFacet || [],
  storages: bucket.storageFacet || [],
  screenSizes: bucket.screenSizeFacet || [],
  price: {
    min: Math.floor(stats.min || 0),
    max: Math.ceil(stats.max || 0),
  },
},
    });
  } catch (err) {
    console.error('getProducts error:', err);
    res.status(500).json({ message: 'Failed to fetch products' });
  }
};
exports.updateProduct = async (req, res) => {
  try {
    const updateData = { ...req.body };
    // Ye fields sirf promotion set karta hai, form se nahi aate
    delete updateData.saleEndsAt;
    delete updateData.salePromotion;
    if (updateData.discountPercentage !== undefined) {
      updateData.discountPercentage = Math.min(
        100,
        Math.max(0, Number(updateData.discountPercentage) || 0)
      );
    }
if (updateData.productTags) {
  if (typeof updateData.productTags === "string") {
    try {
      updateData.productTags = JSON.parse(
        updateData.productTags
      );
    } catch (err) {
      console.error("Product Tags Parse Error:", err);
      delete updateData.productTags;
    }
  }
}
    // 🚀 NEW: Safe Parsing for KeyFeatures (Bullet Points)
    if (updateData.keyFeatures) {
      if (typeof updateData.keyFeatures === 'string') {
        // [object Object] error check jo aksar FormData mein aata hai
        if (updateData.keyFeatures.startsWith('[object')) {
          delete updateData.keyFeatures; 
        } else {
          try {
            updateData.keyFeatures = JSON.parse(updateData.keyFeatures);
          } catch (e) {
            console.error("KeyFeatures parse error:", e);
            delete updateData.keyFeatures;
          }
        }
      }
    }

    // 1. Safe Parsing for Specifications (Table Data)
    if (updateData.specifications) {
      if (typeof updateData.specifications === 'string') {
        if (updateData.specifications.startsWith('[object')) {
          delete updateData.specifications; 
        } else {
          try {
            updateData.specifications = JSON.parse(updateData.specifications);
          } catch (e) {
            console.error("Spec parse error:", e);
            delete updateData.specifications;
          }
        }
      }
    }

    // 🚀 Safe Parsing for FAQs
    if (updateData.faqs) {
      if (typeof updateData.faqs === 'string') {
        if (updateData.faqs.startsWith('[object')) {
          delete updateData.faqs; 
        } else {
          try {
            updateData.faqs = JSON.parse(updateData.faqs);
          } catch (e) {
            console.error("FAQ parse error:", e);
            delete updateData.faqs;
          }
        }
      }
    }

    // 🚀 Safe Parsing for Variations
    if (updateData.variations) {
      if (typeof updateData.variations === 'string') {
        if (updateData.variations.startsWith('[object')) {
          delete updateData.variations; 
        } else {
          try {
            updateData.variations = JSON.parse(updateData.variations);
          } catch (e) {
            console.error("Variations parse error:", e);
            delete updateData.variations;
          }
        }
      }
    }
        // 🧹 Description clean karein
    if (updateData.description !== undefined) {
      updateData.description = cleanDescription(updateData.description);
    }

        // 🔗 Slug: manual diya to wohi, warna naam badla to naya banayein
    if (updateData.slug) {
      updateData.slug = await Product.generateUniqueSlug(updateData.slug, req.params.id);
    } else if (updateData.name) {
      const current = await Product.findById(req.params.id).select("name").lean();
      if (current && current.name !== updateData.name) {
        updateData.slug = await Product.generateUniqueSlug(updateData.name, req.params.id);
      } else {
        delete updateData.slug;
      }
    }
       // 🏷️ SKU: product aur har variation ka (khaali ho to khud banta hai)
    if (updateData.sku !== undefined || Array.isArray(updateData.variations)) {
      const current = await Product.findById(req.params.id).select("brand productType sku").lean();
      const skus = await assignSkus({
        productId: req.params.id,
        brand: updateData.brand ?? current?.brand,
        productType: updateData.productType ?? current?.productType,
        sku: updateData.sku || current?.sku,
        variations: updateData.variations,
      });
      updateData.sku = skus.sku;
      if (Array.isArray(updateData.variations)) updateData.variations = skus.variations;
    }

    if (updateData.productType === "variable") {
  const list = Array.isArray(updateData.variations) ? updateData.variations : [];
  const prices = list.map((v) => Number(v.price)).filter((p) => p > 0);

  if (!prices.length) {
    return res.status(400).json({
      message: "Variable product needs at least one variation with a price.",
    });
  }
  updateData.price = Math.min(...prices);
  updateData.quantity = list.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0);
}
    // 2. Handle quantity properly
             applyDiscountPrice(updateData);

    // Sale khatam ho chuki thi aur admin ne naya discount diya: naya discount bina expiry ke chalega.
    // (Chalti promotion wale product ka discount badle to expiry wahi rehti hai.)
    if (updateData.discountPercentage !== undefined) {
      const before = await Product.findById(req.params.id).select("discountPercentage saleEndsAt").lean();
      const changed = before && Number(before.discountPercentage) !== Number(updateData.discountPercentage);
      if (changed && Product.isSaleOver(before)) {
        updateData.saleEndsAt = null;
        updateData.salePromotion = null;
      }
    }
    if (updateData.quantity !== undefined) {
      updateData.quantity = Number(updateData.quantity);
      if (isNaN(updateData.quantity) || updateData.quantity < 0) updateData.quantity = 0;
    }

    
   if (updateData.condition) {
    updateData.condition = updateData.condition.toLowerCase();
}

    // 3. 🖼️ Gallery: bheji gayi to poori list (library + nayi files) usi tarteeb mein,
    //    na bheji to images waisi hi rehti hain
    const gallery = await buildGallery(req.body.galleryImages, req.files || []);
    registerUploads(req.files || [], 'products', (f, i) => gallery?.fileMeta[i]).catch(logMediaError);

    if (gallery) {
      if (!gallery.images.length) {
        return res.status(400).json({ message: 'At least one product image is required.' });
      }
      updateData.images = gallery.images;
      updateData.image = gallery.images[0].url;
    }
    delete updateData.galleryImages;
    // 4. Update in Database
    const product = await Product.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    );

    if (!product) return res.status(404).json({ message: 'Product not found' });

    res.json(product);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message }); // jaise duplicate SKU
    console.error('❌ Error updating product:', err);
    res.status(500).json({ 
      message: 'Error updating product', 
      error: err.message 
    });
  }
};
// ✅ DELETE PRODUCT
exports.deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete product', error: err.message });
  }
};

exports.getProductMeta = async (req, res) => {
  try {
    const [categories, brands] = await Promise.all([
      Product.distinct('category'),
      Product.distinct('brand'),
    ]);
 
    res.json({
      categories: ['All', ...categories.filter(Boolean).sort()],
      brands: ['All', ...brands.filter(Boolean).sort()],
    });
  } catch (err) {
    console.error('getProductMeta error:', err);
    res.status(500).json({ message: 'Failed to fetch filter metadata' });
  }
};
 
// Small helper: escape user input before dropping it into a $regex, so a
// search term like "C++ (16GB)" can't be interpreted as regex syntax.
// function escapeRegex(str) {
//   return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// }
 
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
 
// "Dell, HP , Lenovo" -> ["Dell", "HP", "Lenovo"]
function csv(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
 
// Case-insensitive exact match against any value in the list.
function matchAnyOf(list) {
  return { $in: list.map((v) => new RegExp(`^${escapeRegex(v)}$`, 'i')) };
}
 
// Combine only the non-empty conditions. Returns {} when there are none,
// which Mongo treats as "match everything".
function allOf(...conditions) {
  const list = conditions.filter((c) => c && Object.keys(c).length > 0);
  return list.length ? { $and: list } : {};
}
 
// Counts for one field, newest-to-oldest irrelevant — sorted alphabetically so
// the sidebar order never jumps around as counts change.
function countsByField(field) {
  return [
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $match: { _id: { $nin: [null, ''] } } },
    { $project: { _id: 0, value: '$_id', count: 1 } },
    { $sort: { value: 1 } },
  ];
}
 
const EMPTY_FACETS = {
  brands: [],
  categories: [],
  conditions: [],
  rams: [],
  storages: [],
  screenSizes: [],
  price: { min: 0, max: 0 },
};

/// ✅ GET LIMITED PRODUCTS (Updated Logic)
exports.getLimitedProducts = async (req, res) => {
  try {
    // Database se wo products pehle uthaein jin ka discountPercentage 0 se zyada ho
    // .sort({ discountPercentage: -1 }) se zyada discount wale pehle aayenge
    const products = await Product.find()
      .sort({ discountPercentage: -1 }) 
      .limit(10); 
      
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch limited products', error: err.message });
  }
};

// 🆕 Get top 3 best-selling products
exports.getTopSellingProducts = async (req, res) => {
  try {
    const topProducts = await Order.aggregate([
      { $unwind: "$products" },
      { 
        $group: {
          _id: "$products.productId", // ✅ correct field name
          totalSold: { $sum: "$products.quantity" },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 3 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "productDetails"
        }
      },
      { $unwind: "$productDetails" },
      {
        $project: {
          _id: 0,
          totalSold: 1,
          product: "$productDetails"
        }
      }
    ]);

    res.status(200).json(topProducts);
  } catch (error) {
    console.error("Error fetching top products:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// 🆕 Get product with the highest discount
exports.getHighestDiscountProduct = async (req, res) => {
  try {
    // Find product with the maximum discountPercentage
    const product = await Product.findOne({ discountPercentage: { $gt: 0 }, ...Product.saleActiveFilter() })
      .sort({ discountPercentage: -1 }) // highest first
      .limit(1);

    if (!product) return res.status(404).json({ message: "No discounted products found" });

    res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching highest discount product:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ TOGGLE WISHLIST (Add/Remove)
exports.toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id; // Auth middleware se user milega

    let wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      // Agar user ki wishlist exist nahi karti toh nayi banayein
      wishlist = new Wishlist({ user: userId, products: [productId] });
    } else {
      // Check karein ke product pehle se array mein hai ya nahi
      const index = wishlist.products.indexOf(productId);

      if (index > -1) {
        // Agar hai toh nikaal dein
        wishlist.products.splice(index, 1);
      } else {
        // Agar nahi hai toh add karein
        wishlist.products.push(productId);
      }
    }

    await wishlist.save();
    res.status(200).json({ 
      message: "Wishlist updated", 
      count: wishlist.products.length,
      wishlist: wishlist.products 
    });
  } catch (error) {
    console.error("Wishlist Toggle Error:", error);
    res.status(500).json({ message: "Server error while updating wishlist" });
  }
};


