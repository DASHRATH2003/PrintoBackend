import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Seller from '../models/Seller.js';
import crypto from 'crypto';
import { createTransporter } from '../utils/email.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Register new user
export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: 'customer'
    });
    
    await newUser.save();
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Register new seller
export const registerSeller = async (req, res) => {
  try {
    const { name, email, password, sellerName, parentSellerEmail } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new seller user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: 'seller'
    });

    await newUser.save();

    // Determine parent seller for hierarchy (in Seller collection)
    let parentSellerDoc = null;
    if (parentSellerEmail) {
      parentSellerDoc = await Seller.findOne({ email: parentSellerEmail });
    }

    const sellerHierarchyLevel = parentSellerDoc ? (parentSellerDoc.sellerHierarchyLevel || 0) + 1 : 0;

    // Create Seller document in separate collection
    const sellerDoc = new Seller({
      name,
      email,
      password: hashedPassword,
      sellerName: sellerName || name,
      parentSeller: parentSellerDoc ? parentSellerDoc._id : null,
      sellerHierarchyLevel
    });

    await sellerDoc.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Seller registered successfully',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      },
      seller: {
        id: sellerDoc._id,
        name: sellerDoc.name,
        email: sellerDoc.email,
        sellerName: sellerDoc.sellerName,
        parentSeller: sellerDoc.parentSeller,
        sellerHierarchyLevel: sellerDoc.sellerHierarchyLevel
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Login user
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Update login tracking
    user.loginCount = (user.loginCount || 0) + 1;
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // If seller, enforce login rules based on verification status
    let sellerVerificationStatus = undefined;
    if (user.role === 'seller') {
      try {
        const sellerDoc = await Seller.findOne({ email: user.email }).select('verificationStatus');
        sellerVerificationStatus = sellerDoc?.verificationStatus || 'pending';
        const statusLower = String(sellerVerificationStatus).toLowerCase();
        // Block login when seller is not approved (pending or rejected)
        if (statusLower !== 'approved') {
          const msg = statusLower === 'rejected'
            ? 'Seller rejected by admin. Login not allowed.'
            : 'Seller approval pending. You will receive admin approval within 24 hours.';
          return res.status(403).json({ message: msg });
        }
      } catch (e) {
        sellerVerificationStatus = 'pending';
        return res.status(403).json({ message: 'Seller approval pending. You will receive admin approval within 24 hours.' });
      }
    }

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        loginCount: user.loginCount,
        lastLogin: user.lastLogin,
        verificationStatus: sellerVerificationStatus
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Forgot password: generate token and email link
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      // For security, respond success even if email not found
      return res.json({ message: 'If the email exists, a reset link has been sent' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
    user.resetPasswordToken = token;
    user.resetPasswordExpires = expires;
    await user.save();

    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    const transporter = createTransporter();
    if (transporter) {
      try {
        await transporter.verify();
        const info = await transporter.sendMail({
          from: (process.env.SMTP_FROM || 'PrintCo <no-reply@printco.local>').trim(),
          to: email,
          subject: 'Reset your PrintCo password',
          html: `<p>Hello,</p>
                 <p>You requested a password reset. Click the link below to set a new password. This link expires in 30 minutes.</p>
                 <p><a href="${resetUrl}" target="_blank" rel="noopener">Reset Password</a></p>
                 <p>If you did not request this, you can safely ignore this email.</p>`
        });
        console.log('✉️ Reset email sent:', { to: email, messageId: info?.messageId, resetUrl });
      } catch (smtpError) {
        console.error('❌ SMTP send failed:', smtpError?.response || smtpError?.message || smtpError);
      }
    } else {
      console.warn('SMTP not configured; skipped sending reset email. Reset URL:', resetUrl);
    }

    // In development or when SMTP isn't configured, include resetUrl to allow manual testing
    const includeResetUrl = process.env.NODE_ENV !== 'production' || !transporter;
    res.json({ 
      message: 'If the email exists, a reset link has been sent',
      ...(includeResetUrl ? { resetUrl } : {})
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Reset password: validate token, set new password
export const resetPassword = async (req, res) => {
  try {
    const { email, token, password } = req.body;
    if (!email || !token || !password) {
      return res.status(400).json({ message: 'Email, token, and new password are required' });
    }
    const user = await User.findOne({ email, resetPasswordToken: token });
    if (!user) {
      return res.status(400).json({ message: 'Invalid reset token' });
    }
    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      return res.status(400).json({ message: 'Reset token has expired' });
    }
    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();
    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};