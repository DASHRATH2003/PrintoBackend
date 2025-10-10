import express from 'express';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { authenticateToken, requireSeller, requireApprovedSeller } from '../middleware/auth.js';
import { normalizeCategory } from '../utils/category.js';
import Seller from '../models/Seller.js';
import multer from 'multer';
import cloudinary from '../utils/cloudinary.js';

const router = express.Router();

// Configure multer for file uploads (memory storage for Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// All seller routes require authentication and seller role
router.use(authenticateToken, requireSeller);

// GET /api/seller/products - List seller's products
router.get('/products', requireApprovedSeller, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, category, isActive, inStock } = req.query;

    const query = { createdBy: req.user.userId };
    if (category && category !== 'all') query.category = normalizeCategory(category);
    if (typeof isActive !== 'undefined') query.isActive = isActive === 'true';
    if (typeof inStock !== 'undefined') query.inStock = inStock === 'true';
    if (search) query.$text = { $search: search };

    const products = await Product.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      data: products,
      pagination: { current: Number(page), pages: Math.ceil(total / Number(limit)), total }
    });
  } catch (error) {
    console.error('Error fetching seller products:', error);
    res.status(500).json({ success: false, message: 'Error fetching seller products', error: error.message });
  }
});

// POST /api/seller/products - Create a new product (seller-owned)
router.post(
  '/products',
  requireApprovedSeller,
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 10 }]),
  async (req, res) => {
    try {
      // Helpers copied from admin create with minor tweaks
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
        price: req.body.price !== undefined ? parseFloat(req.body.price) : undefined,
        offerPrice: req.body.offerPrice !== undefined && req.body.offerPrice !== '' ? parseFloat(req.body.offerPrice) : null,
        category: normalizeCategory(req.body.category || ''),
        subcategory: req.body.subcategory || '',
        colorVarients: parseList(req.body.colorVarients),
        sizeVarients: parseList(req.body.sizeVarients),
        inStock: req.body.inStock !== undefined ? req.body.inStock === 'true' || req.body.inStock === true : true,
        stockQuantity: req.body.stockQuantity ? parseInt(req.body.stockQuantity) : 0,
        createdBy: req.user.userId,
        sellerId: null,
        sellerName: '',
        isActive: true
      };

      // Attach seller metadata from Seller collection (by JWT email)
      try {
        const sellerDoc = await Seller.findOne({ email: req.user.email }).select('_id sellerName name');
        if (sellerDoc) {
          productData.sellerId = sellerDoc._id;
          productData.sellerName = sellerDoc.sellerName || sellerDoc.name || '';
        }
      } catch (e) {
        // Non-blocking: if seller doc not found, keep defaults
        console.warn('Seller doc not found for product creation:', e?.message || e);
      }

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

      const imagesColorMapObj = parseImagesColorMap(req.body.imagesColorMap);
      const colorsList = Array.isArray(productData.colorVarients) ? productData.colorVarients : [];
      productData.colorVarients = buildColorVarientsObjects(colorsList, productData.images || [], imagesColorMapObj);

      const product = new Product(productData);
      const savedProduct = await product.save();

      res.status(201).json({ success: true, message: 'Product created successfully', data: savedProduct });
    } catch (error) {
      console.error('Error creating seller product:', error);
      res.status(500).json({ success: false, message: 'Error creating product', error: error.message });
    }
  }
);

// PATCH /api/seller/products/:id/toggle-status - Toggle product active status (seller-owned only)
router.patch('/products/:id/toggle-status', requireApprovedSeller, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    if (String(product.createdBy) !== String(req.user.userId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this product' });
    }

    product.isActive = !product.isActive;
    product.updatedBy = req.user.userId;
    await product.save();

    res.json({ success: true, message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`, data: product });
  } catch (error) {
    console.error('Error toggling seller product status:', error);
    res.status(500).json({ success: false, message: 'Error toggling product status', error: error.message });
  }
});

// GET /api/seller/orders - List orders that include seller's products
router.get('/orders', requireApprovedSeller, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const sellerProducts = await Product.find({ createdBy: req.user.userId }).select('_id');
    const productIds = sellerProducts.map(p => p._id);

    const orderQuery = { 'items.productId': { $in: productIds } };
    if (status) orderQuery.status = String(status).toLowerCase();

    const orders = await Order.find(orderQuery)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Order.countDocuments(orderQuery);

    res.json({ success: true, data: orders, pagination: { current: Number(page), pages: Math.ceil(total / Number(limit)), total } });
  } catch (error) {
    console.error('Error fetching seller orders:', error);
    res.status(500).json({ success: false, message: 'Error fetching seller orders', error: error.message });
  }
});

// GET /api/seller/orders/:id - Get single order if it includes seller's product
router.get('/orders/:id', requireApprovedSeller, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const sellerProducts = await Product.find({ createdBy: req.user.userId }).select('_id');
    const productIds = sellerProducts.map(p => String(p._id));

    const hasSellerItem = (order.items || []).some(it => it.productId && productIds.includes(String(it.productId)));
    if (!hasSellerItem) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this order' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    console.error('Error fetching seller order:', error);
    res.status(500).json({ success: false, message: 'Error fetching order', error: error.message });
  }
});

// PUT /api/seller/orders/:id/status - Update order status if order contains seller's product
router.put('/orders/:id/status', requireApprovedSeller, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const sellerProducts = await Product.find({ createdBy: req.user.userId }).select('_id');
    const productIds = sellerProducts.map(p => String(p._id));
    const hasSellerItem = (order.items || []).some(it => it.productId && productIds.includes(String(it.productId)));
    if (!hasSellerItem) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this order' });
    }

    // Validate status values: only allow four options requested
    const allowedStatuses = ['pending', 'processing', 'shipped', 'cancelled'];
    const newStatus = String(status || '').toLowerCase();
    if (!allowedStatuses.includes(newStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    order.status = newStatus;
    await order.save();
    res.json({ success: true, message: 'Order status updated successfully', data: order });
  } catch (error) {
    console.error('Error updating seller order status:', error);
    res.status(500).json({ success: false, message: 'Error updating order status', error: error.message });
  }
});

export default router;
// GET /api/seller/sub-sellers - List sub-sellers under current seller
router.get('/sub-sellers', requireApprovedSeller, async (req, res) => {
  try {
    // find current seller document by JWT email or userId
    const currentSeller = await Seller.findOne({ email: req.user.email });
    if (!currentSeller) {
      return res.json({ success: true, data: [], count: 0 });
  }

  const subs = await Seller.find({ parentSeller: currentSeller._id })
    .select('name email sellerName sellerHierarchyLevel createdAt');

  res.json({ success: true, data: subs, count: subs.length });
  } catch (error) {
    console.error('Error fetching sub-sellers:', error);
    res.status(500).json({ success: false, message: 'Error fetching sub-sellers', error: error.message });
  }
});

// POST /api/seller/verification - Submit seller verification details and documents
router.post(
  '/verification',
  upload.fields([
    { name: 'idProof', maxCount: 1 },
    { name: 'addressProof', maxCount: 1 },
    // Optional additional documents
    { name: 'businessProof', maxCount: 1 },
    { name: 'bankProof', maxCount: 1 }
  ]),
  async (req, res) => {
  try {
    const { sellerName, shopName, email, phone } = req.body;
    // Find current seller by email from JWT
    const currentSeller = await Seller.findOne({ email: req.user.email });
    if (!currentSeller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    // Upload files to Cloudinary if provided
    const uploadFileBuffer = async (file) => {
      if (!file) return null;
      try {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream({ resource_type: 'auto', folder: 'seller_verifications' }, (err, res) => {
            if (err) reject(err); else resolve(res);
          }).end(file.buffer);
        });
        return result?.secure_url || null;
      } catch (err) {
        console.error('Cloudinary upload error (seller verification):', err);
        throw err;
      }
    };

    const idProofUrl = await uploadFileBuffer(req.files?.idProof?.[0]);
    const addressProofUrl = await uploadFileBuffer(req.files?.addressProof?.[0]);
    const businessProofUrl = await uploadFileBuffer(req.files?.businessProof?.[0]);
    const bankProofUrl = await uploadFileBuffer(req.files?.bankProof?.[0]);

    // Update seller document with verification info
    currentSeller.verification = {
      sellerName: sellerName || currentSeller.sellerName || currentSeller.name,
      shopName: shopName || '',
      email: email || currentSeller.email,
      phone: phone || '',
      idProofUrl: idProofUrl || currentSeller.verification?.idProofUrl || '',
      addressProofUrl: addressProofUrl || currentSeller.verification?.addressProofUrl || '',
      businessProofUrl: businessProofUrl || currentSeller.verification?.businessProofUrl || '',
      bankProofUrl: bankProofUrl || currentSeller.verification?.bankProofUrl || '',
      submittedAt: new Date(),
      reviewedAt: null,
      reviewerNote: ''
    };
    currentSeller.verificationStatus = 'pending';
    // Preserve registeredOn if exists
    if (!currentSeller.registeredOn) {
      currentSeller.registeredOn = currentSeller.createdAt || new Date();
    }
    await currentSeller.save();

    res.status(200).json({ success: true, message: 'Verification submitted successfully', data: currentSeller });
  } catch (error) {
    console.error('Error submitting seller verification:', error);
    res.status(500).json({ success: false, message: 'Error submitting verification', error: error.message });
  }
  }
);

// GET /api/seller/verification - Get current seller verification status/details
router.get('/verification', async (req, res) => {
  try {
    const currentSeller = await Seller.findOne({ email: req.user.email }).select('sellerName email verificationStatus registeredOn verification createdAt');
    if (!currentSeller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }
    res.json({ success: true, data: currentSeller });
  } catch (error) {
    console.error('Error fetching seller verification:', error);
    res.status(500).json({ success: false, message: 'Error fetching verification', error: error.message });
  }
});