const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const passport = require('passport');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');
const User = require('./models/User');

// Load environment variables
dotenv.config();

// Connect DB
const connectDB = require('./config/db');
connectDB();

// Import routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const cardRoutes = require('./routes/cardRoutes');
const orderRoutes = require('./routes/orderRoutes');
const contactRoute = require('./routes/contact');
const paymentRoutes = require('./routes/paymentRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const promotionRoutes = require('./routes/promotionRoutes');
const subscriberRoutes = require('./routes/subscriberRoutes');
const unsubscribeRoutes = require('./routes/unsubscribeRoutes');
const couponRoutes = require("./routes/couponRoutes");
const reviewRoutes = require('./routes/reviewRoutes')
const cmsRoutes = require('./routes/cmsRoutes'); 
const chatRoutes = require ("./routes/chatRoutes.js");
const articleRoutes = require('./routes/articleRoutes');
const sitemapRoutes = require('./routes/sitemapRoutes');
const dealRoutes = require('./routes/dealRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const adminSettingsRoutes = require('./routes/adminSettingsRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const compareRoutes = require('./routes/compareRoutes');
require('./config/passport'); // Google strategy

// Initialize app
const app = express();
const server = http.createServer(app);

// Middleware
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://technoz-a4377.web.app",
  "https://technoz-a4377.firebaseapp.com",
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
]
  .filter(Boolean)
  .map((u) => u.trim().replace(/\/+$/, "")); // aakhir ka "/" hata do, warna match fail hota hai

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], // 🟢 Yahan "PATCH" lazmi add karein
  credentials: true
}));
app.use(express.json());
app.set("trust proxy", 1);

// API data hamesha fresh: browser/proxy cache na kare (304 + khaali body ka masla)
app.set("etag", false);
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Vary", "Authorization");
  next();
});
app.use(passport.initialize());

// Serve static uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads/articles', express.static(path.join(__dirname, 'uploads/articles')));

// API Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin-settings', adminSettingsRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cardRoutes);
app.use('/api/orders', orderRoutes); // ✅ Includes new /track/:trackingId route
app.use('/api/contact', contactRoute);
app.use('/api/stripe', paymentRoutes);
app.use('/api/banners', bannerRoutes);
app.use("/api/promotions", promotionRoutes);
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/unsubscribe', unsubscribeRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/reviews", reviewRoutes);
app.use('/api/cms', cmsRoutes);
app.use("/api/chat", chatRoutes);
app.use('/api/articles', articleRoutes);
app.use('/sitemap.xml', sitemapRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/compare', compareRoutes);
// app.use('/sitemap.xml', require('./routes/sitemapRoutes'));
// ⚙️ Global Error Handler (optional, but useful)
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});
// Start Server
// Real-time: naya order aane par admin panel ko signal
const io = new Server(server, { cors: { origin: allowedOrigins, credentials: true } });

// Sirf admin/editor connect ho sakein
io.use((socket, next) => {
  try {
    const user = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
    if (["administrator", "editor"].includes(user.role)) return next();
  } catch {}
  next(new Error("Unauthorized"));
});

app.set("io", io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
