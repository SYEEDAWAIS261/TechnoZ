const Product = require("../models/Product");
const User = require("../models/User");

exports.createProductReview = async (req, res) => {
  try {
    const { rating, comment, ratings, pros, cons } = req.body;
    const productId = req.params.id;
    const userId = req.user._id;
    

    // ✅ 1. Validate inputs
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ message: "Please provide a valid rating (1-5)" });

    if (!comment || comment.trim() === "")
      return res.status(400).json({ message: "Please add a comment for your review" });

    // ✅ 2. Fetch product
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // ✅ 3. Fetch user for name + image
    const user = await User.findById(userId).select("username profileImage");
    if (!user) return res.status(404).json({ message: "User not found" });

    // ✅ 4. Check if already reviewed
    const alreadyReviewed = product.reviews.find(
      (r) => r.user?.toString() === userId.toString()
    );
    if (alreadyReviewed)
      return res.status(400).json({ message: "You have already reviewed this product" });

    // ✅ 5. Construct full image path
    const userImagePath = user.profileImage
      ? `/uploads/profile/${user.profileImage}`
      : "";

    // ✅ 6. Sub-ratings parse karein (multer FormData mein string bhejta hai)
    let subRatings = ratings;
    if (typeof subRatings === "string") {
      try { subRatings = JSON.parse(subRatings); } catch { subRatings = {}; }
    }
    subRatings = subRatings || {};

    const clamp = (v) => {
      const n = Number(v) || 0;
      return n < 0 ? 0 : n > 5 ? 5 : n;
    };

    // ✅ 7. Create review
    const review = {
      name: user.username,
      rating: Number(rating),
      comment: comment.trim(),
      user: userId,
      userImage: userImagePath,
      ratings: {
        value:      clamp(subRatings.value),
        durability: clamp(subRatings.durability),
        delivery:   clamp(subRatings.delivery),
      },
      pros: (pros || "").trim(),
      cons: (cons || "").trim(),
    };

    product.reviews.push(review);

    // ✅ 8. Manual calculation ki jagah model ka method
    product.recalculateRatings();

    await product.save();

    res.status(201).json({
      message: "Review added successfully",
      review,
      numReviews: product.numReviews,
      rating: product.rating,
      ratingBreakdown: product.ratingBreakdown,
      ratingDistribution: product.ratingDistribution,
    });
  } catch (error) {
    console.error("Error creating product review:", error);
    res.status(500).json({ message: "Server error while adding review" });
  }
};