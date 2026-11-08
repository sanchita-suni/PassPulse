/**
 * FR-007 ticket tiers with independent quota and price (TC-TCK-01), BR-001 order limit.
 */
const request = require('supertest');
const app = require('../src/app');
const EventModel = require('../src/models/event.model');
const tokens = require('./helpers/tokens');

const DRAFT = 'EVT-WORK-2026'; // capacity 60, no tiers

beforeEach(async () => {
  await EventModel.clearAll();
  EventModel.seedDefaultEvents();
});

function addTier(body, token = tokens.organizer(), eventId = DRAFT) {
  return request(app).post(`/api/events/${eventId}/tiers`).set('Authorization', token).send(body);
}

describe('POST /api/events/:id/tiers (FR-007)', () => {
  test('defines Early Bird, General and VIP tiers with their own quota and price', async () => {
    const eb = await addTier({ name: 'Early Bird', price: 199, quota: 20 });
    const gen = await addTier({ name: 'General', price: 349.5, quota: 30 });
    const vip = await addTier({ name: 'VIP', price: 799, quota: 10, maxPerOrder: 2 });
    expect([eb.status, gen.status, vip.status]).toEqual([201, 201, 201]);
    expect(eb.body.tier).toMatchObject({ name: 'Early Bird', price: 199, quota: 20, sold: 0, available: 20, maxPerOrder: 5 });
    expect(vip.body.tier.maxPerOrder).toBe(2);

    const list = await request(app).get(`/api/events/${DRAFT}/tiers`).set('Authorization', tokens.organizer());
    expect(list.body.tiers.map((t) => t.name)).toEqual(['Early Bird', 'General', 'VIP']);
  });

  test('a free tier (price 0) is allowed', async () => {
    const res = await addTier({ name: 'Student', price: 0, quota: 10 });
    expect(res.status).toBe(201);
  });

  test.each([
    [{ name: 'Zero', price: 100, quota: 0 }, 'quota'],
    [{ name: 'Neg', price: -1, quota: 5 }, 'price cannot be negative'],
    [{ name: 'NoPrice', quota: 5 }, 'price must be a number'],
    [{ price: 10, quota: 5 }, 'name is required'],
    [{ name: 'Frac', price: 10, quota: 2.5 }, 'quota'],
    [{ name: 'Big order', price: 10, quota: 5, maxPerOrder: 6 }, 'maxPerOrder'],
  ])('TC-TCK-01: rejects %j with 400', async (body, msg) => {
    const res = await addTier(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain(msg);
  });

  test('total quota cannot exceed event capacity', async () => {
    await addTier({ name: 'General', price: 100, quota: 50 });
    const res = await addTier({ name: 'VIP', price: 500, quota: 11 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('QUOTA_EXCEEDS_CAPACITY');
  });

  test('tier names are unique per event (409)', async () => {
    await addTier({ name: 'General', price: 100, quota: 10 });
    const res = await addTier({ name: 'general', price: 120, quota: 10 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TIER_EXISTS');
  });

  test('only the owner or an admin manages tiers', async () => {
    expect((await addTier({ name: 'X', price: 1, quota: 1 }, tokens.otherOrganizer())).status).toBe(403);
    expect((await addTier({ name: 'X', price: 1, quota: 1 }, tokens.attendee())).status).toBe(403);
    expect((await addTier({ name: 'X', price: 1, quota: 1 }, tokens.admin())).status).toBe(201);
  });

  test('tiers of a cancelled event cannot change', async () => {
    await request(app).post(`/api/events/${DRAFT}/cancel`).set('Authorization', tokens.organizer());
    const res = await addTier({ name: 'Late', price: 1, quota: 1 });
    expect(res.status).toBe(409);
  });
});

describe('PUT and DELETE /api/events/:id/tiers/:tierId (FR-007)', () => {
  test('updates price and quota independently', async () => {
    const res = await request(app)
      .put('/api/events/EVT-TECH-2026/tiers/TIER-TECH-VIP')
      .set('Authorization', tokens.organizer())
      .send({ price: 899, quota: 90 });
    expect(res.status).toBe(200);
    expect(res.body.tier).toMatchObject({ price: 899, quota: 90, sold: 41, available: 49 });

    const general = (await request(app).get('/api/events/EVT-TECH-2026')).body.event.tiers.find(
      (t) => t.id === 'TIER-TECH-GEN'
    );
    expect(general.price).toBe(499);
  });

  test('quota cannot drop below tickets sold, and names stay unique', async () => {
    const low = await request(app)
      .put('/api/events/EVT-TECH-2026/tiers/TIER-TECH-VIP')
      .set('Authorization', tokens.organizer())
      .send({ quota: 10 });
    expect(low.status).toBe(400);
    expect(low.body.message).toContain('already sold (41)');

    const dup = await request(app)
      .put('/api/events/EVT-TECH-2026/tiers/TIER-TECH-VIP')
      .set('Authorization', tokens.organizer())
      .send({ name: 'General' });
    expect(dup.status).toBe(409);
  });

  test('empty edit returns 400 and unknown tier returns 404', async () => {
    const empty = await request(app)
      .put('/api/events/EVT-TECH-2026/tiers/TIER-TECH-VIP')
      .set('Authorization', tokens.organizer())
      .send({});
    expect(empty.status).toBe(400);
    const missing = await request(app)
      .put('/api/events/EVT-TECH-2026/tiers/NOPE')
      .set('Authorization', tokens.organizer())
      .send({ price: 1 });
    expect(missing.status).toBe(404);
  });

  test('removes an unsold tier but not one with sales', async () => {
    const sold = await request(app)
      .delete('/api/events/EVT-TECH-2026/tiers/TIER-TECH-VIP')
      .set('Authorization', tokens.organizer());
    expect(sold.status).toBe(409);
    expect(sold.body.code).toBe('TIER_HAS_SALES');

    const unsold = await request(app)
      .delete('/api/events/EVT-COMEDY-2026/tiers/TIER-COMEDY-GA')
      .set('Authorization', tokens.organizer());
    expect(unsold.status).toBe(204);
  });
});
