process.env.QR_HMAC_SECRET =
  process.env.QR_HMAC_SECRET || 'test-qr-secret';

const {
  generateQrPass,
  verifyQrPass,
  generateSignature,
  getQrSecret,
} = require('./qr.service');

describe('QR Pass Service (SEC-006 / FR-011)', () => {
  const baseData = {
    ticketId: 'TKT-TEST-001',
    eventId: 'EVT-TEST-001',
    userId: 'USR-TEST-001',
  };

  let validPass;

  beforeEach(async () => {
    validPass = await generateQrPass({
      ...baseData,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
  });

  test('generates a valid QR pass with 64-hex HMAC signature and PNG data URL', async () => {
    expect(validPass.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(validPass.signature).toHaveLength(64);
    expect(validPass.signature).toMatch(/^[0-9a-f]{64}$/);
    const result = verifyQrPass(validPass.qrData);
    expect(result.valid).toBe(true);
    expect(result.payload.ticketId).toBe(baseData.ticketId);
    expect(result.payload.eventId).toBe(baseData.eventId);
    expect(result.payload.userId).toBe(baseData.userId);
  });

  test('generateQrPass rejects calls missing required fields', async () => {
    await expect(generateQrPass({ ...baseData }))
      .rejects.toThrow('ticketId, eventId, userId and expiresAt are required');
    await expect(generateQrPass({ eventId: 'EVT-1', userId: 'USR-1', expiresAt: '2026-12-01' }))
      .rejects.toThrow('ticketId, eventId, userId and expiresAt are required');
  });

  test('generateSignature produces consistent deterministic HMAC-SHA256 signature', () => {
    const payload = {
      ticketId: 'TKT-CANONICAL-1',
      eventId: 'EVT-CANONICAL-1',
      userId: 'USR-CANONICAL-1',
      issuedAt: '2026-11-08T12:00:00.000Z',
      expiresAt: '2026-11-08T18:00:00.000Z',
    };
    const sig1 = generateSignature(payload);
    const sig2 = generateSignature(payload);
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64);
  });

  describe('Field Tampering Protection (AC-1)', () => {
    test('rejects tampered ticketId with INVALID_SIGNATURE', () => {
      const tampered = JSON.parse(validPass.qrData);
      tampered.ticketId = 'TKT-TAMPERED-999';

      const result = verifyQrPass(JSON.stringify(tampered));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });

    test('rejects tampered eventId with INVALID_SIGNATURE', () => {
      const tampered = JSON.parse(validPass.qrData);
      tampered.eventId = 'EVT-TAMPERED-999';

      const result = verifyQrPass(JSON.stringify(tampered));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });

    test('rejects tampered userId with INVALID_SIGNATURE', () => {
      const tampered = JSON.parse(validPass.qrData);
      tampered.userId = 'USR-TAMPERED-999';

      const result = verifyQrPass(JSON.stringify(tampered));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });

    test('rejects tampered issuedAt with INVALID_SIGNATURE', () => {
      const tampered = JSON.parse(validPass.qrData);
      tampered.issuedAt = new Date(Date.now() - 3600000).toISOString();

      const result = verifyQrPass(JSON.stringify(tampered));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });

    test('rejects tampered expiresAt with INVALID_SIGNATURE', () => {
      const tampered = JSON.parse(validPass.qrData);
      tampered.expiresAt = new Date(Date.now() + 7200000).toISOString();

      const result = verifyQrPass(JSON.stringify(tampered));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });

    test('rejects modified signature with INVALID_SIGNATURE', () => {
      const tampered = JSON.parse(validPass.qrData);
      const originalSig = tampered.signature;
      const lastChar = originalSig[originalSig.length - 1];
      const replacementChar = lastChar === 'a' ? 'b' : 'a';
      tampered.signature = originalSig.slice(0, -1) + replacementChar;

      const result = verifyQrPass(JSON.stringify(tampered));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });
  });

  describe('Signature Format & Edge-Case Robustness', () => {
    test('rejects numeric signature without throwing TypeError', () => {
      const tampered = JSON.parse(validPass.qrData);
      tampered.signature = 1234567890123456;

      const result = verifyQrPass(tampered);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });

    test('rejects object signature without throwing TypeError', () => {
      const tampered = JSON.parse(validPass.qrData);
      tampered.signature = { signature: validPass.signature };

      const result = verifyQrPass(tampered);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });

    test('rejects boolean signature without throwing TypeError', () => {
      const tampered = JSON.parse(validPass.qrData);
      tampered.signature = true;

      const result = verifyQrPass(tampered);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });

    test('rejects truncated signature with INVALID_SIGNATURE', () => {
      const tampered = JSON.parse(validPass.qrData);
      tampered.signature = validPass.signature.slice(0, 32);

      const result = verifyQrPass(JSON.stringify(tampered));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });

    test('rejects invalid non-hexadecimal signature with INVALID_SIGNATURE', () => {
      const tampered = JSON.parse(validPass.qrData);
      tampered.signature = 'z'.repeat(64);

      const result = verifyQrPass(JSON.stringify(tampered));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });

    test('rejects empty signature with INVALID_SIGNATURE', () => {
      const tampered = JSON.parse(validPass.qrData);
      tampered.signature = '';

      const result = verifyQrPass(JSON.stringify(tampered));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_SIGNATURE');
    });

    test('rejects malformed non-JSON string with INVALID_QR_FORMAT', () => {
      const result = verifyQrPass('not-valid-json');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_QR_FORMAT');
    });

    test('rejects non-object payload (e.g. "null" or null) with INVALID_QR_FORMAT', () => {
      expect(verifyQrPass('null')).toEqual({ valid: false, reason: 'INVALID_QR_FORMAT' });
      expect(verifyQrPass(null)).toEqual({ valid: false, reason: 'INVALID_QR_FORMAT' });
      expect(verifyQrPass(12345)).toEqual({ valid: false, reason: 'INVALID_QR_FORMAT' });
    });

    test('rejects QR data with missing required fields with MISSING_QR_FIELDS', () => {
      const result = verifyQrPass(
        JSON.stringify({
          ticketId: 'TKT-TEST-001',
        })
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('MISSING_QR_FIELDS');
    });

    test('rejects QR pass when signature field is omitted entirely with MISSING_QR_FIELDS', () => {
      const tampered = JSON.parse(validPass.qrData);
      delete tampered.signature;

      const result = verifyQrPass(JSON.stringify(tampered));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('MISSING_QR_FIELDS');
    });

    test('rejects an expired QR pass with EXPIRED_QR', async () => {
      const expiredPass = await generateQrPass({
        ...baseData,
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
      });

      const result = verifyQrPass(expiredPass.qrData);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('EXPIRED_QR');
    });
  });

  describe('Secret Configuration & Startup Controls (AC-3)', () => {
    const originalSecret = process.env.QR_HMAC_SECRET;

    afterEach(() => {
      if (originalSecret === undefined) {
        delete process.env.QR_HMAC_SECRET;
      } else {
        process.env.QR_HMAC_SECRET = originalSecret;
      }
    });

    test('getQrSecret returns configured secret when present', () => {
      process.env.QR_HMAC_SECRET = 'active-test-secret-value';
      expect(getQrSecret()).toBe('active-test-secret-value');
    });

    test('throws exact error when QR_HMAC_SECRET is missing', () => {
      delete process.env.QR_HMAC_SECRET;
      expect(() => getQrSecret()).toThrow('QR_HMAC_SECRET is not configured');
    });

    test('throws exact error when QR_HMAC_SECRET is empty string', () => {
      process.env.QR_HMAC_SECRET = '';
      expect(() => getQrSecret()).toThrow('QR_HMAC_SECRET is not configured');
    });

    test('generateSignature throws when QR_HMAC_SECRET is missing', () => {
      delete process.env.QR_HMAC_SECRET;
      expect(() =>
        generateSignature({
          ticketId: 'TKT-1',
          eventId: 'EVT-1',
          userId: 'USR-1',
          issuedAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
        })
      ).toThrow('QR_HMAC_SECRET is not configured');
    });

    test('generateSignature throws when QR_HMAC_SECRET is empty string', () => {
      process.env.QR_HMAC_SECRET = '';
      expect(() =>
        generateSignature({
          ticketId: 'TKT-1',
          eventId: 'EVT-1',
          userId: 'USR-1',
          issuedAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
        })
      ).toThrow('QR_HMAC_SECRET is not configured');
    });

    test('module initialization throws when QR_HMAC_SECRET is missing in isolated context', () => {
      delete process.env.QR_HMAC_SECRET;
      expect(() => {
        jest.isolateModules(() => {
          require('./qr.service');
        });
      }).toThrow('QR_HMAC_SECRET is not configured');
    });

    test('module initialization throws when QR_HMAC_SECRET is empty string in isolated context', () => {
      process.env.QR_HMAC_SECRET = '';
      expect(() => {
        jest.isolateModules(() => {
          require('./qr.service');
        });
      }).toThrow('QR_HMAC_SECRET is not configured');
    });
  });
});
