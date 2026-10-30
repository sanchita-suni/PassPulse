const request = require('supertest');
const app = require('../src/app');
const UserModel = require('../src/models/user.model');

describe('User Authentication & RBAC API (FR-001, FR-002, FR-003, SEC-001, SEC-002)', () => {
  beforeEach(async () => {
    await UserModel.clearAll();
  });

  describe('POST /api/auth/register', () => {
    it('TC-AUTH-01: should register a new attendee successfully with hashed password and JWT', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Saatvik Gupta',
          email: 'saatvik@pes.edu',
          password: 'Password@123',
          role: 'ATTENDEE',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user.email).toBe('saatvik@pes.edu');
      expect(res.body.data.user.role).toBe('ATTENDEE');
      expect(res.body.data.user.passwordHash).toBeUndefined(); // Ensure password hash is not leaked
      expect(res.body.data.token).toBeDefined();
    });

    it('TC-AUTH-02: should reject registration with duplicate email address (409 Conflict)', async () => {
      await request(app).post('/api/auth/register').send({
        fullName: 'Saatvik Gupta',
        email: 'duplicate@pes.edu',
        password: 'Password@123',
      });

      const res = await request(app).post('/api/auth/register').send({
        fullName: 'Another User',
        email: 'duplicate@pes.edu',
        password: 'Password@456',
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.status).toBe('error');
    });

    it('TC-AUTH-03: should reject registration with short password (400 Bad Request)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        fullName: 'Saatvik Gupta',
        email: 'shortpw@pes.edu',
        password: '123',
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe('error');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send({
        fullName: 'Saatvik Gupta',
        email: 'loginuser@pes.edu',
        password: 'SecurePassword123',
        role: 'ORGANIZER',
      });
    });

    it('TC-AUTH-04: should login successfully with correct credentials and return JWT token', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'loginuser@pes.edu',
        password: 'SecurePassword123',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.role).toBe('ORGANIZER');
    });

    it('TC-AUTH-05: should reject login with incorrect password (401 Unauthorized)', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'loginuser@pes.edu',
        password: 'WrongPassword',
      });

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe('error');
    });
  });

  describe('JWT Verification & RBAC Middleware (/api/auth/me & /api/auth/admin-only)', () => {
    let attendeeToken;
    let adminToken;

    beforeEach(async () => {
      const attRes = await request(app).post('/api/auth/register').send({
        fullName: 'Attendee User',
        email: 'attendee@pes.edu',
        password: 'Password@123',
        role: 'ATTENDEE',
      });
      attendeeToken = attRes.body.data.token;

      const admRes = await request(app).post('/api/auth/register').send({
        fullName: 'Admin User',
        email: 'admin@pes.edu',
        password: 'Password@123',
        role: 'ADMIN',
      });
      adminToken = admRes.body.data.token;
    });

    it('TC-AUTH-06: should access protected /me route with valid JWT token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${attendeeToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.user.email).toBe('attendee@pes.edu');
    });

    it('TC-AUTH-07: should reject protected route access without Authorization header (401)', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.statusCode).toBe(401);
    });

    it('TC-SEC-01 (RBAC): should block ATTENDEE from accessing ADMIN endpoint with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/auth/admin-only')
        .set('Authorization', `Bearer ${attendeeToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain('Forbidden: Access denied');
    });

    it('TC-SEC-02 (RBAC): should allow ADMIN to access ADMIN endpoint with 200 OK', async () => {
      const res = await request(app)
        .get('/api/auth/admin-only')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('TC-SEC-03: should reject tampered or invalid JWT signature (401 Unauthorized)', async () => {
      const tamperedToken = attendeeToken.slice(0, -6) + 'abcdef';
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(res.statusCode).toBe(401);
      expect(res.body.message).toContain('Invalid or expired authentication token');
    });
  });
});
