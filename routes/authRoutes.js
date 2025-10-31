import express from 'express';
import { register, login, registerSeller, forgotPassword, resetPassword, smtpStatus } from '../controllers/authController.js';

const router = express.Router();

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/register-seller
router.post('/register-seller', registerSeller);

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/forgot-password
router.post('/forgot-password', forgotPassword);

// POST /api/auth/reset-password
router.post('/reset-password', resetPassword);

// GET /api/auth/smtp-status (diagnostic)
router.get('/smtp-status', smtpStatus);

export default router;