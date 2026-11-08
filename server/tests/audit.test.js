const request = require('supertest');
const app = require('../src/app');
const UserModel = require('../src/models/user.model');
const EventModel = require('../src/models/event.model');
const auditService = require('../src/services/audit.service');
const tokens = require('./helpers/tokens');

describe('Security Audit Logging (SEC-005)', () => {
  beforeEach(async () => {
    auditService.clearInMemoryLogs();
    await UserModel.clearAll();
    await EventModel.clearAll();
    EventModel.seedDefaultEvents();
  });

  const adminToken = () => tokens.admin();
  const attendeeToken = () => tokens.attendee();
  const organizerToken = () => tokens.organizer();
  const gateStaffToken = () => tokens.tokenFor('USR-GATE-001', 'GATE_STAFF');

  describe('1. Failed Login Auditing (AC-1, AC-2)', () => {
    test('TC-SEC-AUDIT-01: audits failed login for non-existent user with actor_id=null', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@passpulse.io', password: 'SomePassword123' });

      expect(res.statusCode).toBe(401);

      const logs = auditService.getInMemoryLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        action: 'LOGIN_FAILED',
        actorId: null,
        target: 'ghost@passpulse.io',
      });
      expect(logs[0].ipAddress).toBeDefined();
      expect(logs[0].createdAt).toBeDefined();
      expect(JSON.stringify(logs[0])).not.toContain('SomePassword123');
    });

    test('TC-SEC-AUDIT-02: audits failed login with incorrect password with existing user actor_id', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({ fullName: 'Alice Smith', email: 'alice@passpulse.io', password: 'CorrectPassword123' });
      expect(regRes.statusCode).toBe(201);
      const userId = regRes.body.data.user.id;

      auditService.clearInMemoryLogs();

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@passpulse.io', password: 'WrongPassword999' });

      expect(res.statusCode).toBe(401);

      const logs = auditService.getInMemoryLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        action: 'LOGIN_FAILED',
        actorId: userId,
        target: 'alice@passpulse.io',
      });
      expect(JSON.stringify(logs[0])).not.toContain('WrongPassword999');
      expect(JSON.stringify(logs[0])).not.toContain('CorrectPassword123');
    });

    test('TC-SEC-AUDIT-03: audits failed login attempt for deactivated account', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({ fullName: 'Bob Blocked', email: 'bob@passpulse.io', password: 'Password@123' });
      const userId = regRes.body.data.user.id;

      await UserModel.setActive(userId, false);
      auditService.clearInMemoryLogs();

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'bob@passpulse.io', password: 'Password@123' });

      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('ACCOUNT_DEACTIVATED');

      const logs = auditService.getInMemoryLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        action: 'LOGIN_FAILED',
        actorId: userId,
        target: 'bob@passpulse.io',
      });
    });

    test('TC-SEC-AUDIT-ERR: propagates audit logging error during failed login as HTTP 500', async () => {
      jest.spyOn(auditService, 'recordAudit').mockRejectedValueOnce(new Error('Audit store failure'));

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'unknown@x.io', password: 'AnyPassword@123' });

      expect(res.statusCode).toBe(500);
      expect(res.body.status).toBe('error');

      auditService.recordAudit.mockRestore();
    });
  });

  describe('2. Administrative Action Auditing (AC-1, AC-2)', () => {
    test('TC-SEC-AUDIT-04: audits event approve, reject, flag, unflag, and remove', async () => {
      // 1. Approve
      const approveRes = await request(app)
        .post('/api/admin/events/EVT-COMEDY-2026/approve')
        .set('Authorization', adminToken());
      expect(approveRes.statusCode).toBe(200);

      // 2. Reject
      await EventModel.insert({
        id: 'EVT-PENDING-REJECT',
        title: 'Pending To Reject',
        description: 'Testing rejection audit',
        category: 'Tech',
        venue: 'Auditorium',
        eventDate: '2026-12-01T10:00:00Z',
        capacity: 100,
        status: 'PENDING_APPROVAL',
        organizerId: 'USR-ORG-001',
        tiers: [],
        notices: [],
      });

      const rejectRes = await request(app)
        .post('/api/admin/events/EVT-PENDING-REJECT/reject')
        .set('Authorization', adminToken())
        .send({ reason: 'Needs updated venue information' });
      expect(rejectRes.statusCode).toBe(200);

      // 3. Flag
      const flagRes = await request(app)
        .post('/api/admin/events/EVT-MUSIC-2026/flag')
        .set('Authorization', adminToken())
        .send({ reason: 'Reported inappropriate content' });
      expect(flagRes.statusCode).toBe(200);

      // 4. Unflag
      const unflagRes = await request(app)
        .post('/api/admin/events/EVT-MUSIC-2026/unflag')
        .set('Authorization', adminToken());
      expect(unflagRes.statusCode).toBe(200);

      // 5. Remove
      const removeRes = await request(app)
        .post('/api/admin/events/EVT-TECH-2026/remove')
        .set('Authorization', adminToken())
        .send({ reason: 'Event cancelled by organizer request' });
      expect(removeRes.statusCode).toBe(200);

      const logs = auditService.getInMemoryLogs();
      const actions = logs.map((l) => l.action);
      expect(actions).toEqual([
        'EVENT_APPROVED',
        'EVENT_REJECTED',
        'EVENT_FLAGGED',
        'EVENT_UNFLAGGED',
        'EVENT_REMOVED',
      ]);
      expect(logs.every((l) => l.actorId === 'USR-ADMIN-001')).toBe(true);
      expect(logs.every((l) => l.ipAddress !== undefined)).toBe(true);
    });

    test('TC-SEC-AUDIT-05: audits user account deactivation and reactivation', async () => {
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ fullName: 'Target User', email: 'target@passpulse.io', password: 'Password@123' });
      const targetUserId = reg.body.data.user.id;

      auditService.clearInMemoryLogs();

      // Deactivate
      const deact = await request(app)
        .post(`/api/admin/users/${targetUserId}/deactivate`)
        .set('Authorization', adminToken());
      expect(deact.statusCode).toBe(200);

      // Reactivate
      const react = await request(app)
        .post(`/api/admin/users/${targetUserId}/reactivate`)
        .set('Authorization', adminToken());
      expect(react.statusCode).toBe(200);

      const logs = auditService.getInMemoryLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0]).toMatchObject({
        action: 'USER_DEACTIVATED',
        actorId: 'USR-ADMIN-001',
        target: targetUserId,
      });
      expect(logs[1]).toMatchObject({
        action: 'USER_REACTIVATED',
        actorId: 'USR-ADMIN-001',
        target: targetUserId,
      });
    });

    test('TC-SEC-AUDIT-06: audits privileged user provisioning by admin', async () => {
      const res = await request(app)
        .post('/api/auth/provision')
        .set('Authorization', adminToken())
        .send({
          fullName: 'New Gate Guard',
          email: 'gateguard@passpulse.io',
          password: 'GuardPassword@2026',
          role: 'GATE_STAFF',
        });

      expect(res.statusCode).toBe(201);
      const provisionedId = res.body.data.user.id;

      const logs = auditService.getInMemoryLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        action: 'USER_PROVISIONED',
        actorId: 'USR-ADMIN-001',
        target: provisionedId,
      });
      expect(JSON.stringify(logs[0])).not.toContain('GuardPassword@2026');
    });
  });

  describe('3. Rejected Check-in Scan Auditing (AC-1, AC-2)', () => {
    test('TC-SEC-AUDIT-07: audits rejected QR check-in attempts', async () => {
      const res = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', gateStaffToken())
        .send({
          qrData: JSON.stringify({ ticketId: 'TKT-TEST-999', eventId: 'EVT-1' }),
          eventId: 'EVT-1',
          ticketStatus: 'VALID',
          bookingConfirmationStatus: 'CONFIRMED',
        });

      expect(res.statusCode).toBe(400);

      const logs = auditService.getInMemoryLogs();
      expect(logs.length).toBeGreaterThanOrEqual(1);
      const rejectedLog = logs.find((l) => l.action === 'CHECK_IN_REJECTED');
      expect(rejectedLog).toBeDefined();
      expect(rejectedLog.target).toBe('TKT-TEST-999');
      expect(rejectedLog.ipAddress).toBeDefined();
    });
  });

  describe('4. Administrative Audit Review Endpoint (AC-3)', () => {
    beforeEach(async () => {
      await auditService.recordAudit({ action: 'LOGIN_FAILED', target: 'bad@x.io', ipAddress: '192.168.1.1' });
      await auditService.recordAudit({ action: 'EVENT_APPROVED', actorId: 'USR-ADMIN-001', target: 'EVT-1', ipAddress: '127.0.0.1' });
      await auditService.recordAudit({ action: 'USER_DEACTIVATED', actorId: 'USR-ADMIN-001', target: 'USR-X', ipAddress: '127.0.0.1' });
    });

    test('TC-SEC-AUDIT-08: blocks unauthenticated requests with HTTP 401', async () => {
      const res = await request(app).get('/api/admin/audit-logs');
      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe('error');
    });

    test('TC-SEC-AUDIT-09: blocks non-admin roles (ATTENDEE, ORGANIZER, GATE_STAFF) with HTTP 403', async () => {
      const attendeeRes = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', attendeeToken());
      expect(attendeeRes.statusCode).toBe(403);

      const organizerRes = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', organizerToken());
      expect(organizerRes.statusCode).toBe(403);

      const gateStaffRes = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', gateStaffToken());
      expect(gateStaffRes.statusCode).toBe(403);
    });

    test('TC-SEC-AUDIT-10: allows ADMIN access and returns paginated, structured audit records', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', adminToken());

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.total).toBe(3);
      expect(res.body.auditLogs).toHaveLength(3);
      expect(res.body.auditLogs[0]).toHaveProperty('id');
      expect(res.body.auditLogs[0]).toHaveProperty('action');
      expect(res.body.auditLogs[0]).toHaveProperty('createdAt');
    });

    test('TC-SEC-AUDIT-11: supports action filter on review endpoint', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?action=LOGIN_FAILED')
        .set('Authorization', adminToken());

      expect(res.statusCode).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.auditLogs[0].action).toBe('LOGIN_FAILED');
      expect(res.body.auditLogs[0].target).toBe('bad@x.io');
    });

    test('TC-SEC-AUDIT-12: supports pagination parameters (limit and offset)', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?limit=2&offset=1')
        .set('Authorization', adminToken());

      expect(res.statusCode).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.limit).toBe(2);
      expect(res.body.offset).toBe(1);
      expect(res.body.auditLogs).toHaveLength(2);
    });
  });
});
