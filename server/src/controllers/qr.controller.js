const { generateQrPass } = require('../services/qr.service');

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

module.exports = {
  createQrPass,
};