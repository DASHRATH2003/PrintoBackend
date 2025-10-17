import mongoose from 'mongoose';

const PosterSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true },
    imageUrl: { type: String, required: true },
    publicId: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Poster', PosterSchema);