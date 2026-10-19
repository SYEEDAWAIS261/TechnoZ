const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Promotion = require('../models/Promotion');

const SITE = 'https://technoz.com';

router.get('/', async (req, res) => {
  try {
    const [products, promotions] = await Promise.all([
      Product.find({ slug: { $exists: true, $ne: '' } }).select('slug updatedAt').lean(),
      Promotion.find({ isActive: true, slug: { $exists: true, $ne: '' } })
                .select('slug updatedAt').lean(),
    ]);

    const staticUrls = [
      { loc: `${SITE}/`,         priority: '1.0', changefreq: 'weekly'  },
      { loc: `${SITE}/products`, priority: '0.9', changefreq: 'daily'   },
      { loc: `${SITE}/outlet`,   priority: '0.8', changefreq: 'weekly'  },
      { loc: `${SITE}/about`,    priority: '0.4', changefreq: 'monthly' },
      { loc: `${SITE}/contact`,  priority: '0.4', changefreq: 'monthly' },
    ];

    const productUrls = products
      .filter(p => p.slug)
      .map(p => ({
        loc: `${SITE}/product/${p.slug}`,
        lastmod: p.updatedAt?.toISOString().split('T')[0],
        priority: '0.7',
        changefreq: 'weekly',
      }));

    const promoUrls = promotions
      .filter(p => p.slug)
      .map(p => ({
        loc: `${SITE}/deals/${p.slug}`,
        lastmod: p.updatedAt?.toISOString().split('T')[0],
        priority: '0.6',
        changefreq: 'weekly',
      }));

    const allUrls = [...staticUrls, ...productUrls, ...promoUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap error:', err);
    res.status(500).send('Sitemap generation failed');
  }
});

module.exports = router;