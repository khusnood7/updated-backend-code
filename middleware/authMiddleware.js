// middleware/authMiddleware.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ERROR_CODES = require('../constants/errorCodes');
const logger = require('../utils/logger');
const sessionService = require('../services/sessionService'); // Assuming this file is set up for session management

const authMiddleware = async (req, res, next) => {
  let token;

  // Extract token from Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    logger.warn('No token provided');
    return res.status(401).json({ success: false, message: ERROR_CODES.UNAUTHORIZED });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      logger.warn(`User not found for token: ${decoded.id}`);
      return res.status(404).json({ success: false, message: ERROR_CODES.NOT_FOUND });
    }

    // Check if the session is expired based on the last activity time
    const sessionExpired = sessionService.isSessionExpired(user.lastActivity);
    if (sessionExpired) {
      logger.warn('Session expired due to inactivity');
      return res.status(401).json({ success: false, message: 'Session expired due to inactivity' });
    }

    // Refresh token if the session is still valid but approaching expiration
    const shouldRefreshToken = sessionService.shouldRefreshToken(decoded.iat);
    if (shouldRefreshToken) {
      const newToken = sessionService.generateAccessToken(user);
      res.setHeader('Authorization', `Bearer ${newToken}`);
      logger.info('Token refreshed for user:', user._id);
    }

    // Update last activity timestamp to keep the session alive
    await sessionService.updateLastActivity(user._id);

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Token expired');
      return res.status(401).json({ success: false, message: 'Token expired' });
    } else if (error.name === 'JsonWebTokenError') {
      logger.error('Invalid token:', error);
      return res.status(401).json({ success: false, message: ERROR_CODES.UNAUTHORIZED });
    }

    logger.error('Auth Middleware Error:', error);
    return res.status(500).json({ success: false, message: ERROR_CODES.SERVER_ERROR });
  }
};

module.exports = authMiddleware;
