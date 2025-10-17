import dotenv from 'dotenv';

// Configure dotenv FIRST before importing other modules
dotenv.config();

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import routes
import authRoutes from './routes/authRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import productRoutes from './routes/productRoutes.js';
import subcategoryRoutes from './routes/subcategoryRoutes.js';
import sellerRoutes from './routes/sellerRoutes.js';
import posterRoutes from './routes/posterRoutes.js';
import bannerRoutes from './routes/bannerRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import bulkUploadRoutes from './routes/bulkUploadRoutes.js';

// Import middleware
import { requestLogger } from './middleware/auth.js';

// Import utilities
import { initializeAdmin, initializeSampleData } from './utils/initializeData.js';

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// CORS Configuration - Allow both production and local development
const allowedOrigins = [
  'https://princo.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002', // Current frontend port
  'http://localhost:3003', // Alternate dev port
  'http://localhost:5173', // Vite default port
  'http://localhost:5001', // API when running on alternate port
  process.env.FRONTEND_URL // Dynamic from environment
].filter(Boolean); // Remove any undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Additional CORS handling for preflight requests
app.options('*', cors());
app.use(requestLogger);

// MongoDB Connection with enhanced logging
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ MongoDB connected successfully');
  console.log('📊 Database:', mongoose.connection.name);
  console.log('🔄 Ready to accept connections');
})
.catch((err) => {
  console.error('❌ MongoDB connection error:', err.message);
  console.log('🔗 Connection string:', MONGO_URI);
});

// MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('✅ Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ Mongoose disconnected from MongoDB');
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/products', productRoutes);
app.use('/api/subcategories', subcategoryRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/posters', posterRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/bulk-upload', bulkUploadRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString()
  });
});

// Basic API endpoint
app.get('/api', (req, res) => {
  res.json({ message: 'L-Mart API is running!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🚨 Server error:', err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('⭐ Health check available at: https://printobackend.onrender.com/api/health');
});

// Initialize data after server starts
initializeAdmin()
  .then(() => {
    console.log('✅ Admin initialization completed');
  })
  .catch((error) => {
    console.error('❌ Admin initialization failed:', error);
  });