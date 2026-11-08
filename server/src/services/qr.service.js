const crypto = require('crypto');
const QRCode = require('qrcode');

const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;

/**
 * Retrieves and validates the QR HMAC signing secret from environment variables.
 * Throws exact error if secret is missing or empty.
 */
function getQrSecret() {
  const secret = process.env.QR_HMAC_SECRET;
  if (!secret) {
    throw new Error('QR_HMAC_SECRET is not configured');
  }
  return secret;
}

// Fail-closed validation on module load so importing/starting the service fails immediately if secret is missing
getQrSecret();

/**
 * Creates a canonical string from the QR payload.
 * Keeping this deterministic is important for signature verification.
 */
function serializePayload(payload) {
  return JSON.stringify({
    ticketId: payload.ticketId,
    eventId: payload.eventId,
    userId: payload.userId,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  });
}

/**
 * Generates an HMAC-SHA256 signature for a QR payload.
 */
function generateSignature(payload) {
  const secret = getQrSecret();
  const serialized = serializePayload(payload);

  return crypto
    .createHmac('sha256', secret)
    .update(serialized)
    .digest('hex');
}

/**
 * Generates a QR pass for a confirmed ticket.
 */
async function generateQrPass({
  ticketId,
  eventId,
  userId,
  issuedAt = new Date().toISOString(),
  expiresAt,
}) {
  if (!ticketId || !eventId || !userId || !expiresAt) {
    throw new Error(
      'ticketId, eventId, userId and expiresAt are required'
    );
  }

  const payload = {
    ticketId,
    eventId,
    userId,
    issuedAt,
    expiresAt,
  };

  const signature = generateSignature(payload);

  const qrData = JSON.stringify({
    ...payload,
    signature,
  });

  const qrCodeDataUrl = await QRCode.toDataURL(qrData);

  return {
    payload,
    signature,
    qrData,
    qrCodeDataUrl,
  };
}

/**
 * Verifies the integrity of a QR pass.
 */
function verifyQrPass(qrData) {
  let parsed;

  try {
    parsed = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
  } catch {
    return {
      valid: false,
      reason: 'INVALID_QR_FORMAT',
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      valid: false,
      reason: 'INVALID_QR_FORMAT',
    };
  }

  const {
    ticketId,
    eventId,
    userId,
    issuedAt,
    expiresAt,
    signature,
  } = parsed;

  if (
    !ticketId ||
    !eventId ||
    !userId ||
    !issuedAt ||
    !expiresAt ||
    signature === undefined ||
    signature === null
  ) {
    return {
      valid: false,
      reason: 'MISSING_QR_FIELDS',
    };
  }

  if (typeof signature !== 'string' || !HEX_64_REGEX.test(signature)) {
    return {
      valid: false,
      reason: 'INVALID_SIGNATURE',
    };
  }

  const payload = {
    ticketId,
    eventId,
    userId,
    issuedAt,
    expiresAt,
  };

  const expectedSignature = generateSignature(payload);

  const providedBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return {
      valid: false,
      reason: 'INVALID_SIGNATURE',
    };
  }

  const expiryTime = new Date(expiresAt).getTime();

  if (Number.isNaN(expiryTime) || Date.now() > expiryTime) {
    return {
      valid: false,
      reason: 'EXPIRED_QR',
    };
  }

  return {
    valid: true,
    payload,
  };
}

module.exports = {
  generateQrPass,
  verifyQrPass,
  generateSignature,
  getQrSecret,
};
