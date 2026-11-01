process.env.QR_HMAC_SECRET =
  process.env.QR_HMAC_SECRET || 'test-qr-secret';

const request = require('supertest');
const app = require('../app');

describe('QR Pass API', () => {
  const validRequest = {
    ticketId: 'TKT-API-001',
    eventId: 'EVT-API-001',
    userId: 'USR-API-001',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };

  test('creates a QR pass for valid input', async () => {
    const response = await request(app)
      .post('/api/qr/pass')
      .send(validRequest);

    expect(response.statusCode).toBe(201);
    expect(response.body.status).toBe('success');

    expect(response.body.data.ticketId).toBe(validRequest.ticketId);
    expect(response.body.data.eventId).toBe(validRequest.eventId);
    expect(response.body.data.userId).toBe(validRequest.userId);

    expect(response.body.data.signature).toHaveLength(64);
    expect(response.body.data.qrData).toBeDefined();

    expect(response.body.data.qrCodeDataUrl)
      .toMatch(/^data:image\/png;base64,/);
  });

  test('rejects request with missing fields', async () => {
    const response = await request(app)
      .post('/api/qr/pass')
      .send({
        ticketId: 'TKT-API-002',
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('INVALID_QR_REQUEST');
  });

  test('rejects an expired QR pass request', async () => {
    const response = await request(app)
      .post('/api/qr/pass')
      .send({
        ...validRequest,
        ticketId: 'TKT-API-003',
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('INVALID_EXPIRY');
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
});
