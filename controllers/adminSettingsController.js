const User = require("../models/User");
const bcrypt = require("bcryptjs");
// ===============================
// ADMIN PROFILE
// ===============================

const getAdminProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "username email role isBlocked"
    );

    if (!user) {
      return res.status(404).json({
        message: "Admin user not found.",
      });
    }

    res.json({
      username: user.username,
      email: user.email,
      role: user.role,
      isBlocked: user.isBlocked,
    });
  } catch (error) {
    console.error("Get admin profile error:", error);

    res.status(500).json({
      message: "Failed to load admin profile.",
    });
  }
};

// ===============================
// ADMIN PROFILE - UPDATE
// ===============================

const updateAdminProfile = async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({
        message: "Username is required.",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "Admin user not found.",
      });
    }

    user.username = username.trim();

    await user.save();

    res.json({
      message: "Admin profile updated successfully.",
      username: user.username,
      email: user.email,
      role: user.role,
      isBlocked: user.isBlocked,
    });
  } catch (error) {
    console.error("Update admin profile error:", error);

    res.status(500).json({
      message: "Failed to update admin profile.",
    });
  }
};

// ===============================
// ADMIN PASSWORD - CHANGE
// ===============================

const changeAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current and new password are required.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "New password must be at least 8 characters long.",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "Admin user not found.",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        message: "Password change is not available for this account.",
      });
    }

    const matches = await bcrypt.compare(currentPassword, user.password);

    if (!matches) {
      return res.status(401).json({
        message: "Current password is incorrect.",
      });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("Change admin password error:", error);

    res.status(500).json({
      message: "Failed to change password.",
    });
  }
};

module.exports = {
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
};
