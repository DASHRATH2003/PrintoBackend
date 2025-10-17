import express from 'express';
import { upload } from '../utils/localStorage.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import {
  uploadFile,
  uploadMultipleFiles,
  uploadMultipleFilesPublic,
  getAllFiles,
  getPublicFiles,
  getUserFiles,
  getFile,
  downloadFile,
  updateFile,
  deleteFile,
  getFileStats
} from '../controllers/fileController.js';

const router = express.Router();

// Public routes
router.get('/public', getPublicFiles); // Get all public files
router.post('/upload-multiple-public', upload.array('files', 10), uploadMultipleFilesPublic); // Public upload multiple files (max 10)
router.get('/download/:id', downloadFile); // Download file (public files accessible without auth, private files require auth)

// Protected routes (require authentication)
router.use(authenticateToken);

// File upload routes
router.post('/upload', upload.single('file'), uploadFile); // Upload single file
router.post('/upload-multiple', upload.array('files', 10), uploadMultipleFiles); // Upload multiple files (max 10)

// File management routes
router.get('/my-files', getUserFiles); // Get current user's files
router.get('/:id', getFile); // Get single file details
router.put('/:id', updateFile); // Update file details
router.delete('/:id', deleteFile); // Delete file

// Admin only routes
router.get('/', requireAdmin, getAllFiles); // Get all files (admin only)
router.get('/admin/all', requireAdmin, getAllFiles); // Get all files (admin only)
router.get('/admin/stats', requireAdmin, getFileStats); // Get file statistics (admin only)
router.get('/stats/overview', requireAdmin, getFileStats); // Get file statistics (admin only)

export default router;