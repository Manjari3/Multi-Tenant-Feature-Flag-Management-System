'use strict';

require('dotenv').config();

/**
 * Centralised configuration.
 * All environment variables are read and validated here so the rest of the
 * application never calls process.env directly.
 */

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_in_production',
    expiresIn: '2h',
  },

  superAdmin: {
    username: process.env.SUPER_ADMIN_USERNAME || 'superadmin',
    password: process.env.SUPER_ADMIN_PASSWORD || 'superpassword',
  },

  db: {
    path: process.env.DB_PATH || './data/feature_flags.db',
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                   // requests per window per IP
    authMax: 20,                // stricter limit for auth endpoints
  },
};

module.exports = config;
