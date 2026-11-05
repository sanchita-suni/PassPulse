jest.mock('../models/user.model', () => ({
  findById: jest.fn(),
  isDeactivated: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const UserModel = require('../models/user.model');
const { authenticate, requireAuth, optionalAuth } = require('./auth.middleware');

describe('Authentication middleware edge cases', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;
  const jwtSecret = process.env.JWT_SECRET || 'your_super_secret_jwt_key';

  beforeEach(() => {
    jest.clearAllMocks();
    UserModel.findById.mockResolvedValue(null);
    UserModel.isDeactivated.mockReturnValue(false);
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  test('uses decoded-token fallback values when a user repository record is absent', async () => {
    const token = jwt.sign({
      userId: 'USR-TOKEN-ONLY',
      role: '',
      name: '',
      fullName: 'Token User',
      email: '',
    }, jwtSecret);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(req.user).toMatchObject({
      userId: 'USR-TOKEN-ONLY',
      role: 'ATTENDEE',
      name: 'Token User',
      email: '',
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('defaults the test-only user headers for required and optional authentication', () => {
    process.env.NODE_ENV = 'test';
    const req = { headers: { 'x-user-id': 'USR-HEADER' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    requireAuth(req, res, next);
    expect(req.user).toEqual({
      userId: 'USR-HEADER',
      role: 'ATTENDEE',
      name: '',
      email: '',
    });
    expect(next).toHaveBeenCalledTimes(1);

    const optionalReq = { headers: { 'x-user-id': 'USR-OPTIONAL' } };
    optionalAuth(optionalReq, res, next);
    expect(optionalReq.user).toEqual({
      userId: 'USR-OPTIONAL',
      role: 'ATTENDEE',
      name: '',
      email: '',
    });
    expect(next).toHaveBeenCalledTimes(2);
  });

  test('does not trust test-only headers outside test mode for optional authentication', () => {
    process.env.NODE_ENV = 'production';
    const req = { headers: { 'x-user-id': 'USR-UNTRUSTED' } };
    const next = jest.fn();

    optionalAuth(req, {}, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('uses the fallback signing secret when no JWT_SECRET is configured', () => {
    delete process.env.JWT_SECRET;
    let middleware;
    jest.isolateModules(() => {
      middleware = require('./auth.middleware');
    });
    const token = jwt.sign({ userId: 'USR-DEFAULT-SECRET' }, 'your_super_secret_jwt_key');
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    return middleware.authenticate(req, res, next).then(() => {
      expect(req.user.userId).toBe('USR-DEFAULT-SECRET');
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
