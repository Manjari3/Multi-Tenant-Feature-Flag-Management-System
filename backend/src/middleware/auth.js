'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Verifies the Bearer token in the Authorization header.
 * On success, attaches the decoded payload to req.user.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token is required.' });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  jwt.verify(token, config.jwt.secret, (err, decoded) => {
    if (err) {
      const message =
        err.name === 'TokenExpiredError'
          ? 'Token has expired. Please log in again.'
          : 'Invalid token. Please log in again.';
      return res.status(401).json({ error: message });
    }
    req.user = decoded;
    next();
  });
}

/**
 * Role-based access control.
 * @param {...string} roles - Allowed roles (e.g. 'SUPER_ADMIN', 'ORG_ADMIN')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
