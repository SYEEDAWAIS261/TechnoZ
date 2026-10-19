const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const protect = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');

// POST /api/upload — generic image upload
router.post('/', protect, isAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No image file provided' });
  }

  // ✅ Encode filename to safely handle spaces
  const safeFilename = encodeURIComponent(req.file.filename);
  const filePath = `/uploads/${safeFilename}`;

  res.status(200).json({
    message: 'Image uploaded successfully',
    url: filePath,
    path: filePath,
  });
});

module.exports = router;