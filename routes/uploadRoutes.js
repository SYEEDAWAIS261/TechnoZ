const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const protect = require('../middleware/authMiddleware');
const isAdmin = require('../middleware/adminMiddleware');
const { registerUploads } = require('../services/mediaService');

// POST /api/upload — generic image upload (Cloudinary)
router.post('/', protect, isAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No image file provided' });
  }

  const url = upload.fileUrl(req.file, 'media');

  // Media Library mein bhi nazar aaye
  registerUploads([req.file], 'media').catch((err) =>
    console.error('Media library register failed:', err.message)
  );

  res.status(200).json({
    message: 'Image uploaded successfully',
    url,
    path: url,
  });
});

module.exports = router;