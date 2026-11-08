const { generateQrPass } = require('../services/qr.service');

const {
  getAttendeePass,
  getTicketsByUserId,
  getTicketById,
  getPersistentTicketsByUserId,
} = require('../services/ticket.service');

const { createToken } = require('../middleware/auth.middleware');

/**
 * Generates an HMAC-signed QR pass for an existing confirmed ticket (FR-011).
 * Restricted to authenticated staff/admin roles.
 * Requires only ticketId from request body.
 * Enforces ticket existence in repository and confirmed booking status.
 * Validates that all required trusted ticket fields exist and rejects incomplete ticket records.
 * Derives payload fields strictly and exclusively from trusted ticket records (no client overrides).
 */
async function createQrPass(req, res, next) {
  try {
    const { ticketId } = req.body;

    if (!ticketId) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_QR_REQUEST',
        message: 'ticketId is required',
      });
    }

    // Enforce ticket existence in official repository
    const existingTicket = getTicketById(ticketId);
    if (!existingTicket) {
      return res.status(404).json({
        status: 'error',
        code: 'TICKET_NOT_FOUND',
        message: `No ticket found with ID '${ticketId}'`,
      });
    }

    // Validate that all required trusted ticket fields exist and reject incomplete ticket records
    if (
      !existingTicket.ticketId ||
      !existingTicket.eventId ||
      !existingTicket.userId ||
      !existingTicket.expiresAt
    ) {
      return res.status(400).json({
        status: 'error',
        code: 'INCOMPLETE_TICKET_RECORD',
        message: 'Official ticket record is missing required fields (ticketId, eventId, userId, or expiresAt)',
      });
    }

    // Enforce booking confirmation status
    if (existingTicket.bookingConfirmationStatus !== 'CONFIRMED') {
      return res.status(400).json({
        status: 'error',
        code: 'UNCONFIRMED_BOOKING',
        message: `QR pass can only be minted for confirmed bookings. Current status: ${existingTicket.bookingConfirmationStatus}`,
      });
    }

    // Enforce ticket validity status
    if (existingTicket.ticketStatus !== 'VALID') {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_TICKET_STATUS',
        message: `Ticket is not valid for pass generation. Current status: ${existingTicket.ticketStatus}`,
      });
    }

    // Enforce trusted expiration date from official ticket record
    const ticketExpiryTime = new Date(existingTicket.expiresAt).getTime();
    if (Number.isNaN(ticketExpiryTime) || ticketExpiryTime <= Date.now()) {
      return res.status(400).json({
        status: 'error',
        code: 'EXPIRED_PASS',
        message: 'Official ticket record has expired and cannot receive a pass',
      });
    }

    // Generate QR pass strictly and exclusively from trusted repository record fields
    const qrPass = await generateQrPass({
      ticketId: existingTicket.ticketId,
      eventId: existingTicket.eventId,
      userId: existingTicket.userId,
      expiresAt: existingTicket.expiresAt,
    });

    return res.status(201).json({
      status: 'success',
      data: {
        ticketId: qrPass.payload.ticketId,
        eventId: qrPass.payload.eventId,
        userId: qrPass.payload.userId,
        issuedAt: qrPass.payload.issuedAt,
        expiresAt: qrPass.payload.expiresAt,
        signature: qrPass.signature,
        qrData: qrPass.qrData,
        qrCodeDataUrl: qrPass.qrCodeDataUrl,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves the attendee digital pass for a confirmed ticket (FR-012).
 * Validates ownership, booking confirmation status, and validity.
 */
async function getAttendeePassController(req, res, next) {
  try {
    const { ticketId } = req.params;
    const requestingUser = req.user;

    const result = await getAttendeePass({ ticketId, requestingUser });

    if (!result.success) {
      return res.status(result.status || 400).json({
        status: 'error',
        code: result.code,
        message: result.message,
      });
    }

    return res.status(200).json({
      status: 'success',
      data: result.pass,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves all tickets associated with the authenticated attendee.
 */
async function getAttendeeTicketsController(req, res, next) {
  try {
    const userId = req.user ? req.user.userId : req.query.userId;
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_ID',
        message: 'userId is required',
      });
    }

    const tickets = await getPersistentTicketsByUserId(userId);

    return res.status(200).json({
      status: 'success',
      data: tickets,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Generates a signed JWT token for demo/testing attendee authentication.
 * Restricted strictly to automated test environments (NODE_ENV === 'test').
 * Privileged roles (ADMIN, STAFF, GATE_STAFF) are strictly forbidden.
 */
function getDemoTokenController(req, res, next) {
  try {
    if (process.env.NODE_ENV !== 'test') {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Demo token generation is disabled outside automated test environments',
      });
    }

    const requestedRole = (req.query.role || 'ATTENDEE').toUpperCase();
    if (requestedRole !== 'ATTENDEE') {
      return res.status(403).json({
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Forbidden: Demo token endpoint cannot issue privileged tokens',
      });
    }

    const userId = req.query.userId || 'USR-ATTENDEE-001';
    const role = 'ATTENDEE';
    const name =
      req.query.name ||
      (userId === 'USR-ATTENDEE-001'
        ? 'Alex Johnson'
        : userId === 'USR-ATTENDEE-002'
        ? 'Sarah Connor'
        : 'Demo Attendee');
    const email =
      req.query.email || `${userId.toLowerCase().replace(/[^a-z0-9]/g, '')}@passpulse.io`;

    const token = createToken({ userId, role, name, email });

    return res.status(200).json({
      status: 'success',
      data: {
        token,
        user: {
          userId,
          role,
          name,
          email,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createQrPass,
  getAttendeePassController,
  getAttendeeTicketsController,
  getDemoTokenController,
};
