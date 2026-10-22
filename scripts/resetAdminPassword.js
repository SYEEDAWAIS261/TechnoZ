require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

(async () => {
  const [email, newPassword] = process.argv.slice(2);
  if (!email || !newPassword) {
    console.log("Usage: node scripts/resetAdminPassword.js <email> <newPassword>");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) {
    console.log("❌ Is email ka koi user nahi mila");
    process.exit(1);
  }
  user.password = await bcrypt.hash(newPassword, 12);
  user.isBlocked = false;
  await user.save();
  console.log(`✅ Password reset ho gaya. Role: ${user.role}`);
  await mongoose.disconnect();
})();