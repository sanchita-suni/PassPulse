const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const redisConfig = require('../src/config/redis');
const healthService = require('../src/services/health.service');
const availabilityService = require('../src/services/availability.service');
const tokens = require('./helpers/tokens');

describe('Health and Availability API Endpoints (NFR-004 / Issue #35)', () => {
  beforeEach(() => {
    healthService.resetHealthState();
    db.setPool({
      query: jest.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
    });
    redisConfig.setRedisClient({
      isOpen: true,
      ping: jest.fn().mockResolvedValue('PONG'),
    });
  });

  afterEach(() => {
    healthService.resetHealthState();
    jest.restoreAllMocks();
  });

  describe('GET / (Root endpoint)', () => {
    test('returns PassPulse API Server text', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.text).toBe('PassPulse API Server');
    });
  });

  describe('GET /api/health (AC-1)', () => {
    test('returns 200 OK and status success with healthy services', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toBe('PassPulse API is healthy');
      expect(res.body.services.database.status).toBe('up');
      expect(res.body.services.redis.status).toBe('up');
      expect(typeof res.body.services.database.latencyMs).toBe('number');
      expect(typeof res.body.services.redis.latencyMs).toBe('number');
    });

    test('returns 503 Service Unavailable when database is down', async () => {
      db.setPool({
        query: jest.fn().mockRejectedValue(new Error('Connection terminated')),
      });

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('PassPulse API dependency unavailable');
      expect(res.body.services.database.status).toBe('down');
      expect(res.body.services.redis.status).toBe('up');

      // Sanitize check: no stack traces or driver errors
      expect(res.body.services.database).not.toHaveProperty('error');
      expect(JSON.stringify(res.body)).not.toContain('Connection terminated');
    });

    test('returns 503 Service Unavailable when Redis is down', async () => {
      redisConfig.setRedisClient({
        isOpen: true,
        ping: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
      });

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
      expect(res.body.services.database.status).toBe('up');
      expect(res.body.services.redis.status).toBe('down');
      expect(JSON.stringify(res.body)).not.toContain('Redis connection refused');
    });

    test('handles unexpected controller error gracefully with 503', async () => {
      jest.spyOn(healthService, 'checkHealth').mockRejectedValueOnce(new Error('Catastrophic failure'));

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('PassPulse API health check failed');
      expect(res.body.services.database.status).toBe('down');
    });
  });

  describe('GET /api/health/live (AC-1)', () => {
    test('returns 200 OK even when database and redis are failing', async () => {
      db.setPool({
        query: jest.fn().mockRejectedValue(new Error('DB is totally dead')),
      });
      redisConfig.setRedisClient({
        isOpen: false,
        ping: jest.fn().mockRejectedValue(new Error('Redis is down')),
      });

      const res = await request(app).get('/api/health/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.message).toBe('PassPulse API is alive');
      expect(typeof res.body.uptime).toBe('number');
    });
  });

  describe('GET /api/health/ready (AC-1)', () => {
    test('returns 200 OK when services are ready', async () => {
      const res = await request(app).get('/api/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    test('returns 503 when a dependency is down', async () => {
      db.setPool({
        query: jest.fn().mockRejectedValue(new Error('Down')),
      });

      const res = await request(app).get('/api/health/ready');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
    });

    test('handles unexpected readiness error gracefully with 503', async () => {
      jest.spyOn(healthService, 'getReadiness').mockRejectedValueOnce(new Error('Readiness crash'));

      const res = await request(app).get('/api/health/ready');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBe('PassPulse API readiness check failed');
    });
  });

  describe('GET /api/admin/availability (AC-3 RBAC & Review)', () => {
    test('returns 401 Unauthorized when no Authorization header is provided', async () => {
      const res = await request(app).get('/api/admin/availability');
      expect(res.status).toBe(401);
    });

    test('returns 403 Forbidden when accessed by an ATTENDEE token', async () => {
      const res = await request(app)
        .get('/api/admin/availability')
        .set('Authorization', tokens.attendee());
      expect(res.status).toBe(403);
    });

    test('returns 403 Forbidden when accessed by an ORGANIZER token', async () => {
      const res = await request(app)
        .get('/api/admin/availability')
        .set('Authorization', tokens.organizer());
      expect(res.status).toBe(403);
    });

    test('returns 200 OK and availability metrics when accessed by an ADMIN token', async () => {
      const res = await request(app)
        .get('/api/admin/availability')
        .set('Authorization', tokens.admin());

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.target).toBe('99.5%');
      expect(typeof res.body.availabilityPercentage).toBe('number');
      expect(typeof res.body.meetsTarget).toBe('boolean');
      expect(typeof res.body.totalChecks).toBe('number');
      expect(Array.isArray(res.body.incidents)).toBe(true);
    });
  });
});
