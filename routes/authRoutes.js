import express from 'express';
import { register, login, registerSeller, forgotPassword, resetPassword } from '../controllers/authController.js';

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

export default router;