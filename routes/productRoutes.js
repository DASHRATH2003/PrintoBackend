import express from 'express';
import Product from '../models/Product.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Get all products (no category filter)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, featured, inStock } = req.query;
    
    const query = { isActive: true };
    
    if (search) {
      query.$text = { $search: search };
    }
    
    if (featured !== undefined) {
      query.isFeatured = featured === 'true';
    }
    
    if (inStock !== undefined) {
      query.inStock = inStock === 'true';
    }
    
    const products = await Product.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
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
    res.status(500).json({
      success: false,
      message: 'Error fetching all products',
      error: error.message
    });
  }
});

// Get all products by category
router.get('/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 10, search, featured, inStock } = req.query;
    
    const query = { 
      category: category.toLowerCase(),
      isActive: true
    };
    
    if (search) {
      query.$text = { $search: search };
    }
    
    if (featured !== undefined) {
      query.isFeatured = featured === 'true';
    }
    
    if (inStock !== undefined) {
      query.inStock = inStock === 'true';
    }
    
    const products = await Product.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
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
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
});

// Get products by category (with /category/ prefix)
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 10, search, featured, inStock } = req.query;
    
    const query = { 
      category: category.toLowerCase(),
      isActive: true
    };
    
    if (search) {
      query.$text = { $search: search };
    }
    
    if (featured !== undefined) {
      query.isFeatured = featured === 'true';
    }
    
    if (inStock !== undefined) {
      query.inStock = inStock === 'true';
    }
    
    const products = await Product.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
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
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
});

// Get single product by ID
router.get('/single/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('createdBy', 'name email');
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product',
      error: error.message
    });
  }
});

// Create new product at base path (Admin only) - for frontend compatibility
router.post('/', authenticateToken, requireAdmin, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 10 }]), async (req, res) => {
  try {
    console.log('🔥 Product creation started');
    console.log('📝 Request body:', req.body);
    console.log('📁 Request file:', req.file ? 'File present' : 'No file');
    console.log('👤 User ID:', req.user?.id);
    
    const {
      name,
      description,
      price,
      originalPrice,
      discount,
      category,
      subcategory,
      stockQuantity,
      tags,
      specifications,
      colorVariants,
      newsContent,
      newsDate,
      newsAuthor,
      printingOptions,
      businessInfo
    } = req.body;

    let imageUrl = 'https://via.placeholder.com/400x300?text=No+Image';
    let additionalImages = [];
    
    // Upload main image to Cloudinary if provided
    if (req.files && req.files.image && req.files.image[0]) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { resource_type: 'auto' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(req.files.image[0].buffer);
      });
      imageUrl = result.secure_url;
    }

    // Upload additional images if provided
    if (req.files && req.files.images && req.files.images.length > 0) {
      for (const file of req.files.images) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { resource_type: 'auto' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(file.buffer);
        });
        additionalImages.push(result.secure_url);
      }
    }

    // Safely parse JSON fields
    let parsedTags = [];
    let parsedSpecifications = {};
    let parsedColorVariants = {};
    let parsedPrintingOptions = {};
    let parsedBusinessInfo = {};
    
    try {
      parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [];
    } catch (e) {
      console.warn('Failed to parse tags, using empty array:', e.message);
      parsedTags = [];
    }
    
    try {
      parsedSpecifications = specifications ? (typeof specifications === 'string' ? JSON.parse(specifications) : specifications) : {};
    } catch (e) {
      console.warn('Failed to parse specifications, using empty object:', e.message);
      parsedSpecifications = {};
    }
    
    try {
      parsedColorVariants = colorVariants ? (typeof colorVariants === 'string' ? JSON.parse(colorVariants) : colorVariants) : {};
    } catch (e) {
      console.warn('Failed to parse colorVariants, using empty object:', e.message);
      parsedColorVariants = {};
    }
    
    try {
      parsedColorVariants = colorVariants ? (typeof colorVariants === 'string' ? JSON.parse(colorVariants) : colorVariants) : {};
    } catch (e) {
      console.warn('Failed to parse colorVariants, using empty object:', e.message);
      parsedColorVariants = {};
    }

    const productData = {
      name,
      description,
      price: parseFloat(price),
      originalPrice: originalPrice ? parseFloat(originalPrice) : null,
      discount: discount ? parseFloat(discount) : 0,
      category: category.toLowerCase(),
      subcategory: subcategory || '',
      image: imageUrl,
      images: additionalImages,
      stockQuantity: stockQuantity ? parseInt(stockQuantity) : 0,
      tags: parsedTags,
      specifications: parsedSpecifications,
      colorVariants: parsedColorVariants,
      createdBy: req.user.userId
    };

    // Add category-specific fields
    if (category.toLowerCase() === 'news') {
      productData.newsContent = newsContent || '';
      productData.newsDate = newsDate ? new Date(newsDate) : new Date();
      productData.newsAuthor = newsAuthor || '';
    }

    if (category.toLowerCase() === 'printing') {
      try {
        productData.printingOptions = printingOptions ? (typeof printingOptions === 'string' ? JSON.parse(printingOptions) : printingOptions) : {};
      } catch (e) {
        console.warn('Failed to parse printingOptions, using empty object:', e.message);
        productData.printingOptions = {};
      }
    }

    if (category.toLowerCase() === 'localmarket') {
      try {
        productData.businessInfo = businessInfo ? (typeof businessInfo === 'string' ? JSON.parse(businessInfo) : businessInfo) : {};
      } catch (e) {
        console.warn('Failed to parse businessInfo, using empty object:', e.message);
        productData.businessInfo = {};
      }
    }

    console.log('💾 Final product data:', productData);
    console.log('🏗️ Creating product instance...');
    const product = new Product(productData);
    console.log('💾 Saving product to database...');
    await product.save();
    console.log('✅ Product saved successfully!');

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating product',
      error: error.message
    });
  }
});

// Create new product (Admin only)
router.post('/create', authenticateToken, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      originalPrice,
      discount,
      category,
      subcategory,
      stockQuantity,
      tags,
      specifications,
      colorVariants,
      newsContent,
      newsDate,
      newsAuthor,
      printingOptions,
      businessInfo
    } = req.body;

    let imageUrl = 'https://via.placeholder.com/400x300?text=No+Image';
    
    // Upload image to Cloudinary if provided
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { resource_type: 'auto' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(req.file.buffer);
      });
      imageUrl = result.secure_url;
    }

    // Safely parse JSON fields
    let parsedTags = [];
    let parsedSpecifications = {};
    let parsedColorVariants = {};
    let parsedPrintingOptions = {};
    let parsedBusinessInfo = {};
    
    try {
      parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [];
    } catch (e) {
      console.warn('Failed to parse tags, using empty array:', e.message);
      parsedTags = [];
    }
    
    try {
      parsedSpecifications = specifications ? (typeof specifications === 'string' ? JSON.parse(specifications) : specifications) : {};
    } catch (e) {
      console.warn('Failed to parse specifications, using empty object:', e.message);
      parsedSpecifications = {};
    }

    const productData = {
      name,
      description,
      price: parseFloat(price),
      originalPrice: originalPrice ? parseFloat(originalPrice) : null,
      discount: discount ? parseFloat(discount) : 0,
      category: category.toLowerCase(),
      subcategory: subcategory || '',
      image: imageUrl,
      stockQuantity: stockQuantity ? parseInt(stockQuantity) : 0,
      tags: parsedTags,
      specifications: parsedSpecifications,
      colorVariants: parsedColorVariants,
      createdBy: req.user.userId
    };

    // Add category-specific fields
    if (category.toLowerCase() === 'news') {
      productData.newsContent = newsContent || '';
      productData.newsDate = newsDate ? new Date(newsDate) : new Date();
      productData.newsAuthor = newsAuthor || '';
    }

    if (category.toLowerCase() === 'printing') {
      try {
        productData.printingOptions = printingOptions ? (typeof printingOptions === 'string' ? JSON.parse(printingOptions) : printingOptions) : {};
      } catch (e) {
        console.warn('Failed to parse printingOptions, using empty object:', e.message);
        productData.printingOptions = {};
      }
    }

    if (category.toLowerCase() === 'localmarket') {
      try {
        productData.businessInfo = businessInfo ? (typeof businessInfo === 'string' ? JSON.parse(businessInfo) : businessInfo) : {};
      } catch (e) {
        console.warn('Failed to parse businessInfo, using empty object:', e.message);
        productData.businessInfo = {};
      }
    }

    const product = new Product(productData);
    await product.save();

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating product',
      error: error.message
    });
  }
});

// Update product (Admin only)
router.put('/update/:id', authenticateToken, requireAdmin, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 10 }]), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const updateData = { ...req.body };
    updateData.updatedBy = req.user.userId;

    // Handle main image upload if provided
    if (req.files && req.files.image && req.files.image[0]) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { resource_type: 'auto' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(req.files.image[0].buffer);
      });
      updateData.image = result.secure_url;
    }

    // Handle additional images upload if provided
    if (req.files && req.files.images && req.files.images.length > 0) {
      const additionalImages = [];
      for (const file of req.files.images) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { resource_type: 'auto' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(file.buffer);
        });
        additionalImages.push(result.secure_url);
      }
      
      // Merge new images with existing ones
      if (product.images && product.images.length > 0) {
        updateData.images = [...product.images, ...additionalImages];
      } else {
        updateData.images = additionalImages;
      }
    }

    // Parse JSON fields if they exist
    if (updateData.tags && typeof updateData.tags === 'string') {
      updateData.tags = JSON.parse(updateData.tags);
    }
    if (updateData.specifications && typeof updateData.specifications === 'string') {
      updateData.specifications = JSON.parse(updateData.specifications);
    }
    if (updateData.colorVariants && typeof updateData.colorVariants === 'string') {
      updateData.colorVariants = JSON.parse(updateData.colorVariants);
    }
    if (updateData.printingOptions && typeof updateData.printingOptions === 'string') {
      updateData.printingOptions = JSON.parse(updateData.printingOptions);
    }
    if (updateData.businessInfo && typeof updateData.businessInfo === 'string') {
      updateData.businessInfo = JSON.parse(updateData.businessInfo);
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating product',
      error: error.message
    });
  }
});

// Delete product (Admin only)
router.delete('/delete/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting product',
      error: error.message
    });
  }
});

// Toggle product status (Admin only)
router.patch('/toggle-status/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.isActive = !product.isActive;
    product.updatedBy = req.user.userId;
    await product.save();

    res.json({
      success: true,
      message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
      data: product
    });
  } catch (error) {
    console.error('Error toggling product status:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling product status',
      error: error.message
    });
  }
});

// Get admin products (all products for admin panel)
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    
    const query = {};
    
    if (category && category !== 'all') {
      query.category = category.toLowerCase();
    }
    
    if (search) {
      query.$text = { $search: search };
    }
    
    const products = await Product.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
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
    console.error('Error fetching admin products:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
});

export default router;