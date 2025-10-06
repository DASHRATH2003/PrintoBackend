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
    enum: ['emart', 'localmarket', 'printing', 'news'],
    lowercase: true
  },
  subcategory: {
    type: String,
    trim: true,
    default: ''
  },


  // ✅ Separate variant lists
  colorVarients: {
    type: [String],
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

  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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

const Product = mongoose.model('Product', productSchema);
export default Product;