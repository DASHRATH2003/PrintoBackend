import express from 'express';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import User from '../models/User.js';
import { normalizeCategory } from '../utils/category.js';
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

    // First-word prefix matching (case-insensitive) on product name
    if (search && String(search).trim().length > 0) {
      const term = String(search).trim();
      const firstWord = term.split(/\s+/)[0];
      const escaped = firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Anchor to start of product name
      const regex = new RegExp(`^${escaped}`, 'i');
      query.$or = [{ name: regex }];
    }
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

    const query = { category: normalizeCategory(category), isActive: true };

    // First-word prefix matching (case-insensitive) on product name within category
    if (search && String(search).trim().length > 0) {
      const term = String(search).trim();
      const firstWord = term.split(/\s+/)[0];
      const escaped = firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escaped}`, 'i');
      query.$or = [{ name: regex }];
    }
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
router.post('/', authenticateToken, requireAdmin, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 10 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
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

    // Parse color->image index map (JSON string or object), e.g. { "red": [0,2], "blue": 1 }
    const parseImagesColorMap = (raw) => {
      if (!raw) return {};
      try {
        if (typeof raw === 'string') {
          const trimmed = raw.trim();
          if (!trimmed) return {};
          return JSON.parse(trimmed);
        }
        if (typeof raw === 'object') return raw;
        return {};
      } catch (e) {
        return {};
      }
    };

    // Build array of { color, images: [url] } from colors list and uploaded images
    const buildColorVarientsObjects = (colors, images, colorMapObj) => {
      const variants = [];
      const normColor = (c) => String(c).trim().toLowerCase();
      const keys = colorMapObj && typeof colorMapObj === 'object' ? Object.keys(colorMapObj) : [];
      if (keys.length > 0) {
        for (const key of keys) {
          const color = normColor(key);
          let indices = colorMapObj[key];
          if (!Array.isArray(indices)) {
            indices = String(indices).split(',').map(s => s.trim()).filter(Boolean);
          }
          const idxNums = indices.map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n) && n >= 0 && n < images.length);
          const urls = idxNums.map(i => images[i]);
          variants.push({ color, images: urls });
        }
      } else if (Array.isArray(colors) && colors.length > 0) {
        colors.forEach((c, i) => {
          const color = normColor(c);
          const url = images?.[i] ? [images[i]] : [];
          variants.push({ color, images: url });
        });
      }
      return variants;
    };

    const productData = {
      name: req.body.name,
      description: req.body.description,
      price: parseFloat(req.body.price),
      offerPrice: req.body.offerPrice !== undefined && req.body.offerPrice !== '' ? parseFloat(req.body.offerPrice) : null,
      category: normalizeCategory(req.body.category),
      subcategory: req.body.subcategory || '',
      // Temporarily keep colors list; will convert to objects after image upload
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

    // Handle optional video (max 5MB)
    if (req.files?.video?.[0]) {
      const videoFile = req.files.video[0];
      const maxBytes = 5 * 1024 * 1024; // 5MB
      if (videoFile.size && videoFile.size > maxBytes) {
        return res.status(400).json({ success: false, message: 'Video size must be 5MB or less' });
      }
      const videoResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ resource_type: 'video', folder: 'product_videos' }, (err, res) => {
          if (err) reject(err); else resolve(res);
        }).end(videoFile.buffer);
      });
      productData.videoUrl = videoResult.secure_url;
    }

    // Now convert colorVarients into array of { color, images } using imagesColorMap or fallback
    const imagesColorMapObj = parseImagesColorMap(req.body.imagesColorMap);
    const colorsList = Array.isArray(productData.colorVarients) ? productData.colorVarients : [];
    // Debug logs to trace incoming mapping and built variants
    console.log('🟦 [Create] Raw imagesColorMap:', req.body.imagesColorMap);
    console.log('🟦 [Create] Parsed imagesColorMap object:', imagesColorMapObj);
    console.log('🟦 [Create] Uploaded images count:', (productData.images || []).length);
    console.log('🟦 [Create] Parsed colors list:', colorsList);
    productData.colorVarients = buildColorVarientsObjects(colorsList, productData.images || [], imagesColorMapObj);
    console.log('🟩 [Create] Built colorVarients objects:', productData.colorVarients);

    const product = new Product(productData);
    const savedProduct = await product.save();

    res.status(201).json({ success: true, message: 'Product created successfully', data: savedProduct });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ success: false, message: 'Error creating product', error: error.message });
  }
});

// ✅ Update product
router.put('/update/:id', authenticateToken, requireAdmin, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 10 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const updateData = { ...req.body, updatedBy: req.user.userId };

    // Normalize numeric fields
    if (updateData.price !== undefined) updateData.price = parseFloat(updateData.price);
    if (req.body.offerPrice !== undefined) {
      updateData.offerPrice = req.body.offerPrice !== '' ? parseFloat(req.body.offerPrice) : null;
    }
    // Parse colors list for update (if provided)
    const parseListUpdate = (raw) => {
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
    let colorsListForUpdate;
    if (req.body.colorVarients !== undefined) {
      colorsListForUpdate = parseListUpdate(req.body.colorVarients);
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

    // Handle optional video (max 5MB)
    if (req.files?.video?.[0]) {
      const videoFile = req.files.video[0];
      const maxBytes = 5 * 1024 * 1024; // 5MB
      if (videoFile.size && videoFile.size > maxBytes) {
        return res.status(400).json({ success: false, message: 'Video size must be 5MB or less' });
      }
      const videoResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ resource_type: 'video' }, (err, res) => {
          if (err) reject(err); else resolve(res);
        }).end(videoFile.buffer);
      });
      updateData.videoUrl = videoResult.secure_url;
    }

    // Convert colorVarients to array of { color, images } for update
    const parseImagesColorMapUpdate = (raw) => {
      if (!raw) return {};
      try {
        if (typeof raw === 'string') {
          const trimmed = raw.trim();
          if (!trimmed) return {};
          return JSON.parse(trimmed);
        }
        if (typeof raw === 'object') return raw;
        return {};
      } catch (e) {
        return {};
      }
    };
    const buildColorVarientsObjectsUpdate = (colors, images, colorMapObj) => {
      const variants = [];
      const normColor = (c) => String(c).trim().toLowerCase();
      const keys = colorMapObj && typeof colorMapObj === 'object' ? Object.keys(colorMapObj) : [];
      if (keys.length > 0) {
        for (const key of keys) {
          const color = normColor(key);
          let indices = colorMapObj[key];
          if (!Array.isArray(indices)) {
            indices = String(indices).split(',').map(s => s.trim()).filter(Boolean);
          }
          const idxNums = indices.map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n) && n >= 0 && n < images.length);
          const urls = idxNums.map(i => images[i]);
          variants.push({ color, images: urls });
        }
      } else if (Array.isArray(colors) && colors.length > 0) {
        colors.forEach((c, i) => {
          const color = normColor(c);
          const url = images?.[i] ? [images[i]] : [];
          variants.push({ color, images: url });
        });
      }
      return variants;
    };

    const finalImages = updateData.images || product.images || [];
    const currentColors = colorsListForUpdate !== undefined
      ? colorsListForUpdate
      : (Array.isArray(product.colorVarients) ? product.colorVarients.map(cv => (typeof cv === 'string' ? cv : cv.color)) : []);
    const imagesColorMapObjUpdate = parseImagesColorMapUpdate(req.body.imagesColorMap);
    // Debug logs to trace update mapping
    console.log('🟦 [Update] Raw imagesColorMap:', req.body.imagesColorMap);
    console.log('🟦 [Update] Parsed imagesColorMap object:', imagesColorMapObjUpdate);
    console.log('🟦 [Update] Final images count:', finalImages.length);
    console.log('🟦 [Update] Current colors list:', currentColors);
    if (currentColors.length > 0 || Object.keys(imagesColorMapObjUpdate).length > 0) {
      updateData.colorVarients = buildColorVarientsObjectsUpdate(currentColors, finalImages, imagesColorMapObjUpdate);
      console.log('🟩 [Update] Built colorVarients objects:', updateData.colorVarients);
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
    if (category && category !== 'all') query.category = normalizeCategory(category);
    // Admin listing search: first-word prefix matching on name
    if (search && String(search).trim().length > 0) {
      const term = String(search).trim();
      const firstWord = term.split(/\s+/)[0];
      const escaped = firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escaped}`, 'i');
      query.$or = [{ name: regex }];
    }

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

// ✅ Get products by seller (used by admin view and seller self-view)
// Path expects Seller collection id; internally maps to User by email
router.get('/seller/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const sellerDoc = await Seller.findById(id).select('email _id verificationStatus');
    if (!sellerDoc) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    // Authorization: admin can view any seller; seller can only view own and must be approved
    const role = String(req.user?.role || '').toLowerCase();
    if (role === 'seller') {
      const currentSeller = await Seller.findOne({ email: req.user.email }).select('_id verificationStatus');
      if (!currentSeller || String(currentSeller._id) !== String(sellerDoc._id)) {
        return res.status(403).json({ success: false, message: 'Not authorized to view other seller products' });
      }
      if (String(currentSeller.verificationStatus).toLowerCase() !== 'approved') {
        return res.status(403).json({ success: false, message: 'Seller not approved by admin yet' });
      }
    }

    // Build query that supports both new and legacy product ownership mappings
    const userDoc = await User.findOne({ email: sellerDoc.email }).select('_id');
    const orConditions = [];
    // New mapping: explicit sellerId stored on Product
    orConditions.push({ sellerId: sellerDoc._id });
    // Legacy mapping: Product.createdBy stores Seller._id
    orConditions.push({ createdBy: sellerDoc._id });
    // Standard mapping: Product.createdBy stores User._id mapped from seller email
    if (userDoc && userDoc._id) {
      orConditions.push({ createdBy: userDoc._id });
    }

    const query = { $or: orConditions };
    const products = await Product.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    // Return plain array for current frontend expectations
    return res.json(products);
  } catch (error) {
    console.error('Error fetching products by seller:', error);
    return res.status(500).json({ success: false, message: 'Error fetching products by seller', error: error.message });
  }
});

// ✅ Delete all products (Admin only)
router.delete('/admin/delete-all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await Product.deleteMany({});
    res.json({ 
      success: true, 
      message: `All products deleted successfully. ${result.deletedCount} products were removed.`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting all products:', error);
    res.status(500).json({ success: false, message: 'Error deleting all products', error: error.message });
  }
});

export default router;
