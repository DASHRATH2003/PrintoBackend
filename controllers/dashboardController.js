import User from '../models/User.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import AdminEarning from '../models/AdminEarning.js';
import CategoryCommission from '../models/CategoryCommission.js';

// Get dashboard statistics
export const getDashboardStats = async (req, res) => {
  try {
    const totalCustomers = await User.countDocuments({ role: 'customer' });
    
    // Include ALL orders (admin + seller products) in stats
    const totalOrders = await Order.countDocuments();

    const revenueResult = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    const pendingOrders = await Order.countDocuments({ status: 'pending' });

    // Total products across marketplace (admin + sellers)
    const totalProducts = await Product.countDocuments();
    
    res.json({
      totalCustomers,
      totalOrders,
      totalRevenue,
      pendingOrders,
      totalProducts
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all customers for admin dashboard
export const getCustomers = async (req, res) => {
  try {
    const customers = await User.find({ role: 'customer' })
      .select('name email orderCount totalSpent createdAt loginCount lastLogin')
      .sort({ createdAt: -1 });
    
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all orders for admin dashboard
export const getDashboardOrders = async (req, res) => {
  try {
    // Return ALL orders (including those containing seller products)
    // Populate product details to derive seller metadata
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .populate({
        path: 'items.productId',
        select: 'sellerId sellerName createdBy name',
        populate: { path: 'createdBy', select: 'name email role' }
      });

    // Flatten seller info into each item for frontend convenience
    const enriched = await Promise.all(orders.map(async (order) => {
      const o = order.toObject();
      o.items = await Promise.all((o.items || []).map(async (item) => {
        const prod = item.productId || {};
        const createdBy = prod.createdBy || {};
        let sellerId = prod.sellerId || null;

        // Fallback: if sellerId missing but product created by a seller user, map to Seller by email
        if (!sellerId && createdBy && createdBy.email) {
          try {
            const sellerDoc = await Seller.findOne({ email: createdBy.email }).select('_id');
            if (sellerDoc) sellerId = sellerDoc._id;
          } catch (_) {
            // ignore lookup errors
          }
        }

        // Additional legacy fallback: handle products where createdBy stored as Seller._id
        if (!sellerId) {
          try {
            const fullProd = await Product.findById(item.productId).select('createdBy sellerId sellerName');
            if (fullProd) {
              if (fullProd.sellerId) {
                sellerId = fullProd.sellerId;
              } else if (fullProd.createdBy) {
                // Attempt to resolve createdBy as a Seller document
                const sellerById = await Seller.findById(fullProd.createdBy).select('_id sellerName name email');
                if (sellerById) {
                  sellerId = sellerById._id;
                  // Prefer stored sellerName if available below
                  if (!prod.sellerName) {
                    prod.sellerName = sellerById.sellerName || sellerById.name || '';
                  }
                }
              }
            }
          } catch (_) {
            // ignore legacy lookup errors
          }
        }

        let sellerName = prod.sellerName || '';
        if (!sellerName && createdBy && createdBy.name) {
          const role = String(createdBy.role || '').toLowerCase();
          sellerName = role === 'admin' ? 'Admin' : createdBy.name;
        }

        return {
          ...item,
          sellerId: sellerId ? String(sellerId) : null,
          sellerName
        };
      }));
      return o;
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update order status from dashboard
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const order = await Order.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all sellers for admin dashboard
export const getSellers = async (req, res) => {
  try {
    const sellers = await Seller.find()
      .select('name email sellerName sellerHierarchyLevel parentSeller createdAt orderCount totalRevenue loginCount lastLogin verificationStatus registeredOn verification')
      .sort({ createdAt: -1 })
      .populate('parentSeller', 'name email sellerName');

    res.json(sellers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get single seller details for admin dashboard
export const getSellerDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const seller = await Seller.findById(id)
      .select('name email sellerName sellerHierarchyLevel parentSeller createdAt orderCount totalRevenue loginCount lastLogin verificationStatus registeredOn verification')
      .populate('parentSeller', 'name email sellerName');

    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }

    // Include products and orders summary using User mapping
    const user = await User.findOne({ email: seller.email }).select('_id');
    let productsCount = 0;
    let orders = [];
    if (user && user._id) {
      const sellerProducts = await Product.find({ createdBy: user._id }).select('_id');
      const productIds = sellerProducts.map(p => p._id);
      productsCount = sellerProducts.length;
      if (productIds.length > 0) {
        orders = await Order.find({ 'items.productId': { $in: productIds } })
          .select('status total createdAt')
          .limit(5)
          .sort({ createdAt: -1 });
      }
    }

    res.json({ seller, summary: { productsCount, recentOrders: orders } });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Admin: Update seller basic details
export const updateSellerByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      sellerName,
      email,
      sellerHierarchyLevel,
      parentSellerId,
      parentSellerEmail,
      verificationStatus,
      shopName,
      phone
    } = req.body;

    const seller = await Seller.findById(id);
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }

    // Handle email change: ensure uniqueness across Seller and User, and sync User
    const emailChanged = email && String(email).toLowerCase() !== String(seller.email).toLowerCase();
    let linkedUser = null;
    try {
      linkedUser = await User.findOne({ email: seller.email });
    } catch {}

    if (emailChanged) {
      // Check conflicts
      const existingSeller = await Seller.findOne({ email });
      if (existingSeller && String(existingSeller._id) !== String(seller._id)) {
        return res.status(400).json({ success: false, message: 'Email already in use by another seller' });
      }
      const existingUser = await User.findOne({ email });
      if (existingUser && (!linkedUser || String(existingUser._id) !== String(linkedUser._id))) {
        return res.status(400).json({ success: false, message: 'Email already in use by another user' });
      }
    }

    // Apply updates
    if (typeof name !== 'undefined') seller.name = name;
    if (typeof sellerName !== 'undefined') seller.sellerName = sellerName;
    if (typeof sellerHierarchyLevel !== 'undefined') seller.sellerHierarchyLevel = sellerHierarchyLevel;
    if (typeof verificationStatus !== 'undefined') seller.verificationStatus = String(verificationStatus).toLowerCase();

    // Parent seller linkage by ID or email
    if (parentSellerId) {
      seller.parentSeller = parentSellerId;
    } else if (parentSellerEmail) {
      const parent = await Seller.findOne({ email: parentSellerEmail }).select('_id');
      seller.parentSeller = parent ? parent._id : null;
    }

    // Update verification sub-fields
    seller.verification = seller.verification || {};
    if (typeof shopName !== 'undefined') seller.verification.shopName = shopName;
    if (typeof phone !== 'undefined') seller.verification.phone = phone;
    if (typeof sellerName !== 'undefined') seller.verification.sellerName = sellerName;

    // Email last to avoid partial updates on validation failure
    if (emailChanged) {
      seller.email = email;
      if (linkedUser) {
        linkedUser.email = email;
        await linkedUser.save();
      }
    }

    await seller.save();
    const populated = await Seller.findById(seller._id)
      .select('name email sellerName sellerHierarchyLevel parentSeller createdAt orderCount totalRevenue loginCount lastLogin verificationStatus registeredOn verification')
      .populate('parentSeller', 'name email sellerName');

    res.json({ success: true, message: 'Seller updated successfully', data: populated });
  } catch (error) {
    console.error('Error updating seller by admin:', error);
    res.status(500).json({ success: false, message: 'Error updating seller', error: error.message });
  }
};

// Admin earnings summary and breakdown across all orders
export const getAdminEarnings = async (req, res) => {
  try {
    const { range = 'month', months = 12, weeks = 8, years = 3 } = req.query;
    const orders = await Order.find().sort({ createdAt: -1 });

    let totalEarned = 0; // delivered
    let totalUpcoming = 0; // pending + processing + shipped
    let totalCancelled = 0; // cancelled
    let ordersCount = 0;

    // Sum admin commission from items, fallback to 2% if not present
    const sumItem = (item) => {
      const priceTotal = Number(item.price || 0) * Number(item.quantity || 0);
      const commissionAmount = Number(item.commissionAmount || 0);
      if (commissionAmount && commissionAmount > 0) return commissionAmount;
      const pct = Number(item.commissionPercent || 2);
      return (priceTotal * pct) / 100;
    };

    orders.forEach(order => {
      const amt = (order.items || []).reduce((acc, it) => acc + sumItem(it), 0);
      if (amt <= 0) return;
      ordersCount += 1;
      const st = String(order.status || '').toLowerCase();
      if (st === 'delivered') totalEarned += amt;
      else if (st === 'cancelled') totalCancelled += amt;
      else totalUpcoming += amt; // pending/processing/shipped
    });

    const now = new Date();
    const breakdown = [];

    const pushBucket = (label, from, to) => {
      let earned = 0, upcoming = 0, cancelled = 0, count = 0;
      for (const order of orders) {
        const d = new Date(order.createdAt || order.paymentDate || order.updatedAt || order.createdAt);
        if (d >= from && d < to) {
          const amt = (order.items || []).reduce((acc, it) => acc + sumItem(it), 0);
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
      const diff = (day + 6) % 7; // Monday start
      const s = new Date(d);
      s.setDate(d.getDate() - diff);
      return startOfDay(s);
    };

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

    // Persist snapshot to AdminEarning collection (non-blocking)
    try {
      await AdminEarning.create({
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
      console.warn('AdminEarning persist error:', persistErr?.message || persistErr);
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
    console.error('Error computing admin earnings:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Admin: Get all category commissions (with defaults for missing ones)
export const getCategoryCommissions = async (req, res) => {
  try {
    const categories = ['l-mart', 'localmarket', 'printing', 'news'];
    const rows = await CategoryCommission.find({}).select('category commissionPercent');
    const map = new Map(rows.map(r => [String(r.category).toLowerCase(), Number(r.commissionPercent || 2)]));
    const data = categories.map(cat => ({ category: cat, commissionPercent: map.get(cat) ?? 2 }));
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching category commissions:', error);
    res.status(500).json({ success: false, message: 'Error fetching commissions', error: error.message });
  }
};

// Admin: Set commission for a category (upsert)
export const setCategoryCommission = async (req, res) => {
  try {
    const categoryRaw = req.params.category || req.body.category;
    const category = String(categoryRaw || '').toLowerCase();
    const { commissionPercent } = req.body;
    const categories = ['l-mart', 'localmarket', 'printing', 'news'];
    if (!categories.includes(category)) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }
    const value = Number(commissionPercent);
    if (Number.isNaN(value) || value < 0 || value > 100) {
      return res.status(400).json({ success: false, message: 'commissionPercent must be between 0 and 100' });
    }
    const updated = await CategoryCommission.findOneAndUpdate(
      { category },
      { commissionPercent: value, updatedBy: req.user?.userId || null },
      { new: true, upsert: true }
    ).select('category commissionPercent');
    res.json({ success: true, message: 'Commission updated', data: updated });
  } catch (error) {
    console.error('Error setting category commission:', error);
    res.status(500).json({ success: false, message: 'Error updating commission', error: error.message });
  }
};
// Delete all orders (admin-only)
export const deleteAllOrders = async (req, res) => {
  try {
    const result = await Order.deleteMany({});
    res.json({ success: true, message: 'All orders deleted', deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete orders', error: error.message });
  }
};