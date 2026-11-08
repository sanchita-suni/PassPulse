/**
 * Admin moderation (FR-019, SEC-005): approve, reject, flag or remove events and
 * deactivate or reactivate accounts. Every event action is kept on the
 * event's moderation history and audited in the audit trail.
 */
const EventModel = require('../models/event.model');
const UserModel = require('../models/user.model');
const { EventError, changeStatus } = require('./event.service');
const auditService = require('./audit.service');

function adminId(user) {
  return (user && (user.id || user.userId)) || null;
}

function cleanReason(reason) {
  return typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
}

async function loadEvent(id) {
  const event = await EventModel.findById(id);
  if (!event) throw new EventError(404, 'EVENT_NOT_FOUND', 'Event not found');
  return event;
}

async function record(event, admin, action, reason, changes = {}) {
  const entry = { action, by: adminId(admin), reason: reason || null, at: new Date().toISOString() };
  const fresh = await EventModel.findById(event.id);
  return EventModel.save({
    ...fresh,
    ...changes,
    moderation: [...(fresh.moderation || []), entry],
  });
}

async function listEvents({ status, flagged } = {}) {
  const all = await EventModel.findAll();
  return all
    .filter((e) => !status || e.status === String(status).toUpperCase())
    .filter((e) => flagged === undefined || String(e.isFlagged) === String(flagged))
    .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
}

async function approveEvent(id, admin, ipAddress) {
  const event = await loadEvent(id);
  await changeStatus(id, 'PUBLISHED', admin);
  const updated = await record(event, admin, 'APPROVED');
  await auditService.recordAudit({
    actorId: adminId(admin),
    action: 'EVENT_APPROVED',
    target: id,
    ipAddress,
  });
  return updated;
}

async function rejectEvent(id, admin, reason, ipAddress) {
  const event = await loadEvent(id);
  const why = cleanReason(reason);
  if (!why) throw new EventError(400, 'VALIDATION_ERROR', 'reason is required to reject an event');
  await changeStatus(id, 'DRAFT', admin);
  const updated = await record(event, admin, 'REJECTED', why);
  await auditService.recordAudit({
    actorId: adminId(admin),
    action: 'EVENT_REJECTED',
    target: id,
    ipAddress,
  });
  return updated;
}

async function flagEvent(id, admin, reason, ipAddress) {
  const event = await loadEvent(id);
  const why = cleanReason(reason);
  if (!why) throw new EventError(400, 'VALIDATION_ERROR', 'reason is required to flag an event');
  if (event.isFlagged) throw new EventError(409, 'ALREADY_FLAGGED', 'Event is already flagged');
  const updated = await record(event, admin, 'FLAGGED', why, { isFlagged: true, flagReason: why });
  await auditService.recordAudit({
    actorId: adminId(admin),
    action: 'EVENT_FLAGGED',
    target: id,
    ipAddress,
  });
  return updated;
}

async function unflagEvent(id, admin, ipAddress) {
  const event = await loadEvent(id);
  if (!event.isFlagged) throw new EventError(409, 'NOT_FLAGGED', 'Event is not flagged');
  const updated = await record(event, admin, 'UNFLAGGED', null, { isFlagged: false, flagReason: null });
  await auditService.recordAudit({
    actorId: adminId(admin),
    action: 'EVENT_UNFLAGGED',
    target: id,
    ipAddress,
  });
  return updated;
}

/**
 * Removing an event cancels it. Any ticket holders are notified (BR-006).
 */
async function removeEvent(id, admin, reason, ipAddress) {
  const event = await loadEvent(id);
  const why = cleanReason(reason);
  if (!why) throw new EventError(400, 'VALIDATION_ERROR', 'reason is required to remove an event');
  if (['COMPLETED', 'CANCELLED'].includes(event.status)) {
    throw new EventError(409, 'EVENT_CLOSED', `Event is already ${event.status}`);
  }
  await changeStatus(id, 'CANCELLED', admin, { notifyHolders: true });
  const updated = await record(event, admin, 'REMOVED', why);
  await auditService.recordAudit({
    actorId: adminId(admin),
    action: 'EVENT_REMOVED',
    target: id,
    ipAddress,
  });
  return updated;
}

function sanitize(user) {
  const { passwordHash, ...safe } = user;
  return { ...safe, isActive: user.isActive !== false };
}

function listUsers() {
  return UserModel.getAllUsers().map(sanitize);
}

async function setUserActive(id, admin, isActive, ipAddress) {
  if (!isActive && id === adminId(admin)) {
    throw new EventError(400, 'VALIDATION_ERROR', 'You cannot deactivate your own account');
  }
  const user = await UserModel.setActive(id, isActive);
  if (!user) throw new EventError(404, 'USER_NOT_FOUND', 'User not found');
  await auditService.recordAudit({
    actorId: adminId(admin),
    action: isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
    target: id,
    ipAddress,
  });
  return sanitize(user);
}

async function listAuditLogs(query) {
  return auditService.getAuditLogs(query);
}

module.exports = {
  listEvents,
  approveEvent,
  rejectEvent,
  flagEvent,
  unflagEvent,
  removeEvent,
  listUsers,
  setUserActive,
  listAuditLogs,
};
