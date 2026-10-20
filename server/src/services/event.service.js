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

function matches(event, f) {
  if (!PUBLIC_STATUSES.includes(event.status)) return false;
  if (f.category && event.category.toLowerCase() !== f.category) return false;
  if (f.venue && !event.venue.toLowerCase().includes(f.venue)) return false;

  const date = new Date(event.eventDate);
  if (f.startDate && date < f.startDate) return false;
  if (f.endDate && date > f.endDate) return false;

  if (f.search) {
    const text = `${event.title} ${event.description} ${event.venue} ${event.category}`.toLowerCase();
    if (!text.includes(f.search)) return false;
  }

  if (f.minPrice !== null || f.maxPrice !== null) {
    const inRange = event.tiers.some(
      (t) => (f.minPrice === null || t.price >= f.minPrice) && (f.maxPrice === null || t.price <= f.maxPrice)
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
async function searchEvents(query) {
  const filters = parseFilters(query);
  const all = await EventModel.findAll();
  const matched = all
    .filter((e) => matches(e, filters))
    .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));

  const start = (filters.page - 1) * filters.limit;
  return {
    total: matched.length,
    page: filters.page,
    limit: filters.limit,
    events: matched.slice(start, start + filters.limit).map(toSummary),
  };
}

/**
 * Public event detail. Events that are not on sale are hidden (404).
 */
async function getPublicEvent(id) {
  const event = await EventModel.findById(id);
  if (!event || !PUBLIC_STATUSES.includes(event.status)) {
    throw new EventError(404, 'EVENT_NOT_FOUND', 'Event not found');
  }
  return event;
}

async function listCategories() {
  const all = await EventModel.findAll();
  return [...new Set(all.filter((e) => PUBLIC_STATUSES.includes(e.status)).map((e) => e.category))].sort();
}

module.exports = {
  EventError,
  PUBLIC_STATUSES,
  parseFilters,
  searchEvents,
  getPublicEvent,
  listCategories,
};
