import express from 'express';
import { getDashboardStats, getCustomers, getDashboardOrders, updateOrderStatus, getSellers, getSellerDetails, updateSellerByAdmin, getAdminEarnings, getCategoryCommissions, setCategoryCommission, deleteAllOrders } from '../controllers/dashboardController.js';
import Seller from '../models/Seller.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// All dashboard routes require authentication and admin access
router.use(authenticateToken, requireAdmin);

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', getDashboardStats);

// GET /api/dashboard/customers - Get all customers
router.get('/customers', getCustomers);

// GET /api/dashboard/orders - Get all orders for admin
router.get('/orders', getDashboardOrders);

// DELETE /api/dashboard/orders/all - Delete all orders
router.delete('/orders/all', deleteAllOrders);

// PUT /api/dashboard/orders/:id/status - Update order status
router.put('/orders/:id/status', updateOrderStatus);

// GET /api/dashboard/sellers - Get all sellers
router.get('/sellers', getSellers);

// GET /api/dashboard/sellers/:id - Get seller details
router.get('/sellers/:id', getSellerDetails);

// GET /api/dashboard/earnings - Admin earnings summary
router.get('/earnings', getAdminEarnings);

// Category commissions
// GET /api/dashboard/commissions - list all category commissions
router.get('/commissions', getCategoryCommissions);
// PUT /api/dashboard/commissions/:category - set commission for category
router.put('/commissions/:category', setCategoryCommission);

// Admin: Review seller verification - approve/reject
router.put('/sellers/:id/verification', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body; // action: 'approve' | 'reject'
    const seller = await Seller.findById(id);
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Seller not found' });
    }
    const normalized = String(action || '').toLowerCase();
    if (!['approve', 'reject'].includes(normalized)) {
      return res.status(400).json({ success: false, message: 'Invalid action. Use approve or reject.' });
    }
    seller.verificationStatus = normalized === 'approve' ? 'approved' : 'rejected';
    seller.verification = {
      ...(seller.verification || {}),
      reviewedAt: new Date(),
      reviewerNote: note || ''
    };
    await seller.save();
    res.json({ success: true, message: `Seller verification ${seller.verificationStatus}.`, data: seller });
  } catch (error) {
    console.error('Error updating seller verification:', error);
    res.status(500).json({ success: false, message: 'Error updating verification', error: error.message });
  }
});

// Admin: Update seller details
router.put('/sellers/:id', async (req, res, next) => {
  try {
    // authenticateToken + requireAdmin already applied at router level
    next();
  } catch (e) {
    next();
  }
}, updateSellerByAdmin);

export default router;