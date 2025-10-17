import File from '../models/File.js';
import User from '../models/User.js';
import cloudinary from '../utils/cloudinary.js';
import { getFileCategory, deleteLocalFile } from '../utils/localStorage.js';

// Upload single file to Cloudinary
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const { description, tags, isPublic } = req.body;
    const userId = req.user ? req.user.userId : null;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, { resource_type: 'auto' });

    // Save to MongoDB
    const fileData = new File({
      originalName: req.file.originalname,
      fileName: result.public_id,
      filePath: '', // not needed, empty
      fileUrl: result.secure_url, // Cloudinary url
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

    // Optionally delete local file
    await deleteLocalFile(req.file.path);

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading file',
      error: error.message
    });
  }
};

// Upload multiple files to Cloudinary
export const uploadMultipleFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }
    const { description, tags, isPublic } = req.body;
    const userId = req.user ? req.user.userId : null;

    const uploadedFiles = [];
    for (const file of req.files) {
      // Upload each file to Cloudinary
      const result = await cloudinary.uploader.upload(file.path, { resource_type: 'auto' });

      const fileData = new File({
        originalName: file.originalname,
        fileName: result.public_id,
        filePath: '',
        fileUrl: result.secure_url,
        fileType: file.mimetype,
        fileSize: file.size,
        uploadedBy: userId,
        category: getFileCategory(file.mimetype),
        description: description || '',
        isPublic: isPublic !== undefined ? isPublic : true,
        tags: tags ? tags.split(',').map(tag => tag.trim()) : []
      });
      const savedFile = await fileData.save();
      if (userId) {
        await savedFile.populate('uploadedBy', 'name email');
      }
      uploadedFiles.push(savedFile);

      // Optionally delete local file
      await deleteLocalFile(file.path);
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

// Upload multiple files to Cloudinary (Public endpoint - no auth required)
export const uploadMultipleFilesPublic = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }
    const { description, tags, category } = req.body;

    const uploadedFiles = [];
    for (const file of req.files) {
      // Upload each file to Cloudinary
      const result = await cloudinary.uploader.upload(file.path, { resource_type: 'auto' });

      const fileData = new File({
        originalName: file.originalname,
        fileName: result.public_id,
        filePath: '',
        fileUrl: result.secure_url,
        fileType: file.mimetype,
        fileSize: file.size,
        uploadedBy: null, // No user for public uploads
        category: category || getFileCategory(file.mimetype),
        description: description || '',
        isPublic: true, // Always public for this endpoint
        tags: tags ? tags.split(',').map(tag => tag.trim()) : []
      });
      const savedFile = await fileData.save();
      uploadedFiles.push(savedFile);

      // Optionally delete local file
      await deleteLocalFile(file.path);
    }

    res.status(201).json({
      success: true,
      message: `${uploadedFiles.length} files uploaded successfully`,
      files: uploadedFiles
    });
  } catch (error) {
    console.error('Public multiple files upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading files',
      error: error.message
    });
  }
}

// Get all files (admin only)
export const getAllFiles = async (req, res) => {
  try {
    const files = await File.find().populate('uploadedBy', 'name email').sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      files
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

// Get all public files
export const getPublicFiles = async (req, res) => {
  try {
    const files = await File.find({ isPublic: true }).populate('uploadedBy', 'name email').sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      files
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

// Get current user's files
export const getUserFiles = async (req, res) => {
  try {
    const userId = req.user.userId;
    const files = await File.find({ uploadedBy: userId }).populate('uploadedBy', 'name email').sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      files
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

// Get single file details
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

    // Check if user has permission to view the file
    if (!file.isPublic && (!req.user || file.uploadedBy._id.toString() !== req.user.userId)) {
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

// Download file
export const downloadFile = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Download request received for file ID:', id);
    console.log('Request user:', req.user);
    
    const file = await File.findById(id);
    
    if (!file) {
      console.log('File not found');
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    console.log('File found:', file.originalName, 'isPublic:', file.isPublic);

    // Check if user has permission to download the file
    if (!file.isPublic && (!req.user || file.uploadedBy.toString() !== req.user.userId)) {
      console.log('Access denied - private file and no valid user');
      return res.status(403).json({
        success: false,
        message: 'Access denied - Please login to download private files'
      });
    }

    console.log('Access granted - proceeding with download');

    // Increment download count
    file.downloadCount = (file.downloadCount || 0) + 1;
    await file.save();

    // Redirect to Cloudinary URL for download
    console.log('Redirecting to:', file.fileUrl);
    res.redirect(file.fileUrl);
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

    // Check if user owns the file
    if (file.uploadedBy.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update file details
    if (description !== undefined) file.description = description;
    if (tags !== undefined) file.tags = tags.split(',').map(tag => tag.trim());
    if (isPublic !== undefined) file.isPublic = isPublic;

    const updatedFile = await file.save();
    await updatedFile.populate('uploadedBy', 'name email');

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

    // Check if user owns the file or is admin
    if (file.uploadedBy.toString() !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(file.fileName);
    } catch (cloudinaryError) {
      console.error('Cloudinary deletion error:', cloudinaryError);
    }

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

// Get file statistics (admin only)
export const getFileStats = async (req, res) => {
  try {
    const totalFiles = await File.countDocuments();
    const publicFiles = await File.countDocuments({ isPublic: true });
    const privateFiles = await File.countDocuments({ isPublic: false });
    
    // Get total downloads
    const totalDownloadsResult = await File.aggregate([
      {
        $group: {
          _id: null,
          totalDownloads: { $sum: '$downloadCount' }
        }
      }
    ]);
    const totalDownloads = totalDownloadsResult.length > 0 ? totalDownloadsResult[0].totalDownloads : 0;
    
    // Get file counts by category
    const categoryStats = await File.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalSize: { $sum: '$fileSize' },
          totalDownloads: { $sum: '$downloadCount' }
        }
      }
    ]);

    // Get total storage used
    const totalSizeResult = await File.aggregate([
      {
        $group: {
          _id: null,
          totalSize: { $sum: '$fileSize' }
        }
      }
    ]);
    const totalSize = totalSizeResult.length > 0 ? totalSizeResult[0].totalSize : 0;

    res.status(200).json({
      success: true,
      stats: {
        totalFiles,
        publicFiles,
        privateFiles,
        totalSize,
        totalDownloads,
        categoryStats
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
