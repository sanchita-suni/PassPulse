const EventModel = require('../models/event.model');

const PUBLIC_STATUSES = ['PUBLISHED', 'LIVE'];
const MAX_LIMIT = 50;

class EventError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function parseDate(value, name) {
  if (value === undefined || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new EventError(400, 'INVALID_FILTER', `${name} must be a valid date`);
  }
  return d;
}

function parsePrice(value, name) {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new EventError(400, 'INVALID_FILTER', `${name} must be a number of 0 or more`);
  }
  return n;
}

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Normalises and validates catalog query parameters (FR-004).
 * Accepts startDate/endDate and the shorter from/to aliases.
 */
function parseFilters(query = {}) {
  const filters = {
    search: (query.search || query.q || '').toString().trim().toLowerCase(),
    category: (query.category || '').toString().trim().toLowerCase(),
    venue: (query.venue || '').toString().trim().toLowerCase(),
    startDate: parseDate(query.startDate ?? query.from, 'startDate'),
    endDate: parseDate(query.endDate ?? query.to, 'endDate'),
    minPrice: parsePrice(query.minPrice, 'minPrice'),
    maxPrice: parsePrice(query.maxPrice, 'maxPrice'),
    page: parsePositiveInt(query.page, 1),
    limit: Math.min(parsePositiveInt(query.limit, 20), MAX_LIMIT),
  };

  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    throw new EventError(400, 'INVALID_FILTER', 'startDate must be before endDate');
  }
  if (filters.minPrice !== null && filters.maxPrice !== null && filters.minPrice > filters.maxPrice) {
    throw new EventError(400, 'INVALID_FILTER', 'minPrice must not be greater than maxPrice');
  }
  return filters;
}

function isPublic(event) {
  return PUBLIC_STATUSES.includes(event.status) && !event.isFlagged;
}

/**
 * NFR-001: the catalog is served from an index of public events that is rebuilt
 * only when the event store changes. Each entry keeps the lower-cased search
 * text, timestamp and tier prices so a query is a single pass with no cloning,
 * and entries are pre-sorted by date. A category map narrows the scan when the
 * category filter is used.
 */
let searchIndex = { version: -1, entries: [], byCategory: new Map() };

async function getSearchIndex() {
  const current = EventModel.getVersion();
  if (searchIndex.version === current) return searchIndex;

  const all = await EventModel.findAll();
  const entries = all
    .filter(isPublic)
    .map((event) => ({
      summary: toSummary(event),
      text: `${event.title} ${event.description} ${event.venue} ${event.category}`.toLowerCase(),
      venue: event.venue.toLowerCase(),
      category: event.category.toLowerCase(),
      time: new Date(event.eventDate).getTime(),
      prices: event.tiers.map((t) => t.price),
    }))
    .sort((a, b) => a.time - b.time);

  const byCategory = new Map();
  for (const entry of entries) {
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
    byCategory.get(entry.category).push(entry);
  }
  searchIndex = { version: current, entries, byCategory };
  return searchIndex;
}

function matches(entry, f) {
  if (f.venue && !entry.venue.includes(f.venue)) return false;
  if (f.startDate && entry.time < f.startDate.getTime()) return false;
  if (f.endDate && entry.time > f.endDate.getTime()) return false;
  if (f.search && !entry.text.includes(f.search)) return false;
  if (f.minPrice !== null || f.maxPrice !== null) {
    const inRange = entry.prices.some(
      (p) => (f.minPrice === null || p >= f.minPrice) && (f.maxPrice === null || p <= f.maxPrice)
    );
    if (!inRange) return false;
  }
  return true;
}

/**
 * Catalog card shape: event fields plus price range and seats left.
 */
function toSummary(event) {
  const prices = event.tiers.map((t) => t.price);
  return {
    id: event.id,
    title: event.title,
    category: event.category,
    venue: event.venue,
    eventDate: event.eventDate,
    status: event.status,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    seatsAvailable: event.tiers.reduce((sum, t) => sum + t.available, 0),
  };
}

/**
 * FR-004: returns PUBLISHED or LIVE events matching every supplied filter,
 * soonest first, paginated.
 */
// Recent results keyed by normalised filters; cleared whenever the index is rebuilt.
const RESULT_CACHE_SIZE = 500;
const resultCache = new Map();
let resultCacheVersion = -1;

function cacheKey(f) {
  return JSON.stringify([
    f.search,
    f.category,
    f.venue,
    f.startDate && f.startDate.getTime(),
    f.endDate && f.endDate.getTime(),
    f.minPrice,
    f.maxPrice,
    f.page,
    f.limit,
  ]);
}

async function searchEvents(query) {
  const filters = parseFilters(query);
  const index = await getSearchIndex();

  if (resultCacheVersion !== index.version) {
    resultCache.clear();
    resultCacheVersion = index.version;
  }
  const key = cacheKey(filters);
  let result = resultCache.get(key);

  if (!result) {
    const pool = filters.category ? index.byCategory.get(filters.category) || [] : index.entries;
    const matched = pool.filter((entry) => matches(entry, filters));
    const start = (filters.page - 1) * filters.limit;
    result = {
      total: matched.length,
      page: filters.page,
      limit: filters.limit,
      events: matched.slice(start, start + filters.limit).map((entry) => entry.summary),
    };
    if (resultCache.size >= RESULT_CACHE_SIZE) {
      resultCache.delete(resultCache.keys().next().value);
    }
    resultCache.set(key, result);
  }

  return { ...result, events: result.events.map((e) => ({ ...e })) };
}

/**
 * Public event detail. Events that are not on sale are hidden (404).
 */
async function getPublicEvent(id) {
  const event = await EventModel.findById(id);
  if (!event || !isPublic(event)) {
    throw new EventError(404, 'EVENT_NOT_FOUND', 'Event not found');
  }
  return event;
}

async function listCategories() {
  const index = await getSearchIndex();
  return [...new Set(index.entries.map((e) => e.summary.category))].sort();
}


const EDITABLE_FIELDS = ['title', 'description', 'category', 'venue', 'eventDate', 'capacity'];
const CLOSED_STATUSES = ['COMPLETED', 'CANCELLED'];

function newEventId() {
  return `EVT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function actorId(user) {
  return user.id || user.userId;
}

function isAdmin(user) {
  return (user.role || '').toUpperCase() === 'ADMIN';
}

/**
 * Validates event fields. With partial=true only the supplied fields are checked (edits).
 */
function validateEventInput(input, { partial = false } = {}) {
  const errors = [];
  const out = {};

  for (const field of ['title', 'category', 'venue']) {
    if (input[field] !== undefined || !partial) {
      const value = typeof input[field] === 'string' ? input[field].trim() : '';
      if (!value) errors.push(`${field} is required`);
      else if (value.length > 200) errors.push(`${field} must be at most 200 characters`);
      else out[field] = value;
    }
  }

  if (input.description !== undefined) {
    out.description = String(input.description).trim().slice(0, 2000);
  } else if (!partial) {
    out.description = '';
  }

  if (input.eventDate !== undefined || !partial) {
    const d = new Date(input.eventDate);
    if (!input.eventDate || Number.isNaN(d.getTime())) errors.push('eventDate must be a valid date');
    else if (d.getTime() <= Date.now()) errors.push('eventDate must be in the future');
    else out.eventDate = d.toISOString();
  }

  if (input.capacity !== undefined || !partial) {
    const c = Number(input.capacity);
    if (!Number.isInteger(c) || c <= 0) errors.push('capacity must be a whole number greater than 0');
    else out.capacity = c;
  }

  if (errors.length) {
    const err = new EventError(400, 'VALIDATION_ERROR', errors.join('; '));
    err.details = errors;
    throw err;
  }
  return out;
}

/**
 * Loads an event the caller may manage: its organizer, or an admin.
 */
async function getManageableEvent(id, user) {
  const event = await EventModel.findById(id);
  if (!event) throw new EventError(404, 'EVENT_NOT_FOUND', 'Event not found');
  if (!isAdmin(user) && event.organizerId !== actorId(user)) {
    throw new EventError(403, 'NOT_EVENT_OWNER', 'You can only manage your own events');
  }
  return event;
}

/**
 * FR-005: a new event is always saved as DRAFT and owned by the caller.
 */
async function createEvent(input, user) {
  const fields = validateEventInput(input);
  const now = new Date().toISOString();
  return EventModel.insert({
    id: newEventId(),
    organizerId: actorId(user),
    ...fields,
    status: 'DRAFT',
    isFlagged: false,
    tiers: [],
    notices: [],
    createdAt: now,
    updatedAt: now,
  });
}

async function listOrganizerEvents(user) {
  const all = await EventModel.findAll();
  return all
    .filter((e) => isAdmin(user) || e.organizerId === actorId(user))
    .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
}

/**
 * FR-005: edit title, description, category, venue, date/time or capacity.
 */
async function updateEvent(id, input, user) {
  const event = await getManageableEvent(id, user);
  if (CLOSED_STATUSES.includes(event.status)) {
    throw new EventError(409, 'EVENT_CLOSED', `A ${event.status} event cannot be edited`);
  }
  const supplied = Object.fromEntries(Object.entries(input).filter(([k]) => EDITABLE_FIELDS.includes(k)));
  if (Object.keys(supplied).length === 0) {
    throw new EventError(400, 'VALIDATION_ERROR', `Provide at least one of: ${EDITABLE_FIELDS.join(', ')}`);
  }
  const changes = validateEventInput(supplied, { partial: true });

  const tierQuota = event.tiers.reduce((sum, t) => sum + t.quota, 0);
  if (changes.capacity !== undefined && changes.capacity < tierQuota) {
    throw new EventError(400, 'VALIDATION_ERROR', `capacity cannot be below the total tier quota (${tierQuota})`);
  }

  const notices = [...event.notices];
  if (changes.eventDate && changes.eventDate !== event.eventDate) {
    const notice = requireHolderNotice(
      event,
      input.notifyHolders,
      'DATE_CHANGED',
      `${event.title} has moved to ${changes.eventDate}`
    );
    if (notice) notices.push(notice);
  }

  return EventModel.save({ ...event, ...changes, notices });
}

function ticketsSold(event) {
  return event.tiers.reduce((sum, t) => sum + t.sold, 0);
}

/**
 * BR-006: once tickets are sold, a date change or cancellation must notify
 * every ticket holder. Returns the notice to record, or null if none is needed.
 */
function requireHolderNotice(event, notifyHolders, type, message) {
  const sold = ticketsSold(event);
  if (sold === 0) return null;
  if (notifyHolders !== true) {
    throw new EventError(
      409,
      'BOOKINGS_EXIST',
      `${sold} ticket(s) are sold. Send notifyHolders: true to notify ticket holders of this change`
    );
  }
  return { type, message, recipients: sold, sentAt: new Date().toISOString() };
}

/**
 * FR-006: move an event to a new lifecycle state.
 */
async function changeStatus(id, to, user, { notifyHolders } = {}) {
  // Required here because event_state.service imports EventError from this module.
  const { assertTransition } = require('./event_state.service');
  const event = await getManageableEvent(id, user);
  const target = String(to || '').toUpperCase();
  assertTransition(event, target, user.role);

  const notices = [...event.notices];
  if (target === 'CANCELLED') {
    const notice = requireHolderNotice(event, notifyHolders, 'CANCELLED', `${event.title} has been cancelled`);
    if (notice) notices.push(notice);
  }
  return EventModel.save({ ...event, status: target, notices });
}

/**
 * FR-005: organizer cancels an event that has not finished.
 */
async function cancelEvent(id, user, options = {}) {
  const event = await getManageableEvent(id, user);
  if (CLOSED_STATUSES.includes(event.status)) {
    throw new EventError(409, 'EVENT_CLOSED', `Event is already ${event.status}`);
  }
  return changeStatus(id, 'CANCELLED', user, options);
}

module.exports = {
  EventError,
  PUBLIC_STATUSES,
  parseFilters,
  searchEvents,
  getPublicEvent,
  listCategories,
  validateEventInput,
  getManageableEvent,
  createEvent,
  listOrganizerEvents,
  updateEvent,
  cancelEvent,
  changeStatus,
  ticketsSold,
};
