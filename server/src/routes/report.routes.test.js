const request = require('supertest');
const app = require('../app');
const { createToken } = require('../middleware/auth.middleware');
const EventModel = require('../models/event.model');
const {
  registerTicket,
  clearTickets,
} = require('../services/ticket.service');
const {
  registerBookingRecord,
  clearBookingRecords,
} = require('../services/report.service');
const checkinService = require('../services/checkin.service');

describe('Report Export Routes Integration Tests (FR-018 / Issue #30)', () => {
  const organizerUser = {
    userId: 'USR-ORG-OWNER',
    role: 'ORGANIZER',
    name: 'Owner Organizer',
    email: 'owner@org.test',
  };
  const otherOrganizer = {
    userId: 'USR-ORG-OTHER',
    role: 'ORGANIZER',
    name: 'Other Organizer',
    email: 'other@org.test',
  };
  const adminUser = {
    userId: 'USR-ADMIN-1',
    role: 'ADMIN',
    name: 'Admin User',
    email: 'admin@passpulse.test',
  };
  const attendeeUser = {
    userId: 'USR-ATTENDEE-1',
    role: 'ATTENDEE',
    name: 'Attendee User',
    email: 'attendee@passpulse.test',
  };
  const gateStaffUser = {
    userId: 'USR-STAFF-1',
    role: 'GATE_STAFF',
    name: 'Gate Staff',
    email: 'staff@passpulse.test',
  };

  const ownerToken = createToken(organizerUser);
  const otherToken = createToken(otherOrganizer);
  const adminToken = createToken(adminUser);
  const attendeeToken = createToken(attendeeUser);
  const staffToken = createToken(gateStaffUser);

  const testEventId = 'EVT-REPORT-TEST-1';

  beforeEach(async () => {
    jest.restoreAllMocks();
    clearTickets();
    clearBookingRecords();
    checkinService.clearCheckInRecords();
    await EventModel.clearAll();

    // Create event owned by organizerUser
    await EventModel.insert({
      id: testEventId,
      organizerId: organizerUser.userId,
      title: 'Report Test Conference',
      status: 'PUBLISHED',
      category: 'Tech',
      venue: 'Main Hall',
      eventDate: '2026-11-20T10:00:00.000Z',
      capacity: 300,
      tiers: [
        { id: 'TIER-VIP', name: 'VIP Pass', price: 1000, quota: 50, sold: 2, maxPerOrder: 2 },
        { id: 'TIER-GEN', name: 'General', price: 500, quota: 250, sold: 3, maxPerOrder: 5 },
      ],
      notices: [],
    });

    // Seed confirmed tickets
    registerTicket({
      ticketId: 'TKT-REP-1',
      eventId: testEventId,
      userId: 'USR-CUST-1',
      attendeeName: 'Alice Smith',
      attendeeEmail: 'alice@test.com',
      ticketTier: 'VIP Pass',
      price: 1000,
      bookingConfirmationStatus: 'CONFIRMED',
      ticketStatus: 'VALID',
      bookingReference: 'BKG-REP-1',
    });
    registerTicket({
      ticketId: 'TKT-REP-2',
      eventId: testEventId,
      userId: 'USR-CUST-2',
      attendeeName: 'Bob Jones',
      attendeeEmail: 'bob@test.com',
      ticketTier: 'General',
      price: 500,
      bookingConfirmationStatus: 'CONFIRMED',
      ticketStatus: 'VALID',
      bookingReference: 'BKG-REP-2',
    });
    registerTicket({
      ticketId: 'TKT-REP-3',
      eventId: testEventId,
      userId: 'USR-CUST-3',
      attendeeName: 'Charlie Brown',
      attendeeEmail: 'charlie@test.com',
      ticketTier: 'General',
      price: 500,
      bookingConfirmationStatus: 'CONFIRMED',
      ticketStatus: 'VALID',
      bookingReference: 'BKG-REP-3',
    });

    // Seed explicit bookings (2 confirmed, 1 cancelled)
    registerBookingRecord({
      id: 'BKG-REP-1',
      eventId: testEventId,
      userId: 'USR-CUST-1',
      purchaserName: 'Alice Smith',
      purchaserEmail: 'alice@test.com',
      status: 'CONFIRMED',
      totalAmount: 1000,
      ticketCount: 1,
      tierNames: 'VIP Pass',
    });
    registerBookingRecord({
      id: 'BKG-REP-2',
      eventId: testEventId,
      userId: 'USR-CUST-2',
      purchaserName: 'Bob Jones',
      purchaserEmail: 'bob@test.com',
      status: 'CONFIRMED',
      totalAmount: 1000,
      ticketCount: 2,
      tierNames: 'General',
    });
    registerBookingRecord({
      id: 'BKG-REP-3-CAN',
      eventId: testEventId,
      userId: 'USR-CUST-3',
      purchaserName: 'Charlie Brown',
      purchaserEmail: 'charlie@test.com',
      status: 'CANCELLED',
      totalAmount: 500,
      ticketCount: 1,
      tierNames: 'General',
    });
  });

  afterEach(() => {
    clearTickets();
    clearBookingRecords();
    checkinService.clearCheckInRecords();
  });

  describe('Authentication & Authorization Security Controls (SEC-002, FR-018)', () => {
    test('1. Rejects unauthenticated request with 401', async () => {
      const res = await request(app).get(`/api/reports/${testEventId}/attendance`);
      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });

    test('2. Rejects invalid JWT token with 401', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/attendance`)
        .set('Authorization', 'Bearer invalid-token-string');
      expect(res.status).toBe(401);
      expect(res.body.status).toBe('error');
    });

    test('3. Rejects ATTENDEE role with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/attendance`)
        .set('Authorization', `Bearer ${attendeeToken}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Forbidden');
    });

    test('4. Rejects GATE_STAFF role with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/attendance`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Forbidden');
    });

    test('5. Rejects Organizer attempting to export another organizer event with 403 NOT_EVENT_OWNER', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/attendance`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_EVENT_OWNER');
    });

    test('6. Allows ADMIN role to export report for any event', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/attendance?format=csv`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });

    test('7. Returns 404 EVENT_NOT_FOUND when requesting non-existent event', async () => {
      const res = await request(app)
        .get('/api/reports/EVT-DOES-NOT-EXIST/attendance')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('EVENT_NOT_FOUND');
    });

    test('8. Rejects unsupported format with 400 INVALID_REPORT_FORMAT', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/attendance?format=xlsx`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REPORT_FORMAT');
    });
  });

  describe('Attendance Report Exports (GET /api/reports/:eventId/attendance)', () => {
    test('1. Exports attendance CSV matching TC-ANL-02 acceptance criteria', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/attendance?format=csv`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(`attendance-report-${testEventId}.csv`);

      const lines = res.text.trim().split('\r\n');
      // 1 header + 3 confirmed ticket data rows = 4 lines total
      expect(lines).toHaveLength(4);
      expect(lines[0]).toBe('Ticket ID,Attendee Name,Attendee Email,Tier,Booking ID,Ticket Status,Checked In,Check-in Timestamp,Scanned By');
      expect(res.text).toContain('TKT-REP-1,Alice Smith,alice@test.com,VIP Pass,BKG-REP-1,VALID,PENDING');
      expect(res.text).toContain('TKT-REP-2,Bob Jones,bob@test.com,General,BKG-REP-2,VALID,PENDING');
      expect(res.text).toContain('TKT-REP-3,Charlie Brown,charlie@test.com,General,BKG-REP-3,VALID,PENDING');
    });

    test('2. Exports attendance PDF with valid PDF binary buffer', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/attendance?format=pdf`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain(`attendance-report-${testEventId}.pdf`);

      const pdfHeader = res.body.slice(0, 8).toString('binary');
      expect(pdfHeader).toContain('%PDF-1.4');
    });

    test('3. Rejects json format with 400 as public export formats are restricted to CSV and PDF', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/attendance?format=json`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REPORT_FORMAT');
      expect(res.body.message).toContain("Unsupported format 'json'");
    });
  });

  describe('Revenue Report Exports (GET /api/reports/:eventId/revenue)', () => {
    test('1. Exports revenue CSV with authoritative confirmed booking totals', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/revenue?format=csv`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(`revenue-report-${testEventId}.csv`);

      const lines = res.text.trim().split('\r\n');
      expect(lines).toHaveLength(4); // 1 header + 3 bookings
      expect(lines[0]).toBe('Booking ID,Booking Date,Purchaser Name,Purchaser Email,Ticket Tiers,Ticket Count,Total Amount (INR),Booking Status');
      expect(res.text).toContain('BKG-REP-1');
      expect(res.text).toContain('1000.00,CONFIRMED');
      expect(res.text).toContain('BKG-REP-3-CAN');
      expect(res.text).toContain('500.00,CANCELLED');
    });

    test('2. Exports revenue PDF with valid PDF binary buffer', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/revenue?format=pdf`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain(`revenue-report-${testEventId}.pdf`);

      const pdfHeader = res.body.slice(0, 8).toString('binary');
      expect(pdfHeader).toContain('%PDF-1.4');
    });

    test('3. Rejects json format with 400 as public export formats are restricted to CSV and PDF', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/revenue?format=json`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REPORT_FORMAT');
      expect(res.body.message).toContain("Unsupported format 'json'");
    });
  });

  describe('Generic Export Endpoint (GET /api/reports/:eventId/export)', () => {
    test('1. Delegates to attendance export when type=attendance', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/export?type=attendance&format=csv`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Ticket ID,Attendee Name');
    });

    test('2. Delegates to revenue export when type=revenue', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/export?type=revenue&format=pdf`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    test('3. Rejects invalid type parameter with 400 INVALID_REPORT_TYPE', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/export?type=unknown`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REPORT_TYPE');
    });

    test('4. Supports query param token fallback for direct browser download links', async () => {
      const res = await request(app)
        .get(`/api/reports/${testEventId}/attendance?format=csv&token=${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });
  });

  describe('PostgreSQL Database Event Access & Error Handling in Controller', () => {
    const db = require('../config/db');

    afterEach(() => {
      db.setPool(null);
    });

    test('1. Verifies ownership from PostgreSQL events table when not found in in-memory store', async () => {
      const mockPool = {
        query: jest.fn(),
      };
      db.setPool(mockPool);

      // 1. verifyEventAccess: events
      mockPool.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'EVT-PG-001',
          organizer_id: organizerUser.userId,
          title: 'PostgreSQL Event',
        }],
      });
      // 2. getEventMetadata: events
      mockPool.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'EVT-PG-001',
          organizer_id: organizerUser.userId,
          title: 'PostgreSQL Event',
        }],
      });
      // 3. getEventMetadata: ticket_tiers
      mockPool.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });
      // 4. tickets query
      mockPool.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      const res = await request(app)
        .get('/api/reports/EVT-PG-001/attendance?format=csv')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attendance-report-EVT-PG-001.csv');
    });

    test('2. Rejects with 403 when PostgreSQL event belongs to another organizer', async () => {
      const mockPool = {
        query: jest.fn(),
      };
      db.setPool(mockPool);

      mockPool.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'EVT-PG-FOREIGN',
          organizer_id: 'USR-SOMEONE-ELSE',
          title: 'Foreign Event',
        }],
      });

      const res = await request(app)
        .get('/api/reports/EVT-PG-FOREIGN/attendance?format=csv')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_EVENT_OWNER');
    });

    test('3. Returns 404 when event is not found in PostgreSQL events table either', async () => {
      const mockPool = {
        query: jest.fn(),
      };
      db.setPool(mockPool);

      mockPool.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      const res = await request(app)
        .get('/api/reports/EVT-PG-NONE/attendance?format=csv')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('EVENT_NOT_FOUND');
    });

    test('4. Handles unexpected service errors in controller', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const reportService = require('../services/report.service');
      jest.spyOn(reportService, 'generateAttendanceReport').mockRejectedValueOnce(new Error('Unexpected Crash'));

      const res = await request(app)
        .get(`/api/reports/${testEventId}/attendance?format=csv`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(res.body.status).toBe('error');
      spy.mockRestore();
    });

    test('5. Handles unexpected revenue service errors in controller', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const reportService = require('../services/report.service');
      jest.spyOn(reportService, 'generateRevenueReport').mockRejectedValueOnce(new Error('Unexpected Rev Crash'));

      const res = await request(app)
        .get(`/api/reports/${testEventId}/revenue?format=csv`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(res.body.status).toBe('error');
      spy.mockRestore();
    });

    test('6. Handles unexpected generic export errors in controller', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const reportService = require('../services/report.service');
      jest.spyOn(reportService, 'generateAttendanceReport').mockRejectedValueOnce(new Error('Generic Export Crash'));

      const res = await request(app)
        .get(`/api/reports/${testEventId}/export?type=attendance`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(500);
      expect(res.body.status).toBe('error');
      spy.mockRestore();
    });
  });
});
