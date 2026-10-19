const express = require("express");
const router = express.Router();
const adminMiddleware = require("../middleware/adminMiddleware");

const {
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
} = require("../controllers/adminSettingsController");

// Admin profile
router.get(
  "/profile",
  adminMiddleware,
  getAdminProfile
);
router.put(
  "/profile",
  adminMiddleware,
  updateAdminProfile
);
router.put("/password", adminMiddleware, changeAdminPassword);

module.exports = router;