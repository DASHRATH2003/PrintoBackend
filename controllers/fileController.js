import File from '../models/File.js';
import User from '../models/User.js';
import { getFileCategory, deleteFromCloudinary } from '../utils/cloudinaryConfig.js';

// Upload single file
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { description, tags, isPublic } = req.body;
    const userId = req.user ? req.user.id : null; // Handle both authenticated and public uploads // From auth middleware

    // Create file record in database
    const fileData = new File({
      originalName: req.file.originalname,
      fileName: req.file.filename,
      cloudinaryUrl: req.file.path,
      cloudinaryPublicId: req.file.filename,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: userId,
      category: getFileCategory(req.file.mimetype),
      description: description || '',
      isPublic: isPublic !== undefined ? isPublic : true,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : []
    });

    const savedFile = await fileData.save();
    await savedFile.populate('uploadedBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      file: savedFile
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading file',
      error: error.message
    });
  }
};

// Upload multiple files
export const uploadMultipleFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const { description, tags, isPublic } = req.body;
    const userId = req.user ? req.user.id : null; // Handle both authenticated and public uploads

    const uploadedFiles = [];

    for (const file of req.files) {
      const fileData = new File({
        originalName: file.originalname,
        fileName: file.filename,
        cloudinaryUrl: file.path,
        cloudinaryPublicId: file.filename,
        fileType: file.mimetype,
        fileSize: file.size,
        uploadedBy: userId,
        category: getFileCategory(file.mimetype),
        description: description || '',
        isPublic: isPublic !== undefined ? isPublic : true,
        tags: tags ? tags.split(',').map(tag => tag.trim()) : []
      });

      const savedFile = await fileData.save();
      await savedFile.populate('uploadedBy', 'name email');
      uploadedFiles.push(savedFile);
    }

    res.status(201).json({
      success: true,
      message: `${uploadedFiles.length} files uploaded successfully`,
      files: uploadedFiles
    });

  } catch (error) {
    console.error('Multiple files upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading files',
      error: error.message
    });
  }
};

// Get all files (for admin)
export const getAllFiles = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const query = {};
    
    // Filter by category
    if (category && category !== 'all') {
      query.category = category;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { originalName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const files = await File.find(query)
      .populate('uploadedBy', 'name email role')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await File.countDocuments(query);

    res.status(200).json({
      success: true,
      files,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Get all files error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching files',
      error: error.message
    });
  }
};

// Get public files (for users)
export const getPublicFiles = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    
    const query = { isPublic: true };
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (search) {
      query.$or = [
        { originalName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const files = await File.find(query)
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await File.countDocuments(query);

    res.status(200).json({
      success: true,
      files,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Get public files error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching public files',
      error: error.message
    });
  }
};

// Get user's files
export const getUserFiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, category } = req.query;
    
    const query = { uploadedBy: userId };
    
    if (category && category !== 'all') {
      query.category = category;
    }

    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await File.countDocuments(query);

    res.status(200).json({
      success: true,
      files,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Get user files error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user files',
      error: error.message
    });
  }
};

// Get single file
export const getFile = async (req, res) => {
  try {
    const { id } = req.params;
    
    const file = await File.findById(id).populate('uploadedBy', 'name email');
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Check if user has permission to view file
    if (!file.isPublic && req.user.role !== 'admin' && file.uploadedBy._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      file
    });

  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching file',
      error: error.message
    });
  }
};

// Download file (increment download count)
export const downloadFile = async (req, res) => {
  try {
    const { id } = req.params;
    
    const file = await File.findById(id);
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Check permissions
    if (!file.isPublic && req.user.role !== 'admin' && file.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Increment download count
    await File.findByIdAndUpdate(id, { $inc: { downloadCount: 1 } });

    res.status(200).json({
      success: true,
      message: 'File download initiated',
      downloadUrl: file.cloudinaryUrl,
      fileName: file.originalName
    });

  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file',
      error: error.message
    });
  }
};

// Update file details
export const updateFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, tags, isPublic } = req.body;
    
    const file = await File.findById(id);
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && file.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const updateData = {};
    if (description !== undefined) updateData.description = description;
    if (tags !== undefined) updateData.tags = tags.split(',').map(tag => tag.trim());
    if (isPublic !== undefined) updateData.isPublic = isPublic;

    const updatedFile = await File.findByIdAndUpdate(id, updateData, { new: true })
      .populate('uploadedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'File updated successfully',
      file: updatedFile
    });

  } catch (error) {
    console.error('Update file error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating file',
      error: error.message
    });
  }
};

// Delete file
export const deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    
    const file = await File.findById(id);
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && file.uploadedBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Delete from Cloudinary
    await deleteFromCloudinary(file.cloudinaryPublicId);
    
    // Delete from database
    await File.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting file',
      error: error.message
    });
  }
};

// Get file statistics (for admin dashboard)
export const getFileStats = async (req, res) => {
  try {
    const totalFiles = await File.countDocuments();
    const publicFiles = await File.countDocuments({ isPublic: true });
    const privateFiles = await File.countDocuments({ isPublic: false });
    
    const categoryStats = await File.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalSize: { $sum: '$fileSize' }
        }
      }
    ]);

    const totalDownloads = await File.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$downloadCount' }
        }
      }
    ]);

    const recentFiles = await File.find()
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      stats: {
        totalFiles,
        publicFiles,
        privateFiles,
        categoryStats,
        totalDownloads: totalDownloads[0]?.total || 0,
        recentFiles
      }
    });

  } catch (error) {
    console.error('Get file stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching file statistics',
      error: error.message
    });
  }
};