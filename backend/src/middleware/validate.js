'use strict';

const { validationResult } = require('express-validator');

/**
 * Reads the result of express-validator checks applied before this middleware.
 * Returns 422 with a structured errors array if any checks failed.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: 'Validation failed.',
      details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

module.exports = { handleValidationErrors };
