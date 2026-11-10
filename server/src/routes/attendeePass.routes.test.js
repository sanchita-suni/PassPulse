process.env.QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || 'test-qr-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { createToken } = require('../middleware/auth.middleware');
const { initializeDefaultTickets, registerTicket } = require('../services/ticket.service');
const { clearCheckInRecords } = require('../services/checkin.service');
const db = require('../config/db');
const {
  createPostgresTestDatabase,
  seedPersistentTicket,
} = require('../../tests/helpers/postgres-test-database');

describe('Attendee Digital Pass API Integration (FR-012)', () => {
  let cleanupTestDatabase;
  let alexToken;
  let sarahToken;
  let gateStaffToken;

  beforeAll(async () => {
    cleanupTestDatabase = await createPostgresTestDatabase();
    if (cleanupTestDatabase) {
      await seedPersistentTicket(db.getPool(), {
        ticketId: 'TKT-CONFIRMED-001',
        eventId: 'EVT-TECH-2026',
        userId: 'USR-ATTENDEE-001',
        eventName: 'TechSummit 2026',
        eventCategory: 'Tech Conference',
        eventDate: '2026-11-15T09:30:00.000Z',
        venue: 'Main Auditorium, PES Tech Campus',
        attendeeName: 'Alex Johnson',
        attendeeEmail: 'alex.johnson@example.com',
        ticketTier: 'VIP Pass',
        price: 799,
      });
    }
  });

  afterAll(async () => {
    if (cleanupTestDatabase) await cleanupTestDatabase();
  });

  beforeEach(() => {
    initializeDefaultTickets();
    clearCheckInRecords();

    alexToken = createToken({
      userId: 'USR-ATTENDEE-001',
      role: 'ATTENDEE',
      name: 'Alex Johnson',
      email: 'alex.johnson@example.com',
    });

    sarahToken = createToken({
      userId: 'USR-ATTENDEE-002',
      role: 'ATTENDEE',
      name: 'Sarah Connor',
      email: 'sarah.connor@example.com',
    });

    gateStaffToken = createToken({
      userId: 'USR-STAFF-001',
      role: 'GATE_STAFF',
      name: 'Gate Scanner Staff',
    });
  });

  test('GET /api/qr/pass/:ticketId - successfully returns pass for authorized attendee with confirmed booking', async () => {
    const response = await request(app)
      .get('/api/qr/pass/TKT-CONFIRMED-001')
      .set('Authorization', `Bearer ${alexToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('success');

    const pass = response.body.data;
    expect(pass.ticketId).toBe('TKT-CONFIRMED-001');
    expect(pass.attendeeName).toBe('Alex Johnson');
    expect(pass.eventName).toBe('TechSummit 2026');
    expect(pass.ticketTier).toBe('VIP Pass');
    expect(pass.bookingConfirmationStatus).toBe('CONFIRMED');
    expect(pass.ticketStatus).toBe('VALID');
    expect(pass.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(pass.signature).toHaveLength(64);
  });

  test('GET /api/qr/pass/:ticketId - rejects unauthenticated requests with 401', async () => {
    const response = await request(app)
      .get('/api/qr/pass/TKT-CONFIRMED-001');

    expect(response.statusCode).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  test('GET /api/qr/pass/:ticketId - rejects invalid JWT token with 401', async () => {
    const response = await request(app)
      .get('/api/qr/pass/TKT-CONFIRMED-001')
      .set('Authorization', 'Bearer invalid-token-string');

    expect(response.statusCode).toBe(401);
    expect(response.body.code).toBe('INVALID_TOKEN');
  });

  test('GET /api/qr/pass/:ticketId - rejects unauthorized attendee viewing another user’s ticket with 403', async () => {
    // Sarah tries to access Alex's ticket
    const response = await request(app)
      .get('/api/qr/pass/TKT-CONFIRMED-001')
      .set('Authorization', `Bearer ${sarahToken}`);

    expect(response.statusCode).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  test('GET /api/qr/pass/:ticketId - rejects unconfirmed bookings with 400', async () => {
    const response = await request(app)
      .get('/api/qr/pass/TKT-PENDING-001')
      .set('Authorization', `Bearer ${alexToken}`);

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('UNCONFIRMED_BOOKING');
  });

  test('GET /api/qr/pass/:ticketId - rejects expired pass with 400', async () => {
    const response = await request(app)
      .get('/api/qr/pass/TKT-EXPIRED-001')
      .set('Authorization', `Bearer ${alexToken}`);

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('EXPIRED_PASS');
  });

  test('GET /api/qr/pass/:ticketId - returns 404 for missing tickets', async () => {
    const response = await request(app)
      .get('/api/qr/pass/TKT-NONEXISTENT')
      .set('Authorization', `Bearer ${alexToken}`);

    expect(response.statusCode).toBe(404);
    expect(response.body.code).toBe('TICKET_NOT_FOUND');
  });

  test('GET /api/qr/tickets - rejects unauthenticated requests with 401 even if query userId is supplied', async () => {
    // 1. Without query params
    const responseWithoutQuery = await request(app)
      .get('/api/qr/tickets');

    expect(responseWithoutQuery.statusCode).toBe(401);
    expect(responseWithoutQuery.body.code).toBe('UNAUTHORIZED');

    // 2. Supplying ?userId=<another-user> must not bypass authentication
    const responseWithQuery = await request(app)
      .get('/api/qr/tickets?userId=USR-ATTENDEE-001');

    expect(responseWithQuery.statusCode).toBe(401);
    expect(responseWithQuery.body.code).toBe('UNAUTHORIZED');
  });

  test('GET /api/qr/tickets - does not allow authenticated attendee to view another user\'s tickets via query param', async () => {
    const response = await request(app)
      .get('/api/qr/tickets?userId=USR-ATTENDEE-001')
      .set('Authorization', `Bearer ${sarahToken}`);

    expect(response.statusCode).toBe(200);
    const tickets = response.body.data;
    expect(Array.isArray(tickets)).toBe(true);
    for (const ticket of tickets) {
      expect(ticket.userId).toBe('USR-ATTENDEE-002');
      expect(ticket.userId).not.toBe('USR-ATTENDEE-001');
    }
  });

  test('GET /api/qr/tickets - returns list of confirmed tickets for attendee', async () => {
    const response = await request(app)
      .get('/api/qr/tickets')
      .set('Authorization', `Bearer ${alexToken}`);

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data[0].userId).toBe('USR-ATTENDEE-001');
  });

  test('End-to-end integration: Pass generated by attendee endpoint validates at gate scanner', async () => {
    // 1. Attendee fetches digital pass
    const passResponse = await request(app)
      .get('/api/qr/pass/TKT-CONFIRMED-001')
      .set('Authorization', `Bearer ${alexToken}`);

    expect(passResponse.statusCode).toBe(200);
    const { qrData, eventId } = passResponse.body.data;

    // 2. Gate staff scans QR at entrance
    const checkinResponse = await request(app)
      .post('/api/checkin/verify')
      .set('Authorization', `Bearer ${gateStaffToken}`)
      .send({
        qrData,
        eventId,
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      });

    expect(checkinResponse.statusCode).toBe(200);
    expect(checkinResponse.body.code).toBe('CHECKED_IN');
    expect(checkinResponse.body.data.ticketId).toBe('TKT-CONFIRMED-001');

    // 3. Duplicate scan rejected
    const duplicateResponse = await request(app)
      .post('/api/checkin/verify')
      .set('Authorization', `Bearer ${gateStaffToken}`)
      .send({
        qrData,
        eventId,
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      });

    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.body.code).toBe('DUPLICATE_ENTRY');
  });

  test('GET /api/qr/token - returns demo JWT token for attendee', async () => {
    const response = await request(app)
      .get('/api/qr/token?userId=USR-ATTENDEE-001');

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data.token).toBeDefined();
    expect(response.body.data.user.userId).toBe('USR-ATTENDEE-001');
  });

  test('GET /api/qr/pass/:ticketId - authenticates via x-user-id header', async () => {
    const response = await request(app)
      .get('/api/qr/pass/TKT-CONFIRMED-001')
      .set('x-user-id', 'USR-ATTENDEE-001');

    expect(response.statusCode).toBe(200);
    expect(response.body.data.ticketId).toBe('TKT-CONFIRMED-001');
  });

  test('GET /api/qr/pass/:ticketId - rejects cancelled ticket status with 400', async () => {
    const response = await request(app)
      .get('/api/qr/pass/TKT-CANCELLED-001')
      .set('Authorization', `Bearer ${alexToken}`);

    expect(response.statusCode).toBe(400);
    expect(response.body.code).toBe('INVALID_TICKET_STATUS');
  });

  test('Normalizes authenticated user: handles token with "id" payload format instead of "userId"', async () => {
    const altToken = jwt.sign(
      {
        id: 'USR-ATTENDEE-001',
        role: 'ATTENDEE',
        name: 'Alex Johnson',
        email: 'alex.johnson@example.com',
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Pass retrieval
    const passResponse = await request(app)
      .get('/api/qr/pass/TKT-CONFIRMED-001')
      .set('Authorization', `Bearer ${altToken}`);

    expect(passResponse.statusCode).toBe(200);
    expect(passResponse.body.data.ticketId).toBe('TKT-CONFIRMED-001');

    // Ticket list retrieval
    const ticketsResponse = await request(app)
      .get('/api/qr/tickets')
      .set('Authorization', `Bearer ${altToken}`);

    expect(ticketsResponse.statusCode).toBe(200);
    expect(ticketsResponse.body.data.length).toBeGreaterThan(0);
    expect(ticketsResponse.body.data[0].userId).toBe('USR-ATTENDEE-001');
  });

  test('Normalizes authenticated user: rejects unauthorized access when token uses "id" format', async () => {
    const altSarahToken = jwt.sign(
      {
        id: 'USR-ATTENDEE-002',
        role: 'ATTENDEE',
        name: 'Sarah Connor',
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    const response = await request(app)
      .get('/api/qr/pass/TKT-CONFIRMED-001')
      .set('Authorization', `Bearer ${altSarahToken}`);

    expect(response.statusCode).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  test('GET /api/qr/tickets & /pass/:ticketId - supports multiple confirmed tickets for the same attendee', async () => {
    registerTicket({
      ticketId: 'TKT-CONFIRMED-003',
      eventId: 'EVT-CULT-2026',
      eventName: 'PassPulse Cultural Fest 2026',
      eventCategory: 'Cultural',
      eventDate: '2026-12-05T17:00:00.000Z',
      venue: 'Open Air Amphitheatre',
      userId: 'USR-ATTENDEE-001',
      attendeeName: 'Alex Johnson',
      attendeeEmail: 'alex.johnson@example.com',
      ticketTier: 'General Admission',
      price: 399.0,
      bookingConfirmationStatus: 'CONFIRMED',
      ticketStatus: 'VALID',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      bookingReference: 'BKG-9934-CULT',
      createdAt: new Date().toISOString(),
    });

    const listResponse = await request(app)
      .get('/api/qr/tickets')
      .set('Authorization', `Bearer ${alexToken}`);

    expect(listResponse.statusCode).toBe(200);
    const alexTickets = listResponse.body.data;
    const ticketIds = alexTickets.map((t) => t.ticketId);
    expect(ticketIds).toContain('TKT-CONFIRMED-001');
    expect(ticketIds).toContain('TKT-CONFIRMED-003');

    // Fetch pass for the second confirmed ticket
    const pass2Response = await request(app)
      .get('/api/qr/pass/TKT-CONFIRMED-003')
      .set('Authorization', `Bearer ${alexToken}`);

    expect(pass2Response.statusCode).toBe(200);
    expect(pass2Response.body.data.ticketId).toBe('TKT-CONFIRMED-003');
    expect(pass2Response.body.data.eventName).toBe('PassPulse Cultural Fest 2026');
    expect(pass2Response.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(pass2Response.body.data.signature).toHaveLength(64);
  });

  test('GET /api/qr/pass/:ticketId - allows ADMIN role to view any attendee pass', async () => {
    const adminToken = createToken({
      userId: 'USR-ADMIN-001',
      role: 'ADMIN',
      name: 'System Admin',
    });

    const response = await request(app)
      .get('/api/qr/pass/TKT-CONFIRMED-001')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.data.ticketId).toBe('TKT-CONFIRMED-001');
  });
});
