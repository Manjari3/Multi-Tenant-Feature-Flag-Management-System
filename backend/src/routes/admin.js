'use strict';

const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, param } = require('express-validator');

const config = require('../config');
const { get, all, run } = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

const SALT_ROUNDS = 12;

// ── POST /api/admin/signup ────────────────────────────────────────────────────
router.post(
  '/signup',
  [
    body('username')
      .trim()
      .notEmpty().withMessage('Username is required.')
      .isLength({ min: 3, max: 50 }).withMessage('Username must be 3–50 characters.')
      .matches(/^[a-zA-Z0-9_.-]+$/).withMessage('Username may only contain letters, numbers, underscores, dots, and hyphens.'),
    body('password')
      .notEmpty().withMessage('Password is required.')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('organization_id')
      .notEmpty().withMessage('Organization is required.')
      .isInt({ min: 1 }).withMessage('Invalid organization ID.'),
    handleValidationErrors,
  ],
  async (req, res, next) => {
    try {
      const { username, password, organization_id } = req.body;

      // Verify the organisation actually exists
      const org = await get(
        `SELECT id FROM organizations WHERE id = ?`,
        [organization_id]
      );
      if (!org) {
        return res.status(404).json({ error: 'Organization not found.' });
      }

      const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

      const result = await run(
        `INSERT INTO users (username, password_hash, role, organization_id) VALUES (?, ?, 'ORG_ADMIN', ?)`,
        [username, password_hash, organization_id]
      ).catch((err) => {
        if (err.message.includes('UNIQUE')) {
          const e = new Error('Username is already taken.');
          e.status = 409;
          throw e;
        }
        throw err;
      });

      return res.status(201).json({
        id: result.lastID,
        username,
        organization_id: Number(organization_id),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/admin/login ─────────────────────────────────────────────────────
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

      const user = await get(
        `SELECT id, password_hash, role, organization_id FROM users WHERE username = ?`,
        [username]
      );

      // Constant-time comparison to mitigate timing attacks
      const dummyHash = '$2b$12$DUMMY_HASH_TO_PREVENT_TIMING_ATTACKS_xxxxxxxxxxxxxxxxxx';
      const passwordMatch = user
        ? await bcrypt.compare(password, user.password_hash)
        : await bcrypt.compare(password, dummyHash).then(() => false);

      if (!user || !passwordMatch) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      const token = jwt.sign(
        { id: user.id, role: user.role, organization_id: user.organization_id },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      return res.json({ token, organization_id: user.organization_id });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/admin/flags ──────────────────────────────────────────────────────
router.get(
  '/flags',
  authenticate,
  requireRole('ORG_ADMIN'),
  async (req, res, next) => {
    try {
      const flags = await all(
        `SELECT id, key, is_enabled, created_at, updated_at
           FROM feature_flags
          WHERE organization_id = ?
          ORDER BY created_at DESC`,
        [req.user.organization_id]
      );
      return res.json(flags.map((f) => ({ ...f, is_enabled: !!f.is_enabled })));
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/admin/flags ─────────────────────────────────────────────────────
router.post(
  '/flags',
  authenticate,
  requireRole('ORG_ADMIN'),
  [
    body('key')
      .trim()
      .notEmpty().withMessage('Feature key is required.')
      .isLength({ min: 1, max: 100 }).withMessage('Key must be 1–100 characters.')
      .matches(/^[a-z0-9_]+$/).withMessage('Key may only contain lowercase letters, numbers, and underscores.'),
    body('is_enabled')
      .optional()
      .isBoolean().withMessage('is_enabled must be a boolean.'),
    handleValidationErrors,
  ],
  async (req, res, next) => {
    try {
      const { key, is_enabled = false } = req.body;
      const enabled = is_enabled ? 1 : 0;

      const result = await run(
        `INSERT INTO feature_flags (key, is_enabled, organization_id) VALUES (?, ?, ?)`,
        [key, enabled, req.user.organization_id]
      ).catch((err) => {
        if (err.message.includes('UNIQUE')) {
          const e = new Error('A flag with that key already exists for this organization.');
          e.status = 409;
          throw e;
        }
        throw err;
      });

      const flag = await get(
        `SELECT id, key, is_enabled, created_at, updated_at FROM feature_flags WHERE id = ?`,
        [result.lastID]
      );

      return res.status(201).json({ ...flag, is_enabled: !!flag.is_enabled });
    } catch (err) {
      next(err);
    }
  }
);

// ── PUT /api/admin/flags/:id ──────────────────────────────────────────────────
router.put(
  '/flags/:id',
  authenticate,
  requireRole('ORG_ADMIN'),
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid flag ID.'),
    body('is_enabled')
      .notEmpty().withMessage('is_enabled is required.')
      .isBoolean().withMessage('is_enabled must be a boolean.'),
    handleValidationErrors,
  ],
  async (req, res, next) => {
    try {
      const { is_enabled } = req.body;
      const enabled = is_enabled ? 1 : 0;

      const result = await run(
        `UPDATE feature_flags
            SET is_enabled = ?
          WHERE id = ? AND organization_id = ?`,
        [enabled, req.params.id, req.user.organization_id]
      );

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Feature flag not found.' });
      }

      const flag = await get(
        `SELECT id, key, is_enabled, updated_at FROM feature_flags WHERE id = ?`,
        [req.params.id]
      );

      return res.json({ ...flag, is_enabled: !!flag.is_enabled });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/admin/flags/:id ───────────────────────────────────────────────
router.delete(
  '/flags/:id',
  authenticate,
  requireRole('ORG_ADMIN'),
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid flag ID.'),
    handleValidationErrors,
  ],
  async (req, res, next) => {
    try {
      const result = await run(
        `DELETE FROM feature_flags WHERE id = ? AND organization_id = ?`,
        [req.params.id, req.user.organization_id]
      );

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Feature flag not found.' });
      }

      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
