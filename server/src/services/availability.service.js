/**
 * Availability Monitoring & Downtime Recording Service (NFR-004 / Issue #35)
 *
 * Enforces NFR-004:
 * - 60-second periodic availability poller.
 * - Outage start, recovery, duration, and failure cause tracking.
 * - Resilient persistence (survives restarts even during database downtime).
 * - Exact uptime percentage calculation against the 99.5% SLA target.
 * - Strict separation from the security audit_log table.
 */
const fs = require('fs');
const path = require('path');
const healthService = require('./health.service');
const { getPool, isPoolInitialized } = require('../config/db');

const DEFAULT_POLL_INTERVAL_MS = 60000;
const AVAILABILITY_TARGET_PERCENT = 99.5;

function getDefaultStateFilePath() {
  return (
    process.env.AVAILABILITY_STATE_FILE ||
    path.join(__dirname, '..', '..', 'data', 'availability-state.json')
  );
}

// In-memory state tracking
let metrics = {
  totalChecks: 0,
  successfulChecks: 0,
  failedChecks: 0,
  lastCheckAt: null,
};

let activeIncident = null;
let incidents = [];
let nextIncidentId = 1;

let pollerTimer = null;
let initialImmediate = null;
let activePoll = null;
const blockedSavePaths = new Set();

/**
 * Loads persistent availability state from disk, if available.
 * Detects corruption, preserves corrupt history as timestamped backup, and blocks
 * subsequent writes if the backup operation fails to prevent silent data loss.
 */
function loadStateFromFile(filePath = getDefaultStateFilePath()) {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: true, exists: false };
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      console.warn(`[AVAILABILITY] Detected corrupted availability state file (${parseError.message}). Attempting backup...`);
      const backupPath = `${filePath}.corrupt.${Date.now()}`;
      try {
        fs.renameSync(filePath, backupPath);
        console.warn(`[AVAILABILITY] Preserved corrupted state file as ${path.basename(backupPath)}`);
        blockedSavePaths.delete(filePath);
      } catch (backupError) {
        console.error(`[AVAILABILITY] Critical: Failed to backup corrupted state file: ${backupError.message}. Halting writes to protect history.`);
        blockedSavePaths.add(filePath);
        return { success: false, corrupted: true, backedUp: false, error: backupError.message };
      }

      // Initialize recovery state only after successful backup
      metrics = {
        totalChecks: 0,
        successfulChecks: 0,
        failedChecks: 0,
        lastCheckAt: null,
      };
      activeIncident = null;
      incidents = [];
      nextIncidentId = 1;
      return { success: true, corrupted: true, backedUp: true, backupPath };
    }

    blockedSavePaths.delete(filePath);

    if (parsed.metrics) {
      metrics = {
        totalChecks: Number(parsed.metrics.totalChecks) || 0,
        successfulChecks: Number(parsed.metrics.successfulChecks) || 0,
        failedChecks: Number(parsed.metrics.failedChecks) || 0,
        lastCheckAt: parsed.metrics.lastCheckAt || null,
      };
    }
    activeIncident = parsed.activeIncident || null;
    incidents = Array.isArray(parsed.incidents) ? parsed.incidents : [];
    nextIncidentId = Number(parsed.nextIncidentId) || (incidents.length + (activeIncident ? 2 : 1));
    return { success: true, exists: true };
  } catch (error) {
    console.error('Failed to load availability state file:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Persists availability state to disk atomically using a temporary file and rename.
 * Guarantees zero partial-write corruption and prevents overwriting corrupted unbacked-up files.
 *
 * @param {string} [filePath]
 * @returns {boolean} true if persistence succeeded, false otherwise
 */
function saveStateToFile(filePath = getDefaultStateFilePath()) {
  if (blockedSavePaths.has(filePath)) {
    console.error('Failed to save availability state file: Write blocked to protect un-backed-up corrupted state file');
    return false;
  }

  let tempPath = null;
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const payload = JSON.stringify(
      {
        metrics,
        activeIncident,
        incidents,
        nextIncidentId,
        savedAt: new Date().toISOString(),
      },
      null,
      2
    );

    // Write to unique temporary file in the same directory for atomic rename
    const uniqueSuffix = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    tempPath = path.join(dir, `.${path.basename(filePath)}.${uniqueSuffix}.tmp`);

    fs.writeFileSync(tempPath, payload, 'utf8');

    // Atomic rename replaces destination file
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (error) {
    if (tempPath) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // Ignore temporary cleanup error
      }
    }
    console.error('Failed to save availability state file:', error.message);
    return false;
  }
}

/**
 * Syncs an opened incident to PostgreSQL if available.
 * Fails silently if PostgreSQL is down or table does not exist.
 */
async function syncIncidentStartToDb(incident) {
  try {
    if (!process.env.DATABASE_URL && !isPoolInitialized()) return;
    const pool = getPool();
    await pool.query(
      `INSERT INTO availability_incidents (service, status, started_at, failure_cause)
       VALUES ($1, $2, $3, $4)`,
      [incident.service, incident.status, incident.startedAt, incident.failureCause]
    );
  } catch {
    // Expected when database is the component currently down
  }
}

/**
 * Syncs incident resolution to PostgreSQL if available.
 */
async function syncIncidentRecoveryToDb(incident) {
  try {
    if (!process.env.DATABASE_URL && !isPoolInitialized()) return;
    const pool = getPool();
    await pool.query(
      `UPDATE availability_incidents
       SET status = 'RESOLVED',
           recovered_at = $1,
           duration_seconds = $2
       WHERE service = $3 AND status = 'OPEN' AND started_at = $4`,
      [incident.recoveredAt, incident.durationSeconds, incident.service, incident.startedAt]
    );
  } catch {
    // Expected when database is down
  }
}

/**
 * Evaluates failure cause and service identifier from health check result.
 */
function identifyFailure(healthResult) {
  const dbDown = healthResult.services?.database?.status === 'down';
  const redisDown = healthResult.services?.redis?.status === 'down';

  if (dbDown && redisDown) {
    return { service: 'database+redis', cause: 'PostgreSQL and Redis dependencies unavailable' };
  }
  if (dbDown) {
    return { service: 'database', cause: 'PostgreSQL database unreachable or query timeout' };
  }
  if (redisDown) {
    return { service: 'redis', cause: 'Redis cache unreachable or ping timeout' };
  }
  return { service: 'server', cause: healthResult.message || 'Health check error' };
}

/**
 * Records a single health check execution, updates metrics, and tracks outage intervals.
 */
async function recordCheckResult(healthResult, options = {}) {
  const timestamp = healthResult.timestamp || new Date().toISOString();
  metrics.lastCheckAt = timestamp;
  metrics.totalChecks += 1;

  const isHealthy = healthResult.status === 'success' && healthResult.httpCode === 200;

  if (isHealthy) {
    metrics.successfulChecks += 1;

    // If an incident was active, it is now resolved
    if (activeIncident) {
      const recoveredAt = timestamp;
      const startedTime = new Date(activeIncident.startedAt).getTime();
      const recoveredTime = new Date(recoveredAt).getTime();
      const durationSeconds = Math.max(0, Math.round(((recoveredTime - startedTime) / 1000) * 100) / 100);

      const resolved = {
        ...activeIncident,
        status: 'RESOLVED',
        recoveredAt,
        durationSeconds,
      };

      incidents.push(resolved);
      activeIncident = null;
      await syncIncidentRecoveryToDb(resolved);
    }
  } else {
    metrics.failedChecks += 1;

    // If not currently in an active incident, start a new one
    if (!activeIncident) {
      const { service, cause } = identifyFailure(healthResult);
      activeIncident = {
        id: nextIncidentId++,
        service,
        status: 'OPEN',
        startedAt: timestamp,
        failureCause: cause,
      };
      await syncIncidentStartToDb(activeIncident);
    }
  }

  saveStateToFile(options.stateFilePath);
}

/**
 * Executes a single poll cycle against health checks.
 * Prevents overlapping poll cycles.
 */
function runPollCycle(options = {}) {
  if (activePoll) return activePoll;

  activePoll = (async () => {
    try {
      const checker = options.healthChecker || healthService.checkHealth;
      const result = await checker({ timeoutMs: options.timeoutMs || 2500 });
      await recordCheckResult(result, options);
      return result;
    } catch (error) {
      const fallbackResult = {
        status: 'error',
        httpCode: 503,
        message: 'Poller failed to execute health check',
        timestamp: new Date().toISOString(),
        services: {
          database: { status: 'down' },
          redis: { status: 'down' },
        },
      };
      await recordCheckResult(fallbackResult, options);
      return fallbackResult;
    } finally {
      activePoll = null;
    }
  })();

  return activePoll;
}

/**
 * Starts the 60-second background availability poller.
 * Does not block application startup.
 */
function startAvailabilityPoller(options = {}) {
  if (pollerTimer || initialImmediate) return;

  loadStateFromFile(options.stateFilePath);

  const intervalMs =
    options.intervalMs ||
    parseInt(process.env.AVAILABILITY_POLL_INTERVAL_MS, 10) ||
    DEFAULT_POLL_INTERVAL_MS;

  // Execute initial check without blocking startup
  initialImmediate = setImmediate(() => {
    initialImmediate = null;
    runPollCycle(options);
  });

  pollerTimer = setInterval(() => {
    runPollCycle(options);
  }, intervalMs);

  if (typeof pollerTimer.unref === 'function') {
    pollerTimer.unref();
  }
}

/**
 * Gracefully stops the availability poller.
 */
async function stopAvailabilityPoller() {
  if (initialImmediate) {
    clearImmediate(initialImmediate);
    initialImmediate = null;
  }
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
  if (activePoll) {
    try {
      await activePoll;
    } catch {
      // Ignore poll error during shutdown
    }
  }
}

/**
 * Computes availability percentage and uptime report against NFR-004 targets.
 */
function getAvailabilitySummary(query = {}) {
  const total = metrics.totalChecks;
  const successful = metrics.successfulChecks;
  const failed = metrics.failedChecks;

  const availabilityPercentage =
    total === 0 ? 100.0 : Math.round((successful / total) * 10000) / 100;

  const meetsTarget = availabilityPercentage >= AVAILABILITY_TARGET_PERCENT;

  return {
    target: `${AVAILABILITY_TARGET_PERCENT}%`,
    meetsTarget,
    availabilityPercentage,
    totalChecks: total,
    successfulChecks: successful,
    failedChecks: failed,
    lastCheckAt: metrics.lastCheckAt,
    activeIncident: activeIncident ? { ...activeIncident } : null,
    incidents: [...incidents].reverse(),
  };
}

function isPollerRunning() {
  return pollerTimer !== null;
}

function resetAvailabilityState(options = {}) {
  if (initialImmediate) {
    clearImmediate(initialImmediate);
    initialImmediate = null;
  }
  metrics = {
    totalChecks: 0,
    successfulChecks: 0,
    failedChecks: 0,
    lastCheckAt: null,
  };
  activeIncident = null;
  incidents = [];
  nextIncidentId = 1;

  const filePath = options.stateFilePath || getDefaultStateFilePath();
  blockedSavePaths.delete(filePath);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup error
  }
}

function isWriteBlocked(filePath = getDefaultStateFilePath()) {
  return blockedSavePaths.has(filePath);
}

// Initial state load
loadStateFromFile();

module.exports = {
  startAvailabilityPoller,
  stopAvailabilityPoller,
  runPollCycle,
  recordCheckResult,
  getAvailabilitySummary,
  loadStateFromFile,
  saveStateToFile,
  isPollerRunning,
  resetAvailabilityState,
  isWriteBlocked,
  DEFAULT_POLL_INTERVAL_MS,
  AVAILABILITY_TARGET_PERCENT,
};
