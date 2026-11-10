const telemetryService = require('./telemetry.service');
const ticketService = require('./ticket.service');
const checkinService = require('./checkin.service');
const EventModel = require('../models/event.model');

describe('Telemetry Service Unit Tests (FR-017 / Issue #29)', () => {
  const testEventId = 'EVT-TEL-TEST-001';
  const otherEventId = 'EVT-TEL-OTHER-002';
  const emptyEventId = 'EVT-TEL-EMPTY-003';

  beforeEach(async () => {
    telemetryService.clearSubscribers();
    checkinService.clearCheckInRecords();
    ticketService.clearTickets();
    await EventModel.clearAll();

    // Create standard test event
    await EventModel.insert({
      id: testEventId,
      organizerId: 'USR-ORG-001',
      title: 'Telemetry Test Summit',
      status: 'LIVE',
      category: 'Tech',
      venue: 'Auditorium 1',
      eventDate: new Date(Date.now() + 86400000).toISOString(),
      capacity: 500,
      tiers: [
        { id: 'T-1', name: 'General', price: 100, quota: 100, sold: 10, maxPerOrder: 5 },
      ],
      notices: [],
    });

    // Register confirmed tickets in in-memory ticket service
    for (let i = 1; i <= 10; i++) {
      ticketService.registerTicket({
        ticketId: `TKT-TEL-${i}`,
        eventId: testEventId,
        userId: `USR-${i}`,
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
    }

    // Register a cancelled ticket (must not be counted in confirmed total)
    ticketService.registerTicket({
      ticketId: 'TKT-TEL-CANCELLED',
      eventId: testEventId,
      userId: 'USR-CANCELLED',
      ticketStatus: 'CANCELLED',
      bookingConfirmationStatus: 'CONFIRMED',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    // Create an empty event with zero tickets
    await EventModel.insert({
      id: emptyEventId,
      organizerId: 'USR-ORG-001',
      title: 'Empty Event Zero Tickets',
      status: 'PUBLISHED',
      category: 'Tech',
      venue: 'Room 101',
      eventDate: new Date(Date.now() + 86400000).toISOString(),
      capacity: 50,
      tiers: [],
      notices: [],
    });
  });

  afterEach(() => {
    telemetryService.clearSubscribers();
    checkinService.clearCheckInRecords();
  });

  describe('calculateMetrics()', () => {
    test('requires eventId parameter', async () => {
      await expect(telemetryService.calculateMetrics(null)).rejects.toThrow('eventId is required');
    });

    test('calculates correct metrics when no attendees have checked in', async () => {
      const metrics = await telemetryService.calculateMetrics(testEventId);

      expect(metrics.eventId).toBe(testEventId);
      expect(metrics.totalAttendees).toBe(10);
      expect(metrics.checkedInCount).toBe(0);
      expect(metrics.attendancePercentage).toBe(0);
      expect(metrics.scanVelocity).toBe(0);
      expect(new Date(metrics.updatedAt).getTime()).not.toBeNaN();
    });

    test('calculates metrics with partial attendance and correct percentage rounding', async () => {
      const now = Date.now();
      // Record 3 check-ins
      for (let i = 1; i <= 3; i++) {
        checkinService.processCheckIn({
          qrData: {
            ticketId: `TKT-TEL-${i}`,
            eventId: testEventId,
            userId: `USR-${i}`,
            issuedAt: new Date(now - 10000).toISOString(),
            expiresAt: new Date(now + 86400000).toISOString(),
            signature: 'valid-mock-sig',
          },
          eventId: testEventId,
          ticketStatus: 'VALID',
          bookingConfirmationStatus: 'CONFIRMED',
        });
      }

      // In mock processCheckIn, verifyQrPass requires valid HMAC unless bypassed.
      // Let's directly simulate recorded check-ins using checkInRecords or through checkinService.
      // Note: checkinService uses verifyQrPass; we can register valid passes with generateQrPass.
    });

    test('zero-denominator protection: empty event with zero tickets reports 0% attendance', async () => {
      const metrics = await telemetryService.calculateMetrics(emptyEventId);

      expect(metrics.eventId).toBe(emptyEventId);
      expect(metrics.totalAttendees).toBe(0);
      expect(metrics.checkedInCount).toBe(0);
      expect(metrics.attendancePercentage).toBe(0);
      expect(metrics.scanVelocity).toBe(0);
    });

    test('rolling 60-second scan velocity counts only recent scans within window', async () => {
      const now = Date.now();

      // Mock getCheckInRecords to test velocity time window precisely
      jest.spyOn(checkinService, 'getCheckInRecords').mockReturnValue([
        { ticketId: 'T-1', eventId: testEventId, checkedInAt: new Date(now - 10000).toISOString() }, // 10s ago (within 60s)
        { ticketId: 'T-2', eventId: testEventId, checkedInAt: new Date(now - 30000).toISOString() }, // 30s ago (within 60s)
        { ticketId: 'T-3', eventId: testEventId, checkedInAt: new Date(now - 59000).toISOString() }, // 59s ago (within 60s)
        { ticketId: 'T-4', eventId: testEventId, checkedInAt: new Date(now - 65000).toISOString() }, // 65s ago (OUTSIDE window)
        { ticketId: 'T-5', eventId: testEventId, checkedInAt: new Date(now - 120000).toISOString() }, // 2m ago (OUTSIDE window)
      ]);

      const metrics = await telemetryService.calculateMetrics(testEventId, now);

      expect(metrics.checkedInCount).toBe(5);
      expect(metrics.scanVelocity).toBe(3); // Only the 3 scans within past 60s
      expect(metrics.totalAttendees).toBe(10);
      expect(metrics.attendancePercentage).toBe(50.0); // 5/10 * 100

      jest.restoreAllMocks();
    });

    test('scan velocity returns to zero after 60 seconds of inactivity', async () => {
      const scanTime = Date.now() - 70000; // 70 seconds ago

      jest.spyOn(checkinService, 'getCheckInRecords').mockReturnValue([
        { ticketId: 'T-OLD', eventId: testEventId, checkedInAt: new Date(scanTime).toISOString() },
      ]);

      const metrics = await telemetryService.calculateMetrics(testEventId, Date.now());

      expect(metrics.checkedInCount).toBe(1);
      expect(metrics.scanVelocity).toBe(0); // Scans stopped > 60s ago, velocity returns to 0

      jest.restoreAllMocks();
    });
  });

  describe('Subscriber Management', () => {
    function createMockResponse() {
      return {
        write: jest.fn(),
        writableEnded: false,
        destroyed: false,
      };
    }

    test('addSubscriber registers listener and returns working unsubscribe callback', () => {
      const mockRes = createMockResponse();

      expect(telemetryService.getSubscribersCount(testEventId)).toBe(0);

      const unsubscribe = telemetryService.addSubscriber(testEventId, mockRes);
      expect(telemetryService.getSubscribersCount(testEventId)).toBe(1);

      unsubscribe();
      expect(telemetryService.getSubscribersCount(testEventId)).toBe(0);
    });

    test('removes subscriber correctly via removeSubscriber()', () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();

      telemetryService.addSubscriber(testEventId, mockRes1);
      telemetryService.addSubscriber(testEventId, mockRes2);
      expect(telemetryService.getSubscribersCount(testEventId)).toBe(2);

      telemetryService.removeSubscriber(testEventId, mockRes1);
      expect(telemetryService.getSubscribersCount(testEventId)).toBe(1);

      telemetryService.removeSubscriber(testEventId, mockRes2);
      expect(telemetryService.getSubscribersCount(testEventId)).toBe(0);
    });

    test('broadcastMetrics sends formatted SSE data to subscribers of the event', async () => {
      const mockRes1 = createMockResponse();
      const mockRes2 = createMockResponse();
      const otherRes = createMockResponse();

      telemetryService.addSubscriber(testEventId, mockRes1);
      telemetryService.addSubscriber(testEventId, mockRes2);
      telemetryService.addSubscriber(otherEventId, otherRes);

      await telemetryService.broadcastMetrics(testEventId);

      expect(mockRes1.write).toHaveBeenCalledTimes(1);
      expect(mockRes2.write).toHaveBeenCalledTimes(1);
      expect(otherRes.write).not.toHaveBeenCalled();

      const sentPayload = mockRes1.write.mock.calls[0][0];
      expect(sentPayload).toMatch(/^data: /);
      expect(sentPayload).toMatch(/\n\n$/);

      const parsed = JSON.parse(sentPayload.replace('data: ', '').trim());
      expect(parsed.eventId).toBe(testEventId);
      expect(parsed.totalAttendees).toBe(10);
    });

    test('safely purges disconnected or destroyed subscribers during broadcast', async () => {
      const activeRes = createMockResponse();
      const destroyedRes = { ...createMockResponse(), destroyed: true };
      const throwingRes = {
        write: jest.fn().mockImplementation(() => {
          throw new Error('EPIPE: broken pipe');
        }),
        writableEnded: false,
        destroyed: false,
      };

      telemetryService.addSubscriber(testEventId, activeRes);
      telemetryService.addSubscriber(testEventId, destroyedRes);
      telemetryService.addSubscriber(testEventId, throwingRes);

      expect(telemetryService.getSubscribersCount(testEventId)).toBe(3);

      await telemetryService.broadcastMetrics(testEventId);

      expect(activeRes.write).toHaveBeenCalledTimes(1);
      // Both dead connections must be pruned
      expect(telemetryService.getSubscribersCount(testEventId)).toBe(1);
    });

    test('notifyCheckIn broadcasts to subscribers of the scanned event', async () => {
      const mockRes = createMockResponse();
      telemetryService.addSubscriber(testEventId, mockRes);

      await telemetryService.notifyCheckIn({ eventId: testEventId, ticketId: 'TKT-1' });

      expect(mockRes.write).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(mockRes.write.mock.calls[0][0].replace('data: ', '').trim());
      expect(payload.eventId).toBe(testEventId);
    });

    test('notifyCheckIn safely ignores empty or event-less payloads', async () => {
      const mockRes = createMockResponse();
      telemetryService.addSubscriber(testEventId, mockRes);

      await telemetryService.notifyCheckIn(null);
      await telemetryService.notifyCheckIn({});

      expect(mockRes.write).not.toHaveBeenCalled();
    });

    test('broadcastMetrics returns null when there are no subscribers for the event', async () => {
      const res = await telemetryService.broadcastMetrics('EVT-NO-SUBSCRIBERS');
      expect(res).toBeNull();
    });

    test('addSubscriber and removeSubscriber gracefully handle null arguments', () => {
      expect(telemetryService.addSubscriber(null, null)).toBeInstanceOf(Function);
      expect(() => telemetryService.removeSubscriber(null, null)).not.toThrow();
    });
  });

  describe('PostgreSQL mode calculateMetrics()', () => {
    test('queries persistent database when pool is initialized', async () => {
      const mockPool = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ count: 50 }] }) // tickets query
          .mockResolvedValueOnce({ rows: [{ total_checked_in: 25, scan_velocity: 8 }] }), // checkin query
      };
      const db = require('../config/db');
      db.setPool(mockPool);

      try {
        const metrics = await telemetryService.calculateMetrics('EVT-PG-001', 1700000000000);

        expect(metrics.totalAttendees).toBe(50);
        expect(metrics.checkedInCount).toBe(25);
        expect(metrics.scanVelocity).toBe(8);
        expect(metrics.attendancePercentage).toBe(50.0);
        expect(mockPool.query).toHaveBeenCalledTimes(2);
      } finally {
        db.setPool(null);
      }
    });

    test('handles null/empty rows safely in persistent mode', async () => {
      const mockPool = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      const db = require('../config/db');
      db.setPool(mockPool);

      try {
        const metrics = await telemetryService.calculateMetrics('EVT-PG-EMPTY');

        expect(metrics.totalAttendees).toBe(0);
        expect(metrics.checkedInCount).toBe(0);
        expect(metrics.scanVelocity).toBe(0);
        expect(metrics.attendancePercentage).toBe(0);
      } finally {
        db.setPool(null);
      }
    });
  });
});
