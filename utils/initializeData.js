import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Order from '../models/Order.js';

// Initialize default admin user if not exists
export const initializeAdmin = async () => {
  try {
    const adminExists = await User.findOne({ email: 'admin@lmart.in' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('santoshlmart@90', 10);
      const admin = new User({
        name: 'Admin User',
        email: 'admin@lmart.in',
        password: hashedPassword,
        role: 'admin'
      });
      await admin.save();
      console.log('Default admin user created');
    }
  } catch (error) {
    console.error('Error initializing admin:', error);
  }
};

// Initialize sample data
export const initializeSampleData = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount <= 1) { // Only admin exists
      // Create sample customers
      const sampleUsers = [
        {
          name: 'Demo User',
          email: 'user@printo.com',
          password: await bcrypt.hash('user123', 10),
          role: 'customer',
          orderCount: 2,
          totalSpent: 899
        },
        {
          name: 'John Doe',
          email: 'john@example.com',
          password: await bcrypt.hash('password123', 10),
          role: 'customer',
          orderCount: 5,
          totalSpent: 2500
        },
        {
          name: 'Jane Smith',
          email: 'jane@example.com',
          password: await bcrypt.hash('password123', 10),
          role: 'customer',
          orderCount: 3,
          totalSpent: 1800
        },
        {
          name: 'Mike Johnson',
          email: 'mike@example.com',
          password: await bcrypt.hash('password123', 10),
          role: 'customer',
          orderCount: 8,
          totalSpent: 4200
        }
      ];
      
      const createdUsers = await User.insertMany(sampleUsers);
      
      // Create sample orders
      const sampleOrders = [
        {
          customerId: createdUsers[0]._id,
          customerName: 'John Doe',
          orderId: 'ORD-001',
          paymentId: 'PAY-001',
          items: [
            { name: 'Business Cards', quantity: 500, price: 299 },
            { name: 'Brochures', quantity: 100, price: 199 }
          ],
          total: 498,
          status: 'delivered'
        },
        {
          customerId: createdUsers[1]._id,
          customerName: 'Jane Smith',
          orderId: 'ORD-002',
          paymentId: 'PAY-002',
          items: [
            { name: 'Posters', quantity: 10, price: 89 }
          ],
          total: 89,
          status: 'shipped'
        },
        {
          customerId: createdUsers[2]._id,
          customerName: 'Mike Johnson',
          orderId: 'ORD-003',
          paymentId: 'PAY-003',
          items: [
            { name: 'Banners', quantity: 2, price: 599 },
            { name: 'Flyers', quantity: 1000, price: 399 }
          ],
          total: 998,
          status: 'processing'
        },
        {
          customerId: createdUsers[0]._id,
          customerName: 'John Doe',
          orderId: 'ORD-004',
          paymentId: 'PAY-004',
          items: [
            { name: 'Logo Design', quantity: 1, price: 1999 }
          ],
          total: 1999,
          status: 'pending'
        }
      ];
      
      await Order.insertMany(sampleOrders);
      console.log('Sample data initialized');
    }
  } catch (error) {
    console.error('Error initializing sample data:', error);
  }
};