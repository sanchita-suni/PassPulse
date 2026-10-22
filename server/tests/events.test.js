/**
 * FR-004 catalog search and filtering (TC-EVT-01, TC-EVT-02).
 */
const request = require('supertest');
const app = require('../src/app');
const EventModel = require('../src/models/event.model');

beforeEach(async () => {
  await EventModel.clearAll();
  EventModel.seedDefaultEvents();
});

describe('GET /api/events (FR-004)', () => {
  test('returns only PUBLISHED and LIVE events, soonest first', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    const statuses = res.body.events.map((e) => e.status);
    expect(statuses.every((s) => ['PUBLISHED', 'LIVE'].includes(s))).toBe(true);
    const dates = res.body.events.map((e) => new Date(e.eventDate).getTime());
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
    expect(res.body.events.find((e) => e.id === 'EVT-WORK-2026')).toBeUndefined();
    expect(res.body.events.find((e) => e.id === 'EVT-COMEDY-2026')).toBeUndefined();
  });

  test('TC-EVT-01: keyword search matches title, description and venue', async () => {
    const byTitle = await request(app).get('/api/events?search=techsummit');
    expect(byTitle.body.events.map((e) => e.id)).toEqual(['EVT-TECH-2026']);

    const byVenue = await request(app).get('/api/events?q=amphitheatre');
    expect(byVenue.body.events.map((e) => e.id)).toEqual(['EVT-CULT-2026']);
  });

  test('TC-EVT-01: category filter is case-insensitive', async () => {
    const res = await request(app).get('/api/events?category=music');
    expect(res.body.events.map((e) => e.id)).toEqual(['EVT-MUSIC-2026']);
  });

  test('TC-EVT-01: venue filter matches part of the venue name', async () => {
    const res = await request(app).get('/api/events?venue=pes');
    expect(res.body.events.map((e) => e.id).sort()).toEqual(['EVT-SPORT-2026', 'EVT-TECH-2026']);
  });

  test('TC-EVT-01: date range filter (startDate/endDate and from/to)', async () => {
    const res = await request(app).get('/api/events?startDate=2026-11-20&endDate=2026-12-31');
    expect(res.body.events.map((e) => e.id)).toEqual(['EVT-MUSIC-2026', 'EVT-CULT-2026']);

    const alias = await request(app).get('/api/events?from=2027-01-01');
    expect(alias.body.events.map((e) => e.id)).toEqual(['EVT-SPORT-2026']);
  });

  test('TC-EVT-01: price range keeps events with any tier in range', async () => {
    const res = await request(app).get('/api/events?minPrice=500&maxPrice=700');
    expect(res.body.events.map((e) => e.id)).toEqual(['EVT-MUSIC-2026']);

    const free = await request(app).get('/api/events?maxPrice=0');
    expect(free.body.events.map((e) => e.id)).toEqual(['EVT-SPORT-2026']);
  });

  test('TC-EVT-01: combined filters must all match', async () => {
    const res = await request(app).get('/api/events?category=tech&venue=auditorium&maxPrice=300&search=ai');
    expect(res.body.events.map((e) => e.id)).toEqual(['EVT-TECH-2026']);
  });

  test('TC-EVT-02: no match returns 200, empty list, total 0 and "No events found"', async () => {
    const res = await request(app).get('/api/events?category=Opera');
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.message).toBe('No events found');
  });

  test('summary carries price range and seats left', async () => {
    const res = await request(app).get('/api/events?search=techsummit');
    const e = res.body.events[0];
    expect(e.minPrice).toBe(299);
    expect(e.maxPrice).toBe(799);
    expect(e.seatsAvailable).toBe(0 + 230 + 59);
  });

  test('paginates with page and limit', async () => {
    const res = await request(app).get('/api/events?limit=2&page=2');
    expect(res.body.total).toBe(4);
    expect(res.body.events).toHaveLength(2);
    expect(res.body.page).toBe(2);
    const capped = await request(app).get('/api/events?limit=500');
    expect(capped.body.limit).toBe(50);
  });

  test.each([
    ['startDate=not-a-date'],
    ['minPrice=-5'],
    ['maxPrice=abc'],
    ['minPrice=900&maxPrice=100'],
    ['startDate=2027-01-01&endDate=2026-01-01'],
  ])('rejects invalid filter %s with 400 INVALID_FILTER', async (qs) => {
    const res = await request(app).get(`/api/events?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILTER');
  });

  test('injection-style input is treated as plain text', async () => {
    const res = await request(app).get(`/api/events?search=${encodeURIComponent("' OR 1=1 --")}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});

describe('GET /api/events/:id and /categories', () => {
  test('returns full detail with tiers and availability', async () => {
    const res = await request(app).get('/api/events/EVT-TECH-2026');
    expect(res.status).toBe(200);
    expect(res.body.event.tiers).toHaveLength(3);
    const vip = res.body.event.tiers.find((t) => t.name === 'VIP Pass');
    expect(vip.available).toBe(59);
  });

  test('hides events that are not on sale', async () => {
    const draft = await request(app).get('/api/events/EVT-WORK-2026');
    expect(draft.status).toBe(404);
    expect(draft.body.code).toBe('EVENT_NOT_FOUND');
    const missing = await request(app).get('/api/events/NOPE');
    expect(missing.status).toBe(404);
  });

  test('lists categories of events on sale', async () => {
    const res = await request(app).get('/api/events/categories');
    expect(res.body.categories).toEqual(['Cultural', 'Music', 'Sports', 'Tech']);
  });
});
