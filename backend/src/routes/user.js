'use strict';

const router = require('express').Router();
const { query } = require('express-validator');

const { get, all } = require('../config/database');
const { handleValidationErrors } = require('../middleware/validate');

// ── GET /api/user/orgs ────────────────────────────────────────────────────────
// Public — used by the user and admin frontends to populate the org dropdown.
router.get('/orgs', async (req, res, next) => {
  try {
    const orgs = await all(
      `SELECT id, name FROM organizations ORDER BY name ASC`
    );
    return res.json(orgs);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/user/flags/check ─────────────────────────────────────────────────
// Public — checks whether a given feature key is enabled for an organisation.
router.get(
  '/flags/check',
  [
    query('org_id')
      .notEmpty().withMessage('org_id is required.')
      .isInt({ min: 1 }).withMessage('org_id must be a positive integer.'),
    query('key')
      .trim()
      .notEmpty().withMessage('key is required.')
      .isLength({ min: 1, max: 100 }).withMessage('key must be 1–100 characters.'),
    handleValidationErrors,
  ],
  async (req, res, next) => {
    try {
      const { org_id, key } = req.query;

      // Verify the org exists first so we can give a clear "not found" vs "disabled"
      const org = await get(
        `SELECT id, name FROM organizations WHERE id = ?`,
        [org_id]
      );
      if (!org) {
        return res.status(404).json({ error: 'Organization not found.' });
      }

      const flag = await get(
        `SELECT is_enabled FROM feature_flags WHERE organization_id = ? AND key = ?`,
        [org_id, key]
      );

      if (!flag) {
        return res.json({
          enabled: false,
          message: `Feature '${key}' does not exist for organization '${org.name}'.`,
        });
      }

      return res.json({
        enabled: !!flag.is_enabled,
        message: flag.is_enabled
          ? `Feature '${key}' is enabled for organization '${org.name}'.`
          : `Feature '${key}' is disabled for organization '${org.name}'.`,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
