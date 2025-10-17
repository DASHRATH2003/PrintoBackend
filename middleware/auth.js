import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to authenticate JWT token
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Middleware for admin access
export const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Middleware for seller access
export const requireSeller = (req, res, next) => {
  if (!req.user || req.user.role !== 'seller') {
    return res.status(403).json({ message: 'Seller access required' });
  }
  next();
};

// Middleware to ensure seller is approved by admin before accessing seller features
import Seller from '../models/Seller.js';
export const requireApprovedSeller = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'seller') {
      return res.status(403).json({ message: 'Seller access required' });
    }
    const seller = await Seller.findOne({ email: req.user.email }).select('verificationStatus');
    if (!seller) {
      return res.status(404).json({ message: 'Seller profile not found' });
    }
    if (String(seller.verificationStatus).toLowerCase() !== 'approved') {
      return res.status(403).json({ message: 'Seller not approved by admin yet' });
    }
    next();
  } catch (err) {
    console.error('Error in requireApprovedSeller:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Request logging middleware
export const requestLogger = (req, res, next) => {
  console.log('\n🌐🌐🌐 REQUEST RECEIVED 🌐🌐🌐');
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('🌐🌐🌐 END REQUEST LOG 🌐🌐🌐\n');
  next();
};