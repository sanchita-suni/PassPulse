/**
 * FR-019 admin moderation and account deactivation (TC-ADM-01, TC-ADM-02).
 */
const request = require('supertest');
const app = require('../src/app');
const EventModel = require('../src/models/event.model');
const UserModel = require('../src/models/user.model');
const { hashPassword } = require('../src/utils/password.util');
const tokens = require('./helpers/tokens');

beforeEach(async () => {
  await EventModel.clearAll();
  EventModel.seedDefaultEvents();
  await UserModel.clearAll();
});

const admin = () => tokens.admin();

describe('Admin route protection (TC-ADM-02)', () => {
  test.each([
    ['get', '/api/admin/events'],
    ['get', '/api/admin/users'],
    ['post', '/api/admin/events/EVT-COMEDY-2026/approve'],
    ['post', '/api/admin/users/USR-X/deactivate'],
  ])('%s %s: 401 without a token, 403 for organizer and attendee', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
    expect((await request(app)[method](url).set('Authorization', tokens.organizer())).status).toBe(403);
    expect((await request(app)[method](url).set('Authorization', tokens.attendee())).status).toBe(403);
  });
});

describe('Event moderation (FR-019)', () => {
  test('lists events by status and flag', async () => {
    const pending = await request(app).get('/api/admin/events?status=pending_approval').set('Authorization', admin());
    expect(pending.status).toBe(200);
    expect(pending.body.events.map((e) => e.id)).toEqual(['EVT-COMEDY-2026']);
    const all = await request(app).get('/api/admin/events').set('Authorization', admin());
    expect(all.body.total).toBe(6);
    const flagged = await request(app).get('/api/admin/events?flagged=true').set('Authorization', admin());
    expect(flagged.body.total).toBe(0);
  });

  test('approve publishes a pending event and records who did it', async () => {
    const res = await request(app).post('/api/admin/events/EVT-COMEDY-2026/approve').set('Authorization', admin());
    expect(res.status).toBe(200);
    expect(res.body.event.status).toBe('PUBLISHED');
    expect(res.body.event.moderation[0]).toMatchObject({ action: 'APPROVED', by: 'USR-ADMIN-001' });
    expect((await request(app).get('/api/events/EVT-COMEDY-2026')).status).toBe(200);
  });

  test('approve only works on a pending event', async () => {
    const res = await request(app).post('/api/admin/events/EVT-WORK-2026/approve').set('Authorization', admin());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  test('reject sends a pending event back to DRAFT with a reason', async () => {
    const noReason = await request(app).post('/api/admin/events/EVT-COMEDY-2026/reject').set('Authorization', admin());
    expect(noReason.status).toBe(400);
    const res = await request(app)
      .post('/api/admin/events/EVT-COMEDY-2026/reject')
      .set('Authorization', admin())
      .send({ reason: 'Add age rating' });
    expect(res.body.event.status).toBe('DRAFT');
    expect(res.body.event.moderation[0]).toMatchObject({ action: 'REJECTED', reason: 'Add age rating' });
  });

  test('flag hides an event from the catalog until it is unflagged', async () => {
    const flag = await request(app)
      .post('/api/admin/events/EVT-MUSIC-2026/flag')
      .set('Authorization', admin())
      .send({ reason: 'Reported as misleading' });
    expect(flag.status).toBe(200);
    expect(flag.body.event.isFlagged).toBe(true);
    expect((await request(app).get('/api/events/EVT-MUSIC-2026')).status).toBe(404);
    expect((await request(app).get('/api/events?category=Music')).body.total).toBe(0);

    const again = await request(app)
      .post('/api/admin/events/EVT-MUSIC-2026/flag')
      .set('Authorization', admin())
      .send({ reason: 'x' });
    expect(again.status).toBe(409);

    const unflag = await request(app).post('/api/admin/events/EVT-MUSIC-2026/unflag').set('Authorization', admin());
    expect(unflag.body.event.isFlagged).toBe(false);
    expect((await request(app).get('/api/events/EVT-MUSIC-2026')).status).toBe(200);
    expect((await request(app).post('/api/admin/events/EVT-MUSIC-2026/unflag').set('Authorization', admin())).status).toBe(409);
  });

  test('flag needs a reason', async () => {
    const res = await request(app).post('/api/admin/events/EVT-MUSIC-2026/flag').set('Authorization', admin()).send({});
    expect(res.status).toBe(400);
  });

  test('remove cancels the event and notifies ticket holders', async () => {
    const res = await request(app)
      .post('/api/admin/events/EVT-TECH-2026/remove')
      .set('Authorization', admin())
      .send({ reason: 'Venue unavailable' });
    expect(res.status).toBe(200);
    expect(res.body.event.status).toBe('CANCELLED');
    expect(res.body.event.notices[0]).toMatchObject({ type: 'CANCELLED', recipients: 311 });
    expect(res.body.event.moderation[0]).toMatchObject({ action: 'REMOVED', reason: 'Venue unavailable' });

    const twice = await request(app)
      .post('/api/admin/events/EVT-TECH-2026/remove')
      .set('Authorization', admin())
      .send({ reason: 'again' });
    expect(twice.status).toBe(409);
    const noReason = await request(app).post('/api/admin/events/EVT-MUSIC-2026/remove').set('Authorization', admin());
    expect(noReason.status).toBe(400);
  });

  test('unknown event returns 404', async () => {
    const res = await request(app).post('/api/admin/events/NOPE/approve').set('Authorization', admin());
    expect(res.status).toBe(404);
  });
});

describe('Account deactivation (TC-ADM-01)', () => {
  async function registerAndLogin(email) {
    await request(app).post('/api/auth/register').send({ fullName: 'Riya', email, password: 'Secret@123' });
    const login = await request(app).post('/api/auth/login').send({ email, password: 'Secret@123' });
    return login.body.data;
  }

  test("a deactivated user's next request returns 401 and login is refused", async () => {
    const { user, token } = await registerAndLogin('riya@example.com');
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);

    const res = await request(app).post(`/api/admin/users/${user.id}/deactivate`).set('Authorization', admin());
    expect(res.status).toBe(200);
    expect(res.body.user.isActive).toBe(false);
    expect(res.body.user.passwordHash).toBeUndefined();

    const next = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(next.status).toBe(401);
    expect(next.body.code).toBe('ACCOUNT_DEACTIVATED');

    const pass = await request(app).get('/api/qr/pass/TKT-CONFIRMED-001').set('Authorization', `Bearer ${token}`);
    expect(pass.status).toBe(401);

    const login = await request(app).post('/api/auth/login').send({ email: 'riya@example.com', password: 'Secret@123' });
    expect(login.status).toBe(401);
    expect(login.body.code).toBe('ACCOUNT_DEACTIVATED');
  });

  test('reactivation restores access', async () => {
    const { user, token } = await registerAndLogin('dev@example.com');
    await request(app).post(`/api/admin/users/${user.id}/deactivate`).set('Authorization', admin());
    const res = await request(app).post(`/api/admin/users/${user.id}/reactivate`).set('Authorization', admin());
    expect(res.body.user.isActive).toBe(true);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);
  });

  test('lists users without password hashes', async () => {
    await registerAndLogin('a@example.com');
    const res = await request(app).get('/api/admin/users').set('Authorization', admin());
    expect(res.body.total).toBe(1);
    expect(res.body.users[0]).toMatchObject({ email: 'a@example.com', isActive: true });
    expect(res.body.users[0].passwordHash).toBeUndefined();
  });

  test('admin cannot deactivate themselves, unknown user returns 404', async () => {
    const hash = await hashPassword('Admin@2026');
    await UserModel.create({ id: 'USR-ADMIN-001', fullName: 'Admin', email: 'admin@x.io', passwordHash: hash, role: 'ADMIN' });
    const self = await request(app).post('/api/admin/users/USR-ADMIN-001/deactivate').set('Authorization', admin());
    expect(self.status).toBe(400);
    const missing = await request(app).post('/api/admin/users/NOPE/deactivate').set('Authorization', admin());
    expect(missing.status).toBe(404);
  });
});
