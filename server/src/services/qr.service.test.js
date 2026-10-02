const {
  generateQrPass,
  verifyQrPass,
} = require('./qr.service');

describe('QR Pass Service', () => {
  const baseData = {
    ticketId: 'TKT-TEST-001',
    eventId: 'EVT-TEST-001',
    userId: 'USR-TEST-001',
  };

  test('generates a valid QR pass', async () => {
    const pass = await generateQrPass({
      ...baseData,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    expect(pass.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(pass.signature).toHaveLength(64);
    expect(verifyQrPass(pass.qrData).valid).toBe(true);
  });

  test('rejects a tampered QR payload', async () => {
    const pass = await generateQrPass({
      ...baseData,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const tampered = JSON.parse(pass.qrData);
    tampered.ticketId = 'TKT-TAMPERED';

    const result = verifyQrPass(JSON.stringify(tampered));

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('INVALID_SIGNATURE');
  });

  test('rejects an expired QR pass', async () => {
    const pass = await generateQrPass({
      ...baseData,
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
    });

    const result = verifyQrPass(pass.qrData);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('EXPIRED_QR');
  });

  test('rejects QR data with missing fields', () => {
    const result = verifyQrPass(
      JSON.stringify({
        ticketId: 'TKT-TEST-001',
      })
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('MISSING_QR_FIELDS');
  });
});