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