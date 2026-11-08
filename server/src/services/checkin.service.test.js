process.env.QR_HMAC_SECRET =
  process.env.QR_HMAC_SECRET || 'test-qr-secret';

const crypto = require('crypto');
const { generateQrPass } = require('./qr.service');
const { registerTicket, clearTickets, initializeDefaultTickets } = require('./ticket.service');
const db = require('../config/db');
const {
  createPostgresTestDatabase,
  seedPersistentTicket,
} = require('../../tests/helpers/postgres-test-database');

const {
  processCheckIn,
  validateCheckInData,
  processPersistentCheckIn,
  getPersistentCheckInRecord,
  getPersistentCheckInRecords,
  getCheckInRecord,
  getCheckInRecords,
  getCheckInCount,
  clearCheckInRecords,
} = require('./checkin.service');

const describePostgres = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

describe('Check-in Service (FR-014 / Issue #26)', () => {
  const baseData = {
    ticketId: 'TKT-CHECKIN-001',
    eventId: 'EVT-CHECKIN-001',
    userId: 'USR-CHECKIN-001',
  };

  let qrData;
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

    registerTicket({
      ticketId: baseData.ticketId,
      eventId: baseData.eventId,
      userId: baseData.userId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

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

    // Register ticket with CANCELLED status in repository
    registerTicket({
      ticketId: baseData.ticketId,
      eventId: baseData.eventId,
      userId: baseData.userId,
      ticketStatus: 'CANCELLED',
      bookingConfirmationStatus: 'CONFIRMED',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    // Scanner client claims VALID, but repository status is CANCELLED (authoritative)
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

    // Register ticket with PENDING status in repository
    registerTicket({
      ticketId: baseData.ticketId,
      eventId: baseData.eventId,
      userId: baseData.userId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'PENDING',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    // Scanner client claims CONFIRMED, but repository status is PENDING (authoritative)
    const result = processCheckIn({
      qrData,
      eventId: baseData.eventId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
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

    registerTicket({
      ticketId: 'TKT-EVENT2-001',
      eventId: 'EVT-OTHER-002',
      userId: 'USR-002',
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
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

  test('12. Rejects check-in when ticket ID does not exist in ticket repository, even if request claims VALID and CONFIRMED', async () => {
    const unknownPass = await generateQrPass({
      ticketId: 'TKT-UNREGISTERED-999',
      eventId: baseData.eventId,
      userId: baseData.userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const result = processCheckIn({
      qrData: unknownPass.qrData,
      eventId: baseData.eventId,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('TICKET_NOT_FOUND');
    expect(getCheckInCount()).toBe(0);
  });

  describePostgres('PostgreSQL check-in persistence', () => {
    let fixture;
    let persistentQrData;

    beforeEach(async () => {
      fixture = {
        ticketId: `TKT-PERSISTENT-${crypto.randomUUID()}`,
        eventId: `EVT-PERSISTENT-${crypto.randomUUID()}`,
        userId: `USR-PERSISTENT-${crypto.randomUUID()}`,
      };
      await seedPersistentTicket(db.getPool(), fixture);
      const pass = await generateQrPass({
        ...fixture,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      persistentQrData = pass.qrData;
    });

    test('records a persistent check-in and exposes filtered and unfiltered records', async () => {
      const result = await processPersistentCheckIn({
        qrData: JSON.parse(persistentQrData),
        eventId: fixture.eventId,
        ipAddress: '127.0.0.1',
      });

      expect(result.success).toBe(true);
      expect(result.checkIn).toMatchObject({
        ticketId: fixture.ticketId,
        eventId: fixture.eventId,
        userId: fixture.userId,
        scannedBy: null,
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      });
      const record = await getPersistentCheckInRecord(fixture.ticketId);
      expect(record).toMatchObject(result.checkIn);
      expect(await getPersistentCheckInRecord(null)).toBeNull();
      expect(await getPersistentCheckInRecord('TKT-NOT-RECORDED')).toBeNull();
      await expect(getPersistentCheckInRecords()).resolves.toEqual([record]);
      await expect(getPersistentCheckInRecords(fixture.eventId)).resolves.toEqual([record]);
      await expect(getPersistentCheckInRecords('EVT-NOT-RECORDED')).resolves.toEqual([]);
    });

    test('audits malformed QR data, missing tickets, and scans for another event', async () => {
      const malformed = await processPersistentCheckIn({
        qrData: 'not-json',
        eventId: fixture.eventId,
      });
      expect(malformed).toMatchObject({ success: false, reason: 'INVALID_QR_FORMAT' });

      const missingPass = await generateQrPass({
        ...fixture,
        ticketId: `TKT-MISSING-${crypto.randomUUID()}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      const missing = await processPersistentCheckIn({
        qrData: missingPass.qrData,
        eventId: fixture.eventId,
      });
      expect(missing).toMatchObject({ success: false, reason: 'TICKET_NOT_FOUND' });

      const wrongEvent = await processPersistentCheckIn({
        qrData: persistentQrData,
        eventId: `EVT-WRONG-${crypto.randomUUID()}`,
      });
      expect(wrongEvent).toMatchObject({ success: false, reason: 'WRONG_EVENT' });

      const { rows } = await db.query(
        `SELECT action, target FROM audit_log
         WHERE action = 'CHECK_IN_REJECTED'
         ORDER BY created_at, id`
      );
      expect(rows).toEqual(expect.arrayContaining([
        { action: 'CHECK_IN_REJECTED', target: null },
        expect.objectContaining({ action: 'CHECK_IN_REJECTED', target: expect.stringMatching(/^TKT-MISSING-/) }),
        { action: 'CHECK_IN_REJECTED', target: fixture.ticketId },
      ]));
    });
  });
});
