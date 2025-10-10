import User from '../models/User.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';

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
    const enriched = orders.map(order => {
      const o = order.toObject();
      o.items = (o.items || []).map(item => {
        const prod = item.productId || {};
        const createdBy = prod.createdBy || {};
        const sellerId = prod.sellerId || null;
        let sellerName = prod.sellerName || '';
        if (!sellerName && createdBy && createdBy.name) {
          // If product created by admin, mark clearly; else use user name
          const role = String(createdBy.role || '').toLowerCase();
          sellerName = role === 'admin' ? 'Admin' : createdBy.name;
        }
        return {
          ...item,
          sellerId: sellerId ? String(sellerId) : null,
          sellerName
        };
      });
      return o;
    });

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