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
          <div style="color:#6b7280;font-size:14px;margin-top:4px">Thanks for shopping with PrintCo!</div>
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

        <div style="padding:16px 24px;border-top:1px solid #f1f5f9;color:#9ca3af;font-size:12px">© ${new Date().getFullYear()} PrintCo • This is an automated message</div>
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

    const fromName = (process.env.SMTP_FROM || 'PrintCo <no-reply@printco.local>').trim();
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

// Export transporter creator for use in other modules
export { createTransporter };

