import mongoose from 'mongoose';

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'customer', 'seller'], default: 'customer' },
  orderCount: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  loginCount: { type: Number, default: 0 },
  lastLogin: { type: Date },
  // Password reset fields
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

export default User;