process.env.QR_HMAC_SECRET =
  process.env.QR_HMAC_SECRET || 'test-qr-secret';

const request = require('supertest');
const app = require('../app');

const { generateQrPass } = require('../services/qr.service');
const { clearCheckInRecords } = require('../services/checkin.service');

describe('Check-in API', () => {
  const baseData = {
    ticketId: 'TKT-API-CHECKIN-001',
    eventId: 'EVT-API-CHECKIN-001',
    userId: 'USR-API-CHECKIN-001',
  };

  let qrData;

  beforeEach(async () => {
    clearCheckInRecords();

    const pass = await generateQrPass({
      ...baseData,
      expiresAt: new Date(
        Date.now() + 60 * 60 * 1000
      ).toISOString(),
    });

    qrData = pass.qrData;
  });

  test('accepts a valid check-in', async () => {
    const response = await request(app)
      .post('/api/checkin/verify')
      .send({
        qrData,
        eventId: baseData.eventId,
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.code).toBe('CHECKED_IN');

    expect(response.body.data.ticketId)
      .toBe(baseData.ticketId);

    expect(response.body.data.eventId)
      .toBe(baseData.eventId);

    expect(response.body.data.userId)
      .toBe(baseData.userId);

    expect(response.body.data.checkedInAt)
      .toBeDefined();
  });

  test('rejects a duplicate check-in', async () => {
    const payload = {
      qrData,
      eventId: baseData.eventId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    };

    const firstResponse = await request(app)
      .post('/api/checkin/verify')
      .send(payload);

    const secondResponse = await request(app)
      .post('/api/checkin/verify')
      .send(payload);

    expect(firstResponse.statusCode).toBe(200);

    expect(secondResponse.statusCode).toBe(409);
    expect(secondResponse.body.code)
      .toBe('DUPLICATE_ENTRY');
  });

  test('rejects a QR pass for another event', async () => {
    const response = await request(app)
      .post('/api/checkin/verify')
      .send({
        qrData,
        eventId: 'EVT-DIFFERENT-001',
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.code)
      .toBe('WRONG_EVENT');
  });

  test('rejects an invalid QR signature', async () => {
    const tampered = JSON.parse(qrData);
    tampered.ticketId = 'TKT-TAMPERED-001';

    const response = await request(app)
      .post('/api/checkin/verify')
      .send({
        qrData: JSON.stringify(tampered),
        eventId: baseData.eventId,
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.code)
      .toBe('INVALID_SIGNATURE');
  });
});