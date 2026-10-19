const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const ctrl = require("../controllers/promotionController");
const protect = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/adminMiddleware");
const requirePermission = require("../middleware/permissionMiddleware");
const router = express.Router();

const uploadDir = path.join(__dirname, "..", "uploads", "promotions");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_")),
});
const upload = multer({ storage });

router.post(
  "/",
  protect,
  isAdmin,
  requirePermission("promotions.create"),
  upload.single("image"),
  ctrl.createPromotion
);
router.get("/", ctrl.getPromotions);
router.get("/active", ctrl.getActivePromotions);
router.put(
  "/:id",
  protect,
  isAdmin,
  requirePermission("promotions.edit"),
  upload.single("image"),
  ctrl.updatePromotion
);
router.delete(
  "/:id",
  protect,
  isAdmin,
  requirePermission("promotions.delete"),
  ctrl.deletePromotion
);
router.get("/:slug/public", ctrl.getPromotionPublic);

module.exports = router;