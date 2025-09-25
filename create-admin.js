// Create admin user for testing
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from './Backend/models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const createAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/printo');
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@printo.com' });
    if (existingAdmin) {
      console.log('Admin user already exists');
      console.log('Email: admin@printo.com');
      console.log('Password: admin123');
      process.exit(0);
    }
    
    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = new User({
      name: 'Admin',
      email: 'admin@printo.com',
      password: hashedPassword,
      role: 'admin'
    });
    
    await admin.save();
    console.log('Admin user created successfully');
    console.log('Email: admin@printo.com');
    console.log('Password: admin123');
    
  } catch (error) {
    console.error('Error creating admin:', error);
  } finally {
    await mongoose.disconnect();
  }
};

createAdmin();