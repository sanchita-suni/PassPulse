process.env.QR_HMAC_SECRET =
  process.env.QR_HMAC_SECRET || 'test-qr-secret';

const request = require('supertest');
const app = require('../app');

const { generateQrPass } = require('../services/qr.service');
const { clearCheckInRecords, getCheckInCount, getCheckInRecord } = require('../services/checkin.service');

describe('Check-in API (FR-014 / Issue #26)', () => {
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

  test('1. Accepts a valid check-in and returns HTTP 200 with CHECKED_IN and timestamp', async () => {
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

    expect(response.body.data.ticketId).toBe(baseData.ticketId);
    expect(response.body.data.eventId).toBe(baseData.eventId);
    expect(response.body.data.userId).toBe(baseData.userId);
    expect(response.body.data.checkedInAt).toBeDefined();

    const timestamp = new Date(response.body.data.checkedInAt);
    expect(!isNaN(timestamp.getTime())).toBe(true);
    expect(getCheckInCount()).toBe(1);
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
      .send(payload);

    const secondResponse = await request(app)
      .post('/api/checkin/verify')
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
      .send(payload);
    expect(firstResponse.statusCode).toBe(200);
    const initialTimestamp = firstResponse.body.data.checkedInAt;

    // Rescan 3 times
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/checkin/verify')
        .send(payload);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe('DUPLICATE_ENTRY');
    }

    // Assert strictly 1 record maintained
    expect(getCheckInCount()).toBe(1);
    const record = getCheckInRecord(baseData.ticketId);
    expect(record.checkedInAt).toBe(initialTimestamp);
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
      request(app).post('/api/checkin/verify').send(payload)
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

    expect(getCheckInCount()).toBe(1);
  });

  test('5. Rejects a cancelled ticket status with HTTP 400 INVALID_TICKET_STATUS', async () => {
    const response = await request(app)
      .post('/api/checkin/verify')
      .send({
        qrData,
        eventId: baseData.eventId,
        ticketStatus: 'CANCELLED',
        bookingConfirmationStatus: 'CONFIRMED',
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('INVALID_TICKET_STATUS');
    expect(getCheckInCount()).toBe(0);
  });

  test('6. Rejects an unconfirmed booking status with HTTP 400 UNCONFIRMED_BOOKING', async () => {
    const response = await request(app)
      .post('/api/checkin/verify')
      .send({
        qrData,
        eventId: baseData.eventId,
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'PENDING',
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('UNCONFIRMED_BOOKING');
    expect(getCheckInCount()).toBe(0);
  });

  test('7. Rejects request with missing required check-in fields with HTTP 400', async () => {
    const response = await request(app)
      .post('/api/checkin/verify')
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
      .send({
        qrData,
        eventId: 'EVT-DIFFERENT-001',
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('WRONG_EVENT');
    expect(getCheckInCount()).toBe(0);
  });

  test('9. Rejects an invalid QR signature with HTTP 400 INVALID_SIGNATURE', async () => {
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
    expect(response.body.code).toBe('INVALID_SIGNATURE');
    expect(getCheckInCount()).toBe(0);
  });
});
