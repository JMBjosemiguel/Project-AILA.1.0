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

async function transaction(callback) {
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
