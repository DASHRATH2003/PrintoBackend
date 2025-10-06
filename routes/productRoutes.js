import express from 'express';
import Product from '../models/Product.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Legacy variant removed

// ---------------------- ROUTES ---------------------- //

// ✅ Get all products
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, featured, inStock } = req.query;

    const query = { isActive: true };

    if (search) query.$text = { $search: search };
    if (featured !== undefined) query.isFeatured = featured === 'true';
    if (inStock !== undefined) query.inStock = inStock === 'true';

    const products = await Product.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      data: products,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching all products:', error);
    res.status(500).json({ success: false, message: 'Error fetching all products', error: error.message });
  }
});

// ✅ Get by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 10, search, featured, inStock } = req.query;

    const query = { category: category.toLowerCase(), isActive: true };

    if (search) query.$text = { $search: search };
    if (featured !== undefined) query.isFeatured = featured === 'true';
    if (inStock !== undefined) query.inStock = inStock === 'true';

    const products = await Product.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      data: products,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching products by category:', error);
    res.status(500).json({ success: false, message: 'Error fetching products', error: error.message });
  }
});

// ✅ Get single product
router.get('/single/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('createdBy', 'name email');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ success: false, message: 'Error fetching product', error: error.message });
  }
});

// ✅ Create product
router.post('/', authenticateToken, requireAdmin, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 10 }]), async (req, res) => {
  try {
    // Parse color and size variants (comma-separated string or JSON array)
    const parseList = (raw) => {
      if (!raw) return [];
      try {
        if (typeof raw === 'string') {
          const trimmed = raw.trim();
          if (trimmed.startsWith('[')) return JSON.parse(trimmed).map(String);
          return trimmed.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (Array.isArray(raw)) return raw.map(String);
        return [String(raw)].filter(Boolean);
      } catch (e) {
        return String(raw).split(',').map(s => s.trim()).filter(Boolean);
      }
    };

    const productData = {
      name: req.body.name,
      description: req.body.description,
      price: parseFloat(req.body.price),
      offerPrice: req.body.offerPrice !== undefined && req.body.offerPrice !== '' ? parseFloat(req.body.offerPrice) : null,
      category: req.body.category.toLowerCase(),
      subcategory: req.body.subcategory || '',
      colorVarients: parseList(req.body.colorVarients),
      sizeVarients: parseList(req.body.sizeVarients),
      inStock: req.body.inStock !== undefined ? req.body.inStock === 'true' : true,
      stockQuantity: req.body.stockQuantity ? parseInt(req.body.stockQuantity) : 0,
      createdBy: req.user.userId
    };

    // Handle main image
    if (req.files?.image?.[0]) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ resource_type: 'auto', folder: 'products' }, (err, res) => {
          if (err) reject(err); else resolve(res);
        }).end(req.files.image[0].buffer);
      });
      productData.image = result.secure_url;
    }

    // Handle additional images
    if (req.files?.images?.length > 0) {
      productData.images = [];
      for (const file of req.files.images) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream({ resource_type: 'auto', folder: 'products' }, (err, res) => {
            if (err) reject(err); else resolve(res);
          }).end(file.buffer);
        });
        productData.images.push(result.secure_url);
      }
    }

    const product = new Product(productData);
    const savedProduct = await product.save();

    res.status(201).json({ success: true, message: 'Product created successfully', data: savedProduct });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ success: false, message: 'Error creating product', error: error.message });
  }
});

// ✅ Update product
router.put('/update/:id', authenticateToken, requireAdmin, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 10 }]), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const updateData = { ...req.body, updatedBy: req.user.userId };

    // Normalize numeric fields
    if (updateData.price !== undefined) updateData.price = parseFloat(updateData.price);
    if (req.body.offerPrice !== undefined) {
      updateData.offerPrice = req.body.offerPrice !== '' ? parseFloat(req.body.offerPrice) : null;
    }
    if (req.body.colorVarients !== undefined) {
      const parseList = (raw) => {
        if (!raw) return [];
        try {
          if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (trimmed.startsWith('[')) return JSON.parse(trimmed).map(String);
            return trimmed.split(',').map(s => s.trim()).filter(Boolean);
          }
          if (Array.isArray(raw)) return raw.map(String);
          return [String(raw)].filter(Boolean);
        } catch (e) {
          return String(raw).split(',').map(s => s.trim()).filter(Boolean);
        }
      };
      updateData.colorVarients = parseList(req.body.colorVarients);
    }
    if (req.body.sizeVarients !== undefined) {
      const parseList = (raw) => {
        if (!raw) return [];
        try {
          if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (trimmed.startsWith('[')) return JSON.parse(trimmed).map(String);
            return trimmed.split(',').map(s => s.trim()).filter(Boolean);
          }
          if (Array.isArray(raw)) return raw.map(String);
          return [String(raw)].filter(Boolean);
        } catch (e) {
          return String(raw).split(',').map(s => s.trim()).filter(Boolean);
        }
      };
      updateData.sizeVarients = parseList(req.body.sizeVarients);
    }

    // Handle main image
    if (req.files?.image?.[0]) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ resource_type: 'auto' }, (err, res) => {
          if (err) reject(err); else resolve(res);
        }).end(req.files.image[0].buffer);
      });
      updateData.image = result.secure_url;
    }

    // Handle additional images
    if (req.files?.images?.length > 0) {
      const newImages = [];
      for (const file of req.files.images) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream({ resource_type: 'auto' }, (err, res) => {
            if (err) reject(err); else resolve(res);
          }).end(file.buffer);
        });
        newImages.push(result.secure_url);
      }
      updateData.images = product.images ? [...product.images, ...newImages] : newImages;
    }

    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true }).populate('createdBy', 'name email');

    res.json({ success: true, message: 'Product updated successfully', data: updatedProduct });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, message: 'Error updating product', error: error.message });
  }
});

// ✅ Delete product
router.delete('/delete/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Error deleting product', error: error.message });
  }
});

// ✅ Toggle status
router.patch('/toggle-status/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    product.isActive = !product.isActive;
    product.updatedBy = req.user.userId;
    await product.save();

    res.json({ success: true, message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`, data: product });
  } catch (error) {
    console.error('Error toggling product status:', error);
    res.status(500).json({ success: false, message: 'Error toggling product status', error: error.message });
  }
});

// ✅ Admin all products
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;

    const query = {};
    if (category && category !== 'all') query.category = category.toLowerCase();
    if (search) query.$text = { $search: search };

    const products = await Product.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Product.countDocuments(query);

    res.json({ success: true, data: products, pagination: { current: page, pages: Math.ceil(total / limit), total } });
  } catch (error) {
    console.error('Error fetching admin products:', error);
    res.status(500).json({ success: false, message: 'Error fetching products', error: error.message });
  }
});

export default router;
