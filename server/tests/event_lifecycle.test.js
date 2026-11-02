/**
 * FR-006 lifecycle transitions (TC-EVT-04), BR-005 submit rule and
 * BR-006 holder notice (TC-EVT-05).
 */
const request = require('supertest');
const app = require('../src/app');
const EventModel = require('../src/models/event.model');
const { allowedTransitions } = require('../src/services/event_state.service');
const tokens = require('./helpers/tokens');

beforeEach(async () => {
  await EventModel.clearAll();
  EventModel.seedDefaultEvents();
});

function setStatus(id, status, token = tokens.organizer(), extra = {}) {
  return request(app).patch(`/api/events/${id}/status`).set('Authorization', token).send({ status, ...extra });
}

async function addTier(id) {
  return request(app)
    .post(`/api/events/${id}/tiers`)
    .set('Authorization', tokens.organizer())
    .send({ name: 'General', price: 100, quota: 40 });
}

describe('PATCH /api/events/:id/status (FR-006)', () => {
  test('walks the full path DRAFT -> PENDING_APPROVAL -> PUBLISHED -> LIVE -> COMPLETED', async () => {
    await addTier('EVT-WORK-2026');
    expect((await setStatus('EVT-WORK-2026', 'PENDING_APPROVAL')).body.event.status).toBe('PENDING_APPROVAL');
    expect((await setStatus('EVT-WORK-2026', 'PUBLISHED', tokens.admin())).body.event.status).toBe('PUBLISHED');

    const listed = await request(app).get('/api/events?search=robotics');
    expect(listed.body.total).toBe(1);

    expect((await setStatus('EVT-WORK-2026', 'LIVE')).body.event.status).toBe('LIVE');
    const done = await setStatus('EVT-WORK-2026', 'COMPLETED');
    expect(done.status).toBe(200);
    expect(done.body.event.status).toBe('COMPLETED');
  });

  test.each([
    ['EVT-WORK-2026', 'LIVE'],
    ['EVT-WORK-2026', 'PUBLISHED'],
    ['EVT-WORK-2026', 'COMPLETED'],
    ['EVT-TECH-2026', 'DRAFT'],
    ['EVT-MUSIC-2026', 'PUBLISHED'],
  ])('TC-EVT-04: %s to %s is illegal and returns 409 INVALID_TRANSITION', async (id, to) => {
    const res = await setStatus(id, to, tokens.admin());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  test('completed and cancelled events are final', async () => {
    await setStatus('EVT-MUSIC-2026', 'COMPLETED');
    expect((await setStatus('EVT-MUSIC-2026', 'LIVE')).status).toBe(409);
    expect((await setStatus('EVT-MUSIC-2026', 'CANCELLED', tokens.organizer(), { notifyHolders: true })).status).toBe(409);
  });

  test('only an admin can publish an event awaiting approval (403 APPROVAL_REQUIRED)', async () => {
    const res = await setStatus('EVT-COMEDY-2026', 'PUBLISHED');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('APPROVAL_REQUIRED');
  });

  test('organizer can withdraw a pending event back to DRAFT', async () => {
    const res = await setStatus('EVT-COMEDY-2026', 'DRAFT');
    expect(res.body.event.status).toBe('DRAFT');
  });

  test('BR-005: cannot submit for approval without a tier that has quota', async () => {
    const res = await setStatus('EVT-WORK-2026', 'PENDING_APPROVAL');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TIERS_REQUIRED');
  });

  test('rejects an unknown status with 400 and other organizers with 403', async () => {
    expect((await setStatus('EVT-WORK-2026', 'OPEN')).status).toBe(400);
    expect((await setStatus('EVT-WORK-2026', 'CANCELLED', tokens.otherOrganizer())).status).toBe(403);
    expect((await setStatus('EVT-WORK-2026', 'CANCELLED', tokens.attendee())).status).toBe(403);
  });

  test('allowedTransitions hides the approval step from organizers', () => {
    expect(allowedTransitions('PENDING_APPROVAL', 'ORGANIZER')).toEqual(['DRAFT', 'CANCELLED']);
    expect(allowedTransitions('PENDING_APPROVAL', 'ADMIN')).toEqual(['PUBLISHED', 'DRAFT', 'CANCELLED']);
    expect(allowedTransitions('UNKNOWN', 'ADMIN')).toEqual([]);
  });
});

describe('BR-006 changes after bookings exist (TC-EVT-05)', () => {
  const newDate = () => new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();

  test('date change on an event with sold tickets needs notifyHolders', async () => {
    const blocked = await request(app)
      .put('/api/events/EVT-TECH-2026')
      .set('Authorization', tokens.organizer())
      .send({ eventDate: newDate() });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('BOOKINGS_EXIST');

    const ok = await request(app)
      .put('/api/events/EVT-TECH-2026')
      .set('Authorization', tokens.organizer())
      .send({ eventDate: newDate(), notifyHolders: true });
    expect(ok.status).toBe(200);
    expect(ok.body.event.notices).toHaveLength(1);
    expect(ok.body.event.notices[0]).toMatchObject({ type: 'DATE_CHANGED', recipients: 311 });
  });

  test('other edits on a sold event do not need a notice', async () => {
    const res = await request(app)
      .put('/api/events/EVT-TECH-2026')
      .set('Authorization', tokens.organizer())
      .send({ description: 'Updated agenda' });
    expect(res.status).toBe(200);
    expect(res.body.event.notices).toHaveLength(0);
  });

  test('cancelling an event with sold tickets needs notifyHolders', async () => {
    const blocked = await request(app).post('/api/events/EVT-TECH-2026/cancel').set('Authorization', tokens.organizer());
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('BOOKINGS_EXIST');

    const ok = await setStatus('EVT-TECH-2026', 'CANCELLED', tokens.organizer(), { notifyHolders: true });
    expect(ok.body.event.status).toBe('CANCELLED');
    expect(ok.body.event.notices[0]).toMatchObject({ type: 'CANCELLED', recipients: 311 });
  });

  test('events with no sales cancel without a notice', async () => {
    const res = await request(app).post('/api/events/EVT-COMEDY-2026/cancel').set('Authorization', tokens.organizer());
    expect(res.status).toBe(200);
    expect(res.body.event.notices).toEqual([]);
  });
});
