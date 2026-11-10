const { generateQrPass } = require('./qr.service');
const { getPool, isPoolInitialized } = require('../config/db');

/**
 * In-memory confirmed tickets repository.
 * Consistent with checkin.service.js in Sprint 5,
 * until the PostgreSQL booking/ticket model is merged.
 */
const ticketRecords = new Map();

/**
 * Default sample tickets matching SRS Table 1, 2, and 3 schema:
 * - Table 1 (Users): user_id, full_name, email, role
 * - Table 2 (Events): event_id, title, category, venue, event_date, status
 * - Table 3 (Ticket Tiers): tier_id, tier_name, price
 */
function createDefaultTickets() {
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      ticketId: 'TKT-CONFIRMED-001',
      eventId: 'EVT-TECH-2026',
      eventName: 'TechSummit 2026',
      eventCategory: 'Tech Conference',
      eventDate: '2026-11-15T09:30:00.000Z',
      venue: 'Main Auditorium, PES Tech Campus',
      userId: 'USR-ATTENDEE-001',
      attendeeName: 'Alex Johnson',
      attendeeEmail: 'alex.johnson@example.com',
      ticketTier: 'VIP Pass',
      price: 799.0,
      bookingConfirmationStatus: 'CONFIRMED',
      ticketStatus: 'VALID',
      expiresAt: futureDate,
      bookingReference: 'BKG-9042-VIP',
      createdAt: new Date().toISOString(),
    },
    {
      ticketId: 'TKT-DEMO-001',
      eventId: 'EVT-TECH-2026',
      eventName: 'TechSummit 2026',
      eventCategory: 'Tech Conference',
      eventDate: '2026-11-15T09:30:00.000Z',
      venue: 'Main Auditorium, PES Tech Campus',
      userId: 'USR-DEMO-001',
      attendeeName: 'Alex Johnson',
      attendeeEmail: 'alex.demo@example.com',
      ticketTier: 'VIP Pass',
      price: 799.0,
      bookingConfirmationStatus: 'CONFIRMED',
      ticketStatus: 'VALID',
      expiresAt: futureDate,
      bookingReference: 'BKG-DEMO-001',
      createdAt: new Date().toISOString(),
    },
    {
      ticketId: 'TKT-CONFIRMED-002',
      eventId: 'EVT-CULT-2026',
      eventName: 'PassPulse Cultural Fest 2026',
      eventCategory: 'Cultural',
      eventDate: '2026-12-05T17:00:00.000Z',
      venue: 'Open Air Amphitheatre',
      userId: 'USR-ATTENDEE-002',
      attendeeName: 'Sarah Connor',
      attendeeEmail: 'sarah.connor@example.com',
      ticketTier: 'General Admission',
      price: 399.0,
      bookingConfirmationStatus: 'CONFIRMED',
      ticketStatus: 'VALID',
      expiresAt: futureDate,
      bookingReference: 'BKG-8812-GEN',
      createdAt: new Date().toISOString(),
    },
    {
      ticketId: 'TKT-PENDING-001',
      eventId: 'EVT-TECH-2026',
      eventName: 'TechSummit 2026',
      eventCategory: 'Tech Conference',
      eventDate: '2026-11-15T09:30:00.000Z',
      venue: 'Main Auditorium, PES Tech Campus',
      userId: 'USR-ATTENDEE-001',
      attendeeName: 'Alex Johnson',
      attendeeEmail: 'alex.johnson@example.com',
      ticketTier: 'Early Bird',
      price: 199.0,
      bookingConfirmationStatus: 'PENDING',
      ticketStatus: 'VALID',
      expiresAt: futureDate,
      bookingReference: 'BKG-7721-PND',
      createdAt: new Date().toISOString(),
    },
    {
      ticketId: 'TKT-CANCELLED-001',
      eventId: 'EVT-TECH-2026',
      eventName: 'TechSummit 2026',
      eventCategory: 'Tech Conference',
      eventDate: '2026-11-15T09:30:00.000Z',
      venue: 'Main Auditorium, PES Tech Campus',
      userId: 'USR-ATTENDEE-001',
      attendeeName: 'Alex Johnson',
      attendeeEmail: 'alex.johnson@example.com',
      ticketTier: 'General Admission',
      price: 399.0,
      bookingConfirmationStatus: 'CONFIRMED',
      ticketStatus: 'CANCELLED',
      expiresAt: futureDate,
      bookingReference: 'BKG-6632-CAN',
      createdAt: new Date().toISOString(),
    },
    {
      ticketId: 'TKT-EXPIRED-001',
      eventId: 'EVT-PAST-2025',
      eventName: 'PassPulse Hackathon 2025',
      eventCategory: 'Hackathon',
      eventDate: '2025-10-10T10:00:00.000Z',
      venue: 'Seminar Hall 3',
      userId: 'USR-ATTENDEE-001',
      attendeeName: 'Alex Johnson',
      attendeeEmail: 'alex.johnson@example.com',
      ticketTier: 'General Admission',
      price: 299.0,
      bookingConfirmationStatus: 'CONFIRMED',
      ticketStatus: 'VALID',
      expiresAt: pastDate,
      bookingReference: 'BKG-5521-EXP',
      createdAt: pastDate,
    },
  ];
}

function initializeDefaultTickets() {
  ticketRecords.clear();
  for (const ticket of createDefaultTickets()) {
    ticketRecords.set(ticket.ticketId, ticket);
  }
}

// Seed on module initialization
initializeDefaultTickets();

/**
 * Retrieve a ticket by ID.
 */
function getTicketById(ticketId) {
  if (!ticketId) return null;
  return ticketRecords.get(ticketId) || null;
}

/**
 * Register or update a ticket in the repository.
 */
function registerTicket(ticketData) {
  if (!ticketData || !ticketData.ticketId) {
    throw new Error('ticketId is required to register a ticket');
  }
  ticketRecords.set(ticketData.ticketId, { ...ticketData });
  return ticketRecords.get(ticketData.ticketId);
}

/**
 * Retrieve all tickets for a specific user ID.
 */
function getTicketsByUserId(userId) {
  if (!userId) return [];
  const results = [];
  for (const ticket of ticketRecords.values()) {
    if (ticket.userId === userId) {
      results.push(ticket);
    }
  }
  return results;
}

/**
 * Retrieve all confirmed, active tickets for an event ID (in-memory repository).
 */
function getConfirmedTicketsByEvent(eventId) {
  if (!eventId) return [];
  const results = [];
  for (const ticket of ticketRecords.values()) {
    if (
      ticket.eventId === eventId &&
      ticket.bookingConfirmationStatus === 'CONFIRMED' &&
      ticket.ticketStatus !== 'CANCELLED'
    ) {
      results.push(ticket);
    }
  }
  return results;
}

function getOptionalPool() {
  if (!isPoolInitialized()) return null;
  try {
    return getPool();
  } catch (error) {
    if (error.message === 'DATABASE_URL is not configured') return null;
    throw error;
  }
}

function mapDatabaseTicket(row) {
  return {
    ticketId: row.ticket_id,
    id: row.ticket_id,
    bookingId: row.booking_id,
    bookingReference: row.booking_id,
    eventId: row.event_id,
    eventName: row.event_name,
    eventCategory: row.event_category,
    eventDate: row.event_date,
    venue: row.venue,
    userId: row.user_id,
    attendeeName: row.attendee_name,
    attendeeEmail: row.attendee_email,
    ticketTier: row.tier_name,
    price: Number(row.price),
    bookingConfirmationStatus: row.booking_status,
    ticketStatus: row.ticket_status,
    expiresAt: row.expires_at,
    issuedAt: row.issued_at,
    createdAt: row.issued_at,
  };
}

const PERSISTED_TICKET_SELECT = `
  SELECT ticket.id AS ticket_id, ticket.booking_id, ticket.status AS ticket_status,
         ticket.issued_at, booking.event_id, booking.user_id,
         booking.status AS booking_status, event.title AS event_name,
         event.category AS event_category, event.event_date, event.venue,
         GREATEST(event.event_date + INTERVAL '1 day',
                  ticket.issued_at + INTERVAL '1 day') AS expires_at,
         attendee.full_name AS attendee_name, attendee.email AS attendee_email,
         tier.name AS tier_name, tier.price
  FROM tickets AS ticket
  JOIN bookings AS booking ON booking.id = ticket.booking_id
  JOIN events AS event ON event.id = booking.event_id
  JOIN users AS attendee ON attendee.id = booking.user_id
  JOIN ticket_tiers AS tier ON tier.id = ticket.tier_id AND tier.event_id = booking.event_id
`;

async function getPersistentTicketById(ticketId) {
  const pool = getOptionalPool();
  if (!pool) return null;
  const result = await pool.query(`${PERSISTED_TICKET_SELECT} WHERE ticket.id = $1`, [ticketId]);
  if (!result.rowCount) return null;
  return registerTicket(mapDatabaseTicket(result.rows[0]));
}

async function getPersistentTicketsByUserId(userId) {
  if (!userId) return [];
  const pool = getOptionalPool();
  if (!pool) return getTicketsByUserId(userId);
  const result = await pool.query(
    `${PERSISTED_TICKET_SELECT}
     WHERE booking.user_id = $1
     ORDER BY ticket.issued_at DESC, ticket.id`,
    [userId]
  );
  const tickets = new Map(getTicketsByUserId(userId).map((ticket) => [ticket.ticketId, ticket]));
  for (const row of result.rows) {
    const ticket = registerTicket(mapDatabaseTicket(row));
    tickets.set(ticket.ticketId, ticket);
  }
  return [...tickets.values()];
}

/**
 * Clear all tickets (used for testing).
 */
function clearTickets() {
  ticketRecords.clear();
}

/**
 * Generates and retrieves an attendee's digital pass for a confirmed ticket.
 * Enforces:
 * 1. Existence check (404)
 * 2. Authorization check: user must own ticket or be staff/admin (403)
 * 3. Booking confirmation status check: must be CONFIRMED (400)
 * 4. Ticket status check: must be VALID (400)
 * 5. Expiry check: expiresAt must be in the future (400)
 * 6. Cryptographically signed QR pass generation via qr.service.js
 */
async function getAttendeePass({ ticketId, requestingUser }) {
  if (!ticketId) {
    return {
      success: false,
      status: 400,
      code: 'MISSING_TICKET_ID',
      message: 'ticketId parameter is required',
    };
  }

  const ticket = getTicketById(ticketId) || await getPersistentTicketById(ticketId);

  if (!ticket) {
    return {
      success: false,
      status: 404,
      code: 'TICKET_NOT_FOUND',
      message: `No ticket found with ID '${ticketId}'`,
    };
  }

  // Authorization check: prevent unauthorized access across attendees
  if (requestingUser) {
    const isOwner = requestingUser.userId === ticket.userId;
    const isPrivileged =
      requestingUser.role === 'ADMIN' ||
      requestingUser.role === 'STAFF' ||
      requestingUser.role === 'GATE_STAFF';

    if (!isOwner && !isPrivileged) {
      return {
        success: false,
        status: 403,
        code: 'FORBIDDEN',
        message: 'You are not authorized to view another attendee’s digital pass',
      };
    }
  }

  // Confirmed booking validation
  if (ticket.bookingConfirmationStatus !== 'CONFIRMED') {
    return {
      success: false,
      status: 400,
      code: 'UNCONFIRMED_BOOKING',
      message:
        'Digital pass is only accessible for confirmed bookings. Current booking status: ' +
        ticket.bookingConfirmationStatus,
    };
  }

  // Valid ticket status validation
  if (ticket.ticketStatus !== 'VALID') {
    return {
      success: false,
      status: 400,
      code: 'INVALID_TICKET_STATUS',
      message:
        'This ticket is no longer valid. Ticket status: ' + ticket.ticketStatus,
    };
  }

  // Expiration check
  const expiryTime = new Date(ticket.expiresAt).getTime();
  if (Number.isNaN(expiryTime) || expiryTime <= Date.now()) {
    return {
      success: false,
      status: 400,
      code: 'EXPIRED_PASS',
      message: 'This digital pass has expired and is no longer valid for entry',
    };
  }

  // Generate cryptographic QR pass using existing backend HMAC signing
  const qrPass = await generateQrPass({
    ticketId: ticket.ticketId,
    eventId: ticket.eventId,
    userId: ticket.userId,
    expiresAt: ticket.expiresAt,
  });

  return {
    success: true,
    status: 200,
    pass: {
      ticketId: ticket.ticketId,
      eventId: ticket.eventId,
      eventName: ticket.eventName,
      eventCategory: ticket.eventCategory,
      eventDate: ticket.eventDate,
      venue: ticket.venue,
      userId: ticket.userId,
      attendeeName: ticket.attendeeName,
      attendeeEmail: ticket.attendeeEmail,
      ticketTier: ticket.ticketTier,
      price: ticket.price,
      bookingConfirmationStatus: ticket.bookingConfirmationStatus,
      ticketStatus: ticket.ticketStatus,
      bookingReference: ticket.bookingReference,
      issuedAt: qrPass.payload.issuedAt,
      expiresAt: qrPass.payload.expiresAt,
      signature: qrPass.signature,
      qrData: qrPass.qrData,
      qrCodeDataUrl: qrPass.qrCodeDataUrl,
    },
  };
}

module.exports = {
  getTicketById,
  getPersistentTicketById,
  mapDatabaseTicket,
  registerTicket,
  getTicketsByUserId,
  getPersistentTicketsByUserId,
  getConfirmedTicketsByEvent,
  clearTickets,
  initializeDefaultTickets,
  getAttendeePass,
};
