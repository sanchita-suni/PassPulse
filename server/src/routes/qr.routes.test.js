process.env.QR_HMAC_SECRET =
  process.env.QR_HMAC_SECRET || 'test-qr-secret';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret';

const path = require('path');
const { spawnSync } = require('child_process');
const request = require('supertest');
const app = require('../app');
const { createToken } = require('../middleware/auth.middleware');
const { registerTicket, clearTickets, initializeDefaultTickets } = require('../services/ticket.service');

describe('QR Pass API', () => {
  const validRequest = {
    ticketId: 'TKT-API-001',
  };

  let staffToken;
  let adminToken;
  let attendeeToken;

  beforeEach(() => {
    initializeDefaultTickets();

    staffToken = createToken({
      userId: 'USR-STAFF-001',
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

    registerTicket({
      ticketId: 'TKT-API-001',
      eventId: 'EVT-API-001',
      userId: 'USR-API-001',
      ticketTier: 'VIP Pass',
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  });

  describe('POST /api/qr/pass Security & Access Controls (FR-011 / SEC-006)', () => {
    test('rejects unauthenticated requests to POST /api/qr/pass with HTTP 401 Unauthorized', async () => {
      const response = await request(app)
        .post('/api/qr/pass')
        .send(validRequest);

      expect(response.statusCode).toBe(401);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    test('rejects unauthorized ATTENDEE requests to POST /api/qr/pass with HTTP 403 Forbidden', async () => {
      const response = await request(app)
        .post('/api/qr/pass')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send(validRequest);

      expect(response.statusCode).toBe(403);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('Forbidden: Access denied');
    });

    test('creates a QR pass for valid ticket when requested by authorized STAFF (request containing only ticketId)', async () => {
      const response = await request(app)
        .post('/api/qr/pass')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          ticketId: 'TKT-API-001',
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.status).toBe('success');

      expect(response.body.data.ticketId).toBe('TKT-API-001');
      expect(response.body.data.eventId).toBe('EVT-API-001');
      expect(response.body.data.userId).toBe('USR-API-001');

      expect(response.body.data.signature).toHaveLength(64);
      expect(response.body.data.qrData).toBeDefined();

      expect(response.body.data.qrCodeDataUrl)
        .toMatch(/^data:image\/png;base64,/);
    });

    test('creates a QR pass for valid ticket when requested by authorized ADMIN (request containing only ticketId)', async () => {
      const response = await request(app)
        .post('/api/qr/pass')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ticketId: 'TKT-API-001',
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.signature).toHaveLength(64);
      expect(response.body.data.ticketId).toBe('TKT-API-001');
    });

    test('rejects pass generation when ticket does not exist in repository with HTTP 404 TICKET_NOT_FOUND', async () => {
      const response = await request(app)
        .post('/api/qr/pass')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          ticketId: 'TKT-NONEXISTENT-999',
        });

      expect(response.statusCode).toBe(404);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('TICKET_NOT_FOUND');
    });

    test('rejects pass generation when ticket booking is not CONFIRMED with HTTP 400 UNCONFIRMED_BOOKING', async () => {
      registerTicket({
        ticketId: 'TKT-PENDING-MINT',
        eventId: 'EVT-API-001',
        userId: 'USR-API-001',
        ticketTier: 'Standard',
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'PENDING',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });

      const response = await request(app)
        .post('/api/qr/pass')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          ticketId: 'TKT-PENDING-MINT',
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('UNCONFIRMED_BOOKING');
    });

    test('rejects pass generation when ticket status is invalid or CANCELLED with HTTP 400 INVALID_TICKET_STATUS', async () => {
      registerTicket({
        ticketId: 'TKT-CANCELLED-MINT',
        eventId: 'EVT-API-001',
        userId: 'USR-API-001',
        ticketTier: 'Standard',
        ticketStatus: 'CANCELLED',
        bookingConfirmationStatus: 'CONFIRMED',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });

      const response = await request(app)
        .post('/api/qr/pass')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          ticketId: 'TKT-CANCELLED-MINT',
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('INVALID_TICKET_STATUS');
    });

    test('rejects pass generation when trusted repository ticket record is incomplete with HTTP 400 INCOMPLETE_TICKET_RECORD', async () => {
      registerTicket({
        ticketId: 'TKT-INCOMPLETE-001',
        // eventId missing from repository record
        userId: 'USR-API-001',
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });

      const response = await request(app)
        .post('/api/qr/pass')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          ticketId: 'TKT-INCOMPLETE-001',
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('INCOMPLETE_TICKET_RECORD');
    });

    test('strictly derives pass payload from trusted ticket record and client-supplied eventId/userId/expiresAt cannot override official values', async () => {
      // Official ticket has distinct eventId, userId, and expiresAt
      const officialExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      registerTicket({
        ticketId: 'TKT-TRUSTED-001',
        eventId: 'EVT-OFFICIAL-123',
        userId: 'USR-OFFICIAL-456',
        ticketTier: 'VIP Pass',
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
        expiresAt: officialExpiry,
      });

      // Client attempts to pass spoofed eventId, userId, and expiry in the request body
      const response = await request(app)
        .post('/api/qr/pass')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          ticketId: 'TKT-TRUSTED-001',
          eventId: 'EVT-SPOOFED-999',
          userId: 'USR-SPOOFED-999',
          expiresAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        });

      expect(response.statusCode).toBe(201);
      // Payload MUST strictly match official repository record, ignoring all client-supplied spoofing
      expect(response.body.data.eventId).toBe('EVT-OFFICIAL-123');
      expect(response.body.data.userId).toBe('USR-OFFICIAL-456');
      expect(response.body.data.expiresAt).toBe(officialExpiry);
    });

    test('rejects request with missing ticketId with HTTP 400 INVALID_QR_REQUEST', async () => {
      const response = await request(app)
        .post('/api/qr/pass')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({});

      expect(response.statusCode).toBe(400);
      expect(response.body.code).toBe('INVALID_QR_REQUEST');
      expect(response.body.message).toContain('ticketId is required');
    });

    test('rejects pass generation when official ticket record has expired with HTTP 400 EXPIRED_PASS', async () => {
      registerTicket({
        ticketId: 'TKT-EXPIRED-MINT',
        eventId: 'EVT-API-001',
        userId: 'USR-API-001',
        ticketTier: 'VIP Pass',
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString(), // Expired in repository
      });

      const response = await request(app)
        .post('/api/qr/pass')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          ticketId: 'TKT-EXPIRED-MINT',
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.code).toBe('EXPIRED_PASS');
      expect(response.body.message).toContain('Official ticket record has expired');
    });
  });

  describe('GET /api/qr/token Security Controls (SEC-002 / Issue #25)', () => {
    test('allows demo token generation for ATTENDEE in test environment', async () => {
      const response = await request(app)
        .get('/api/qr/token?userId=USR-ATTENDEE-001');

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.role).toBe('ATTENDEE');
    });

    test('rejects request for privileged ADMIN role with HTTP 403 Forbidden', async () => {
      const response = await request(app)
        .get('/api/qr/token?userId=USR-ADMIN-001&role=ADMIN');

      expect(response.statusCode).toBe(403);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('FORBIDDEN');
      expect(response.body.message).toContain('Forbidden: Demo token endpoint cannot issue privileged tokens');
    });

    test('rejects request for privileged GATE_STAFF role with HTTP 403 Forbidden', async () => {
      const response = await request(app)
        .get('/api/qr/token?userId=USR-GATE-001&role=GATE_STAFF');

      expect(response.statusCode).toBe(403);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('FORBIDDEN');
      expect(response.body.message).toContain('Forbidden: Demo token endpoint cannot issue privileged tokens');
    });

    test('rejects request for privileged STAFF role with HTTP 403 Forbidden', async () => {
      const response = await request(app)
        .get('/api/qr/token?userId=USR-STAFF-001&role=STAFF');

      expect(response.statusCode).toBe(403);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('FORBIDDEN');
      expect(response.body.message).toContain('Forbidden: Demo token endpoint cannot issue privileged tokens');
    });

    test('rejects demo token generation when NODE_ENV is production with HTTP 403 Forbidden', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const response = await request(app)
          .get('/api/qr/token?userId=USR-ATTENDEE-001');

        expect(response.statusCode).toBe(403);
        expect(response.body.status).toBe('error');
        expect(response.body.code).toBe('FORBIDDEN');
        expect(response.body.message).toContain('Demo token generation is disabled outside automated test environments');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('Application Startup & Configuration Controls (SEC-006)', () => {
    test('application refuses to start when QR_HMAC_SECRET is missing', () => {
      const appPath = path.resolve(__dirname, '../app.js');
      const envWithoutSecret = { ...process.env, DOTENV_CONFIG_PATH: '.env.nonexistent' };
      delete envWithoutSecret.QR_HMAC_SECRET;

      const result = spawnSync(
        process.execPath,
        ['-e', `require(${JSON.stringify(appPath)})`],
        {
          cwd: path.resolve(__dirname, '../..'),
          env: envWithoutSecret,
          encoding: 'utf8',
        }
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('QR_HMAC_SECRET is not configured');
    });

    test('application refuses to start when QR_HMAC_SECRET is empty string', () => {
      const appPath = path.resolve(__dirname, '../app.js');
      const result = spawnSync(
        process.execPath,
        ['-e', `require(${JSON.stringify(appPath)})`],
        {
          cwd: path.resolve(__dirname, '../..'),
          env: {
            ...process.env,
            QR_HMAC_SECRET: '',
          },
          encoding: 'utf8',
        }
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('QR_HMAC_SECRET is not configured');
    });
  });
});
