/**
 * NFR-001 / TC-PERF-01 (in-process check): catalog search over 10,000 events.
 * The full 500-user test is run with scripts/bench-search.js or k6
 * (tests/perf/catalog-search.k6.js); see docs/perf/NFR-001_Search_Performance.md.
 */
const request = require('supertest');
const app = require('../../src/app');
const EventModel = require('../../src/models/event.model');
const { seedPerfEvents, QUERIES } = require('./perfData');

jest.setTimeout(60000);

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

afterAll(async () => {
  await EventModel.clearAll();
});

test('p95 catalog search time stays under 150 ms with 10,000 events', async () => {
  await seedPerfEvents(10000);
  await request(app).get('/api/events'); // build the index once

  const timings = [];
  for (let round = 0; round < 30; round += 1) {
    for (const qs of QUERIES) {
      const t0 = process.hrtime.bigint();
      const res = await request(app).get(`/api/events?${qs}`);
      timings.push(Number(process.hrtime.bigint() - t0) / 1e6);
      expect(res.status).toBe(200);
      expect(res.headers['server-timing']).toMatch(/^search;dur=/);
    }
  }
  timings.sort((a, b) => a - b);
  const p95 = percentile(timings, 95);
  expect(timings).toHaveLength(300);
  expect(p95).toBeLessThan(150);
});

test('index is rebuilt after a write, so new events are searchable at once', async () => {
  await seedPerfEvents(50);
  const before = await request(app).get('/api/events?search=freshly-added');
  expect(before.body.total).toBe(0);
  await EventModel.insert({
    id: 'EVT-NEW',
    organizerId: 'USR-ORG-001',
    title: 'Freshly-added gig',
    description: '',
    category: 'Music',
    venue: 'Hall',
    eventDate: '2026-12-01T10:00:00.000Z',
    capacity: 10,
    status: 'PUBLISHED',
    isFlagged: false,
    notices: [],
    tiers: [],
  });
  const after = await request(app).get('/api/events?search=freshly-added');
  expect(after.body.total).toBe(1);
});
