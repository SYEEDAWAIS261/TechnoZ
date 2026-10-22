const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
    user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        unique: true   // har user ki sirf ek wishlist
    },
    products: [
        { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Product' 
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);