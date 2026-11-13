const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({
  path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '..', '..', '.env'),
});

let pool = null;

/**
 * Returns the shared PostgreSQL pool built from DATABASE_URL (OPS-001).
 * Created lazily so modules that never touch the database do not open connections.
 */
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not configured');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

/**
 * Lets tests or scripts supply their own pool (for example an in-memory pg-mem pool).
 */
function setPool(customPool) {
  pool = customPool;
}

function isPoolInitialized() {
  return pool !== null;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function closePool() {
  if (pool && typeof pool.end === 'function') {
    await pool.end();
  }
  pool = null;
}

module.exports = { getPool, setPool, isPoolInitialized, query, closePool };
