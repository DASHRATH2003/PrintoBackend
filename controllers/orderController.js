import Order from '../models/Order.js';
import Product from '../models/Product.js';
import CategoryCommission from '../models/CategoryCommission.js';
import Notification from '../models/Notification.js';
import Seller from '../models/Seller.js';
import { sendNewOrderNotificationToAdmin, sendOrderStatusUpdateToCustomer } from '../utils/email.js';

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
    // Idempotency guard: if an order already exists with same paymentId or orderId, return it
    try {
      if (paymentId || orderId) {
        const existingOrder = await Order.findOne({
          $or: [
            paymentId ? { paymentId } : null,
            orderId ? { orderId } : null
          ].filter(Boolean)
        });
        if (existingOrder) {
          console.log('✅ Idempotency: existing order found, skipping duplicate create');
          return res.status(200).json({
            message: 'Order already exists',
            order: existingOrder
          });
        }
      }
    } catch (checkErr) {
      console.warn('⚠️ Idempotency check failed, continuing create:', checkErr?.message);
    }
    
    // Pre-stock validation: ensure requested quantities do not exceed available stock
    try {
      const requestedByProduct = new Map();
      for (const it of (items || [])) {
        const pid = it.productId || it._id || it.id;
        const qty = Number(it.quantity || 0);
        if (!pid || qty <= 0) continue;
        requestedByProduct.set(pid, (requestedByProduct.get(pid) || 0) + qty);
      }

      const insuff = [];
      for (const [pid, reqQty] of requestedByProduct.entries()) {
        const prod = await Product.findById(pid).select('name stockQuantity inStock');
        if (!prod) continue;
        const available = Number(prod.stockQuantity || 0);
        if (reqQty > available) {
          insuff.push({ productId: String(prod._id), name: prod.name, requested: reqQty, available });
        }
      }

      if (insuff.length > 0) {
        return res.status(400).json({
          message: 'Stock insufficient for some items',
          details: insuff,
        });
      }
    } catch (preCheckErr) {
      console.warn('⚠️ Stock pre-check failed, continuing:', preCheckErr?.message || preCheckErr);
    }

    // Fetch commission map once
    const commissionRows = await CategoryCommission.find({}).select('category commissionPercent');
    const commissionMap = new Map(commissionRows.map(r => [String(r.category).toLowerCase(), Number(r.commissionPercent || 2)]));

    // Helper to compute commission for an item
    const computeItemWithCommission = async (item) => {
      const qty = Number(item.quantity);
      const price = Number(item.price);
      let category = null;
      if (item.productId) {
        try {
          const prod = await Product.findById(item.productId).select('category');
          category = String(prod?.category || '').toLowerCase() || null;
        } catch (e) {
          category = null;
        }
      }
      const pct = category ? (commissionMap.get(category) ?? 2) : 2;
      const commissionAmount = (price * qty * pct) / 100;
      const sellerPayoutAmount = (price * qty) - commissionAmount;
      return {
        name: item.name,
        quantity: qty,
        price: price,
        productId: item.productId || item._id || item.id || null,
        size: (item.size ?? item.selectedSize) ?? null,
        color: (item.color ?? item.selectedColor) ?? null,
        image: item.image || null,
        commissionPercent: pct,
        commissionAmount,
        sellerPayoutAmount
      };
    };

    const itemsWithCommission = await Promise.all((items || []).map(it => computeItemWithCommission(it)));

    // Create new order
    const newOrder = new Order({
      customerId: null, // For guest orders
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      customerCity,
      customerPincode,
      items: itemsWithCommission,
      total: total,
      status: 'processing',
      paymentId,
      orderId,
      paymentDate: new Date()
    });
    
    const savedOrder = await newOrder.save();
    
    console.log('✅ Order saved successfully');

    // Decrease product stock for each ordered item
    try {
      const stockUpdates = [];
      for (const item of (savedOrder.items || [])) {
        const pid = item.productId;
        const qty = Number(item.quantity || 0);
        if (!pid || qty <= 0) continue;

        const prod = await Product.findById(pid).select('stockQuantity inStock');
        if (!prod) continue;

        const before = Number(prod.stockQuantity || 0);
        const after = Math.max(0, before - qty);
        prod.stockQuantity = after;
        prod.inStock = after > 0;
        await prod.save();
        stockUpdates.push({ productId: String(prod._id), before, ordered: qty, after });
      }
      if (stockUpdates.length > 0) {
        console.log('✅ Stock updated for ordered products:', stockUpdates);
      } else {
        console.log('ℹ️ No stock updates performed (no productId or qty)');
      }
    } catch (stockErr) {
      console.error('❌ Failed to update product stock quantities:', stockErr?.message || stockErr);
      // Do not fail order creation on stock update error
    }

    // Create admin notification for new order
    try {
      const notification = new Notification({
        title: 'New Order Received',
        message: `New order #${savedOrder.orderId} received from ${savedOrder.customerName} for ${savedOrder.total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`,
        type: 'order',
        priority: 'high',
        isRead: false,
        metadata: {
          orderId: savedOrder.orderId,
          customerName: savedOrder.customerName,
          customerEmail: savedOrder.customerEmail,
          customerPhone: savedOrder.customerPhone,
          orderTotal: savedOrder.total,
          itemCount: savedOrder.items.length,
          orderDate: savedOrder.paymentDate
        },
        actionUrl: `/admin/orders/${savedOrder._id}`
      });

      await notification.save();
      console.log('✅ Admin notification created for new order');

      // Send email notification to admin
      const emailResult = await sendNewOrderNotificationToAdmin(savedOrder);
      if (emailResult.sent) {
        console.log('✅ Order notification email sent to admin');
      } else {
        console.log('⚠️ Failed to send order notification email:', emailResult.error);
      }
    } catch (notificationError) {
      console.error('❌ Failed to create order notification:', notificationError);
      // Don't fail the order creation if notification fails
    }

    // Create seller notifications for products in the order
    try {
      const sellerNotifications = new Map();
      
      for (const item of savedOrder.items) {
        if (item.productId) {
          try {
            const product = await Product.findById(item.productId).populate('createdBy');
            if (product && product.createdBy) {
              const seller = await Seller.findOne({ email: product.createdBy.email });
              if (seller) {
                const sellerId = seller._id.toString();
                
                if (!sellerNotifications.has(sellerId)) {
                  sellerNotifications.set(sellerId, {
                    seller: seller,
                    items: [],
                    totalAmount: 0
                  });
                }
                
                const sellerData = sellerNotifications.get(sellerId);
                sellerData.items.push({
                  name: item.name,
                  quantity: item.quantity,
                  price: item.price,
                  sellerPayoutAmount: item.sellerPayoutAmount || 0
                });
                sellerData.totalAmount += item.sellerPayoutAmount || 0;
              }
            }
          } catch (productError) {
            console.error('Error fetching product for seller notification:', productError);
          }
        }
      }

      // Create notifications for each seller
      for (const [sellerId, sellerData] of sellerNotifications) {
        try {
          const sellerNotification = new Notification({
            title: 'New Order for Your Products',
            message: `You have received a new order #${savedOrder.orderId} with ${sellerData.items.length} item(s) for ${sellerData.totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`,
            type: 'order',
            priority: 'high',
            recipientType: 'seller',
            recipientId: sellerId,
            recipientModel: 'Seller',
            isRead: false,
            relatedEntity: {
              entityType: 'order',
              entityId: savedOrder._id
            },
            metadata: {
              orderId: savedOrder.orderId,
              customerName: savedOrder.customerName,
              sellerItems: sellerData.items,
              sellerPayoutTotal: sellerData.totalAmount,
              orderDate: savedOrder.paymentDate
            },
            actionUrl: `/seller/orders/${savedOrder._id}`
          });

          await sellerNotification.save();
          console.log(`✅ Seller notification created for seller: ${sellerData.seller.email}`);
        } catch (sellerNotificationError) {
          console.error('❌ Failed to create seller notification:', sellerNotificationError);
        }
      }
    } catch (sellerNotificationError) {
      console.error('❌ Failed to process seller notifications:', sellerNotificationError);
      // Don't fail the order creation if seller notifications fail
    }
    
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

// Get orders for the authenticated customer (by customerId or email)
export const getMyOrders = async (req, res) => {
  try {
    const user = req.user || {};
    const userId = user.userId;
    const userEmail = user.email;

    if (!userId && !userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const orders = await Order.find({
      $or: [
        { customerId: userId },
        { customerEmail: userEmail }
      ]
    }).sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    console.error('Error fetching customer orders:', error);
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
    
    // Get the current order to compare old status with new status
    const currentOrder = await Order.findById(id);
    if (!currentOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    const oldStatus = currentOrder.status;
    
    // Update the order status
    const order = await Order.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    
    console.log('✅ Order status updated successfully');
    
    // Send email notification to customer if status actually changed
    if (oldStatus !== status) {
      console.log(`📧 Sending status update notification: ${oldStatus} → ${status}`);
      
      // Send customer notification email (async, don't wait for it)
      sendOrderStatusUpdateToCustomer(order, status, oldStatus)
        .then(result => {
          if (result.sent) {
            console.log(`✅ Customer notification sent for order ${order.orderId}`);
          } else {
            console.warn(`⚠️ Failed to send customer notification: ${result.error}`);
          }
        })
        .catch(error => {
          console.error(`❌ Error sending customer notification:`, error);
        });
    }
    
    res.json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Customer-initiated cancel order
export const cancelOrderByCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user || {};

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Ownership check: match by customerId or by email
    const isOwner = (
      (order.customerId && String(order.customerId) === String(user.userId)) ||
      (order.customerEmail && user.email && order.customerEmail.toLowerCase() === String(user.email).toLowerCase())
    );

    if (!isOwner) {
      return res.status(403).json({ message: 'You are not allowed to cancel this order' });
    }

    // Allow cancel only if order is still pending or processing
    const currentStatus = String(order.status || '').toLowerCase();
    if (!['pending', 'processing'].includes(currentStatus)) {
      return res.status(400).json({ message: 'Order cannot be cancelled at this stage' });
    }

    order.status = 'cancelled';
    await order.save();

    console.log('✅ Order cancelled by customer successfully');

    res.json({
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};