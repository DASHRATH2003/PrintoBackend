import mongoose from 'mongoose';
import Product from './models/Product.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkProducts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/printco');
    
    const totalProducts = await Product.countDocuments({});
    const activeProducts = await Product.countDocuments({ isActive: true });
    const allProducts = await Product.find({}).select('name category isActive');
    
    console.log('Total Products:', totalProducts);
    console.log('Active Products:', activeProducts);
    console.log('\nAll Products:');
    allProducts.forEach(product => {
      console.log(`- ${product.name} (${product.category}) - Active: ${product.isActive}`);
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error checking products:', error.message);
    process.exit(1);
  }
}

checkProducts();