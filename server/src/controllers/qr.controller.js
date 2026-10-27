const { generateQrPass } = require('../services/qr.service');
const { getAttendeePass, getTicketsByUserId } = require('../services/ticket.service');
const { createToken } = require('../middleware/auth.middleware');

/**
 * Generates an HMAC-signed QR pass from raw parameters (FR-011).
 */
async function createQrPass(req, res, next) {
  try {
    const {
      ticketId,
      eventId,
      userId,
      expiresAt,
    } = req.body;

    if (!ticketId || !eventId || !userId || !expiresAt) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_QR_REQUEST',
        message:
          'ticketId, eventId, userId and expiresAt are required',
      });
    }

    const expiryTime = new Date(expiresAt).getTime();

    if (
      Number.isNaN(expiryTime) ||
      expiryTime <= Date.now()
    ) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_EXPIRY',
        message: 'expiresAt must be a valid future timestamp',
      });
    }

    const qrPass = await generateQrPass({
      ticketId,
      eventId,
      userId,
      expiresAt,
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

    const tickets = getTicketsByUserId(userId);

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
 */
function getDemoTokenController(req, res, next) {
  try {
    const userId = req.query.userId || 'USR-ATTENDEE-001';
    const role = req.query.role || 'ATTENDEE';
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