'use strict';

const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, param } = require('express-validator');

const config = require('../config');
const { get, all, run } = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

// ── POST /api/super/login ──────────────────────────────────────────────────────
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
    handleValidationErrors,
  ],
  async (req, res, next) => {
    try {
      const { username, password } = req.body;

      if (
        username !== config.superAdmin.username ||
        password !== config.superAdmin.password
      ) {
        // Generic message prevents username enumeration
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      const token = jwt.sign(
        { role: 'SUPER_ADMIN', username },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      return res.json({ token });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/super/orgs ───────────────────────────────────────────────────────
router.get(
  '/orgs',
  authenticate,
  requireRole('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const orgs = await all(
        `SELECT id, name, created_at FROM organizations ORDER BY created_at DESC`
      );
      return res.json(orgs);
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/super/orgs ──────────────────────────────────────────────────────
router.post(
  '/orgs',
  authenticate,
  requireRole('SUPER_ADMIN'),
  [
    body('name')
      .trim()
      .notEmpty().withMessage('Organization name is required.')
      .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters.'),
    handleValidationErrors,
  ],
  async (req, res, next) => {
    try {
      const { name } = req.body;

      const result = await run(
        `INSERT INTO organizations (name) VALUES (?)`,
        [name]
      ).catch((err) => {
        if (err.message.includes('UNIQUE')) {
          const e = new Error('An organization with that name already exists.');
          e.status = 409;
          throw e;
        }
        throw err;
      });

      const org = await get(
        `SELECT id, name, created_at FROM organizations WHERE id = ?`,
        [result.lastID]
      );

      return res.status(201).json(org);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
