import nodemailer from 'nodemailer';


// Cache transporter to avoid re-creating on every call
let cachedTransporter = null;

function createTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn('⚠️ SMTP config missing. Email sending disabled.');
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: String(SMTP_SECURE).toLowerCase() === 'true' || Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  cachedTransporter = transporter;
  return transporter;
}

function formatINR(amount) {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount || 0));
  } catch (_) {
    return `₹${Number(amount || 0).toFixed(2)}`;
  }
}

function sanitize(str) {
  if (!str) return '';
  return String(str).replace(/[\`]/g, '').trim();
}

function isHttpUrl(url) {
  try {
    const u = String(url || '');
    return u.startsWith('http://') || u.startsWith('https://');
  } catch (_) {
    return false;
  }
}

function buildItemsTable(items = []) {
  const rows = (items || []).map((it) => {
    const name = sanitize(it?.name);
    const qty = Number(it?.quantity || 0);
    const price = formatINR(it?.price || 0);
    const size = sanitize(it?.size);
    const color = sanitize(it?.color);
    const image = sanitize(it?.image);

    const imageCell = isHttpUrl(image)
      ? `<img src="${image}" alt="${name}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;border:1px solid #eee" />`
      : '';

    return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;vertical-align:middle">${imageCell}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;vertical-align:middle">
          <div style="font-weight:600;color:#111">${name}</div>
          ${size ? `<div style="font-size:12px;color:#555">Size: ${size}</div>` : ''}
          ${color ? `<div style="font-size:12px;color:#555">Color: ${color}</div>` : ''}
        </td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${qty}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${price}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatINR((it?.price || 0) * qty)}</td>
      </tr>`;
  }).join('');

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th style="padding:8px;border-bottom:2px solid #ddd;text-align:left;width:56px">Image</th>
          <th style="padding:8px;border-bottom:2px solid #ddd;text-align:left">Item</th>
          <th style="padding:8px;border-bottom:2px solid #ddd;text-align:center;width:80px">Qty</th>
          <th style="padding:8px;border-bottom:2px solid #ddd;text-align:right;width:120px">Price</th>
          <th style="padding:8px;border-bottom:2px solid #ddd;text-align:right;width:120px">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows || ''}
      </tbody>
    </table>`;
}

function buildEmailHtml(order) {
  const customerName = sanitize(order?.customerName) || 'Customer';
  const orderId = sanitize(order?.orderId) || sanitize(order?._id);
  const paymentId = sanitize(order?.paymentId);
  const total = formatINR(order?.total);

  const addressParts = [
    sanitize(order?.customerAddress),
    sanitize(order?.customerCity),
    sanitize(order?.customerPincode),
  ].filter(Boolean);

  const itemsTable = buildItemsTable(order?.items || []);

  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f8fafc;padding:24px">
      <div style="max-width:680px;margin:auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <div style="padding:20px 24px;border-bottom:1px solid #f1f5f9;background:linear-gradient(90deg,#fff,#f8fafc)">
          <h2 style="margin:0;color:#111827">Your Order is Confirmed</h2>
          <div style="color:#6b7280;font-size:14px;margin-top:4px">Thanks for shopping with L-Mart!</div>
        </div>

        <div style="padding:24px">
          <p style="margin:0 0 16px 0;color:#111827">Hi ${customerName},</p>
          <p style="margin:0 0 16px 0;color:#374151">We’ve received your order and it’s now being processed.</p>

          <div style="display:flex;gap:16px;margin:16px 0;padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#fafafa">
            <div style="flex:1">
              <div style="color:#6b7280;font-size:12px">Order</div>
              <div style="color:#111827;font-weight:600">${orderId}</div>
            </div>
            <div style="flex:1">
              <div style="color:#6b7280;font-size:12px">Payment</div>
              <div style="color:#111827">${paymentId || '—'}</div>
            </div>
            <div style="flex:1">
              <div style="color:#6b7280;font-size:12px">Total</div>
              <div style="color:#111827;font-weight:600">${total}</div>
            </div>
          </div>

          ${itemsTable}

          ${addressParts.length ? `
          <div style="margin-top:20px">
            <h3 style="margin:0 0 8px 0;color:#111827;font-size:16px">Shipping Address</h3>
            <div style="color:#374151">${addressParts.join(', ')}</div>
          </div>` : ''}

          <div style="margin-top:24px;color:#6b7280;font-size:12px">If you have any questions, just reply to this email.</div>
        </div>

        <div style="padding:16px 24px;border-top:1px solid #f1f5f9;color:#9ca3af;font-size:12px">© ${new Date().getFullYear()} L-Mart • This is an automated message</div>
      </div>
    </div>`;
}

export async function sendOrderConfirmationEmail(order) {
  try {
    const transporter = createTransporter();
    const toEmail = sanitize(order?.customerEmail);

    if (!transporter) {
      return { sent: false, reason: 'smtp_not_configured' };
    }

    if (!toEmail) {
      console.warn('⚠️ No customerEmail on order; skipping email. Order id:', order?._id || order?.orderId);
      return { sent: false, reason: 'missing_recipient' };
    }

    const fromName = (process.env.SMTP_FROM || 'L-Mart <no-reply@lmart.local>').trim();
    const subject = `Order Confirmed • ${sanitize(order?.orderId) || order?._id}`;
    const html = buildEmailHtml(order);

    const info = await transporter.sendMail({
      from: fromName,
      to: toEmail,
      subject,
      html,
    });

    return { sent: true, messageId: info?.messageId };
  } catch (error) {
    console.error('❌ Failed to send order confirmation email:', error?.message || error);
    return { sent: false, error: error?.message || String(error) };
  }
}

// Send admin notification for new seller registration
export async function sendNewSellerNotificationToAdmin(sellerData) {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.warn('⚠️ Email transporter not available. Skipping admin notification.');
      return { sent: false, error: 'Email not configured' };
    }

    const adminEmail = 'dashrathsirt34@gmail.com';
    const subject = 'New Seller Registration - Action Required';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Seller Registration</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #2c3e50; margin: 0; }
          .alert { background-color: #e8f5e8; border: 1px solid #4caf50; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
          .seller-info { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .info-row { margin: 10px 0; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 New Seller Registration</h1>
          </div>
          
          <div class="alert">
            <strong>New seller coming!</strong> A new seller has registered on your platform and requires verification.
          </div>
          
          <div class="seller-info">
            <h3>Seller Details:</h3>
            <div class="info-row">
              <span class="label">Name:</span> 
              <span class="value">${sanitize(sellerData.name)}</span>
            </div>
            <div class="info-row">
              <span class="label">Email:</span> 
              <span class="value">${sanitize(sellerData.email)}</span>
            </div>
            <div class="info-row">
              <span class="label">Seller Name:</span> 
              <span class="value">${sanitize(sellerData.sellerName)}</span>
            </div>
            <div class="info-row">
              <span class="label">Registration Date:</span> 
              <span class="value">${new Date().toLocaleString('en-IN')}</span>
            </div>
            ${sellerData.parentSellerEmail ? `
            <div class="info-row">
              <span class="label">Parent Seller:</span> 
              <span class="value">${sanitize(sellerData.parentSellerEmail)}</span>
            </div>
            ` : ''}
          </div>
          
          <p><strong>Action Required:</strong> Please review and verify this seller in your admin dashboard.</p>
          
          <div class="footer">
            <p>This is an automated notification from your Printo platform.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: adminEmail,
      subject,
      html,
    });

    console.log('✅ Admin notification sent for new seller:', sellerData.email);
    return { sent: true, messageId: info?.messageId };
  } catch (error) {
    console.error('❌ Failed to send admin notification:', error?.message || error);
    return { sent: false, error: error?.message || String(error) };
  }
}

// Send new order notification to admin
export async function sendNewOrderNotificationToAdmin(order) {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.warn('⚠️ No transporter available. Skipping order notification email.');
      return { sent: false, error: 'No transporter configured' };
    }

    const adminEmail = 'dashrathsirt34@gmail.com';
    
    // Build items table for email
    const itemsHtml = order.items.map(item => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px; text-align: left;">
          <div style="display: flex; align-items: center;">
            ${item.image ? `<img src="${item.image}" alt="${sanitize(item.name)}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; margin-right: 12px;">` : ''}
            <div>
              <div style="font-weight: 600; color: #1f2937;">${sanitize(item.name)}</div>
              ${item.size ? `<div style="font-size: 12px; color: #6b7280;">Size: ${sanitize(item.size)}</div>` : ''}
              ${item.color ? `<div style="font-size: 12px; color: #6b7280;">Color: ${sanitize(item.color)}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="padding: 12px; text-align: center; color: #374151;">${item.quantity}</td>
        <td style="padding: 12px; text-align: right; color: #374151; font-weight: 600;">${formatINR(item.price)}</td>
        <td style="padding: 12px; text-align: right; color: #059669; font-weight: 600;">${formatINR(item.price * item.quantity)}</td>
      </tr>
    `).join('');

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Order Received - L-Mart</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9fafb;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">🎉 New Order Received!</h1>
            <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 16px;">A customer has placed a new order on L-Mart</p>
          </div>

          <!-- Order Info -->
          <div style="padding: 30px;">
            <div style="background-color: #f3f4f6; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
              <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 20px; font-weight: 600;">📋 Order Details</h2>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div>
                  <strong style="color: #374151;">Order ID:</strong><br>
                  <span style="color: #6b7280; font-family: monospace;">${sanitize(order.orderId)}</span>
                </div>
                <div>
                  <strong style="color: #374151;">Payment ID:</strong><br>
                  <span style="color: #6b7280; font-family: monospace;">${sanitize(order.paymentId)}</span>
                </div>
                <div>
                  <strong style="color: #374151;">Order Date:</strong><br>
                  <span style="color: #6b7280;">${new Date(order.paymentDate).toLocaleDateString('en-IN', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</span>
                </div>
                <div>
                  <strong style="color: #374151;">Status:</strong><br>
                  <span style="background-color: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${order.status.toUpperCase()}</span>
                </div>
              </div>
            </div>

            <!-- Customer Info -->
            <div style="background-color: #ecfdf5; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
              <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 20px; font-weight: 600;">👤 Customer Information</h2>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div>
                  <strong style="color: #374151;">Name:</strong><br>
                  <span style="color: #6b7280;">${sanitize(order.customerName)}</span>
                </div>
                <div>
                  <strong style="color: #374151;">Email:</strong><br>
                  <span style="color: #6b7280;">${sanitize(order.customerEmail)}</span>
                </div>
                <div>
                  <strong style="color: #374151;">Phone:</strong><br>
                  <span style="color: #6b7280;">${sanitize(order.customerPhone)}</span>
                </div>
                <div>
                  <strong style="color: #374151;">City:</strong><br>
                  <span style="color: #6b7280;">${sanitize(order.customerCity)} - ${sanitize(order.customerPincode)}</span>
                </div>
              </div>
              <div style="margin-top: 15px;">
                <strong style="color: #374151;">Address:</strong><br>
                <span style="color: #6b7280;">${sanitize(order.customerAddress)}</span>
              </div>
            </div>

            <!-- Order Items -->
            <div style="margin-bottom: 25px;">
              <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 20px; font-weight: 600;">🛍️ Order Items</h2>
              <div style="border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
                <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="background-color: #f9fafb;">
                      <th style="padding: 15px; text-align: left; color: #374151; font-weight: 600;">Product</th>
                      <th style="padding: 15px; text-align: center; color: #374151; font-weight: 600;">Qty</th>
                      <th style="padding: 15px; text-align: right; color: #374151; font-weight: 600;">Price</th>
                      <th style="padding: 15px; text-align: right; color: #374151; font-weight: 600;">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsHtml}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Order Total -->
            <div style="background-color: #fef3c7; border-radius: 12px; padding: 20px; text-align: center;">
              <h3 style="color: #92400e; margin: 0 0 10px 0; font-size: 18px;">💰 Order Total</h3>
              <div style="font-size: 32px; font-weight: 700; color: #059669;">${formatINR(order.total)}</div>
            </div>

            <!-- Action Button -->
            <div style="text-align: center; margin-top: 30px;">
              <a href="http://localhost:3000/admin/dashboard" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: #ffffff; 
                        text-decoration: none; 
                        padding: 15px 30px; 
                        border-radius: 8px; 
                        font-weight: 600; 
                        display: inline-block;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                📊 View in Admin Dashboard
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; margin: 0; font-size: 14px;">
              This is an automated notification from L-Mart Admin System
            </p>
            <p style="color: #9ca3af; margin: 5px 0 0 0; font-size: 12px;">
              © ${new Date().getFullYear()} L-Mart. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"L-Mart Admin" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `🎉 New Order Received - ${order.orderId} (${formatINR(order.total)})`,
      html: emailHtml,
    };

    console.log(`📧 Sending new order notification to admin: ${adminEmail}`);
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Order notification email sent successfully:', result.messageId);
    
    return { sent: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Failed to send order notification to admin:', error?.message || error);
    return { sent: false, error: error?.message || String(error) };
  }
}

// Send order status update notification to customer
export async function sendOrderStatusUpdateToCustomer(order, newStatus, oldStatus) {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.warn('⚠️ No transporter available. Skipping customer status notification email.');
      return { sent: false, error: 'No transporter configured' };
    }

    // Status display mapping
    const statusDisplay = {
      'pending': { text: 'Pending', color: '#f59e0b', emoji: '⏳', bgColor: '#fef3c7' },
      'processing': { text: 'Processing', color: '#3b82f6', emoji: '🔄', bgColor: '#dbeafe' },
      'shipped': { text: 'Shipped', color: '#8b5cf6', emoji: '🚚', bgColor: '#ede9fe' },
      'delivered': { text: 'Delivered', color: '#10b981', emoji: '✅', bgColor: '#d1fae5' },
      'cancelled': { text: 'Cancelled', color: '#ef4444', emoji: '❌', bgColor: '#fee2e2' }
    };

    const statusInfo = statusDisplay[newStatus] || { text: newStatus, color: '#6b7280', emoji: '📦', bgColor: '#f3f4f6' };
    
    // Build items table for email
    const itemsHtml = order.items.map(item => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px; text-align: left;">
          <div style="display: flex; align-items: center;">
            ${item.image ? `<img src="${item.image}" alt="${sanitize(item.name)}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; margin-right: 12px;">` : ''}
            <div>
              <div style="font-weight: 600; color: #1f2937;">${sanitize(item.name)}</div>
              ${item.size ? `<div style="font-size: 12px; color: #6b7280;">Size: ${sanitize(item.size)}</div>` : ''}
              ${item.color ? `<div style="font-size: 12px; color: #6b7280;">Color: ${sanitize(item.color)}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="padding: 12px; text-align: center; color: #374151;">${item.quantity}</td>
        <td style="padding: 12px; text-align: right; color: #374151; font-weight: 600;">${formatINR(item.price)}</td>
        <td style="padding: 12px; text-align: right; color: #059669; font-weight: 600;">${formatINR(item.price * item.quantity)}</td>
      </tr>
    `).join('');

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Status Update - L-Mart</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9fafb;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">${statusInfo.emoji} Order Status Updated!</h1>
            <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 16px;">Your order status has been updated</p>
          </div>

          <!-- Status Update -->
          <div style="padding: 30px;">
            <div style="background-color: ${statusInfo.bgColor}; border-radius: 12px; padding: 25px; margin-bottom: 25px; text-align: center;">
              <h2 style="color: ${statusInfo.color}; margin: 0 0 15px 0; font-size: 24px; font-weight: 700;">
                ${statusInfo.emoji} ${statusInfo.text}
              </h2>
              <p style="color: #374151; margin: 0; font-size: 16px;">
                Your order <strong>${sanitize(order.orderId)}</strong> is now <strong>${statusInfo.text.toLowerCase()}</strong>
              </p>
            </div>

            <!-- Order Info -->
            <div style="background-color: #f3f4f6; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
              <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 20px; font-weight: 600;">📋 Order Details</h2>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div>
                  <strong style="color: #374151;">Order ID:</strong><br>
                  <span style="color: #6b7280; font-family: monospace;">${sanitize(order.orderId)}</span>
                </div>
                <div>
                  <strong style="color: #374151;">Payment ID:</strong><br>
                  <span style="color: #6b7280; font-family: monospace;">${sanitize(order.paymentId)}</span>
                </div>
                <div>
                  <strong style="color: #374151;">Order Date:</strong><br>
                  <span style="color: #6b7280;">${new Date(order.paymentDate).toLocaleDateString('en-IN', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</span>
                </div>
                <div>
                  <strong style="color: #374151;">Updated:</strong><br>
                  <span style="color: #6b7280;">${new Date().toLocaleDateString('en-IN', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</span>
                </div>
              </div>
            </div>

            <!-- Customer Info -->
            <div style="background-color: #ecfdf5; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
              <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 20px; font-weight: 600;">📍 Delivery Information</h2>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div>
                  <strong style="color: #374151;">Name:</strong><br>
                  <span style="color: #6b7280;">${sanitize(order.customerName)}</span>
                </div>
                <div>
                  <strong style="color: #374151;">Phone:</strong><br>
                  <span style="color: #6b7280;">${sanitize(order.customerPhone)}</span>
                </div>
                <div style="grid-column: 1 / -1;">
                  <strong style="color: #374151;">Address:</strong><br>
                  <span style="color: #6b7280;">${sanitize(order.customerAddress)}, ${sanitize(order.customerCity)} - ${sanitize(order.customerPincode)}</span>
                </div>
              </div>
            </div>

            <!-- Order Items -->
            <div style="margin-bottom: 25px;">
              <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 20px; font-weight: 600;">🛍️ Order Items</h2>
              <div style="border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
                <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="background-color: #f9fafb;">
                      <th style="padding: 15px; text-align: left; color: #374151; font-weight: 600;">Product</th>
                      <th style="padding: 15px; text-align: center; color: #374151; font-weight: 600;">Qty</th>
                      <th style="padding: 15px; text-align: right; color: #374151; font-weight: 600;">Price</th>
                      <th style="padding: 15px; text-align: right; color: #374151; font-weight: 600;">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsHtml}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Order Total -->
            <div style="background-color: #fef3c7; border-radius: 12px; padding: 20px; text-align: center;">
              <h3 style="color: #92400e; margin: 0 0 10px 0; font-size: 18px;">💰 Order Total</h3>
              <div style="font-size: 32px; font-weight: 700; color: #059669;">${formatINR(order.total)}</div>
            </div>

            <!-- Contact Info -->
            <div style="background-color: #f0f9ff; border-radius: 12px; padding: 20px; margin-top: 25px; text-align: center;">
              <h3 style="color: #0369a1; margin: 0 0 10px 0; font-size: 18px;">📞 Need Help?</h3>
              <p style="color: #374151; margin: 0; font-size: 14px;">
                If you have any questions about your order, please contact our support team.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; margin: 0; font-size: 14px;">
              Thank you for choosing L-Mart!
            </p>
            <p style="color: #9ca3af; margin: 5px 0 0 0; font-size: 12px;">
              © ${new Date().getFullYear()} L-Mart. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"L-Mart" <${process.env.SMTP_USER}>`,
      to: order.customerEmail,
      subject: `${statusInfo.emoji} Order ${statusInfo.text} - ${order.orderId}`,
      html: emailHtml,
    };

    console.log(`📧 Sending order status update to customer: ${order.customerEmail}`);
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Customer status notification email sent successfully:', result.messageId);
    
    return { sent: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Failed to send status update to customer:', error?.message || error);
    return { sent: false, error: error?.message || String(error) };
  }
}

// Export transporter creator for use in other modules
export { createTransporter };

