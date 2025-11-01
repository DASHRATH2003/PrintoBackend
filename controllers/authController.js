import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Seller from '../models/Seller.js';
import Notification from '../models/Notification.js';
import crypto from 'crypto';
import { createTransporter, sendNewSellerNotificationToAdmin } from '../utils/email.js';
import { sendEmailWithRetryGeneric } from '../utils/email.js';

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
    console.log('🔍 SELLER REGISTRATION START:', req.body);
    const { name, email, password, sellerName, parentSellerEmail } = req.body;

    // Check if seller already exists
    const existingSeller = await Seller.findOne({ email });
    if (existingSeller) {
      console.log('❌ Seller already exists:', email);
      return res.status(400).json({ message: 'Seller already exists' });
    }

    // Also check if email exists in User table to avoid conflicts
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('❌ Email already exists in User table:', email);
      return res.status(400).json({ message: 'Email already exists' });
    }

    console.log('✅ Email is unique, proceeding with seller creation');

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Determine parent seller for hierarchy (in Seller collection)
    let parentSellerDoc = null;
    if (parentSellerEmail) {
      parentSellerDoc = await Seller.findOne({ email: parentSellerEmail });
    }

    const sellerHierarchyLevel = parentSellerDoc ? (parentSellerDoc.sellerHierarchyLevel || 0) + 1 : 0;

    console.log('🔧 Creating Seller document ONLY (NOT User)');
    // Create Seller document - only in Seller collection
    const sellerDoc = new Seller({
      name,
      email,
      password: hashedPassword,
      sellerName: sellerName || name,
      parentSeller: parentSellerDoc ? parentSellerDoc._id : null,
      sellerHierarchyLevel
    });

    console.log('💾 Saving seller to Seller collection...');
    await sellerDoc.save();
    console.log('✅ Seller saved successfully:', sellerDoc._id);

    // Send admin notification about new seller registration
    try {
      await sendNewSellerNotificationToAdmin({
        name: sellerDoc.name,
        email: sellerDoc.email,
        sellerName: sellerDoc.sellerName,
        parentSellerEmail: parentSellerEmail
      });
    } catch (emailError) {
      console.error('Failed to send admin notification:', emailError);
      // Don't fail the registration if email fails
    }

    // Create in-app notification for admin
    try {
      await Notification.create({
        title: 'New Seller Registration',
        message: `New seller "${sellerDoc.sellerName || sellerDoc.name}" has registered and requires verification.`,
        type: 'seller',
        priority: 'high',
        recipientType: 'admin',
        relatedEntity: {
          entityType: 'seller',
          entityId: sellerDoc._id
        },
        actionUrl: '/admin/sellers',
        metadata: {
          sellerName: sellerDoc.sellerName,
          sellerEmail: sellerDoc.email,
          registrationDate: new Date().toISOString()
        }
      });
      console.log('✅ In-app notification created for new seller:', sellerDoc.email);
    } catch (notificationError) {
      console.error('Failed to create in-app notification:', notificationError);
      // Don't fail the registration if notification fails
    }

    console.log('📤 Sending response - NO AUTOMATIC LOGIN');
    res.status(201).json({
      message: 'Seller registered successfully. Please login to continue.',
      seller: {
        id: sellerDoc._id,
        name: sellerDoc.name,
        email: sellerDoc.email,
        sellerName: sellerDoc.sellerName,
        parentSeller: sellerDoc.parentSeller,
        sellerHierarchyLevel: sellerDoc.sellerHierarchyLevel
      }
    });
    console.log('✅ SELLER REGISTRATION COMPLETED - Only Seller table should have entry');
  } catch (error) {
    console.error('❌ SELLER REGISTRATION ERROR:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Login user
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // First check if this is a seller login
    const seller = await Seller.findOne({ email });
    if (seller) {
      // This is a seller login - authenticate from Seller table
      const isValidPassword = await bcrypt.compare(password, seller.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }
      
      // Update login tracking for seller
      seller.loginCount = (seller.loginCount || 0) + 1;
      seller.lastLogin = new Date();
      await seller.save();

      // Check seller verification status
      const statusLower = String(seller.verificationStatus).toLowerCase();
      if (statusLower !== 'approved') {
        const msg = statusLower === 'rejected'
          ? 'Seller rejected by admin. Login not allowed.'
          : 'Seller approval pending. You will receive admin approval within 24 hours.';
        return res.status(403).json({ message: msg });
      }

      // Generate JWT token for seller
      const token = jwt.sign(
        { userId: seller._id, email: seller.email, role: 'seller' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.json({
        message: 'Login successful',
        token,
        user: {
          id: seller._id,
          name: seller.name,
          email: seller.email,
          role: 'seller',
          loginCount: seller.loginCount,
          lastLogin: seller.lastLogin,
          verificationStatus: seller.verificationStatus
        }
      });
    }
    
    // If not a seller, check User table for regular users
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

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        loginCount: user.loginCount,
        lastLogin: user.lastLogin
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

    // First: try to find seller by email
    let accountType = null;
    let accountDoc = await Seller.findOne({ email });
    if (accountDoc) {
      accountType = 'seller';
    } else {
      // Fallback: find regular user
      accountDoc = await User.findOne({ email });
      if (accountDoc) accountType = 'user';
    }

    if (!accountDoc) {
      // For security, respond success even if email not found
      return res.json({ message: 'If the email exists, a reset link has been sent' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
    accountDoc.resetPasswordToken = token;
    accountDoc.resetPasswordExpires = expires;
    await accountDoc.save();

    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    const fromAddress = (process.env.SENDGRID_FROM || process.env.SMTP_FROM || (process.env.SMTP_USER ? `"L-Mart" <${process.env.SMTP_USER}>` : 'L-Mart <no-reply@example.com>')).trim();
    const html = `<p>Hello,</p>
                  <p>You requested a password reset for your ${accountType} account. Click the link below to set a new password. This link expires in 30 minutes.</p>
                  <p><a href="${resetUrl}" target="_blank" rel="noopener">Reset Password</a></p>
                  <p>If you did not request this, you can safely ignore this email.</p>`;

    const sendRes = await sendEmailWithRetryGeneric({
      from: fromAddress,
      to: email,
      subject: 'Reset your L-Mart password',
      html,
    });
    if (sendRes.sent) {
      console.log('✉️ Reset email sent:', { to: email, messageId: sendRes?.messageId, resetUrl, accountType });
    } else {
      console.warn('⚠️ Reset email not sent:', sendRes?.error || 'unknown');
    }

    // In development or when SMTP isn't configured, include resetUrl to allow manual testing
    const includeResetUrl = process.env.NODE_ENV !== 'production';
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

    // Try seller first to mirror login logic
    let accountType = 'seller';
    let accountDoc = await Seller.findOne({ email, resetPasswordToken: token });
    if (!accountDoc) {
      // Fallback to regular user
      accountType = 'user';
      accountDoc = await User.findOne({ email, resetPasswordToken: token });
    }

    if (!accountDoc) {
      return res.status(400).json({ message: 'Invalid reset token' });
    }
    if (!accountDoc.resetPasswordExpires || accountDoc.resetPasswordExpires < new Date()) {
      return res.status(400).json({ message: 'Reset token has expired' });
    }

    const hashed = await bcrypt.hash(password, 10);
    accountDoc.password = hashed;
    accountDoc.resetPasswordToken = null;
    accountDoc.resetPasswordExpires = null;
    await accountDoc.save();
    res.json({ message: 'Password has been reset successfully', accountType });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// SMTP status: verify transporter configuration in runtime (diagnostic)
export const smtpStatus = async (req, res) => {
  try {
    const provider = process.env.SENDGRID_API_KEY ? 'sendgrid' : (process.env.SMTP_HOST ? 'smtp' : 'none');
    const transporter = createTransporter();
    if (provider === 'none') {
      return res.json({ configured: false, provider });
    }
    let verifyOk = false;
    let verifyError = null;
    try {
      if (provider === 'smtp' && transporter) {
        await transporter.verify();
        verifyOk = true;
      } else if (provider === 'sendgrid') {
        verifyOk = true; // SendGrid does not support SMTP verify; assume key presence.
      }
    } catch (err) {
      verifyOk = false;
      verifyError = err?.message || String(err);
    }

    res.json({
      configured: true,
      provider,
      verifyOk,
      verifyError,
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true' || Number(process.env.SMTP_PORT) === 465,
      from: (process.env.SENDGRID_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '').toString()
    });
  } catch (error) {
    res.status(500).json({ message: 'smtp status error', error: error?.message || String(error) });
  }
};