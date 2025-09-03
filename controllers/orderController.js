import Order from '../models/Order.js';

// Create new order
export const createOrder = async (req, res) => {
  try {
    console.log('\n🔥🔥🔥 CREATE ORDER FUNCTION CALLED 🔥🔥🔥');
    console.log('Request method:', req.method);
    console.log('Request URL:', req.url);
    console.log('Request headers:', req.headers);
    console.log('Request body (raw):', JSON.stringify(req.body, null, 2));
    
    const { orderId, paymentId, total, items, customerName, customerEmail, customerPhone, customerAddress, customerCity, customerPincode } = req.body;
    
    console.log('🔍 Extracted fields detailed:', {
      orderId: { value: orderId, type: typeof orderId, exists: !!orderId },
      paymentId: { value: paymentId, type: typeof paymentId, exists: !!paymentId },
      total: { value: total, type: typeof total, exists: !!total },
      items: { value: items, type: typeof items, exists: !!items, length: items?.length },
      customerName: { value: customerName, type: typeof customerName, exists: !!customerName },
      customerEmail: { value: customerEmail, type: typeof customerEmail, exists: !!customerEmail },
      customerPhone: { value: customerPhone, type: typeof customerPhone, exists: !!customerPhone },
      customerAddress: { value: customerAddress, type: typeof customerAddress, exists: !!customerAddress },
      customerCity: { value: customerCity, type: typeof customerCity, exists: !!customerCity },
      customerPincode: { value: customerPincode, type: typeof customerPincode, exists: !!customerPincode }
    });
    
    // Validate required fields
    if (!orderId || !paymentId || !total || !items || !customerName) {
      console.log('Validation failed - missing fields:', {
        orderId: !!orderId,
        paymentId: !!paymentId,
        total: !!total,
        items: !!items,
        customerName: !!customerName
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Only prevent obvious dummy/fake data from being saved
    // Allow all real payments including Razorpay test payments to be saved
   const isTestData = (
  // Block only exact dummy values - allow test payments
  orderId.toLowerCase() === 'dummy_order' ||
  orderId.toLowerCase() === 'test_order' ||
  paymentId.toLowerCase() === 'dummy_payment' ||
  paymentId.toLowerCase() === 'test_payment'
  // Removed customerName check to allow test users
);
    
    if (isTestData) {
      console.log('Test data detected - not saving to database:', {
        customerName,
        customerEmail,
        orderId,
        paymentId
      });
      return res.status(400).json({ 
        message: 'Test data not allowed. Only real payment data will be saved.',
        error: 'Test data validation failed'
      });
    }
    
    // Create new order
    const newOrder = new Order({
      customerId: null, // For guest orders
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      customerCity,
      customerPincode,
      items: items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
      })),
      total: total,
      status: 'processing',
      paymentId,
      orderId,
      paymentDate: new Date()
    });
    
    const savedOrder = await newOrder.save();
    
    console.log('✅ Order saved successfully');
    
    res.status(201).json({
      message: 'Order created successfully',
      order: savedOrder
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get all orders
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get order by order ID
export const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get order by payment ID
export const getOrderByPaymentId = async (req, res) => {
  try {
    console.log('getOrderByPaymentId called with paymentId:', req.params.paymentId);
    const { paymentId } = req.params;
    const order = await Order.findOne({ paymentId });
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found for this payment ID' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error fetching order by payment ID:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};



// Update order status
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const order = await Order.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    console.log('✅ Order status updated successfully');
    
    res.json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};