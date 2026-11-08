jest.mock('../services/checkin.service', () => ({
  processCheckIn: jest.fn(),
  processPersistentCheckIn: jest.fn(),
}));
jest.mock('../services/ticket.service', () => ({
  getPersistentTicketById: jest.fn(),
}));
jest.mock('../config/db', () => ({
  isPoolInitialized: jest.fn(),
}));

const checkinService = require('../services/checkin.service');
const ticketService = require('../services/ticket.service');
const db = require('../config/db');
const { verifyCheckIn } = require('./checkin.controller');

function createResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Check-in controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects requests missing any required check-in field', async () => {
    const res = createResponse();
    const next = jest.fn();

    await verifyCheckIn({ body: { qrData: '{}', eventId: 'EVT-1' } }, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'INVALID_CHECKIN_REQUEST',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  test('routes malformed QR strings through legacy validation when no pool is initialized', async () => {
    db.isPoolInitialized.mockReturnValue(false);
    checkinService.processCheckIn.mockReturnValue({
      success: false,
      reason: 'INVALID_QR_FORMAT',
    });
    const res = createResponse();
    const next = jest.fn();

    await verifyCheckIn({
      body: {
        qrData: 'not-json',
        eventId: 'EVT-1',
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      },
    }, res, next);

    expect(ticketService.getPersistentTicketById).not.toHaveBeenCalled();
    expect(checkinService.processCheckIn).toHaveBeenCalledWith(expect.objectContaining({
      qrData: 'not-json',
    }));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('uses the persistent check-in service for a found ticket and resolves the user ID', async () => {
    ticketService.getPersistentTicketById.mockResolvedValue({ ticketId: 'TKT-1' });
    checkinService.processPersistentCheckIn.mockResolvedValue({
      success: true,
      checkIn: { ticketId: 'TKT-1' },
    });
    const res = createResponse();
    const next = jest.fn();

    await verifyCheckIn({
      body: {
        qrData: { ticketId: 'TKT-1' },
        eventId: 'EVT-1',
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      },
      user: { id: 'USR-1' },
      ip: '127.0.0.1',
    }, res, next);

    expect(checkinService.processPersistentCheckIn).toHaveBeenCalledWith(expect.objectContaining({
      scannedBy: 'USR-1',
      ipAddress: '127.0.0.1',
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  test('keeps persistence enabled when a valid ticket is not found and uses the default error status', async () => {
    ticketService.getPersistentTicketById.mockResolvedValue(null);
    db.isPoolInitialized.mockReturnValue(true);
    checkinService.processPersistentCheckIn.mockResolvedValue({
      success: false,
      reason: 'UNMAPPED_REJECTION',
    });
    const res = createResponse();
    const next = jest.fn();

    await verifyCheckIn({
      body: {
        qrData: { ticketId: 'TKT-MISSING' },
        eventId: 'EVT-1',
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      },
    }, res, next);

    expect(checkinService.processPersistentCheckIn).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'UNMAPPED_REJECTION',
    }));
  });

  test('passes database lookup and service failures to error middleware', async () => {
    const lookupError = new Error('lookup failed');
    ticketService.getPersistentTicketById.mockRejectedValue(lookupError);
    const lookupNext = jest.fn();
    await verifyCheckIn({
      body: {
        qrData: { ticketId: 'TKT-1' },
        eventId: 'EVT-1',
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      },
    }, createResponse(), lookupNext);
    expect(lookupNext).toHaveBeenCalledWith(lookupError);

    ticketService.getPersistentTicketById.mockResolvedValue(null);
    db.isPoolInitialized.mockReturnValue(false);
    const serviceError = new Error('check-in failed');
    checkinService.processCheckIn.mockImplementation(() => {
      throw serviceError;
    });
    const serviceNext = jest.fn();
    await verifyCheckIn({
      body: {
        qrData: {},
        eventId: 'EVT-1',
        ticketStatus: 'VALID',
        bookingConfirmationStatus: 'CONFIRMED',
      },
    }, createResponse(), serviceNext);
    expect(serviceNext).toHaveBeenCalledWith(serviceError);
  });
});
