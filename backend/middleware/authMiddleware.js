// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  const auth = req.headers.authorization;
  // Also accept token via query param (for CSV/PDF download links)
  const rawToken = (auth && auth.startsWith('Bearer ')) ? auth.split(' ')[1] : req.query.token;
  if (!rawToken) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(rawToken, process.env.JWT_SECRET || 'bloodconnect_secret');
    // Special hardcoded admin (no DB user record)
    if (decoded.id === 'admin' && decoded.roles && decoded.roles.includes('admin')) {
      req.user = { _id: 'admin', id: 'admin', name: 'Onlyadmin', roles: ['admin'], role: 'admin' };
      return next();
    }
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const adminOnly = (req, res, next) => {
  if (!req.user || !req.user.roles.includes('admin')) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

module.exports = { protect, adminOnly };
