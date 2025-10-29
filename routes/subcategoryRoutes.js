import express from 'express';
import Subcategory from '../models/Subcategory.js';
import { normalizeCategory } from '../utils/category.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import multer from 'multer';
import cloudinary from '../utils/cloudinary.js';

const router = express.Router();

// Public: list subcategories by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const subs = await Subcategory.find({ category: normalizeCategory(category), isActive: true })
      .sort({ name: 1 });
    res.json({ success: true, data: subs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching subcategories', error: error.message });
  }
});

// Configure multer memory storage for Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Admin: create subcategory (optional image)
router.post('/', authenticateToken, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, category } = req.body;
    if (!name || !category) {
      return res.status(400).json({ success: false, message: 'Name and category are required' });
    }
    const sub = new Subcategory({ name: name.trim(), category: normalizeCategory(category), createdBy: req.user.userId });

    // If image file provided, upload to Cloudinary
    if (req.file) {
      try {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream({ resource_type: 'image', folder: 'subcategories' }, (err, res) => {
            if (err) reject(err); else resolve(res);
          }).end(req.file.buffer);
        });
        sub.imageUrl = result?.secure_url || '';
        sub.imagePublicId = result?.public_id || '';
      } catch (err) {
        console.error('Cloudinary upload error (subcategory):', err);
        // continue without image
      }
    }
    await sub.save();
    res.status(201).json({ success: true, message: 'Subcategory created', data: sub });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Subcategory already exists for this category' });
    }
    if (error?.name === 'ValidationError') {
      const msg = Object.values(error.errors || {}).map(e => e.message).join(', ') || 'Validation error';
      return res.status(400).json({ success: false, message: msg });
    }
    res.status(500).json({ success: false, message: 'Error creating subcategory', error: error.message });
  }
});

// Admin: delete subcategory
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const sub = await Subcategory.findById(id);
    if (!sub) return res.status(404).json({ success: false, message: 'Subcategory not found' });

    // Try to delete cloudinary image if present
    if (sub.imagePublicId) {
      try {
        await cloudinary.uploader.destroy(sub.imagePublicId);
      } catch (e) {
        console.warn('Cloudinary deletion failed (subcategory):', e);
      }
    }

    await Subcategory.findByIdAndDelete(id);
    res.json({ success: true, message: 'Subcategory deleted', data: sub });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting subcategory', error: error.message });
  }
});

// Admin: list all subcategories
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const subs = await Subcategory.find().sort({ category: 1, name: 1 });
    res.json({ success: true, data: subs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching all subcategories', error: error.message });
  }
});

export default router;