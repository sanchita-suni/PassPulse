/**
 * Admin moderation (FR-019): approve, reject, flag or remove events and
 * deactivate or reactivate accounts. Every event action is kept on the
 * event's moderation history.
 */
const EventModel = require('../models/event.model');
const UserModel = require('../models/user.model');
const { EventError, changeStatus } = require('./event.service');

function adminId(user) {
  return user.id || user.userId;
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

async function approveEvent(id, admin) {
  const event = await loadEvent(id);
  await changeStatus(id, 'PUBLISHED', admin);
  return record(event, admin, 'APPROVED');
}

async function rejectEvent(id, admin, reason) {
  const event = await loadEvent(id);
  const why = cleanReason(reason);
  if (!why) throw new EventError(400, 'VALIDATION_ERROR', 'reason is required to reject an event');
  await changeStatus(id, 'DRAFT', admin);
  return record(event, admin, 'REJECTED', why);
}

async function flagEvent(id, admin, reason) {
  const event = await loadEvent(id);
  const why = cleanReason(reason);
  if (!why) throw new EventError(400, 'VALIDATION_ERROR', 'reason is required to flag an event');
  if (event.isFlagged) throw new EventError(409, 'ALREADY_FLAGGED', 'Event is already flagged');
  return record(event, admin, 'FLAGGED', why, { isFlagged: true, flagReason: why });
}

async function unflagEvent(id, admin) {
  const event = await loadEvent(id);
  if (!event.isFlagged) throw new EventError(409, 'NOT_FLAGGED', 'Event is not flagged');
  return record(event, admin, 'UNFLAGGED', null, { isFlagged: false, flagReason: null });
}

/**
 * Removing an event cancels it. Any ticket holders are notified (BR-006).
 */
async function removeEvent(id, admin, reason) {
  const event = await loadEvent(id);
  const why = cleanReason(reason);
  if (!why) throw new EventError(400, 'VALIDATION_ERROR', 'reason is required to remove an event');
  if (['COMPLETED', 'CANCELLED'].includes(event.status)) {
    throw new EventError(409, 'EVENT_CLOSED', `Event is already ${event.status}`);
  }
  await changeStatus(id, 'CANCELLED', admin, { notifyHolders: true });
  return record(event, admin, 'REMOVED', why);
}

function sanitize(user) {
  const { passwordHash, ...safe } = user;
  return { ...safe, isActive: user.isActive !== false };
}

function listUsers() {
  return UserModel.getAllUsers().map(sanitize);
}

async function setUserActive(id, admin, isActive) {
  if (!isActive && id === adminId(admin)) {
    throw new EventError(400, 'VALIDATION_ERROR', 'You cannot deactivate your own account');
  }
  const user = await UserModel.setActive(id, isActive);
  if (!user) throw new EventError(404, 'USER_NOT_FOUND', 'User not found');
  return sanitize(user);
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
};
