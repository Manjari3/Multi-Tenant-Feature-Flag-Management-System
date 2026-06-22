'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const logger = require('./utils/logger');
const { initDb } = require('./config/database');

const superRouter = require('./routes/super');
const adminRouter = require('./routes/admin');
const userRouter  = require('./routes/user');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
// In production, replace the wildcard with an explicit list of allowed origins.
app.use(
  cors({
    origin: config.env === 'production'
      ? (process.env.ALLOWED_ORIGINS || '').split(',')
      : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── HTTP request logging ──────────────────────────────────────────────────────
app.use(
  morgan(config.env === 'production' ? 'combined' : 'dev', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' })); // Guard against large-payload attacks

// ── Global rate limiter ───────────────────────────────────────────────────────
app.use(
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  })
);

// ── Stricter rate limiter for auth endpoints ──────────────────────────────────
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

app.use('/api/super/login', authLimiter);
app.use('/api/admin/login', authLimiter);
app.use('/api/admin/signup', authLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/super', superRouter);
app.use('/api/admin', adminRouter);
app.use('/api/user',  userRouter);

// ── Health-check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// Must have exactly 4 parameters so Express recognises it as an error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;

  // Do not expose internal error details in production
  const message =
    config.env === 'production' && status === 500
      ? 'An unexpected error occurred. Please try again later.'
      : err.message;

  if (status === 500) {
    logger.error('Unhandled error: %s', err.stack || err.message);
  }

  res.status(status).json({ error: message });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initDb();
    app.listen(config.port, () => {
      logger.info(
        'Server running in %s mode on port %d',
        config.env,
        config.port
      );
    });
  } catch (err) {
    logger.error('Failed to start server: %s', err.message);
    process.exit(1);
  }
}

start();

module.exports = app; // exported for testing
