import express from 'express';
import multer from 'multer';
import cloudinary from '../utils/cloudinary.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { createPoster, getAllPosters, deletePoster } from '../controllers/posterController.js';

const router = express.Router();

// Use memory storage for buffering before uploading to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Public: list posters
router.get('/', getAllPosters);

// Admin: create poster (image required)
router.post('/', authenticateToken, requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Image file is required' });
    }

    // Upload to Cloudinary using upload_stream
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'posters' },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return res.status(500).json({ message: 'Image upload failed' });
        }
        // Attach upload result to request for controller
        req.fileUploadResult = result;
        return createPoster(req, res); // Delegate to controller
      }
    );

    uploadStream.end(req.file.buffer);
  } catch (err) {
    next(err);
  }
});

// Admin: delete poster
router.delete('/:id', authenticateToken, requireAdmin, deletePoster);

export default router;