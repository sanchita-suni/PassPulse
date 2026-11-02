/**
 * Ticket tier configuration (FR-007, BR-001).
 * Tiers belong to an event and carry their own price, quota and per-order limit.
 */
const EventModel = require('../models/event.model');
const { EventError, getManageableEvent } = require('./event.service');

const MAX_TICKETS_PER_ORDER = 5; // BR-001

function newTierId() {
  return `TIER-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function validateTier(input, { partial = false } = {}) {
  const errors = [];
  const out = {};

  if (input.name !== undefined || !partial) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) errors.push('name is required');
    else if (name.length > 60) errors.push('name must be at most 60 characters');
    else out.name = name;
  }

  if (input.price !== undefined || !partial) {
    const price = Number(input.price);
    if (input.price === null || input.price === '' || !Number.isFinite(price)) errors.push('price must be a number');
    else if (price < 0) errors.push('price cannot be negative');
    else out.price = Math.round(price * 100) / 100;
  }

  if (input.quota !== undefined || !partial) {
    const quota = Number(input.quota);
    if (!Number.isInteger(quota) || quota <= 0) errors.push('quota must be a whole number greater than 0');
    else out.quota = quota;
  }

  if (input.maxPerOrder !== undefined) {
    const max = Number(input.maxPerOrder);
    if (!Number.isInteger(max) || max < 1 || max > MAX_TICKETS_PER_ORDER) {
      errors.push(`maxPerOrder must be between 1 and ${MAX_TICKETS_PER_ORDER}`);
    } else out.maxPerOrder = max;
  } else if (!partial) {
    out.maxPerOrder = MAX_TICKETS_PER_ORDER;
  }

  if (errors.length) throw new EventError(400, 'VALIDATION_ERROR', errors.join('; '));
  return out;
}

function assertEditable(event) {
  if (['COMPLETED', 'CANCELLED'].includes(event.status)) {
    throw new EventError(409, 'EVENT_CLOSED', `Tiers of a ${event.status} event cannot be changed`);
  }
}

function assertUniqueName(event, name, exceptId) {
  const clash = event.tiers.find((t) => t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new EventError(409, 'TIER_EXISTS', `A tier named "${name}" already exists for this event`);
}

function assertWithinCapacity(event, tiers) {
  const total = tiers.reduce((sum, t) => sum + t.quota, 0);
  if (total > event.capacity) {
    throw new EventError(
      400,
      'QUOTA_EXCEEDS_CAPACITY',
      `Total tier quota (${total}) cannot exceed event capacity (${event.capacity})`
    );
  }
}

function findTier(event, tierId) {
  const tier = event.tiers.find((t) => t.id === tierId);
  if (!tier) throw new EventError(404, 'TIER_NOT_FOUND', 'Tier not found');
  return tier;
}

async function listTiers(eventId, user) {
  const event = await getManageableEvent(eventId, user);
  return event.tiers;
}

async function addTier(eventId, input, user) {
  const event = await getManageableEvent(eventId, user);
  assertEditable(event);
  const fields = validateTier(input);
  assertUniqueName(event, fields.name);
  const tier = { id: newTierId(), ...fields, sold: 0 };
  const tiers = [...event.tiers, tier];
  assertWithinCapacity(event, tiers);
  const saved = await EventModel.save({ ...event, tiers });
  return saved.tiers.find((t) => t.id === tier.id);
}

async function updateTier(eventId, tierId, input, user) {
  const event = await getManageableEvent(eventId, user);
  assertEditable(event);
  const tier = findTier(event, tierId);
  const changes = validateTier(input, { partial: true });
  if (Object.keys(changes).length === 0) {
    throw new EventError(400, 'VALIDATION_ERROR', 'Provide at least one of: name, price, quota, maxPerOrder');
  }
  if (changes.name) assertUniqueName(event, changes.name, tierId);
  if (changes.quota !== undefined && changes.quota < tier.sold) {
    throw new EventError(400, 'VALIDATION_ERROR', `quota cannot be below tickets already sold (${tier.sold})`);
  }
  const tiers = event.tiers.map((t) => (t.id === tierId ? { ...t, ...changes } : t));
  assertWithinCapacity(event, tiers);
  const saved = await EventModel.save({ ...event, tiers });
  return saved.tiers.find((t) => t.id === tierId);
}

async function removeTier(eventId, tierId, user) {
  const event = await getManageableEvent(eventId, user);
  assertEditable(event);
  const tier = findTier(event, tierId);
  if (tier.sold > 0) {
    throw new EventError(409, 'TIER_HAS_SALES', 'A tier with sold tickets cannot be removed');
  }
  await EventModel.save({ ...event, tiers: event.tiers.filter((t) => t.id !== tierId) });
}

module.exports = { MAX_TICKETS_PER_ORDER, validateTier, listTiers, addTier, updateTier, removeTier };
