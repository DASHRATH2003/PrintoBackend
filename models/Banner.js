import mongoose from 'mongoose';

const BannerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    imageTitle: { type: String, trim: true },
    imageUrl: { type: String, required: true },
    publicId: { type: String },
    // Store category redundantly for faster routing/display
    category: { type: String, lowercase: true, default: '' },
    // Link banner to a specific product (optional)
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Banner', BannerSchema);