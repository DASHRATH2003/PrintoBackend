import mongoose from 'mongoose';

// File Schema for storing uploaded files information
const fileSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: false,
    default: ''
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  },
  category: {
    type: String,
    enum: ['document', 'image', 'video', 'audio', 'other'],
    default: 'other'
  },
  description: {
    type: String,
    default: ''
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
fileSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create indexes for better performance
fileSchema.index({ uploadedBy: 1 });
fileSchema.index({ category: 1 });
fileSchema.index({ isPublic: 1 });
fileSchema.index({ createdAt: -1 });

const File = mongoose.model('File', fileSchema);

export default File;