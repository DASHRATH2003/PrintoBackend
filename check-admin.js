// Check admin user
import mongoose from 'mongoose';
import User from './Backend/models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const checkAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/printo');
    
    const admin = await User.findOne({ email: 'admin@printo.com' });
    if (admin) {
      console.log('Admin found:');
      console.log('Email:', admin.email);
      console.log('Name:', admin.name);
      console.log('Role:', admin.role);
    } else {
      console.log('Admin not found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

checkAdmin();