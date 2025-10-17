import mongoose from 'mongoose';

const categoryCommissionSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: ['l-mart', 'localmarket', 'printing', 'news'],
    lowercase: true,
    unique: true
  },
  commissionPercent: {
    type: Number,
    min: 0,
    max: 100,
    default: 2
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

const CategoryCommission = mongoose.model('CategoryCommission', categoryCommissionSchema);
export default CategoryCommission;