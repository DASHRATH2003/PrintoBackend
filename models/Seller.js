import mongoose from 'mongoose';

// Seller Schema - separate collection for sellers
const sellerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  // Password reset fields for seller
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  sellerName: { type: String },
  parentSeller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', default: null },
  sellerHierarchyLevel: { type: Number, default: 0 },
  orderCount: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  loginCount: { type: Number, default: 0 },
  lastLogin: { type: Date },
  // Verification fields
  verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  registeredOn: { type: Date, default: Date.now },
  verification:
    {
      sellerName: { type: String },
      shopName: { type: String },
      email: { type: String },
      phone: { type: String },
      idProofUrl: { type: String },
      addressProofUrl: { type: String },
      businessProofUrl: { type: String },
      bankProofUrl: { type: String },
      submittedAt: { type: Date },
      reviewedAt: { type: Date },
      reviewerNote: { type: String }
    },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'sellers' });

const Seller = mongoose.model('Seller', sellerSchema);

export default Seller;