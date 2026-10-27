/**
 * FR-005 organizer event creation and management (TC-EVT-03).
 */
const request = require('supertest');
const app = require('../src/app');
const EventModel = require('../src/models/event.model');
const tokens = require('./helpers/tokens');

const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

const validEvent = {
  title: 'AI Hack Night',
  description: 'Overnight build sprint',
  category: 'Tech',
  venue: 'Lab Block 2',
  eventDate: future,
  capacity: 120,
};

beforeEach(async () => {
  await EventModel.clearAll();
  EventModel.seedDefaultEvents();
});

describe('POST /api/events (FR-005)', () => {
  test('TC-EVT-03: organizer creates an event saved in DRAFT', async () => {
    const res = await request(app).post('/api/events').set('Authorization', tokens.organizer()).send(validEvent);
    expect(res.status).toBe(201);
    expect(res.body.event.status).toBe('DRAFT');
    expect(res.body.event.organizerId).toBe('USR-ORG-001');
    expect(res.body.event.id).toMatch(/^EVT-/);
    expect(res.body.event.tiers).toEqual([]);
  });

  test('draft events do not appear in the public catalog', async () => {
    const created = await request(app).post('/api/events').set('Authorization', tokens.organizer()).send(validEvent);
    const pub = await request(app).get(`/api/events/${created.body.event.id}`);
    expect(pub.status).toBe(404);
  });

  test('requires authentication (401) and the ORGANIZER or ADMIN role (403)', async () => {
    const anon = await request(app).post('/api/events').send(validEvent);
    expect(anon.status).toBe(401);
    const attendee = await request(app).post('/api/events').set('Authorization', tokens.attendee()).send(validEvent);
    expect(attendee.status).toBe(403);
  });

  test.each([
    [{ title: '' }, 'title is required'],
    [{ venue: undefined }, 'venue is required'],
    [{ capacity: 0 }, 'capacity'],
    [{ capacity: 12.5 }, 'capacity'],
    [{ eventDate: 'tomorrow-ish' }, 'eventDate must be a valid date'],
    [{ eventDate: '2020-01-01T00:00:00Z' }, 'eventDate must be in the future'],
    [{ title: 'x'.repeat(201) }, 'at most 200'],
  ])('rejects invalid input %j with 400', async (patch, msg) => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', tokens.organizer())
      .send({ ...validEvent, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toContain(msg);
  });
});

describe('GET /api/events/mine and /:id/manage', () => {
  test('organizer sees only own events in every status', async () => {
    await request(app).post('/api/events').set('Authorization', tokens.otherOrganizer()).send(validEvent);
    const res = await request(app).get('/api/events/mine').set('Authorization', tokens.organizer());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6);
    expect(res.body.events.every((e) => e.organizerId === 'USR-ORG-001')).toBe(true);
  });

  test('admin sees all events', async () => {
    await request(app).post('/api/events').set('Authorization', tokens.otherOrganizer()).send(validEvent);
    const res = await request(app).get('/api/events/mine').set('Authorization', tokens.admin());
    expect(res.body.total).toBe(7);
  });

  test('owner can load a draft for editing, others get 403', async () => {
    const own = await request(app).get('/api/events/EVT-WORK-2026/manage').set('Authorization', tokens.organizer());
    expect(own.status).toBe(200);
    expect(own.body.event.status).toBe('DRAFT');
    const other = await request(app)
      .get('/api/events/EVT-WORK-2026/manage')
      .set('Authorization', tokens.otherOrganizer());
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('NOT_EVENT_OWNER');
  });
});

describe('PUT /api/events/:id (FR-005)', () => {
  test('owner edits venue, capacity and schedule', async () => {
    const newDate = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();
    const res = await request(app)
      .put('/api/events/EVT-WORK-2026')
      .set('Authorization', tokens.organizer())
      .send({ venue: 'Seminar Hall 4', capacity: 80, eventDate: newDate, status: 'LIVE', organizerId: 'HACK' });
    expect(res.status).toBe(200);
    expect(res.body.event.venue).toBe('Seminar Hall 4');
    expect(res.body.event.capacity).toBe(80);
    expect(res.body.event.eventDate).toBe(newDate);
    expect(res.body.event.status).toBe('DRAFT');
    expect(res.body.event.organizerId).toBe('USR-ORG-001');
  });

  test("TC-EVT-03: an organizer cannot edit another organizer's event (403)", async () => {
    const res = await request(app)
      .put('/api/events/EVT-WORK-2026')
      .set('Authorization', tokens.otherOrganizer())
      .send({ title: 'Hijacked' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_EVENT_OWNER');
  });

  test('returns 404 for an unknown event and 400 for an empty edit', async () => {
    const missing = await request(app).put('/api/events/NOPE').set('Authorization', tokens.organizer()).send({ title: 'x' });
    expect(missing.status).toBe(404);
    const empty = await request(app).put('/api/events/EVT-WORK-2026').set('Authorization', tokens.organizer()).send({});
    expect(empty.status).toBe(400);
  });

  test('capacity cannot drop below the total tier quota', async () => {
    const res = await request(app)
      .put('/api/events/EVT-TECH-2026')
      .set('Authorization', tokens.organizer())
      .send({ capacity: 100 });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('total tier quota (600)');
  });
});

describe('POST /api/events/:id/cancel (FR-005)', () => {
  test('owner cancels an event and it leaves the catalog', async () => {
    const res = await request(app)
      .post('/api/events/EVT-MUSIC-2026/cancel')
      .set('Authorization', tokens.organizer())
      .send({ notifyHolders: true });
    expect(res.status).toBe(200);
    expect(res.body.event.status).toBe('CANCELLED');
    const pub = await request(app).get('/api/events/EVT-MUSIC-2026');
    expect(pub.status).toBe(404);
  });

  test('a cancelled event cannot be edited or cancelled again (409)', async () => {
    await request(app).post('/api/events/EVT-WORK-2026/cancel').set('Authorization', tokens.organizer());
    const again = await request(app).post('/api/events/EVT-WORK-2026/cancel').set('Authorization', tokens.organizer());
    expect(again.status).toBe(409);
    const edit = await request(app)
      .put('/api/events/EVT-WORK-2026')
      .set('Authorization', tokens.organizer())
      .send({ title: 'Back' });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe('EVENT_CLOSED');
  });

  test("another organizer cannot cancel the event", async () => {
    const res = await request(app).post('/api/events/EVT-MUSIC-2026/cancel').set('Authorization', tokens.otherOrganizer());
    expect(res.status).toBe(403);
  });
});
