/**
 * Health check service (NFR-004 / Issue #35)
 *
 * Provides liveness and readiness health checks across critical dependencies
 * (PostgreSQL and Redis) with strict sanitization, latency tracking, and timeout guards.
 */
const { getPool, isPoolInitialized } = require('../config/db');
const { connectRedis } = require('../config/redis');

let isShuttingDown = false;

function setShuttingDown(state) {
  isShuttingDown = Boolean(state);
}

function isShutdown() {
  return isShuttingDown;
}

/**
 * Executes a probe promise against a timeout.
 */
async function withTimeout(promise, timeoutMs = 2000, timeoutErrorMsg = 'Operation timed out') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutErrorMsg)), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probes the PostgreSQL database using SELECT 1 via the existing pool.
 * Errors are caught and strictly sanitized to avoid leaking connection info or credentials.
 *
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=2000]
 * @returns {Promise<{ status: 'up'|'down', latencyMs?: number }>}
 */
async function checkDatabase({ timeoutMs = 2000 } = {}) {
  const start = Date.now();
  try {
    const queryAction = async () => {
      const pool = getPool();
      return pool.query('SELECT 1 AS ok');
    };
    await withTimeout(queryAction(), timeoutMs, 'Database query timeout');
    return {
      status: 'up',
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    // Sanitized: never leak connection string, password, or driver internal errors
    return {
      status: 'down',
    };
  }
}

/**
 * Probes the Redis cache using client.ping() via the existing client.
 * Errors are caught and strictly sanitized.
 *
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=2000]
 * @returns {Promise<{ status: 'up'|'down', latencyMs?: number }>}
 */
async function checkRedis({ timeoutMs = 2000 } = {}) {
  const start = Date.now();
  try {
    const pingAction = async () => {
      const client = await connectRedis();
      return client.ping();
    };
    const pong = await withTimeout(pingAction(), timeoutMs, 'Redis ping timeout');
    if (pong === 'PONG') {
      return {
        status: 'up',
        latencyMs: Date.now() - start,
      };
    }
    return {
      status: 'down',
    };
  } catch (error) {
    // Sanitized: never leak host, port, or redis connection errors
    return {
      status: 'down',
    };
  }
}

/**
 * Shallow liveness check. Independent of external dependencies.
 * Fast check for container orchestrators and load balancers.
 *
 * @returns {{ status: string, httpCode: number, message: string, timestamp: string, uptime: number }}
 */
function getLiveness() {
  return {
    status: 'success',
    httpCode: 200,
    message: 'PassPulse API is alive',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime() * 100) / 100,
  };
}

/**
 * Full health & readiness evaluation for GET /api/health and /api/health/ready.
 * Returns 200 when all critical dependencies are healthy, 503 if any dependency is down or shutting down.
 * Preserves "status": "success" on healthy responses for scripts/check-tls.sh compatibility.
 *
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=2000]
 * @param {Function} [options.dbChecker=checkDatabase]
 * @param {Function} [options.redisChecker=checkRedis]
 */
async function checkHealth({
  timeoutMs = 2000,
  dbChecker = checkDatabase,
  redisChecker = checkRedis,
} = {}) {
  const timestamp = new Date().toISOString();
  const uptime = Math.round(process.uptime() * 100) / 100;

  if (isShuttingDown) {
    return {
      status: 'error',
      httpCode: 503,
      message: 'PassPulse API is shutting down',
      timestamp,
      uptime,
      services: {
        database: { status: 'down' },
        redis: { status: 'down' },
      },
    };
  }

  const [dbResult, redisResult] = await Promise.all([
    dbChecker({ timeoutMs }).catch(() => ({ status: 'down' })),
    redisChecker({ timeoutMs }).catch(() => ({ status: 'down' })),
  ]);

  const isHealthy = dbResult.status === 'up' && redisResult.status === 'up';

  return {
    status: isHealthy ? 'success' : 'error',
    httpCode: isHealthy ? 200 : 503,
    message: isHealthy ? 'PassPulse API is healthy' : 'PassPulse API dependency unavailable',
    timestamp,
    uptime,
    services: {
      database: dbResult,
      redis: redisResult,
    },
  };
}

/**
 * Readiness probe alias for GET /api/health/ready.
 */
async function getReadiness(options = {}) {
  return checkHealth(options);
}

function resetHealthState() {
  isShuttingDown = false;
}

module.exports = {
  checkDatabase,
  checkRedis,
  getLiveness,
  checkHealth,
  getReadiness,
  setShuttingDown,
  isShutdown,
  resetHealthState,
  withTimeout,
};
