const { generateQrPass } = require('./qr.service');
const { registerTicket, clearTickets, initializeDefaultTickets } = require('./ticket.service');

const {
  processCheckIn,
  validateCheckInData,
  getCheckInRecord,
  getCheckInRecords,
  getCheckInCount,
  clearCheckInRecords,
} = require('./checkin.service');

describe('Check-in Service (FR-014 / Issue #26)', () => {
  const baseData = {
    ticketId: 'TKT-CHECKIN-001',
    eventId: 'EVT-CHECKIN-001',
    userId: 'USR-CHECKIN-001',
  };

  let qrData;

  beforeEach(async () => {
    clearCheckInRecords();
    clearTickets();

    const pass = await generateQrPass({
      ...baseData,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    qrData = pass.qrData;
  });

  test('1. First valid scan succeeds and records check-in timestamp', () => {
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

    // Verify timestamp is a valid ISO date
    const parsedDate = new Date(result.checkIn.checkedInAt);
    expect(!isNaN(parsedDate.getTime())).toBe(true);
    expect(parsedDate.getTime()).toBeLessThanOrEqual(Date.now());

    // Verify stored record
    const stored = getCheckInRecord(baseData.ticketId);
    expect(stored).not.toBeNull();
    expect(stored.ticketId).toBe(baseData.ticketId);
    expect(stored.checkedInAt).toBe(result.checkIn.checkedInAt);
  });

  test('2. Second scan of the same ticket returns DUPLICATE_ENTRY', () => {
    const request = {
      qrData,
      eventId: baseData.eventId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    };

    const first = processCheckIn(request);
    const second = processCheckIn(request);

    expect(first.success).toBe(true);
    expect(first.reason).toBe('CHECKED_IN');
    expect(second.success).toBe(false);
    expect(second.reason).toBe('DUPLICATE_ENTRY');
    expect(second.checkIn).toBeDefined();
    expect(second.checkIn.ticketId).toBe(baseData.ticketId);
  });

  test('3. Repeated scans do not create additional check-in records and preserve original timestamp', () => {
    const request = {
      qrData,
      eventId: baseData.eventId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    };

    const firstResult = processCheckIn(request);
    const originalTimestamp = firstResult.checkIn.checkedInAt;

    // Execute 5 subsequent scans
    for (let i = 0; i < 5; i++) {
      const repeated = processCheckIn(request);
      expect(repeated.success).toBe(false);
      expect(repeated.reason).toBe('DUPLICATE_ENTRY');
    }

    // Uniqueness assertion: Exactly 1 record exists
    expect(getCheckInCount()).toBe(1);
    expect(getCheckInRecords()).toHaveLength(1);

    // Stored timestamp must remain the original check-in timestamp
    const record = getCheckInRecord(baseData.ticketId);
    expect(record.checkedInAt).toBe(originalTimestamp);
  });

  test('4. Successful check-in records contain immutable timestamp and details', () => {
    const result = processCheckIn({
      qrData,
      eventId: baseData.eventId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    });

    const record = getCheckInRecord(baseData.ticketId);
    expect(record).toEqual(
      expect.objectContaining({
        ticketId: baseData.ticketId,
        eventId: baseData.eventId,
        userId: baseData.userId,
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
        checkedInAt: result.checkIn.checkedInAt,
      })
    );

    // Query helper returns null for non-existent check-in
    expect(getCheckInRecord('TKT-NON-EXISTENT')).toBeNull();
  });

  test('5. Simultaneous concurrent scans cannot produce multiple successful check-ins', async () => {
    const request = {
      qrData,
      eventId: baseData.eventId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    };

    // Simulate 10 simultaneous scan submissions
    const parallelCalls = Array.from({ length: 10 }, () =>
      Promise.resolve().then(() => processCheckIn(request))
    );

    const outcomes = await Promise.all(parallelCalls);

    const successes = outcomes.filter((res) => res.success === true);
    const duplicates = outcomes.filter(
      (res) => res.success === false && res.reason === 'DUPLICATE_ENTRY'
    );

    // Concurrency guarantee: Exactly 1 succeeds, exactly 9 rejected as DUPLICATE_ENTRY
    expect(successes).toHaveLength(1);
    expect(duplicates).toHaveLength(9);
    expect(getCheckInCount()).toBe(1);
  });

  test('6. Rejects invalid ticket status (CANCELLED, EXPIRED) appropriately', () => {
    const invalidValidation = validateCheckInData({
      ticketId: baseData.ticketId,
      eventId: baseData.eventId,
      userId: baseData.userId,
      ticketStatus: 'CANCELLED',
      bookingConfirmationStatus: 'CONFIRMED',
    });

    expect(invalidValidation.valid).toBe(false);
    expect(invalidValidation.reason).toBe('INVALID_TICKET_STATUS');

    const result = processCheckIn({
      qrData,
      eventId: baseData.eventId,
      ticketStatus: 'CANCELLED',
      bookingConfirmationStatus: 'CONFIRMED',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('INVALID_TICKET_STATUS');
    expect(getCheckInCount()).toBe(0);
  });

  test('7. Rejects unconfirmed booking status (PENDING) appropriately', () => {
    const pendingValidation = validateCheckInData({
      ticketId: baseData.ticketId,
      eventId: baseData.eventId,
      userId: baseData.userId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'PENDING',
    });

    expect(pendingValidation.valid).toBe(false);
    expect(pendingValidation.reason).toBe('UNCONFIRMED_BOOKING');

    const result = processCheckIn({
      qrData,
      eventId: baseData.eventId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'PENDING',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('UNCONFIRMED_BOOKING');
    expect(getCheckInCount()).toBe(0);
  });

  test('8. Rejects a registered ticket when central repository marks status as CANCELLED', () => {
    registerTicket({
      ticketId: baseData.ticketId,
      eventId: baseData.eventId,
      userId: baseData.userId,
      ticketStatus: 'CANCELLED',
      bookingConfirmationStatus: 'CONFIRMED',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    // Scanner client sends VALID, but backend repository knows ticket is CANCELLED
    const result = processCheckIn({
      qrData,
      eventId: baseData.eventId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('INVALID_TICKET_STATUS');
    expect(getCheckInCount()).toBe(0);
  });

  test('9. Rejects a QR belonging to another event', () => {
    const result = processCheckIn({
      qrData,
      eventId: 'EVT-DIFFERENT',
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('WRONG_EVENT');
    expect(getCheckInCount()).toBe(0);
  });

  test('10. Rejects missing booking/check-in fields', () => {
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

  test('11. Filters check-in records by eventId', async () => {
    // Check in ticket 1 for EVT-1
    processCheckIn({
      qrData,
      eventId: baseData.eventId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    });

    // Check in ticket 2 for EVT-2
    const pass2 = await generateQrPass({
      ticketId: 'TKT-EVENT2-001',
      eventId: 'EVT-OTHER-002',
      userId: 'USR-002',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    processCheckIn({
      qrData: pass2.qrData,
      eventId: 'EVT-OTHER-002',
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    });

    expect(getCheckInCount()).toBe(2);
    expect(getCheckInCount(baseData.eventId)).toBe(1);
    expect(getCheckInCount('EVT-OTHER-002')).toBe(1);
    expect(getCheckInRecords(baseData.eventId)).toHaveLength(1);
  });
});
