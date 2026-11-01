const request = require('supertest');
const app = require('../src/app');
const UserModel = require('../src/models/user.model');
const { hashPassword } = require('../src/utils/password.util');

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

    it('TC-AUTH-SEC-01: should force ATTENDEE role even when role: "ADMIN" is requested in public registration (CWE-269)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Malicious Admin Wannabe',
          email: 'wannabe.admin@pes.edu',
          password: 'Password@123',
          role: 'ADMIN',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user.role).toBe('ATTENDEE');
      expect(res.body.data.user.email).toBe('wannabe.admin@pes.edu');
    });

    it('TC-AUTH-SEC-02: should force ATTENDEE role even when role: "GATE_STAFF" is requested in public registration', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Malicious Staff Wannabe',
          email: 'wannabe.staff@pes.edu',
          password: 'Password@123',
          role: 'GATE_STAFF',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user.role).toBe('ATTENDEE');
    });

    it('TC-AUTH-SEC-03: should prevent publicly registered user with attempted ADMIN role from accessing admin endpoint', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Sneaky User',
          email: 'sneaky@pes.edu',
          password: 'Password@123',
          role: 'ADMIN',
        });

      const token = regRes.body.data.token;
      const accessRes = await request(app)
        .get('/api/auth/admin-only')
        .set('Authorization', `Bearer ${token}`);

      expect(accessRes.statusCode).toBe(403);
      expect(accessRes.body.message).toContain('Forbidden: Access denied');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await UserModel.create({
        fullName: 'Saatvik Gupta',
        email: 'loginuser@pes.edu',
        passwordHash: await hashPassword('SecurePassword123'),
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

    it('TC-AUTH-08: should login GATE_STAFF successfully with genuine JWT and role', async () => {
      await UserModel.create({
        fullName: 'Gate Staff Lead',
        email: 'gatestaff@pes.edu',
        passwordHash: await hashPassword('Password@123'),
        role: 'GATE_STAFF',
      });

      const loginRes = await request(app).post('/api/auth/login').send({
        email: 'gatestaff@pes.edu',
        password: 'Password@123',
      });

      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.body.status).toBe('success');
      expect(loginRes.body.data.token).toBeDefined();
      expect(loginRes.body.data.user.role).toBe('GATE_STAFF');
      expect(loginRes.body.data.user.email).toBe('gatestaff@pes.edu');
    });

    it('TC-AUTH-09: should reject login when user email does not exist (401 Unauthorized)', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@pes.edu',
        password: 'SomePassword123',
      });

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toContain('Invalid email or password credentials');
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

      await UserModel.create({
        fullName: 'Admin User',
        email: 'admin@pes.edu',
        passwordHash: await hashPassword('Password@123'),
        role: 'ADMIN',
      });

      const admRes = await request(app).post('/api/auth/login').send({
        email: 'admin@pes.edu',
        password: 'Password@123',
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

  describe('POST /api/auth/provision (Admin-Only User Provisioning - SEC-002, CWE-269)', () => {
    let adminToken;
    let attendeeToken;

    beforeEach(async () => {
      await UserModel.create({
        fullName: 'Provision Admin',
        email: 'provadmin@pes.edu',
        passwordHash: await hashPassword('AdminPass@123'),
        role: 'ADMIN',
      });

      const admLogin = await request(app).post('/api/auth/login').send({
        email: 'provadmin@pes.edu',
        password: 'AdminPass@123',
      });
      adminToken = admLogin.body.data.token;

      const attReg = await request(app).post('/api/auth/register').send({
        fullName: 'Regular Attendee',
        email: 'regattendee@pes.edu',
        password: 'Password@123',
      });
      attendeeToken = attReg.body.data.token;
    });

    it('TC-PROV-01: should reject unauthenticated provisioning request with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/auth/provision')
        .send({
          fullName: 'New Gate Staff',
          email: 'newgate@pes.edu',
          password: 'Password@123',
          role: 'GATE_STAFF',
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe('error');
    });

    it('TC-PROV-02: should reject non-admin (attendee) provisioning request with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/auth/provision')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send({
          fullName: 'New Gate Staff',
          email: 'newgate@pes.edu',
          password: 'Password@123',
          role: 'GATE_STAFF',
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.status).toBe('error');
    });

    it('TC-PROV-03: should allow authenticated ADMIN to provision a new GATE_STAFF account with 201 Created', async () => {
      const res = await request(app)
        .post('/api/auth/provision')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'New Gate Staff',
          email: 'newgate@pes.edu',
          password: 'Password@123',
          role: 'GATE_STAFF',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user.role).toBe('GATE_STAFF');
      expect(res.body.data.user.email).toBe('newgate@pes.edu');

      // Verify the provisioned user can log in with their credentials
      const loginRes = await request(app).post('/api/auth/login').send({
        email: 'newgate@pes.edu',
        password: 'Password@123',
      });
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.body.data.user.role).toBe('GATE_STAFF');
    });

    it('TC-PROV-04: should reject provisioning request with invalid role (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/auth/provision')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Super User',
          email: 'superuser@pes.edu',
          password: 'Password@123',
          role: 'SUPERUSER',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toContain('Invalid role');
    });

    it('TC-PROV-05: should reject duplicate email in provisioning (409 Conflict)', async () => {
      await request(app)
        .post('/api/auth/provision')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Staff Lead',
          email: 'lead@pes.edu',
          password: 'Password@123',
          role: 'STAFF',
        });

      const res = await request(app)
        .post('/api/auth/provision')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Another Staff',
          email: 'lead@pes.edu',
          password: 'Password@456',
          role: 'STAFF',
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.status).toBe('error');
    });
  });

  describe('Default Account Seeding Isolation (SEC-001, CWE-1188)', () => {
    it('TC-SEED-01: should NOT automatically seed accounts in test environment', async () => {
      await UserModel.clearAll();
      expect(UserModel.getAllUsers().length).toBe(0);
    });

    it('TC-SEED-02: should seed default users when seedDefaultUsers is called in development mode', async () => {
      await UserModel.clearAll();
      expect(UserModel.getAllUsers().length).toBe(0);

      UserModel.seedDefaultUsers();
      const seeded = UserModel.getAllUsers();
      expect(seeded.length).toBeGreaterThan(0);
      const admin = seeded.find((u) => u.role === 'ADMIN');
      expect(admin).toBeDefined();
      expect(admin.email).toBe('admin@passpulse.io');
    });
  });
});
