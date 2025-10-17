import mongoose from 'mongoose';

const subcategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  category: {
    type: String,
    required: true,
    enum: ['l-mart', 'localmarket', 'printing', 'news'],
    lowercase: true
  },
  imageUrl: {
    type: String,
    default: ''
  },
  imagePublicId: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

subcategorySchema.index({ category: 1, name: 1 }, { unique: true });

const Subcategory = mongoose.model('Subcategory', subcategorySchema);
export default Subcategory;