const jwt = require("jsonwebtoken");
const User = require("../models/User");

const adminMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        message: "User not found.",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked.",
      });
    }

    if (!["editor", "administrator"].includes(user.role)) {
      return res.status(403).json({
        message: "Admin access required.",
      });
    }

    req.user = user;

    next();
  } catch (error) {
    console.error("Admin authentication error:", error);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Session expired. Please login again.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        message: "Invalid authentication token.",
      });
    }

    return res.status(500).json({
      message: "Authentication server error.",
    });
  }
};

module.exports = adminMiddleware;