import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to authenticate JWT token
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Middleware for admin access
export const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Request logging middleware
export const requestLogger = (req, res, next) => {
  console.log('\n🌐🌐🌐 REQUEST RECEIVED 🌐🌐🌐');
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('🌐🌐🌐 END REQUEST LOG 🌐🌐🌐\n');
  next();
};