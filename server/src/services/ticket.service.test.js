process.env.QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || 'test-qr-secret';

const {
  getAttendeePass,
  getTicketById,
  registerTicket,
  initializeDefaultTickets,
} = require('./ticket.service');
const { verifyQrPass } = require('./qr.service');

describe('Ticket Service & Attendee Pass Validation (FR-012)', () => {
  beforeEach(() => {
    initializeDefaultTickets();
  });

  test('successfully retrieves a digital pass for a confirmed booking with all required fields', async () => {
    const result = await getAttendeePass({
      ticketId: 'TKT-CONFIRMED-001',
      requestingUser: { userId: 'USR-ATTENDEE-001', role: 'ATTENDEE' },
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);

    const pass = result.pass;
    // Attendee's name
    expect(pass.attendeeName).toBe('Alex Johnson');
    expect(pass.userId).toBe('USR-ATTENDEE-001');

    // Event name and details
    expect(pass.eventName).toBe('TechSummit 2026');
    expect(pass.eventDate).toBe('2026-11-15T09:30:00.000Z');
    expect(pass.venue).toBe('Main Auditorium, PES Tech Campus');

    // Ticket ID and Tier
    expect(pass.ticketId).toBe('TKT-CONFIRMED-001');
    expect(pass.ticketTier).toBe('VIP Pass');

    // Booking confirmation status
    expect(pass.bookingConfirmationStatus).toBe('CONFIRMED');
    expect(pass.ticketStatus).toBe('VALID');

    // Signed QR Code
    expect(pass.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(pass.qrData).toBeDefined();
    expect(pass.signature).toHaveLength(64);

    // Cryptographic verification
    const verification = verifyQrPass(pass.qrData);
    expect(verification.valid).toBe(true);
    expect(verification.payload.ticketId).toBe('TKT-CONFIRMED-001');
    expect(verification.payload.eventId).toBe('EVT-TECH-2026');
    expect(verification.payload.userId).toBe('USR-ATTENDEE-001');
  });

  test('rejects access to another attendee’s ticket by changing ticket ID (403 Forbidden)', async () => {
    // Ticket TKT-CONFIRMED-001 belongs to USR-ATTENDEE-001
    // Requesting user is USR-ATTENDEE-002
    const result = await getAttendeePass({
      ticketId: 'TKT-CONFIRMED-001',
      requestingUser: { userId: 'USR-ATTENDEE-002', role: 'ATTENDEE' },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
    expect(result.code).toBe('FORBIDDEN');
    expect(result.message).toContain('not authorized');
  });

  test('allows staff or admin to view any attendee’s confirmed ticket pass', async () => {
    const result = await getAttendeePass({
      ticketId: 'TKT-CONFIRMED-001',
      requestingUser: { userId: 'STAFF-001', role: 'STAFF' },
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.pass.ticketId).toBe('TKT-CONFIRMED-001');
  });

  test('rejects unconfirmed bookings (400 UNCONFIRMED_BOOKING)', async () => {
    const result = await getAttendeePass({
      ticketId: 'TKT-PENDING-001',
      requestingUser: { userId: 'USR-ATTENDEE-001', role: 'ATTENDEE' },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.code).toBe('UNCONFIRMED_BOOKING');
  });

  test('rejects cancelled or invalid tickets (400 INVALID_TICKET_STATUS)', async () => {
    const result = await getAttendeePass({
      ticketId: 'TKT-CANCELLED-001',
      requestingUser: { userId: 'USR-ATTENDEE-001', role: 'ATTENDEE' },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.code).toBe('INVALID_TICKET_STATUS');
  });

  test('rejects expired passes (400 EXPIRED_PASS)', async () => {
    const result = await getAttendeePass({
      ticketId: 'TKT-EXPIRED-001',
      requestingUser: { userId: 'USR-ATTENDEE-001', role: 'ATTENDEE' },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.code).toBe('EXPIRED_PASS');
  });

  test('returns 404 for missing or non-existent tickets', async () => {
    const result = await getAttendeePass({
      ticketId: 'TKT-DOES-NOT-EXIST',
      requestingUser: { userId: 'USR-ATTENDEE-001', role: 'ATTENDEE' },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
    expect(result.code).toBe('TICKET_NOT_FOUND');
  });

  test('returns 400 when ticketId parameter is omitted', async () => {
    const result = await getAttendeePass({
      ticketId: '',
      requestingUser: { userId: 'USR-ATTENDEE-001', role: 'ATTENDEE' },
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.code).toBe('MISSING_TICKET_ID');
  });

  test('registerTicket successfully registers and retrieves a dynamic confirmed ticket', async () => {
    const newTicket = {
      ticketId: 'TKT-CUSTOM-999',
      eventId: 'EVT-CUSTOM-2026',
      eventName: 'Custom Tech Event',
      eventDate: new Date(Date.now() + 86400000).toISOString(),
      venue: 'Auditorium C',
      userId: 'USR-CUSTOM-001',
      attendeeName: 'Jordan Smith',
      attendeeEmail: 'jordan@example.com',
      ticketTier: 'Standard',
      bookingConfirmationStatus: 'CONFIRMED',
      ticketStatus: 'VALID',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };

    registerTicket(newTicket);
    expect(getTicketById('TKT-CUSTOM-999')).toBeDefined();

    const passResult = await getAttendeePass({
      ticketId: 'TKT-CUSTOM-999',
      requestingUser: { userId: 'USR-CUSTOM-001', role: 'ATTENDEE' },
    });

    expect(passResult.success).toBe(true);
    expect(passResult.pass.attendeeName).toBe('Jordan Smith');
  });

  test('handles null parameters in ticket lookup and clearTickets', () => {
    expect(getTicketById(null)).toBeNull();
    const { getTicketsByUserId, clearTickets } = require('./ticket.service');
    expect(getTicketsByUserId(null)).toEqual([]);
    clearTickets();
    expect(getTicketById('TKT-CONFIRMED-001')).toBeNull();
  });
});
