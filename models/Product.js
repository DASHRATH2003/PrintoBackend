import mongoose from 'mongoose';

// Simplified Product Schema - only essential fields for displaying products
const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  // Offer price (discounted price) if product is on offer
  offerPrice: {
    type: Number,
    min: 0,
    default: null
  },
  originalPrice: {
    type: Number,
    min: 0,
    default: null
  },
  discount: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  category: {
    type: String,
    required: true,
    enum: ['l-mart', 'localmarket', 'printing', 'oldee', 'news'],
    lowercase: true
  },
  subcategory: {
    type: String,
    trim: true,
    default: ''
  },


  // ✅ Color-wise images mapping: [{ color, images: [url] }]
  colorVarients: {
    type: [{
      color: { type: String, required: true, trim: true, lowercase: true },
      images: [{ type: String, required: true }]
    }],
    default: []
  },
  sizeVarients: {
    type: [String],
    default: []
  },

  image: {
    type: String,
    default: 'https://via.placeholder.com/400x300?text=No+Image'
  },
  images: [{ type: String }],

  // Optional product video URL
  videoUrl: {
    type: String,
    default: null
  },

  inStock: {
    type: Boolean,
    default: true
  },
  stockQuantity: {
    type: Number,
    min: 0,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },

  // Rating summary fields
  averageRating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  ratingsCount: {
    type: Number,
    min: 0,
    default: 0
  },
  // Per-user ratings for delivery validation and duplicate prevention
  ratings: {
    type: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      orderId: { type: String, required: false },
      rating: { type: Number, min: 1, max: 5, required: true },
      comment: { type: String, default: '' },
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  },

  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Seller ownership metadata for admin visibility
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    default: null
  },
  sellerName: {
    type: String,
    default: ''
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Basic indexes for performance
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ averageRating: 1 });

const Product = mongoose.model('Product', productSchema);
export default Product;