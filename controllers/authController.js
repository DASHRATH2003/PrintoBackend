import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Seller from '../models/Seller.js';

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