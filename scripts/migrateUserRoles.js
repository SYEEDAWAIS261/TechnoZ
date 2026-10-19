const mongoose = require("mongoose");
const User = require("../models/User");
require("dotenv").config();

const migrateUserRoles = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected.");

const adminResult = await User.updateMany(
  { isAdmin: true },
  { $set: { role: "administrator" } }
);

const customerResult = await User.updateMany(
  {
    role: { $exists: false },
    isAdmin: { $ne: true },
  },
  {
    $set: { role: "customer" },
  }
);

console.log(`Admins migrated: ${adminResult.modifiedCount}`);
console.log(`Customers migrated: ${customerResult.modifiedCount}`);

    await mongoose.disconnect();
    console.log("Migration completed.");
  } catch (error) {
    console.error("Role migration failed:", error);
    process.exit(1);
  }
};

migrateUserRoles();