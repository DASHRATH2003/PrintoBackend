import express from 'express';
import { createOrder, getAllOrders, getOrderById, getOrderByPaymentId, updateOrderStatus, cancelOrderByCustomer, getMyOrders } from '../controllers/orderController.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// POST /api/orders - Create new order (public)
router.post('/', createOrder);

// GET /api/orders - Get all orders (public for now, can be restricted later)
router.get('/', getAllOrders);

// GET /api/orders/my - Get orders for authenticated customer
router.get('/my', authenticateToken, getMyOrders);

// Test route to verify routing is working
router.get('/test', (req, res) => {
  console.log('Test route hit!');
  res.json({ message: 'Test route working!' });
});



// GET /api/orders/payment/:paymentId - Get order by payment ID (public for tracking)
router.get('/payment/:paymentId', (req, res, next) => {
  console.log('Route matched: /payment/:paymentId with paymentId:', req.params.paymentId);
  next();
}, getOrderByPaymentId);

// GET /api/orders/:orderId - Get order by ID (public for tracking) - MUST be last
router.get('/:orderId', getOrderById);

// PUT /api/orders/:id/status - Update order status (admin only)
router.put('/:id/status', authenticateToken, requireAdmin, updateOrderStatus);

// PUT /api/orders/:id/cancel - Cancel order by customer (authenticated user)
router.put('/:id/cancel', authenticateToken, cancelOrderByCustomer);

export default router;