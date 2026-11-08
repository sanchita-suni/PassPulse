process.env.QR_HMAC_SECRET =
  process.env.QR_HMAC_SECRET || 'test-qr-secret';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../app');

const { generateQrPass } = require('../services/qr.service');
const { createToken } = require('../middleware/auth.middleware');
const UserModel = require('../models/user.model');
const { hashPassword } = require('../utils/password.util');
const { registerTicket, clearTickets } = require('../services/ticket.service');
const db = require('../config/db');
const {
  createPostgresTestDatabase,
  seedPersistentTicket,
} = require('../../tests/helpers/postgres-test-database');
const {
  clearCheckInRecords,
  getCheckInCount: getInMemoryCheckInCount,
  getCheckInRecord,
} = require('../services/checkin.service');

describe('Check-in API (FR-013 & FR-014 / Issues #25 & #26)', () => {
  const baseData = {
    ticketId: 'TKT-API-CHECKIN-001',
    eventId: 'EVT-API-CHECKIN-001',
    userId: 'USR-API-CHECKIN-001',
  };

  let qrData;
  let gateStaffToken;
  let staffToken;
  let adminToken;
  let attendeeToken;
  let organizerToken;
  let cleanupTestDatabase;

  beforeAll(async () => {
    cleanupTestDatabase = await createPostgresTestDatabase();
  });

  afterAll(async () => {
    if (cleanupTestDatabase) await cleanupTestDatabase();
  });

  beforeEach(async () => {
    clearCheckInRecords();
    clearTickets();

    if (cleanupTestDatabase) {
      baseData.ticketId = `TKT-API-CHECKIN-${crypto.randomUUID()}`;
      baseData.eventId = `EVT-API-CHECKIN-${crypto.randomUUID()}`;
      baseData.userId = `USR-API-CHECKIN-${crypto.randomUUID()}`;
      await seedPersistentTicket(db.getPool(), baseData);
    }

    registerTicket({
      ticketId: baseData.ticketId,
      eventId: baseData.eventId,
      userId: baseData.userId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    gateStaffToken = createToken({
      userId: 'USR-STAFF-001',
      role: 'GATE_STAFF',
      name: 'Gate Staff Lead',
    });

    staffToken = createToken({
      userId: 'USR-STAFF-002',
      role: 'STAFF',
      name: 'Event Staff Member',
    });

    adminToken = createToken({
      userId: 'USR-ADMIN-001',
      role: 'ADMIN',
      name: 'System Admin',
    });

    attendeeToken = createToken({
      userId: 'USR-ATTENDEE-001',
      role: 'ATTENDEE',
      name: 'Alex Johnson',
    });

    organizerToken = createToken({
      userId: 'USR-ORG-001',
      role: 'ORGANIZER',
      name: 'Event Organizer',
    });

    const pass = await generateQrPass({
      ...baseData,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    qrData = pass.qrData;
  });

  async function expectCheckInCount(expected) {
    if (cleanupTestDatabase) {
      const { rows } = await db.query(
        'SELECT count(*)::int AS count FROM check_in_logs WHERE ticket_id = $1',
        [baseData.ticketId]
      );
      expect(rows[0].count).toBe(expected);
    } else {
      expect(getInMemoryCheckInCount()).toBe(expected);
    }
  }

  describe('Core Check-in & Duplicate Prevention (FR-014 / Issue #26)', () => {
    test('1. Accepts a valid check-in and returns HTTP 200 with CHECKED_IN and timestamp', async () => {
      const response = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send({
          qrData,
          eventId: baseData.eventId,
          ticketStatus: 'VALID',
          bookingConfirmationStatus: 'CONFIRMED',
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.code).toBe('CHECKED_IN');

      expect(response.body.data.ticketId).toBe(baseData.ticketId);
      expect(response.body.data.eventId).toBe(baseData.eventId);
      expect(response.body.data.userId).toBe(baseData.userId);
      expect(response.body.data.checkedInAt).toBeDefined();

      const timestamp = new Date(response.body.data.checkedInAt);
      expect(!isNaN(timestamp.getTime())).toBe(true);
      await expectCheckInCount(1);
    });

    test('2. Rejects a duplicate check-in with HTTP 409 DUPLICATE_ENTRY', async () => {
      const payload = {
        qrData,
        eventId: baseData.eventId,
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      };

      const firstResponse = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send(payload);

      const secondResponse = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send(payload);

      expect(firstResponse.statusCode).toBe(200);
      expect(firstResponse.body.code).toBe('CHECKED_IN');

      expect(secondResponse.statusCode).toBe(409);
      expect(secondResponse.body.code).toBe('DUPLICATE_ENTRY');
      expect(secondResponse.body.message).toBe('Check-in rejected');
    });

    test('3. Repeated scans do not create additional check-in records', async () => {
      const payload = {
        qrData,
        eventId: baseData.eventId,
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      };

      // First scan
      const firstResponse = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send(payload);
      expect(firstResponse.statusCode).toBe(200);
      const initialTimestamp = firstResponse.body.data.checkedInAt;

      // Rescan 3 times
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/checkin/verify')
          .set('Authorization', `Bearer ${gateStaffToken}`)
          .send(payload);
        expect(res.statusCode).toBe(409);
        expect(res.body.code).toBe('DUPLICATE_ENTRY');
      }

      // Assert strictly 1 record maintained
      await expectCheckInCount(1);
      if (cleanupTestDatabase) {
        const { rows } = await db.query(
          'SELECT checked_in_at FROM check_in_logs WHERE ticket_id = $1',
          [baseData.ticketId]
        );
        expect(rows).toHaveLength(1);
        expect(new Date(rows[0].checked_in_at).toISOString()).toBe(initialTimestamp);
      } else {
        const record = getCheckInRecord(baseData.ticketId);
        expect(record.checkedInAt).toBe(initialTimestamp);
      }
    });

    test('4. Handles simultaneous concurrent scans safely allowing at most one check-in', async () => {
      const payload = {
        qrData,
        eventId: baseData.eventId,
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      };

      // Send 5 concurrent scan requests simultaneously
      const requests = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/checkin/verify')
          .set('Authorization', `Bearer ${gateStaffToken}`)
          .send(payload)
      );

      const responses = await Promise.all(requests);

      const successes = responses.filter((r) => r.statusCode === 200);
      const duplicates = responses.filter((r) => r.statusCode === 409);

      expect(successes).toHaveLength(1);
      expect(successes[0].body.code).toBe('CHECKED_IN');

      expect(duplicates).toHaveLength(4);
      duplicates.forEach((dup) => {
        expect(dup.body.code).toBe('DUPLICATE_ENTRY');
      });

      await expectCheckInCount(1);
    });

    test('5. Rejects a cancelled ticket status with HTTP 400 INVALID_TICKET_STATUS', async () => {
      if (cleanupTestDatabase) {
        await db.query('UPDATE tickets SET status = $1 WHERE id = $2', [
          'CANCELLED',
          baseData.ticketId,
        ]);
      } else {
        registerTicket({
          ticketId: baseData.ticketId,
          eventId: baseData.eventId,
          userId: baseData.userId,
          ticketStatus: 'CANCELLED',
          bookingConfirmationStatus: 'CONFIRMED',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        });
      }
      const response = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send({
          qrData,
          eventId: baseData.eventId,
          ticketStatus: 'CANCELLED',
          bookingConfirmationStatus: 'CONFIRMED',
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.code).toBe('INVALID_TICKET_STATUS');
      await expectCheckInCount(0);
    });

    test('6. Rejects an unconfirmed booking status with HTTP 400 UNCONFIRMED_BOOKING', async () => {
      if (cleanupTestDatabase) {
        await db.query('UPDATE bookings SET status = $1 WHERE id = $2', [
          'CANCELLED',
          `${baseData.ticketId}-BOOKING`,
        ]);
      } else {
        registerTicket({
          ticketId: baseData.ticketId,
          eventId: baseData.eventId,
          userId: baseData.userId,
          ticketStatus: 'VALID',
          bookingConfirmationStatus: 'PENDING',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        });
      }
      const response = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send({
          qrData,
          eventId: baseData.eventId,
          ticketStatus: 'VALID',
          bookingConfirmationStatus: 'PENDING',
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.code).toBe('UNCONFIRMED_BOOKING');
      await expectCheckInCount(0);
    });

    test('7. Rejects request with missing required check-in fields with HTTP 400', async () => {
      const response = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send({
          qrData,
          // eventId missing
          ticketStatus: 'VALID',
          bookingConfirmationStatus: 'CONFIRMED',
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.code).toBe('INVALID_CHECKIN_REQUEST');
    });

    test('8. Rejects a QR pass for another event with HTTP 400 WRONG_EVENT', async () => {
      const response = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send({
          qrData,
          eventId: 'EVT-DIFFERENT-001',
          ticketStatus: 'VALID',
          bookingConfirmationStatus: 'CONFIRMED',
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.code).toBe('WRONG_EVENT');
      await expectCheckInCount(0);
    });

    test('9. Rejects an invalid QR signature with HTTP 400 INVALID_SIGNATURE', async () => {
      const tampered = JSON.parse(qrData);
      tampered.ticketId = 'TKT-TAMPERED-001';

      const response = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send({
          qrData: JSON.stringify(tampered),
          eventId: baseData.eventId,
          ticketStatus: 'VALID',
          bookingConfirmationStatus: 'CONFIRMED',
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.code).toBe('INVALID_SIGNATURE');
      await expectCheckInCount(0);
    });
  });

  describe('Authentication & Gate Staff RBAC (FR-013 / Issue #25)', () => {
    const validCheckinPayload = () => ({
      qrData,
      eventId: baseData.eventId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    });

    test('10. Rejects check-in requests without an authentication token with HTTP 401 UNAUTHORIZED', async () => {
      const response = await request(app)
        .post('/api/checkin/verify')
        .send(validCheckinPayload());

      expect(response.statusCode).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('UNAUTHORIZED');
      await expectCheckInCount(0);
    });

    test('11. Rejects check-in requests with an invalid JWT token with HTTP 401 INVALID_TOKEN', async () => {
      const response = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', 'Bearer invalid-signature-token-xyz')
        .send(validCheckinPayload());

      expect(response.statusCode).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('INVALID_TOKEN');
      await expectCheckInCount(0);
    });

    test('12. Rejects check-in attempt by an authenticated ATTENDEE with HTTP 403 Forbidden', async () => {
      const response = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send(validCheckinPayload());

      expect(response.statusCode).toBe(403);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('Forbidden: Access denied');
      expect(response.body.message).toContain('Required role(s): GATE_STAFF, STAFF, ADMIN');
      expect(response.body.message).toContain('Current role: ATTENDEE');
      await expectCheckInCount(0);
    });

    test('13. Rejects check-in attempt by an authenticated ORGANIZER with HTTP 403 Forbidden', async () => {
      const response = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(validCheckinPayload());

      expect(response.statusCode).toBe(403);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('Forbidden: Access denied');
      await expectCheckInCount(0);
    });

    test('14. Allows check-in by authorized GATE_STAFF with HTTP 200', async () => {
      const response = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send(validCheckinPayload());

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.code).toBe('CHECKED_IN');
      await expectCheckInCount(1);
    });

    test('15. Allows check-in by authorized STAFF with HTTP 200', async () => {
      const response = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${staffToken}`)
        .send(validCheckinPayload());

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.code).toBe('CHECKED_IN');
      await expectCheckInCount(1);
    });

    test('16. Allows check-in by authorized ADMIN with HTTP 200', async () => {
      const response = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validCheckinPayload());

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.code).toBe('CHECKED_IN');
      await expectCheckInCount(1);
    });

    test('17. Allows check-in via custom x-user-id header with x-user-role: GATE_STAFF', async () => {
      const response = await request(app)
        .post('/api/checkin/verify')
        .set('x-user-id', 'USR-STAFF-001')
        .set('x-user-role', 'GATE_STAFF')
        .send(validCheckinPayload());

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.code).toBe('CHECKED_IN');
      await expectCheckInCount(1);
    });

    test('18. Rejects x-user-id role bypass when NODE_ENV is not "test" with HTTP 401 UNAUTHORIZED', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const response = await request(app)
          .post('/api/checkin/verify')
          .set('x-user-id', 'USR-STAFF-001')
          .set('x-user-role', 'GATE_STAFF')
          .send(validCheckinPayload());

        expect(response.statusCode).toBe(401);
        expect(response.body.status).toBe('error');
        expect(response.body.code).toBe('UNAUTHORIZED');
        expect(response.body.message).toContain('Authentication is required. Provide a valid Bearer token.');
        await expectCheckInCount(0);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    test('19. Allows check-in with genuine Bearer token even when NODE_ENV is "production"', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const response = await request(app)
          .post('/api/checkin/verify')
          .set('Authorization', `Bearer ${gateStaffToken}`)
          .send(validCheckinPayload());

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe('success');
        expect(response.body.code).toBe('CHECKED_IN');
        await expectCheckInCount(1);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    test('20. End-to-end: Staff account is provisioned, logs in via /api/auth/login, and successfully performs check-in via /api/checkin/verify with genuine issued JWT', async () => {
      // 1. Provision staff user
      await UserModel.create({
        fullName: 'Real Gate Operator',
        email: 'real.operator@passpulse.io',
        passwordHash: await hashPassword('SecureGatePassword123'),
        role: 'GATE_STAFF',
      });

      // 2. Login via /api/auth/login to obtain genuine signed JWT
      const loginRes = await request(app).post('/api/auth/login').send({
        email: 'real.operator@passpulse.io',
        password: 'SecureGatePassword123',
      });

      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.body.status).toBe('success');
      expect(loginRes.body.data.user.role).toBe('GATE_STAFF');
      const genuineToken = loginRes.body.data.token;
      expect(genuineToken).toBeDefined();

      // 3. Perform check-in at /api/checkin/verify using genuine token
      const checkinRes = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${genuineToken}`)
        .send(validCheckinPayload());

      expect(checkinRes.statusCode).toBe(200);
      expect(checkinRes.body.status).toBe('success');
      expect(checkinRes.body.code).toBe('CHECKED_IN');
      expect(checkinRes.body.data.ticketId).toBe(baseData.ticketId);
      await expectCheckInCount(1);
    });

    test('21. Rejects check-in with HTTP 404 when ticket ID does not exist in ticket repository, even with VALID and CONFIRMED client payloads', async () => {
      const unknownPass = await generateQrPass({
        ticketId: 'TKT-UNKNOWN-404',
        eventId: baseData.eventId,
        userId: baseData.userId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });

      const response = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send({
          qrData: unknownPass.qrData,
          eventId: baseData.eventId,
          ticketStatus: 'VALID',
          bookingConfirmationStatus: 'CONFIRMED',
        });

      expect(response.statusCode).toBe(404);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('TICKET_NOT_FOUND');
      await expectCheckInCount(0);
    });
  });
});
