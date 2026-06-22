'use strict';

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');

const dbFilePath = path.resolve(__dirname, '..', '..', config.db.path);

// Ensure the data directory exists
const dbDir = path.dirname(dbFilePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbFilePath, (err) => {
  if (err) {
    logger.error('Failed to open SQLite database: %s', err.message);
    process.exit(1);
  }
  logger.info('Connected to SQLite database at %s', dbFilePath);
});

/**
 * Enable WAL mode for better concurrent read performance and enforce
 * foreign key constraints (SQLite disables them by default).
 */
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA foreign_keys = ON;');
});

/**
 * Promisified helper — run a statement that does not return rows.
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Promisified helper — return a single row.
 */
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Promisified helper — return all matching rows.
 */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Create all tables and indexes if they do not already exist.
 * Uses IF NOT EXISTS so it is safe to call on every startup.
 */
async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS organizations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    UNIQUE NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      username        TEXT    UNIQUE NOT NULL,
      password_hash   TEXT    NOT NULL,
      role            TEXT    NOT NULL CHECK(role IN ('ORG_ADMIN')),
      organization_id INTEGER NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      key             TEXT    NOT NULL,
      is_enabled      INTEGER NOT NULL DEFAULT 0,
      organization_id INTEGER NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(key, organization_id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    )
  `);

  // Indexes for common query patterns
  await run(`CREATE INDEX IF NOT EXISTS idx_users_org       ON users(organization_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_flags_org       ON feature_flags(organization_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_flags_org_key   ON feature_flags(organization_id, key)`);

  // Trigger to keep updated_at current
  await run(`
    CREATE TRIGGER IF NOT EXISTS trg_flags_updated_at
    AFTER UPDATE ON feature_flags
    BEGIN
      UPDATE feature_flags
        SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = NEW.id;
    END
  `);

  logger.info('Database schema initialised successfully');
}

module.exports = { db, run, get, all, initDb };
