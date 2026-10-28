/**
 * Synthetic catalog for NFR-001 performance runs.
 */
const EventModel = require('../../src/models/event.model');

const CATEGORIES = ['Tech', 'Music', 'Sports', 'Cultural', 'Workshop', 'Comedy', 'Food', 'Art'];
const VENUES = ['Main Auditorium', 'Open Air Amphitheatre', 'Seminar Hall 3', 'Black Box Theatre', 'Sports Ground'];
const STATUSES = ['PUBLISHED', 'PUBLISHED', 'PUBLISHED', 'LIVE', 'DRAFT', 'PENDING_APPROVAL'];

async function seedPerfEvents(count = 10000) {
  await EventModel.clearAll();
  const base = Date.UTC(2026, 10, 1);
  for (let i = 0; i < count; i += 1) {
    const price = (i % 20) * 50;
    await EventModel.insert({
      id: `EVT-PERF-${i}`,
      organizerId: 'USR-ORG-001',
      title: `Event ${i} ${CATEGORIES[i % CATEGORIES.length]} night`,
      description: `Synthetic event number ${i} for load testing`,
      category: CATEGORIES[i % CATEGORIES.length],
      venue: `${VENUES[i % VENUES.length]}, Block ${i % 7}`,
      eventDate: new Date(base + (i % 365) * 86400000).toISOString(),
      capacity: 500,
      status: STATUSES[i % STATUSES.length],
      isFlagged: false,
      notices: [],
      tiers: [
        { id: `T-${i}-G`, name: 'General', price, quota: 400, sold: i % 400, maxPerOrder: 5 },
        { id: `T-${i}-V`, name: 'VIP', price: price + 500, quota: 100, sold: 0, maxPerOrder: 2 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

// Mixed query set: single filters, combined filters and no filter
const QUERIES = [
  '',
  'category=Tech',
  'search=night',
  'venue=amphitheatre',
  'startDate=2027-01-01&endDate=2027-03-31',
  'minPrice=200&maxPrice=600',
  'category=Music&maxPrice=300&search=event%2012',
  'search=block%203&page=3',
  'category=Food&venue=seminar&startDate=2026-12-01',
  'search=no-such-event',
];

module.exports = { seedPerfEvents, QUERIES };
