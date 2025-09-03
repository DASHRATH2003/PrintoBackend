import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Send order confirmation email
export const sendOrderConfirmationEmail = async (orderData) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: orderData.customerEmail,
      subject: `Order Confirmation - ${orderData.orderId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">Order Confirmation</h2>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #495057; margin-top: 0;">Order Details</h3>
            <p><strong>Order ID:</strong> ${orderData.orderId}</p>
            <p><strong>Payment ID:</strong> ${orderData.paymentId}</p>
            <p><strong>Customer Name:</strong> ${orderData.customerName}</p>
            <p><strong>Total Amount:</strong> ₹${orderData.total}</p>
            <p><strong>Order Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          
          <div style="background: #fff; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #495057; margin-top: 0;">Items Ordered</h3>
            ${orderData.items.map(item => `
              <div style="border-bottom: 1px solid #eee; padding: 10px 0;">
                <p style="margin: 5px 0;"><strong>${item.name}</strong></p>
                <p style="margin: 5px 0; color: #666;">Quantity: ${item.quantity} | Price: ₹${item.price}</p>
              </div>
            `).join('')}
          </div>
          
          <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1976d2; margin-top: 0;">What's Next?</h3>
            <ul style="color: #333; line-height: 1.6;">
              <li>Your order is being processed</li>
              <li>You will receive updates via email</li>
              <li>Expected delivery: 5-7 business days</li>
              <li>Track your order using Order ID: ${orderData.orderId}</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="color: #666;">Thank you for choosing Printo!</p>
            <p style="color: #666;">For any queries, contact us at support@printo.com</p>
          </div>
        </div>
      `
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Order confirmation email sent:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send order status update email
export const sendOrderStatusEmail = async (orderData, newStatus) => {
  try {
    const transporter = createTransporter();
    
    const statusMessages = {
      processing: 'Your order is now being processed',
      shipped: 'Your order has been shipped',
      delivered: 'Your order has been delivered',
      cancelled: 'Your order has been cancelled'
    };
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: orderData.customerEmail,
      subject: `Order Update - ${orderData.orderId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">Order Status Update</h2>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #495057; margin-top: 0;">Order ${orderData.orderId}</h3>
            <p style="font-size: 18px; color: #28a745;"><strong>${statusMessages[newStatus]}</strong></p>
            <p><strong>Customer:</strong> ${orderData.customerName}</p>
            <p><strong>Total:</strong> ₹${orderData.total}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="color: #666;">Thank you for choosing Printo!</p>
          </div>
        </div>
      `
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Order status email sent:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('❌ Error sending status email:', error.message);
    return { success: false, error: error.message };
  }
};