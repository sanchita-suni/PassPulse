const {
  generateAttendanceReport,
  generateRevenueReport,
  registerBookingRecord,
  clearBookingRecords,
  getEventMetadata,
} = require('./report.service');
const {
  registerTicket,
  clearTickets,
  initializeDefaultTickets,
} = require('./ticket.service');
const checkinService = require('./checkin.service');
const EventModel = require('../models/event.model');
const db = require('../config/db');

describe('report.service — Attendance & Revenue Reports (FR-018)', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    clearTickets();
    clearBookingRecords();
    checkinService.clearCheckInRecords();
    await EventModel.clearAll();

    // Seed test events
    await EventModel.insert({
      id: 'EVT-REP-001',
      organizerId: 'USR-ORG-001',
      title: 'DevOps Summit 2026',
      category: 'Tech',
      venue: 'PES Auditorium',
      eventDate: '2026-11-20T10:00:00.000Z',
      capacity: 500,
      status: 'PUBLISHED',
      tiers: [
        { id: 'TIER-VIP', name: 'VIP Pass', price: 1000, quota: 50, sold: 2, maxPerOrder: 2 },
        { id: 'TIER-GEN', name: 'General', price: 500, quota: 200, sold: 3, maxPerOrder: 5 },
      ],
    });

    await EventModel.insert({
      id: 'EVT-EMPTY-001',
      organizerId: 'USR-ORG-001',
      title: 'Empty Event',
      category: 'General',
      venue: 'Hall 2',
      eventDate: '2026-12-01T10:00:00.000Z',
      capacity: 100,
      status: 'PUBLISHED',
      tiers: [],
    });
  });

  afterEach(() => {
    clearTickets();
    clearBookingRecords();
    checkinService.clearCheckInRecords();
  });

  describe('registerBookingRecord and In-Memory Helpers Edge Cases', () => {
    test('throws error if booking record is missing id', () => {
      expect(() => registerBookingRecord(null)).toThrow('id is required');
      expect(() => registerBookingRecord({})).toThrow('id is required');
    });

    test('populates fallback defaults when registering minimal booking record', () => {
      const b = registerBookingRecord({
        id: 'BKG-MIN-1',
        eventId: 'EVT-REP-001',
      });
      expect(b.userId).toBe('USR-UNKNOWN');
      expect(b.purchaserName).toBe('Anonymous');
      expect(b.status).toBe('CONFIRMED');
      expect(b.totalAmount).toBe(0);
      expect(b.ticketCount).toBe(1);
    });

    test('getBookingRecordsByEvent returns empty array for null/empty eventId', () => {
      const { getBookingRecordsByEvent } = require('./report.service');
      expect(getBookingRecordsByEvent(null)).toEqual([]);
      expect(getBookingRecordsByEvent('')).toEqual([]);
    });

    test('generateAttendanceReport requires eventId', async () => {
      await expect(generateAttendanceReport(null)).rejects.toThrow('eventId is required');
    });

    test('generateRevenueReport requires eventId', async () => {
      await expect(generateRevenueReport(null)).rejects.toThrow('eventId is required');
    });

    test('derives totalTicketsSold from tiers sold when no individual tickets exist', async () => {
      // Event EVT-REP-001 has tiers with sold: 2 and sold: 3 = 5 total
      const rep = await generateRevenueReport('EVT-REP-001', 'json');
      expect(rep.summary.totalTicketsSold).toBe(5);
    });
  });

  describe('getEventMetadata', () => {
    test('returns event metadata from in-memory EventModel', async () => {
      const meta = await getEventMetadata('EVT-REP-001');
      expect(meta).not.toBeNull();
      expect(meta.id).toBe('EVT-REP-001');
      expect(meta.title).toBe('DevOps Summit 2026');
      expect(meta.tiers).toHaveLength(2);
    });

    test('returns null for non-existent event', async () => {
      const meta = await getEventMetadata('EVT-NON-EXISTENT');
      expect(meta).toBeNull();
    });
  });

  describe('generateAttendanceReport (In-Memory Mode)', () => {
    test('throws 404 error if event does not exist', async () => {
      await expect(generateAttendanceReport('EVT-GHOST')).rejects.toMatchObject({
        code: 'EVENT_NOT_FOUND',
        status: 404,
      });
    });

    test('handles empty event with zero tickets safely', async () => {
      const rep = await generateAttendanceReport('EVT-EMPTY-001', 'csv');
      expect(rep.summary.totalConfirmed).toBe(0);
      expect(rep.summary.totalCheckedIn).toBe(0);
      expect(rep.summary.attendancePercentage).toBe(0);
      expect(rep.contentType).toBe('text/csv; charset=utf-8');
      expect(rep.filename).toBe('attendance-report-EVT-EMPTY-001.csv');

      // CSV has header only
      const lines = rep.data.trim().split('\r\n');
      expect(lines).toHaveLength(1);
    });

    test('generates attendance CSV where row count equals confirmed tickets (TC-ANL-02)', async () => {
      // Register 4 confirmed tickets
      registerTicket({
        ticketId: 'TKT-001',
        eventId: 'EVT-REP-001',
        userId: 'USR-1',
        attendeeName: 'Alice',
        attendeeEmail: 'alice@example.com',
        ticketTier: 'VIP Pass',
        price: 1000,
        bookingConfirmationStatus: 'CONFIRMED',
        ticketStatus: 'VALID',
        bookingReference: 'BKG-001',
        createdAt: '2026-11-01T10:00:00Z',
      });
      registerTicket({
        ticketId: 'TKT-002',
        eventId: 'EVT-REP-001',
        userId: 'USR-2',
        attendeeName: 'Bob',
        attendeeEmail: 'bob@example.com',
        ticketTier: 'General',
        price: 500,
        bookingConfirmationStatus: 'CONFIRMED',
        ticketStatus: 'VALID',
        bookingReference: 'BKG-002',
        createdAt: '2026-11-01T10:00:00Z',
      });
      registerTicket({
        ticketId: 'TKT-003',
        eventId: 'EVT-REP-001',
        userId: 'USR-3',
        attendeeName: 'Charlie',
        attendeeEmail: 'charlie@example.com',
        ticketTier: 'General',
        price: 500,
        bookingConfirmationStatus: 'CONFIRMED',
        ticketStatus: 'VALID',
        bookingReference: 'BKG-003',
        createdAt: '2026-11-01T10:00:00Z',
      });
      // Register 1 cancelled ticket (must be excluded from confirmed attendance count)
      registerTicket({
        ticketId: 'TKT-004-CAN',
        eventId: 'EVT-REP-001',
        userId: 'USR-4',
        attendeeName: 'David',
        attendeeEmail: 'david@example.com',
        ticketTier: 'General',
        price: 500,
        bookingConfirmationStatus: 'CONFIRMED',
        ticketStatus: 'CANCELLED',
        bookingReference: 'BKG-004',
        createdAt: '2026-11-01T10:00:00Z',
      });

      // Mock check-ins for TKT-001 and TKT-002
      jest.spyOn(checkinService, 'getCheckInRecords').mockReturnValue([
        {
          ticketId: 'TKT-001',
          eventId: 'EVT-REP-001',
          gateStaffId: 'STAFF-1',
          checkedInAt: '2026-11-20T10:15:00Z',
        },
        {
          ticketId: 'TKT-002',
          eventId: 'EVT-REP-001',
          gateStaffId: 'STAFF-1',
          checkedInAt: '2026-11-20T10:20:00Z',
        },
      ]);

      const report = await generateAttendanceReport('EVT-REP-001', 'csv');

      // Acceptance criterion: exactly 3 confirmed tickets (cancelled excluded)
      expect(report.summary.totalConfirmed).toBe(3);
      expect(report.summary.totalCheckedIn).toBe(2);
      expect(report.summary.attendancePercentage).toBe(66.7); // 2/3 * 100 = 66.7%

      const lines = report.data.trim().split('\r\n');
      // 1 header line + 3 confirmed ticket data rows = 4 lines total
      expect(lines).toHaveLength(4);
      expect(lines[0]).toContain('Ticket ID,Attendee Name,Attendee Email,Tier');
      expect(report.data).toContain('TKT-001,Alice,alice@example.com,VIP Pass,BKG-001,VALID,CHECKED_IN');
      expect(report.data).toContain('TKT-002,Bob,bob@example.com,General,BKG-002,VALID,CHECKED_IN');
      expect(report.data).toContain('TKT-003,Charlie,charlie@example.com,General,BKG-003,VALID,PENDING');
      expect(report.data).not.toContain('TKT-004-CAN');
    });

    test('generates attendance PDF report buffer with valid PDF 1.4 header', async () => {
      registerTicket({
        ticketId: 'TKT-PDF-01',
        eventId: 'EVT-REP-001',
        userId: 'USR-PDF',
        attendeeName: 'Emma Watson',
        attendeeEmail: 'emma@example.com',
        ticketTier: 'VIP Pass',
        price: 1000,
        bookingConfirmationStatus: 'CONFIRMED',
        ticketStatus: 'VALID',
        bookingReference: 'BKG-PDF-01',
      });

      const rep = await generateAttendanceReport('EVT-REP-001', 'pdf');
      expect(rep.format).toBe('pdf');
      expect(rep.contentType).toBe('application/pdf');
      expect(rep.filename).toBe('attendance-report-EVT-REP-001.pdf');
      expect(Buffer.isBuffer(rep.data)).toBe(true);
      expect(rep.data.toString('binary')).toContain('%PDF-1.4');
      expect(rep.data.toString('binary')).toContain('PassPulse Attendance Summary Report');
    });

    test('generates JSON format when requested', async () => {
      registerTicket({
        ticketId: 'TKT-JSON-01',
        eventId: 'EVT-REP-001',
        userId: 'USR-JSON',
        attendeeName: 'John',
        attendeeEmail: 'john@example.com',
        ticketTier: 'General',
        price: 500,
        bookingConfirmationStatus: 'CONFIRMED',
        ticketStatus: 'VALID',
      });

      const rep = await generateAttendanceReport('EVT-REP-001', 'json');
      expect(rep.format).toBe('json');
      expect(rep.contentType).toBe('application/json');
      expect(rep.tickets).toHaveLength(1);
      expect(rep.tickets[0].ticketId).toBe('TKT-JSON-01');
    });
  });

  describe('generateRevenueReport (In-Memory Mode)', () => {
    test('handles empty event with zero bookings safely', async () => {
      const rep = await generateRevenueReport('EVT-EMPTY-001', 'csv');
      expect(rep.summary.totalConfirmedRevenue).toBe(0);
      expect(rep.summary.totalConfirmedBookings).toBe(0);
      expect(rep.summary.totalTicketsSold).toBe(0);
      expect(rep.summary.averageOrderValue).toBe(0);
      expect(rep.contentType).toBe('text/csv; charset=utf-8');
      expect(rep.filename).toBe('revenue-report-EVT-EMPTY-001.csv');

      const lines = rep.data.trim().split('\r\n');
      expect(lines).toHaveLength(1); // Header only
    });

    test('calculates authoritative revenue from explicit bookings (excluding cancelled)', async () => {
      registerBookingRecord({
        id: 'BKG-REV-001',
        eventId: 'EVT-REP-001',
        userId: 'USR-1',
        purchaserName: 'Alice',
        purchaserEmail: 'alice@example.com',
        status: 'CONFIRMED',
        totalAmount: 2000,
        ticketCount: 2,
        tierNames: 'VIP Pass',
        createdAt: '2026-11-01T10:00:00Z',
      });
      registerBookingRecord({
        id: 'BKG-REV-002',
        eventId: 'EVT-REP-001',
        userId: 'USR-2',
        purchaserName: 'Bob',
        purchaserEmail: 'bob@example.com',
        status: 'CONFIRMED',
        totalAmount: 1500,
        ticketCount: 3,
        tierNames: 'General',
        createdAt: '2026-11-02T10:00:00Z',
      });
      // Cancelled booking: must NOT be added to total confirmed revenue
      registerBookingRecord({
        id: 'BKG-REV-003-CAN',
        eventId: 'EVT-REP-001',
        userId: 'USR-3',
        purchaserName: 'Charlie',
        purchaserEmail: 'charlie@example.com',
        status: 'CANCELLED',
        totalAmount: 500,
        ticketCount: 1,
        tierNames: 'General',
        createdAt: '2026-11-03T10:00:00Z',
      });

      const rep = await generateRevenueReport('EVT-REP-001', 'csv');

      // Confirmed revenue = 2000 + 1500 = 3500 (Charlie's 500 cancelled is excluded)
      expect(rep.summary.totalConfirmedRevenue).toBe(3500);
      expect(rep.summary.totalConfirmedBookings).toBe(2);
      expect(rep.summary.totalTicketsSold).toBe(5);
      expect(rep.summary.averageOrderValue).toBe(1750); // 3500 / 2

      // CSV checks
      const lines = rep.data.trim().split('\r\n');
      expect(lines).toHaveLength(4); // 1 header + 3 bookings (all bookings listed with status)
      expect(rep.data).toContain('BKG-REV-001,2026-11-01T10:00:00Z,Alice,alice@example.com,VIP Pass,2,2000.00,CONFIRMED');
      expect(rep.data).toContain('BKG-REV-003-CAN,2026-11-03T10:00:00Z,Charlie,charlie@example.com,General,1,500.00,CANCELLED');
    });

    test('derives revenue from confirmed tickets when explicit bookings are not registered', async () => {
      registerTicket({
        ticketId: 'TKT-AUTO-1',
        eventId: 'EVT-REP-001',
        userId: 'USR-AUTO',
        attendeeName: 'Diana',
        attendeeEmail: 'diana@example.com',
        ticketTier: 'VIP Pass',
        price: 1000,
        bookingConfirmationStatus: 'CONFIRMED',
        ticketStatus: 'VALID',
        bookingReference: 'BKG-AUTO-1',
      });
      registerTicket({
        ticketId: 'TKT-AUTO-2',
        eventId: 'EVT-REP-001',
        userId: 'USR-AUTO',
        attendeeName: 'Diana',
        attendeeEmail: 'diana@example.com',
        ticketTier: 'VIP Pass',
        price: 1000,
        bookingConfirmationStatus: 'CONFIRMED',
        ticketStatus: 'VALID',
        bookingReference: 'BKG-AUTO-1',
      });

      const rep = await generateRevenueReport('EVT-REP-001', 'csv');
      expect(rep.summary.totalConfirmedRevenue).toBe(2000);
      expect(rep.summary.totalConfirmedBookings).toBe(1);
      expect(rep.summary.totalTicketsSold).toBe(2);
      expect(rep.summary.averageOrderValue).toBe(2000);
    });

    test('generates revenue PDF report buffer with tier breakdown and bookings table', async () => {
      registerBookingRecord({
        id: 'BKG-PDF-REV',
        eventId: 'EVT-REP-001',
        purchaserName: 'Grace',
        purchaserEmail: 'grace@example.com',
        status: 'CONFIRMED',
        totalAmount: 1000,
        ticketCount: 1,
        tierNames: 'VIP Pass',
      });

      const rep = await generateRevenueReport('EVT-REP-001', 'pdf');
      expect(rep.format).toBe('pdf');
      expect(rep.contentType).toBe('application/pdf');
      expect(rep.filename).toBe('revenue-report-EVT-REP-001.pdf');
      expect(Buffer.isBuffer(rep.data)).toBe(true);
      expect(rep.data.toString('binary')).toContain('%PDF-1.4');
      expect(rep.data.toString('binary')).toContain('PassPulse Revenue');
      expect(rep.data.toString('binary')).toContain('Tier Performance Summary');
    });
  });

  describe('generateAttendanceReport and generateRevenueReport (Mocked PostgreSQL Mode)', () => {
    test('executes authoritative SQL queries for attendance and revenue in persistent DB mode', async () => {
      const mockPool = {
        query: jest.fn(),
      };
      db.setPool(mockPool);

      // 1. Attendance Report Mock Responses
      mockPool.query
        // getEventMetadata: events
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'EVT-SQL-001',
            organizer_id: 'USR-ORG-001',
            title: 'SQL Conference',
            category: 'Tech',
            venue: 'PES Hall',
            event_date: '2026-11-25T09:00:00Z',
            capacity: 200,
            status: 'PUBLISHED',
          }],
        })
        // getEventMetadata: ticket_tiers
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'TIER-SQL-1',
            name: 'General',
            price: '300.00',
            quota: 200,
            sold: 2,
            max_per_order: 5,
          }],
        })
        // tickets Result (1 checked in, 1 pending)
        .mockResolvedValueOnce({
          rowCount: 2,
          rows: [
            {
              ticket_id: 'TKT-SQL-01',
              booking_id: 'BKG-SQL-01',
              ticket_status: 'VALID',
              issued_at: '2026-11-01T10:00:00Z',
              attendee_name: 'SQL User 1',
              attendee_email: 'sql1@example.com',
              tier_name: 'General',
              tier_price: '300.00',
              checked_in_at: '2026-11-25T09:10:00Z',
              scanned_by: 'STAFF-SQL',
            },
            {
              ticket_id: 'TKT-SQL-02',
              booking_id: 'BKG-SQL-02',
              ticket_status: 'VALID',
              issued_at: '2026-11-01T10:05:00Z',
              attendee_name: 'SQL User 2',
              attendee_email: 'sql2@example.com',
              tier_name: 'General',
              tier_price: '300.00',
              checked_in_at: null,
              scanned_by: null,
            },
          ],
        });

      const attRep = await generateAttendanceReport('EVT-SQL-001', 'csv');
      expect(attRep.summary.totalConfirmed).toBe(2);
      expect(attRep.summary.totalCheckedIn).toBe(1);
      expect(attRep.summary.attendancePercentage).toBe(50.0);
      expect(attRep.data).toContain('TKT-SQL-01,SQL User 1,sql1@example.com,General,BKG-SQL-01,VALID,CHECKED_IN');

      // 2. Revenue Report Mock Responses
      mockPool.query
        // getEventMetadata: events
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'EVT-SQL-001',
            organizer_id: 'USR-ORG-001',
            title: 'SQL Conference',
            category: 'Tech',
            venue: 'PES Hall',
            event_date: '2026-11-25T09:00:00Z',
            capacity: 200,
            status: 'PUBLISHED',
          }],
        })
        // getEventMetadata: ticket_tiers
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'TIER-SQL-1',
            name: 'General',
            price: '300.00',
            quota: 200,
            sold: 2,
            max_per_order: 5,
          }],
        })
        // revResult: SUM(bookings.total_amount)
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            total_revenue: '600.00',
            total_bookings: 2,
          }],
        })
        // tierResult
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            tier_id: 'TIER-SQL-1',
            tier_name: 'General',
            tier_price: '300.00',
            quota: 200,
            tickets_sold: 2,
            tier_revenue: '600.00',
          }],
        })
        // bookingsResult
        .mockResolvedValueOnce({
          rowCount: 2,
          rows: [
            {
              booking_id: 'BKG-SQL-01',
              user_id: 'USR-1',
              purchaser_name: 'SQL User 1',
              purchaser_email: 'sql1@example.com',
              booking_status: 'CONFIRMED',
              total_amount: '300.00',
              created_at: '2026-11-01T10:00:00Z',
              ticket_count: 1,
              tier_names: 'General',
            },
            {
              booking_id: 'BKG-SQL-02',
              user_id: 'USR-2',
              purchaser_name: 'SQL User 2',
              purchaser_email: 'sql2@example.com',
              booking_status: 'CONFIRMED',
              total_amount: '300.00',
              created_at: '2026-11-01T10:05:00Z',
              ticket_count: 1,
              tier_names: 'General',
            },
          ],
        });

      const revRep = await generateRevenueReport('EVT-SQL-001', 'csv');
      expect(revRep.summary.totalConfirmedRevenue).toBe(600.0);
      expect(revRep.summary.totalConfirmedBookings).toBe(2);
      expect(revRep.summary.totalTicketsSold).toBe(2);
      expect(revRep.summary.averageOrderValue).toBe(300.0);
      expect(revRep.data).toContain('BKG-SQL-01,2026-11-01T10:00:00.000Z,SQL User 1,sql1@example.com,General,1,300.00,CONFIRMED');

      db.setPool(null);
    });

    test('regression: tier breakdown query verifies SQL join isolates confirmed bookings', async () => {
      const mockPool = {
        query: jest.fn(),
      };
      db.setPool(mockPool);

      mockPool.query
        // getEventMetadata: events
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'EVT-JOIN-1',
            organizer_id: 'USR-ORG-1',
            title: 'Join Test',
            category: 'Tech',
            venue: 'Hall',
            event_date: '2026-11-25T09:00:00Z',
            capacity: 100,
            status: 'PUBLISHED',
          }],
        })
        // getEventMetadata: ticket_tiers
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'TIER-1', name: 'General', price: '500.00', quota: 100, sold: 1 }],
        })
        // revResult: only confirmed booking total
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ total_revenue: '500.00', total_bookings: 1 }],
        })
        // tierResult: verifying that tickets_sold is 1 and revenue is 500 (unconfirmed excluded)
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            tier_id: 'TIER-1',
            tier_name: 'General',
            tier_price: '500.00',
            quota: 100,
            tickets_sold: 1,
            tier_revenue: '500.00',
          }],
        })
        // bookingsResult: 1 confirmed, 1 cancelled
        .mockResolvedValueOnce({
          rowCount: 2,
          rows: [
            {
              booking_id: 'BKG-CONF-1',
              user_id: 'USR-1',
              purchaser_name: 'Confirmed User',
              purchaser_email: 'conf@test.io',
              booking_status: 'CONFIRMED',
              total_amount: '500.00',
              created_at: '2026-11-01T10:00:00Z',
              ticket_count: 1,
              tier_names: 'General',
            },
            {
              booking_id: 'BKG-CANC-1',
              user_id: 'USR-2',
              purchaser_name: 'Cancelled User',
              purchaser_email: 'canc@test.io',
              booking_status: 'CANCELLED',
              total_amount: '500.00',
              created_at: '2026-11-01T10:05:00Z',
              ticket_count: 0,
              tier_names: 'General',
            },
          ],
        });

      const rep = await generateRevenueReport('EVT-JOIN-1', 'csv');

      // Verify the SQL sent for tierResult has the isolated confirmed_tickets join
      const tierQueryCall = mockPool.query.mock.calls[3];
      expect(tierQueryCall[0]).toContain('b.status = \'CONFIRMED\'');
      expect(tierQueryCall[0]).toContain('t.status != \'CANCELLED\'');
      expect(tierQueryCall[0]).toContain('COUNT(ct.id)::int AS tickets_sold');

      expect(rep.summary.totalConfirmedRevenue).toBe(500.0);
      expect(rep.summary.totalConfirmedBookings).toBe(1);
      expect(rep.summary.totalTicketsSold).toBe(1);

      db.setPool(null);
    });
  });
});
