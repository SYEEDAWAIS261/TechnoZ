const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    if (req.user.isBlocked) {
      return res.status(403).json({
        message: "Your account has been blocked.",
      });
    }

    // Administrator has full access
    if (req.user.role === "administrator") {
      return next();
    }

    // Editor permissions
    const editorPermissions = [
  "products.create",
  "products.edit",

  "articles.create",
  "articles.edit",

  "promotions.create",
  "promotions.edit",

  "deals.create",
  "deals.edit",

  "orders.view",
  "orders.edit",

  "coupons.create",
  "coupons.edit",
  "coupons.view",
];

    if (
      req.user.role === "editor" &&
      editorPermissions.includes(permission)
    ) {
      return next();
    }

    return res.status(403).json({
      message: "You do not have permission to perform this action.",
    });
  };
};

module.exports = requirePermission;