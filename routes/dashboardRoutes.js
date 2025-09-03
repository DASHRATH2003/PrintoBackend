import express from 'express';
import { getDashboardStats, getCustomers, getDashboardOrders, updateOrderStatus } from '../controllers/dashboardController.js';
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

// PUT /api/dashboard/orders/:id/status - Update order status
router.put('/orders/:id/status', updateOrderStatus);

export default router;