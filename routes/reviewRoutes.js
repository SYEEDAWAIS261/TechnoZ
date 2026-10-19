const express = require("express");
const { getGlobalTestimonials } = require("../controllers/reviewController");

const router = express.Router();

router.get("/testimonials", getGlobalTestimonials);

module.exports = router;