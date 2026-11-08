const db = require('../config/db');

const AUDIT_ACTIONS = Object.freeze({
  LOGIN_FAILED: 'LOGIN_FAILED',
  CHECK_IN_REJECTED: 'CHECK_IN_REJECTED',
  CHECK_IN_ACCEPTED: 'CHECK_IN_ACCEPTED',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  EVENT_APPROVED: 'EVENT_APPROVED',
  EVENT_REJECTED: 'EVENT_REJECTED',
  EVENT_FLAGGED: 'EVENT_FLAGGED',
  EVENT_UNFLAGGED: 'EVENT_UNFLAGGED',
  EVENT_REMOVED: 'EVENT_REMOVED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_REACTIVATED: 'USER_REACTIVATED',
  USER_PROVISIONED: 'USER_PROVISIONED',
});

// In-memory buffer for isolated test environments when database pool is not initialized
const inMemoryAuditLogs = [];
let memoryIdCounter = 1;
let forceMemoryStore = false;

function cleanString(str, maxLen = 255) {
  if (typeof str !== 'string') return null;
  const trimmed = str.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLen) : null;
}

function shouldUseDatabase() {
  if (forceMemoryStore) {
    return false;
  }
  if (process.env.NODE_ENV !== 'test') {
    return true;
  }
  return db.isPoolInitialized();
}

function mapDbRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    target: row.target,
    ipAddress: row.ip_address,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

/**
 * Records an immutable audit log entry (SEC-005).
 * Uses PostgreSQL in production or when pool is available.
 * Uses isolated in-memory buffer in testing when pool is not initialized.
 * Does not silently fallback to in-memory store when database query fails.
 */
async function recordAudit({ actorId, action, target, ipAddress, client } = {}) {
  if (!action || typeof action !== 'string') {
    throw new Error('Audit action must be a non-empty string');
  }

  const sanitizedActorId = cleanString(actorId, 100);
  const sanitizedAction = cleanString(action, 100);
  const sanitizedTarget = cleanString(target, 500);
  const sanitizedIp = cleanString(ipAddress, 100);

  if (client && typeof client.query === 'function') {
    const res = await client.query(
      `INSERT INTO audit_log (actor_id, action, target, ip_address)
       VALUES ((SELECT id FROM users WHERE id = $1), $2, $3, $4)
       RETURNING id, actor_id, action, target, ip_address, created_at`,
      [sanitizedActorId, sanitizedAction, sanitizedTarget, sanitizedIp]
    );
    return mapDbRow(res.rows[0]);
  }

  if (shouldUseDatabase()) {
    const pool = db.getPool();
    const res = await pool.query(
      `INSERT INTO audit_log (actor_id, action, target, ip_address)
       VALUES ((SELECT id FROM users WHERE id = $1), $2, $3, $4)
       RETURNING id, actor_id, action, target, ip_address, created_at`,
      [sanitizedActorId, sanitizedAction, sanitizedTarget, sanitizedIp]
    );
    return mapDbRow(res.rows[0]);
  }

  const entry = {
    id: memoryIdCounter++,
    actorId: sanitizedActorId,
    action: sanitizedAction,
    target: sanitizedTarget,
    ipAddress: sanitizedIp,
    createdAt: new Date().toISOString(),
  };
  inMemoryAuditLogs.push(entry);
  return { ...entry };
}

/**
 * Retrieves audit log records for administrative review (SEC-005 AC-3).
 * Supports pagination (limit, offset) and optional filters (action, actorId, target).
 */
async function getAuditLogs({ limit, offset, action, actorId, target } = {}) {
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);
  const filterAction = cleanString(action, 100);
  const filterActorId = cleanString(actorId, 100);
  const filterTarget = cleanString(target, 500);

  if (shouldUseDatabase()) {
    const pool = db.getPool();
    const conditions = [];
    const params = [];

    if (filterAction) {
      params.push(filterAction);
      conditions.push(`action = $${params.length}`);
    }
    if (filterActorId) {
      params.push(filterActorId);
      conditions.push(`actor_id = $${params.length}`);
    }
    if (filterTarget) {
      params.push(filterTarget);
      conditions.push(`target = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_log ${whereClause}`,
      params
    );
    const total = Number(countRes.rows[0]?.total || 0);

    const dataParams = [...params, parsedLimit, parsedOffset];
    const dataRes = await pool.query(
      `SELECT id, actor_id, action, target, ip_address, created_at
       FROM audit_log
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    return {
      total,
      limit: parsedLimit,
      offset: parsedOffset,
      auditLogs: dataRes.rows.map(mapDbRow),
    };
  }

  let filtered = [...inMemoryAuditLogs];
  if (filterAction) {
    filtered = filtered.filter((log) => log.action === filterAction);
  }
  if (filterActorId) {
    filtered = filtered.filter((log) => log.actorId === filterActorId);
  }
  if (filterTarget) {
    filtered = filtered.filter((log) => log.target === filterTarget);
  }

  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id - a.id);

  const total = filtered.length;
  const auditLogs = filtered.slice(parsedOffset, parsedOffset + parsedLimit);

  return {
    total,
    limit: parsedLimit,
    offset: parsedOffset,
    auditLogs: auditLogs.map((log) => ({ ...log })),
  };
}

function clearInMemoryLogs() {
  inMemoryAuditLogs.length = 0;
  memoryIdCounter = 1;
}

function getInMemoryLogs() {
  return [...inMemoryAuditLogs];
}

function setForceMemoryStore(value) {
  forceMemoryStore = Boolean(value);
}

module.exports = {
  AUDIT_ACTIONS,
  recordAudit,
  getAuditLogs,
  clearInMemoryLogs,
  getInMemoryLogs,
  setForceMemoryStore,
};
