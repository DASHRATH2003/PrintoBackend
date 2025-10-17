import express from 'express';
import multer from 'multer';
import cloudinary from '../utils/cloudinary.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { createBanner, getAllBanners, deleteBanner } from '../controllers/bannerController.js';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Public: list banners
router.get('/', getAllBanners);

// Admin: create banner with image
router.post('/', authenticateToken, requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Image file is required' });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'banners' },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return res.status(500).json({ message: 'Image upload failed' });
        }
        req.fileUploadResult = result;
        return createBanner(req, res);
      }
    );

    uploadStream.end(req.file.buffer);
  } catch (err) {
    next(err);
  }
});

// Admin: delete banner
router.delete('/:id', authenticateToken, requireAdmin, deleteBanner);

export default router;