const mysql = require('mysql2/promise');
require('dotenv').config({ quiet: true });

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function buildSslConfig() {
  if (!isTruthy(process.env.DB_SSL)) return undefined;

  const ssl = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === undefined
      ? true
      : isTruthy(process.env.DB_SSL_REJECT_UNAUTHORIZED),
  };

  if (process.env.DB_SSL_CA) {
    ssl.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  }

  return ssl;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'aila_db',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  ssl: buildSslConfig(),
});

// Use the text protocol (pool.query) rather than server-side prepared statements
// (pool.execute). Parameters are still bound via `?` and escaped by mysql2, so
// this stays injection-safe, but `LIMIT ?` / `OFFSET ?` work on strict MySQL 8
// (Aiven): execute() sends every JS number as a DOUBLE, which MySQL rejects for
// LIMIT/OFFSET ("Incorrect arguments to mysqld_stmt_execute"). MariaDB accepts it,
// which is why this only surfaced in production.
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// InnoDB may pick either side of a lock cycle as the deadlock victim and abort it
// with ER_LOCK_DEADLOCK (or ER_LOCK_WAIT_TIMEOUT under heavy contention). The
// documented remedy is simply to retry the whole transaction — the victim rolled
// back cleanly, so a fresh attempt is safe. Callbacks here are already written to
// be idempotent (INSERT IGNORE / ON DUPLICATE KEY / re-checked state), so a
// bounded retry turns a rare concurrent 500 into a transparent success.
const TRANSIENT_TX_ERRORS = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);
const TX_MAX_ATTEMPTS = 3;

async function runTransactionOnce(callback) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function transaction(callback) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await runTransactionOnce(callback);
    } catch (error) {
      if (attempt >= TX_MAX_ATTEMPTS || !TRANSIENT_TX_ERRORS.has(error && error.code)) {
        throw error;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 25 * attempt); });
    }
  }
}

async function testConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

async function execute(connection, sql, params = []) {
  if (connection) {
    const [result] = await connection.query(sql, params);
    return result;
  }

  return query(sql, params);
}

module.exports = {
  pool,
  query,
  transaction,
  testConnection,
  execute,
};
