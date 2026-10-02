const { generateQrPass } = require('./qr.service');

const {
  processCheckIn,
  validateCheckInData,
  clearCheckInRecords,
} = require('./checkin.service');

describe('Check-in Service', () => {
  const baseData = {
    ticketId: 'TKT-CHECKIN-001',
    eventId: 'EVT-CHECKIN-001',
    userId: 'USR-CHECKIN-001',
  };

  let qrData;

  beforeEach(async () => {
    clearCheckInRecords();

    const pass = await generateQrPass({
      ...baseData,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    qrData = pass.qrData;
  });

  test('accepts a valid check-in', () => {
    const result = processCheckIn({
      qrData,
      eventId: baseData.eventId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    });

    expect(result.success).toBe(true);
    expect(result.reason).toBe('CHECKED_IN');
    expect(result.checkIn.ticketId).toBe(baseData.ticketId);
    expect(result.checkIn.eventId).toBe(baseData.eventId);
    expect(result.checkIn.userId).toBe(baseData.userId);
    expect(result.checkIn.checkedInAt).toBeDefined();
  });

  test('rejects a duplicate check-in', () => {
    const request = {
      qrData,
      eventId: baseData.eventId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    };

    const first = processCheckIn(request);
    const second = processCheckIn(request);

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.reason).toBe('DUPLICATE_ENTRY');
  });

  test('rejects a QR belonging to another event', () => {
    const result = processCheckIn({
      qrData,
      eventId: 'EVT-DIFFERENT',
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('WRONG_EVENT');
  });

  test('rejects missing booking/check-in fields', () => {
    const result = validateCheckInData({
      ticketId: baseData.ticketId,
      eventId: baseData.eventId,
      userId: baseData.userId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: null,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('MISSING_CHECKIN_FIELDS');
  });
});