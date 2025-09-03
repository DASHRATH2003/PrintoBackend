import express from 'express';
import {
  createPaymentOrder,
  verifyPayment,
  getPaymentStatus
} from '../controllers/paymentController.js';

const router = express.Router();

// @route   POST /api/payment/create-order
// @desc    Create Razorpay payment order
// @access  Public
router.post('/create-order', createPaymentOrder);

// @route   POST /api/payment/verify
// @desc    Verify Razorpay payment and create order
// @access  Public
router.post('/verify', verifyPayment);

// @route   GET /api/payment/status/:paymentId
// @desc    Get payment status from Razorpay
// @access  Public
router.get('/status/:paymentId', getPaymentStatus);

export default router;