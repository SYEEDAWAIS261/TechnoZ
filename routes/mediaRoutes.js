const express = require("express");
const router = express.Router();

// ⚠️ Yeh line bilkul waisi rakhein jaisi aap ki orderRoutes.js mein auth/admin import hai
const auth = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");

const mediaUpload = require("../middleware/mediaUpload");
const media = require("../controllers/mediaController");

// Poori library sirf admin panel ke logged-in staff ke liye
router.use(auth, admin);

router.get("/", media.listMedia);
router.post("/", mediaUpload, media.uploadMedia);
router.post("/import", media.importMedia);
router.get("/:id/usage", media.getMediaUsage);
router.put("/:id", media.updateMedia);
router.delete("/:id", media.deleteMedia);

module.exports = router;