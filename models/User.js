const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: {
    type: String,
    required: function () {
      return !this.googleId;
    },
    unique: true,
  },
  password: {
    type: String,
    required: function () {
      return !this.googleId;
    },
  },
  googleId: { type: String, unique: true, sparse: true },
role: {
  type: String,
  enum: ["customer", "editor", "administrator"],
  default: "customer",
  required: true,
},

  isBlocked: { type: Boolean, default: false },
  // ✅ Add this line
  isLoggedIn: { type: Boolean, default: false },

  // 🔑 Forgot password fields
resetPasswordToken: {
  type: String,
},
resetPasswordExpires: {
  type: Date,
},

  // userSchema addition
unsubscribeStatus: {
  type: Boolean,
  default: false, // false = subscribed, true = unsubscribed
},
unsubscribeToken: {
  type: String,
  default: null,
},
// userSchema ke andar ye add karein:
wishlist: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }
],
phone: { type: String, default: '' },

// ✅ ADD THIS ADDRESSES ARRAY
  addresses: [
    {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, default: "" },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    addressType: {
  type: String,
  enum: ["shipping", "billing"],
  default: "shipping"
},

isDefault: {
  type: Boolean,
  default: false
}
    }
  ]
});

module.exports = mongoose.model('User', userSchema);
