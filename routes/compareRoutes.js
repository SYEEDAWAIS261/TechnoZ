const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { compareWithAI } = require('../controllers/compareAiController');

const router = express.Router();

// Ek user ek minute mein zyada se zyada 6 AI requests (API key ka misuse na ho)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many AI requests. Please wait a minute and try again.' },
});

router.post('/ai', aiLimiter, compareWithAI);

module.exports = router;