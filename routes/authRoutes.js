const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const {
  signup,
  login,
  logout,
  getProfile,
  updateProfile,
  getAllUsers,
  toggleBlockUser,
  forgotPassword,
  resetPassword,
  getUserStats,
  getAddresses, saveAddress, deleteAddress
} = require('../controllers/authController');
const {
  createTeamMember, getTeamMembers, updateTeamMemberRole, toggleTeamMemberStatus, updateAdminProfile
} = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const User = require('../models/User'); // (Agar upload ki wajah se yahan require kiya gaya tha aur ab kahin aur use nahi horaha toh ise bhi remove kar sakte hain, par main safety ke liye chhor raha hoon)

// 🔐 Manual Auth Routes
router.post('/signup', signup);
router.post('/login', login);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

// 🔒 Protected Profile Routes
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.post('/logout', authMiddleware, logout);

// ✅ Address Routes
router.get('/addresses', authMiddleware, getAddresses);
router.post('/addresses', authMiddleware, saveAddress);
router.delete('/addresses/:id', authMiddleware, deleteAddress);

// ✅ Admin-only Routes for User Management
router.get('/all-users', adminMiddleware, getAllUsers);
router.put('/block/:id', adminMiddleware, toggleBlockUser);
router.post(
  '/admin/team-members',
  adminMiddleware,
  createTeamMember
);

router.get(
  '/admin/team-members',
  adminMiddleware,
  getTeamMembers
);
router.put(
  '/admin/team-members/:id/role',
  adminMiddleware,
  updateTeamMemberRole
);
router.put(
  '/admin/team-members/:id/status',
  adminMiddleware,
  toggleTeamMemberStatus
);
router.put(
  '/admin/profile',
  adminMiddleware,
  updateAdminProfile
);
// User Stats Route
router.get('/stats', authMiddleware, getUserStats);

// 🌐 Google OAuth Routes
router.get(
  '/google/login',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
    state: 'login',
    callbackURL: process.env.GOOGLE_CALLBACK_URL 
  })
);

router.get(
  '/google/signup',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'consent',
    state: 'signup',
    callbackURL: process.env.GOOGLE_CALLBACK_URL 
  })
);

// ✅ Updated Google Callback
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:5174'}/login?error=google_failed`,
  }),
  async (req, res) => {
    try {
      const user = req.user;

      // 🚫 Check if blocked
      if (user.isBlocked) {
        return res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:5174'}/login?error=blocked_account`
        );
      }

      // ✅ Generate JWT token
      const token = jwt.sign(
  {
    id: user._id,
    role: user.role,
  },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);
      // ✅ Frontend par redirect karein (Localhost ya Firebase)
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/login?token=${token}`);
    } catch (err) {
      console.error('Google callback error:', err);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/login?error=server_error`);
    }
  }
);

// ❌ Google failure
router.get('/google/failure', (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/login?error=account_not_found`);
});

module.exports = router;