import express from 'express';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { authenticateToken, requireSeller, requireApprovedSeller } from '../middleware/auth.js';
import CategoryCommission from '../models/CategoryCommission.js';
import { normalizeCategory } from '../utils/category.js';
import Seller from '../models/Seller.js';
import multer from 'multer';
import cloudinary from '../utils/cloudinary.js';
import User from '../models/User.js';
import SellerEarning from '../models/SellerEarning.js';
import csv from 'csv-parser';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads (memory storage for Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Configure multer for bulk upload files
const bulkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/bulk');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `seller-bulk-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const bulkUpload = multer({
  storage: bulkStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'), false);
    }
  }
});

// Verification routes (no authentication required)
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
    
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    
    // Find current seller by email from request body
    const currentSeller = await Seller.findOne({ email: email });
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
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    
    const currentSeller = await Seller.findOne({ email: email }).select('sellerName email verificationStatus registeredOn verification createdAt');
    if (!currentSeller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }
    res.json({ success: true, data: currentSeller });
  } catch (error) {
    console.error('Error fetching seller verification:', error);
    res.status(500).json({ success: false, message: 'Error fetching verification', error: error.message });
  }
});

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
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'images', maxCount: 10 },
    { name: 'video', maxCount: 1 }
  ]),
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

      // Handle optional product video (limit 5MB)
      if (req.files?.video?.[0]) {
        const videoFile = req.files.video[0];
        try {
          if (videoFile.size && videoFile.size > 5 * 1024 * 1024) {
            return res.status(400).json({ success: false, message: 'Video file exceeds 5MB limit' });
          }
        } catch (e) {
          // size may not always be available; ignore
        }
        const videoResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream({ resource_type: 'video', folder: 'product_videos' }, (err, res) => {
            if (err) reject(err); else resolve(res);
          }).end(videoFile.buffer);
        });
        productData.videoUrl = videoResult.secure_url;
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

// GET /api/seller/orders/recent - Get recent orders for seller dashboard
router.get('/orders/recent', requireApprovedSeller, async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    // Get seller's products
    const sellerProducts = await Product.find({ createdBy: req.user.userId }).select('_id name price');
    const productIds = sellerProducts.map(p => p._id);

    if (productIds.length === 0) {
      return res.json({ 
        success: true, 
        data: [], 
        summary: { total: 0, pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 }
      });
    }

    // Find recent orders containing seller's products
    const orders = await Order.find({ 'items.productId': { $in: productIds } })
      .populate('items.productId', 'name price')
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    // Filter and enhance order data for seller
    const enhancedOrders = orders.map(order => {
      // Filter items to only include seller's products
      const sellerItems = (order.items || []).filter(item => 
        productIds.some(id => String(id) === String(item.productId))
      );

      // Calculate seller's portion of the order
      const sellerTotal = sellerItems.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);

      return {
        _id: order._id,
        orderId: order.orderId,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        // Provide full customer fields for frontend
        customerInfo: {
          name: order.customerName || order.customerInfo?.name || '',
          email: order.customerEmail || order.customerInfo?.email || '',
          phone: order.customerPhone || order.customerInfo?.phone || '',
          address: order.customerAddress || order.customerInfo?.address || '',
          city: order.customerCity || order.customerInfo?.city || '',
          pincode: order.customerPincode || order.customerInfo?.pincode || ''
        },
        sellerItems,
        sellerTotal,
        itemCount: sellerItems.length,
        totalQuantity: sellerItems.reduce((sum, item) => sum + Number(item.quantity), 0)
      };
    });

    // Get order status summary
    const allOrders = await Order.find({ 'items.productId': { $in: productIds } });
    const summary = {
      total: allOrders.length,
      pending: allOrders.filter(o => o.status === 'pending').length,
      processing: allOrders.filter(o => o.status === 'processing').length,
      shipped: allOrders.filter(o => o.status === 'shipped').length,
      delivered: allOrders.filter(o => o.status === 'delivered').length,
      cancelled: allOrders.filter(o => o.status === 'cancelled').length
    };

    res.json({ 
      success: true, 
      data: enhancedOrders,
      summary
    });
  } catch (error) {
    console.error('Error fetching recent seller orders:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching recent orders', 
      error: error.message 
    });
  }
});

// GET /api/seller/earnings - Earnings summary and aggregates for current seller
router.get('/earnings', requireApprovedSeller, async (req, res) => {
  try {
    const { range = 'month', months = 12, weeks = 8, years = 3 } = req.query;
    // Find products created by current seller
    const sellerProducts = await Product.find({ createdBy: req.user.userId }).select('_id price');
    const productIds = sellerProducts.map(p => p._id);

    if (productIds.length === 0) {
      return res.json({
        success: true,
        data: {
          totalEarned: 0,
          totalUpcoming: 0,
          totalCancelled: 0,
          ordersCount: 0,
          breakdown: []
        }
      });
    }

    const orders = await Order.find({ 'items.productId': { $in: productIds } }).sort({ createdAt: -1 });

    let totalEarned = 0; // delivered
    let totalUpcoming = 0; // pending + processing + shipped
    let totalCancelled = 0; // cancelled
    let ordersCount = 0;

    // Seller net payout per item: use stored sellerPayoutAmount when available
    const sumItem = (item) => {
      const priceTotal = Number(item.price || 0) * Number(item.quantity || 0);
      const payout = Number(item.sellerPayoutAmount || 0);
      if (payout && payout > 0) return payout;
      const pct = Number(item.commissionPercent || 2);
      return priceTotal - ((priceTotal * pct) / 100);
    };

    // helper: get seller share from order items that match productIds
    const sellerAmountFromOrder = (order) => {
      return (order.items || []).filter(it => it.productId && productIds.some(id => String(id) === String(it.productId)))
        .reduce((acc, it) => acc + sumItem(it), 0);
    };

    orders.forEach(order => {
      const amt = sellerAmountFromOrder(order);
      if (amt <= 0) return;
      ordersCount += 1;
      const st = String(order.status || '').toLowerCase();
      if (st === 'delivered') totalEarned += amt;
      else if (st === 'cancelled') totalCancelled += amt;
      else totalUpcoming += amt; // pending/processing/shipped
    });

    // Build breakdown by selected range
    const now = new Date();
    const breakdown = [];

    const pushBucket = (label, from, to) => {
      // sum per bucket
      let earned = 0, upcoming = 0, cancelled = 0, count = 0;
      for (const order of orders) {
        const d = new Date(order.createdAt || order.paymentDate || order.updatedAt || order.createdAt);
        if (d >= from && d < to) {
          const amt = sellerAmountFromOrder(order);
          if (amt <= 0) continue;
          count += 1;
          const st = String(order.status || '').toLowerCase();
          if (st === 'delivered') earned += amt;
          else if (st === 'cancelled') cancelled += amt;
          else upcoming += amt;
        }
      }
      breakdown.push({ label, earned, upcoming, cancelled, count, from, to });
    };

    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const startOfWeek = (d) => {
      const day = d.getDay(); // 0 Sun
      const diff = (day + 6) % 7; // start Monday
      const s = new Date(d);
      s.setDate(d.getDate() - diff);
      return startOfDay(s);
    };
    const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
    const startOfYear = (d) => new Date(d.getFullYear(), 0, 1);

    if (String(range).toLowerCase() === 'week') {
      let end = addDays(startOfWeek(now), 7);
      for (let i = 0; i < Number(weeks); i++) {
        const start = addDays(end, -7);
        const label = `${start.toLocaleDateString()} - ${new Date(end.getTime()-1).toLocaleDateString()}`;
        pushBucket(label, start, end);
        end = start;
      }
    } else if (String(range).toLowerCase() === 'year') {
      let y = now.getFullYear();
      for (let i = 0; i < Number(years); i++) {
        const start = new Date(y, 0, 1);
        const end = new Date(y + 1, 0, 1);
        pushBucket(String(y), start, end);
        y -= 1;
      }
    } else {
      // month
      let m = now.getMonth();
      let y = now.getFullYear();
      for (let i = 0; i < Number(months); i++) {
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 1);
        const label = `${start.toLocaleString('default', { month: 'short' })} ${y}`;
        pushBucket(label, start, end);
        m -= 1;
        if (m < 0) { m = 11; y -= 1; }
      }
    }

    // Persist snapshot to SellerEarning collection (non-blocking)
    try {
      await SellerEarning.create({
        seller: req.user.sellerId || null,
        range: String(range).toLowerCase(),
        params: { weeks: Number(weeks), months: Number(months), years: Number(years) },
        totals: {
          earned: totalEarned,
          upcoming: totalUpcoming,
          cancelled: totalCancelled,
          ordersCount
        },
        breakdown
      });
    } catch (persistErr) {
      // Do not fail the API if persistence fails
      console.warn('SellerEarning persist error:', persistErr?.message || persistErr);
    }

    res.json({
      success: true,
      data: {
        totalEarned,
        totalUpcoming,
        totalCancelled,
        ordersCount,
        breakdown
      }
    });
  } catch (error) {
    console.error('Error computing seller earnings:', error);
    res.status(500).json({ success: false, message: 'Error computing earnings', error: error.message });
  }
});

// GET /api/seller/category-commission/:category - public to sellers: get commission for category
router.get('/category-commission/:category', async (req, res) => {
  try {
    const category = String(req.params.category || '').toLowerCase();
    const valid = ['l-mart', 'localmarket', 'printing', 'oldee', 'news'];
    if (!valid.includes(category)) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }
    const row = await CategoryCommission.findOne({ category }).select('commissionPercent');
    const commissionPercent = row ? Number(row.commissionPercent || 2) : 2;
    res.json({ success: true, data: { category, commissionPercent } });
  } catch (error) {
    console.error('Error getting category commission:', error);
    res.status(500).json({ success: false, message: 'Error fetching commission', error: error.message });
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

    // Validate status values: allow delivered as final completion state
    const allowedStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
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

// Helper functions for bulk upload
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
};

const parseExcel = (filePath) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
};

const validateProductData = (product, index) => {
  const errors = [];
  const requiredFields = ['name', 'price', 'category', 'subcategory'];
  
  requiredFields.forEach(field => {
    if (!product[field] || product[field].toString().trim() === '') {
      errors.push(`Row ${index + 1}: ${field} is required`);
    }
  });

  if (product.price && isNaN(parseFloat(product.price))) {
    errors.push(`Row ${index + 1}: Price must be a valid number`);
  }

  const validCategories = ['l-mart', 'localmarket', 'printing', 'oldee', 'news'];
  if (product.category && !validCategories.includes(product.category.toLowerCase())) {
    errors.push(`Row ${index + 1}: Category must be one of: ${validCategories.join(', ')}`);
  }

  return errors;
};

const processProductData = async (rawData, sellerId) => {
  const processedProducts = [];
  const errors = [];

  for (let i = 0; i < rawData.length; i++) {
    const product = rawData[i];
    
    try {
      const validationErrors = validateProductData(product, i);
      if (validationErrors.length > 0) {
        errors.push(...validationErrors);
        continue;
      }

      const processedProduct = {
        name: product.name.trim(),
        description: product.description || '',
        price: parseFloat(product.price),
        category: normalizeCategory(product.category),
        subcategory: product.subcategory.trim(),
        stock: parseInt(product.stock) || 0,
        isActive: product.isActive !== undefined ? product.isActive === 'true' || product.isActive === true : true,
        tags: product.tags ? product.tags.split(',').map(tag => tag.trim()) : [],
        specifications: product.specifications ? JSON.parse(product.specifications) : {},
        variant: product.variant || 'Standard',
        images: product.images ? product.images.split(',').map(img => img.trim()) : [],
        createdBy: sellerId,
        createdAt: new Date()
      };

      processedProducts.push(processedProduct);
    } catch (error) {
      errors.push(`Row ${i + 1}: Error processing product - ${error.message}`);
    }
  }

  return { processedProducts, errors };
};

// POST /api/seller/bulk-upload - Bulk upload products for sellers
router.post('/bulk-upload', requireApprovedSeller, bulkUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    
    let rawData;
    
    if (fileExt === '.csv') {
      rawData = await parseCSV(filePath);
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      rawData = parseExcel(filePath);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported file format'
      });
    }

    if (!rawData || rawData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No data found in file'
      });
    }

    const { processedProducts, errors } = await processProductData(rawData, req.user.userId);

    let insertedCount = 0;
    const insertErrors = [];

    if (processedProducts.length > 0) {
      try {
        const result = await Product.insertMany(processedProducts, { ordered: false });
        insertedCount = result.length;
      } catch (error) {
        if (error.writeErrors) {
          error.writeErrors.forEach(writeError => {
            insertErrors.push(`Product ${writeError.index + 1}: ${writeError.errmsg}`);
          });
          insertedCount = processedProducts.length - error.writeErrors.length;
        } else {
          insertErrors.push(`Bulk insert error: ${error.message}`);
        }
      }
    }

    fs.unlinkSync(filePath);

    const allErrors = [...errors, ...insertErrors];
    
    res.json({
      success: true,
      message: `Bulk upload completed. ${insertedCount} products inserted successfully.`,
      successCount: insertedCount,
      errorCount: allErrors.length,
      totalProcessed: processedProducts.length,
      total: rawData.length,
      successful: insertedCount,
      failed: allErrors.length,
      errors: allErrors.slice(0, 50), // Limit errors to first 50
      data: {
        totalRows: rawData.length,
        processedRows: processedProducts.length,
        insertedCount: insertedCount,
        errorCount: allErrors.length,
        errors: allErrors.slice(0, 50)
      }
    });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Seller bulk upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Bulk upload failed',
      error: error.message
    });
  }
});

// GET /api/seller/bulk-upload/template - Get bulk upload template for sellers
router.get('/bulk-upload/template', requireApprovedSeller, (req, res) => {
  try {
    // Header order matches desired CSV/Excel format
    const templateData = [
      {
        name: 'Product1',
        description: 'Sample description 1',
        price: 110,
        offerPrice: 100,
        originalPrice: '',
        discount: 0,
        category: 'localmarket',
        subcategory: 'general',
        colorVarients: 'green;red;gray',
        sizeVarients: 'm;l;xl',
        image: 'https://nobero.com/cdn/shop/files/og.jpg?v=1744007258',
        images: 'https://teetall.pk/cdn/shop/products/354f50347f49b27c850e735e7f570b10-_1.webp?crop=center&height=1733&v=1694555029&width=1300;https://media.istockphoto.com/id/471188329/photo/plain-red-tee-shirt-isolated-on-white-background.jpg?s=612x612&w=0&k=20&c=h1n990JR40ZFbPRDpxKppFziIWrisGcE_d9OqkLVAC4=',
        inStock: true,
        stockQuantity: 101,
        isActive: true
      },
      {
        name: 'Product2',
        description: 'Sample description 2',
        price: 120,
        offerPrice: 110,
        originalPrice: '',
        discount: 0,
        category: 'printing',
        subcategory: 'general',
        colorVarients: 'black;white;blue',
        sizeVarients: 'l;xl',
        image: 'https://images.pexels.com/photos/8532616/pexels-photo-8532616.jpeg?cs=srgb&dl=pexels-anna-nekrashevich-8532616.jpg&fm=jpg',
        images: 'https://i.pinimg.com/564x/c1/1d/16/c11d164de692594acf53c9a855093139.jpg;https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS1I4GPMgj9q7UQMU89T-_1FEVKmxzdS6ikXA&s',
        inStock: true,
        stockQuantity: 102,
        isActive: true
      },
      {
        name: 'Product3',
        description: 'Sample description 3',
        price: 130,
        offerPrice: 120,
        originalPrice: '',
        discount: 0,
        category: 'printing',
        subcategory: 'general',
        colorVarients: 'red;black;blue',
        sizeVarients: 'l;xl',
        image: 'https://img.freepik.com/premium-photo/tshirt-isolated_719385-716.jpg?cs=srgb&dl=pexels-anna-nekrashevich-8532616.jpg&fm=jpg',
        images: 'https://printmytee.in/wp-content/uploads/2021/05/Ruffty-Black-With-Red-Tipping.jpg;https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS1I4GPMgj9q7UQMU89T-_1FEVKmxzdS6ikXA&s',
        inStock: true,
        stockQuantity: 102,
        isActive: true
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=seller_bulk_upload_template.xlsx');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.send(buffer);

  } catch (error) {
    console.error('Template generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate template',
      error: error.message
    });
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