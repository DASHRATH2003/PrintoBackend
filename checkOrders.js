import mongoose from 'mongoose';
import Order from './models/Order.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkOrders() {
  try {
    // Connect to MongoDB using the same URI as the server
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const orders = await Order.find().limit(5);
    console.log(`Found ${orders.length} orders`);
    
    orders.forEach((order, i) => {
      console.log(`\nOrder ${i+1}:`);
      console.log('Customer Name:', order.customerName);
      console.log('Customer Address:', order.customerAddress || 'NOT SET');
      console.log('Customer City:', order.customerCity || 'NOT SET');
      console.log('Customer Pincode:', order.customerPincode || 'NOT SET');
      console.log('Order ID:', order.orderId);
      console.log('Created At:', order.createdAt);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkOrders();