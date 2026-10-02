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
});