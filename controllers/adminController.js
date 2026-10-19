const User = require("../models/User");
const bcrypt = require("bcryptjs");

// Create a new team member
exports.createTeamMember = async (req, res) => {
  try {
    // Only administrators can create team members
    if (req.user.role !== "administrator") {
      return res.status(403).json({
        message: "Only administrators can manage team members.",
      });
    }

    const { username, email, password, role } = req.body;

    if (!username || !email || !password || !role) {
      return res.status(400).json({
        message: "Username, email, password and role are required.",
      });
    }

    if (!["editor", "administrator"].includes(role)) {
      return res.status(400).json({
        message: "Invalid team member role.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      $or: [
        { email: normalizedEmail },
        { username: username.trim() },
      ],
    });

    if (existingUser) {
      return res.status(409).json({
        message:
          existingUser.email === normalizedEmail
            ? "Email already exists."
            : "Username already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const teamMember = await User.create({
      username: username.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role,
      isBlocked: false,
      isLoggedIn: false,
    });

    res.status(201).json({
      message: "Team member created successfully.",
      user: {
        id: teamMember._id,
        username: teamMember.username,
        email: teamMember.email,
        role: teamMember.role,
        isBlocked: teamMember.isBlocked,
      },
    });
  } catch (error) {
    console.error("Create team member error:", error);

    res.status(500).json({
      message: "Failed to create team member.",
    });
  }
};
exports.getTeamMembers = async (req, res) => {
  try {
    if (req.user.role !== "administrator") {
      return res.status(403).json({
        message: "Only administrators can manage team members.",
      });
    }

    const teamMembers = await User.find({
      role: { $in: ["editor", "administrator"] },
    })
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .sort({ createdAt: -1 });

    res.json(teamMembers);
  } catch (error) {
    console.error("Get team members error:", error);

    res.status(500).json({
      message: "Failed to fetch team members.",
    });
  }
};
exports.updateTeamMemberRole = async (req, res) => {
  try {
    if (req.user.role !== "administrator") {
      return res.status(403).json({
        message: "Only administrators can manage team members.",
      });
    }

    const { role } = req.body;

    if (!["editor", "administrator"].includes(role)) {
      return res.status(400).json({
        message: "Invalid team member role.",
      });
    }

    const teamMember = await User.findById(req.params.id);

    if (!teamMember) {
      return res.status(404).json({
        message: "Team member not found.",
      });
    }

    // Prevent administrator from changing their own role
   if (teamMember._id.toString() === String(req.user._id || req.user.id)) {
      return res.status(400).json({
        message: "You cannot change your own administrator role.",
      });
    }

    // Prevent changing a customer through this endpoint
    if (!["editor", "administrator"].includes(teamMember.role)) {
      return res.status(400).json({
        message: "This account is not a team member.",
      });
    }

    teamMember.role = role;
    await teamMember.save();

    res.json({
      message: "Team member role updated successfully.",
      user: {
        id: teamMember._id,
        username: teamMember.username,
        email: teamMember.email,
        role: teamMember.role,
        isBlocked: teamMember.isBlocked,
      },
    });
  } catch (error) {
    console.error("Update team member role error:", error);

    res.status(500).json({
      message: "Failed to update team member role.",
    });
  }
};
exports.toggleTeamMemberStatus = async (req, res) => {
  try {
    if (req.user.role !== "administrator") {
      return res.status(403).json({
        message: "Only administrators can manage team members.",
      });
    }

    const teamMember = await User.findById(req.params.id);

    if (!teamMember) {
      return res.status(404).json({
        message: "Team member not found.",
      });
    }

    // Prevent administrator from disabling their own account
    if (teamMember._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        message: "You cannot deactivate your own administrator account.",
      });
    }

    // Only team members can be managed here
    if (!["editor", "administrator"].includes(teamMember.role)) {
      return res.status(400).json({
        message: "This account is not a team member.",
      });
    }

    teamMember.isBlocked = !teamMember.isBlocked;

    if (teamMember.isBlocked) {
      teamMember.isLoggedIn = false;
    }

    await teamMember.save();

    res.json({
      message: teamMember.isBlocked
        ? "Team member deactivated successfully."
        : "Team member activated successfully.",
      user: {
        id: teamMember._id,
        username: teamMember.username,
        email: teamMember.email,
        role: teamMember.role,
        isBlocked: teamMember.isBlocked,
      },
    });
  } catch (error) {
    console.error("Toggle team member status error:", error);

    res.status(500).json({
      message: "Failed to update team member status.",
    });
  }
};
exports.updateAdminProfile = async (req, res) => {
  try {
    if (!["administrator", "editor"].includes(req.user.role)) {
      return res.status(403).json({
        message: "Admin access required.",
      });
    }

    const { username, email, currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        message: "Admin account not found.",
      });
    }

    // Username
    if (username && username.trim() !== user.username) {
      const existingUsername = await User.findOne({
        username: username.trim(),
        _id: { $ne: user._id },
      });

      if (existingUsername) {
        return res.status(409).json({
          message: "Username already exists.",
        });
      }

      user.username = username.trim();
    }

    // Email
    if (email && email.trim().toLowerCase() !== user.email) {
      const normalizedEmail = email.trim().toLowerCase();

      const existingEmail = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: user._id },
      });

      if (existingEmail) {
        return res.status(409).json({
          message: "Email already exists.",
        });
      }

      user.email = normalizedEmail;
    }

    // Password change
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          message: "Current password is required.",
        });
      }

      if (!user.password) {
        return res.status(400).json({
          message: "Password change is not available for this account.",
        });
      }

      const passwordMatches = await bcrypt.compare(
        currentPassword,
        user.password
      );

      if (!passwordMatches) {
        return res.status(401).json({
          message: "Current password is incorrect.",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          message: "New password must be at least 8 characters long.",
        });
      }

      user.password = await bcrypt.hash(newPassword, 12);
    }

    await user.save();

    res.json({
      message: "Profile updated successfully.",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Update admin profile error:", error);

    res.status(500).json({
      message: "Failed to update admin profile.",
    });
  }
};