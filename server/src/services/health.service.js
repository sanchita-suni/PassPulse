const { Client } = require('pg');

const checkinService = require('./checkin.service');
const ticketService = require('./ticket.service');
const UserModel = require('../models/user.model');

const packageJson = require('../../package.json');

/**
 * Health check & Availability Monitoring Service (NFR-004 / Issue #35)
 *
 * Provides liveness probes, readiness checks, and dependency status
 * monitoring for PassPulse services.
 */

/**
 * Basic liveness telemetry.
 * Non-blocking, fast probe for load balancers and orchestrators.
 */
function getLiveness() {
  const memory = process.memoryUsage();

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    service: 'passpulse-server',
    version: packageJson.version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    processId: process.pid,
    memory: {
      rssMb: Math.round((memory.rss / (1024 * 1024)) * 100) / 100,
      heapUsedMb: Math.round((memory.heapUsed / (1024 * 1024)) * 100) / 100,
      heapTotalMb: Math.round((memory.heapTotal / (1024 * 1024)) * 100) / 100,
    },
  };
}

/**
 * Checks PostgreSQL database connectivity.
 * Executes a fast `SELECT 1;` probe with a strict timeout.
 *
 * @param {Object} options
 * @param {Function} [options.customProbe] - Optional probe function for dependency injection / test mocking
 * @param {number} [options.timeoutMs=1500] - Connection & query timeout in milliseconds
 */
async function checkDatabaseAvailability({ customProbe, timeoutMs = 1500 } = {}) {
  const startTime = Date.now();

  if (typeof customProbe === 'function') {
    try {
      return await customProbe();
    } catch (error) {
      return {
        status: 'unhealthy',
        mode: 'postgresql',
        latencyMs: Date.now() - startTime,
        error: error.message || 'Custom probe failure',
      };
    }
  }

  const connectionString = process.env.DATABASE_URL || null;

  // If no database URL is configured in this environment, report in-memory fallback mode
  if (!connectionString) {
    return {
      status: 'healthy',
      mode: 'in-memory',
      message: 'Operating with in-memory stores (DEV-001 / DEV-002 baseline)',
      latencyMs: 0,
    };
  }

  let client;

  try {
    client = new Client({
      connectionString,
      connectionTimeoutMillis: timeoutMs,
      statement_timeout: timeoutMs,
    });

    await client.connect();
    await client.query('SELECT 1');
    const latencyMs = Date.now() - startTime;

    return {
      status: 'healthy',
      mode: 'postgresql',
      latencyMs,
      message: 'Database connection verified',
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      status: 'unhealthy',
      mode: 'postgresql',
      latencyMs,
      error: error.message || 'Database connection error',
    };
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        // Ignore disconnect errors
      }
    }
  }
}

/**
 * Validates the operational readiness of in-memory stores and core modules.
 */
function checkSubsystemsAvailability() {
  try {
    // Verify check-in service and its store interface are accessible
    const hasCheckInService =
      typeof checkinService.processCheckIn === 'function' &&
      typeof checkinService.validateCheckInData === 'function' &&
      (typeof checkinService.getCheckInCount === 'function'
        ? typeof checkinService.getCheckInCount() === 'number'
        : true);

    // Verify user model is accessible
    const hasUserModel =
      typeof UserModel.findByEmail === 'function' &&
      typeof UserModel.findById === 'function';

    // Verify ticket service is accessible
    const hasTicketService =
      typeof ticketService.getTicketById === 'function' &&
      typeof ticketService.getAttendeePass === 'function';

    const allStoresAvailable =
      hasCheckInService && hasUserModel && hasTicketService;

    return {
      status: allStoresAvailable ? 'healthy' : 'degraded',
      stores: {
        checkInStore: hasCheckInService ? 'active' : 'inactive',
        userStore: hasUserModel ? 'active' : 'inactive',
        ticketStore: hasTicketService ? 'active' : 'inactive',
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
    };
  }
}

/**
 * Comprehensive readiness check combining database, memory, and subsystem checks.
 *
 * @param {Object} options
 * @param {Function} [options.dbProbe] - Optional custom database probe
 */
async function getReadiness({ dbProbe } = {}) {
  const liveness = getLiveness();
  const dbStatus = await checkDatabaseAvailability({ customProbe: dbProbe });
  const subsystems = checkSubsystemsAvailability();

  const isDbHealthy = dbStatus.status === 'healthy';
  const isSubsystemsHealthy = subsystems.status === 'healthy';

  const isReady = isDbHealthy && isSubsystemsHealthy;

  return {
    status: isReady ? 'ok' : 'unhealthy',
    ready: isReady,
    timestamp: liveness.timestamp,
    uptimeSeconds: liveness.uptimeSeconds,
    version: liveness.version,
    environment: liveness.environment,
    dependencies: {
      database: dbStatus,
      subsystems,
    },
    system: {
      memory: liveness.memory,
      pid: liveness.processId,
    },
  };
}

module.exports = {
  getLiveness,
  checkDatabaseAvailability,
  checkSubsystemsAvailability,
  getReadiness,
};
