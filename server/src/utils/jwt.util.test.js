describe('JWT utility configuration', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalExpiry = process.env.JWT_EXPIRES_IN;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
    if (originalExpiry === undefined) {
      delete process.env.JWT_EXPIRES_IN;
    } else {
      process.env.JWT_EXPIRES_IN = originalExpiry;
    }
  });

  test('uses the fallback secret and expiry when environment values are absent', () => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES_IN;
    let jwtUtil;
    jest.isolateModules(() => {
      jwtUtil = require('./jwt.util');
    });

    const token = jwtUtil.generateToken({ userId: 'USR-DEFAULT' });
    expect(jwtUtil.verifyToken(token)).toMatchObject({ userId: 'USR-DEFAULT' });
  });

  test('uses configured secret and expiry values', () => {
    process.env.JWT_SECRET = 'test-jwt-configured-secret';
    process.env.JWT_EXPIRES_IN = '5m';
    let jwtUtil;
    jest.isolateModules(() => {
      jwtUtil = require('./jwt.util');
    });

    const token = jwtUtil.generateToken({ userId: 'USR-CONFIGURED' });
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    expect(payload.userId).toBe('USR-CONFIGURED');
    expect(payload.exp - payload.iat).toBe(300);
  });
});
