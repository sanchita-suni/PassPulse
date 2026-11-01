const request = require('supertest');
const app = require('../app');

const {
  getLiveness,
  checkDatabaseAvailability,
  checkSubsystemsAvailability,
  getReadiness,
} = require('../services/health.service');

describe('Health Checks & Availability Monitoring API (NFR-004 / Issue #35)', () => {
  beforeEach(() => {
    // Reset any custom probe injected on app.locals
    delete app.locals.dbProbe;
  });

  afterEach(() => {
    delete app.locals.dbProbe;
  });

  describe('1. Basic Liveness Monitoring', () => {
    test('GET /api/health returns HTTP 200 with running message and system telemetry', async () => {
      const response = await request(app).get('/api/health');

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('PassPulse API is running');

      const data = response.body.data;
      expect(data).toBeDefined();
      expect(data.status).toBe('ok');
      expect(data.service).toBe('passpulse-server');
      expect(data.version).toBeDefined();
      expect(data.environment).toBeDefined();
      expect(typeof data.uptimeSeconds).toBe('number');
      expect(data.memory).toBeDefined();
      expect(typeof data.memory.heapUsedMb).toBe('number');
    });

    test('GET /api/health/live returns HTTP 200 with ALIVE status for orchestrator probes', async () => {
      const response = await request(app).get('/api/health/live');

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.code).toBe('ALIVE');
      expect(response.body.data.status).toBe('ok');
      expect(typeof response.body.data.processId).toBe('number');
    });

    test('getLiveness service returns valid ISO timestamp and non-negative uptime', () => {
      const liveness = getLiveness();

      expect(liveness.status).toBe('ok');
      const timestamp = new Date(liveness.timestamp);
      expect(!isNaN(timestamp.getTime())).toBe(true);
      expect(liveness.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(liveness.memory.rssMb).toBeGreaterThan(0);
    });
  });

  describe('2. Readiness & Dependency Availability Checks', () => {
    test('GET /api/health/ready returns HTTP 200 when dependencies are operational', async () => {
      // Inject successful database probe
      app.locals.dbProbe = async () => ({
        status: 'healthy',
        mode: 'postgresql',
        latencyMs: 5,
        message: 'Database connection verified',
      });

      const response = await request(app).get('/api/health/ready');

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.code).toBe('READY');

      const data = response.body.data;
      expect(data.ready).toBe(true);
      expect(data.dependencies.database.status).toBe('healthy');
      expect(data.dependencies.subsystems.status).toBe('healthy');
    });

    test('GET /api/health?detailed=true returns HTTP 200 with full subsystem diagnostics', async () => {
      app.locals.dbProbe = async () => ({
        status: 'healthy',
        mode: 'postgresql',
        latencyMs: 8,
        message: 'Database connection verified',
      });

      const response = await request(app).get('/api/health?detailed=true');

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.ready).toBe(true);
      expect(response.body.data.dependencies.database.mode).toBe('postgresql');
      expect(response.body.data.dependencies.subsystems.stores.checkInStore).toBe('active');
      expect(response.body.data.dependencies.subsystems.stores.userStore).toBe('active');
      expect(response.body.data.dependencies.subsystems.stores.ticketStore).toBe('active');
    });

    test('checkSubsystemsAvailability confirms core service stores are active', () => {
      const subsystems = checkSubsystemsAvailability();

      expect(subsystems.status).toBe('healthy');
      expect(subsystems.stores.checkInStore).toBe('active');
      expect(subsystems.stores.userStore).toBe('active');
      expect(subsystems.stores.ticketStore).toBe('active');
    });

    test('checkDatabaseAvailability returns healthy in in-memory mode when no DATABASE_URL set', async () => {
      const originalUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      try {
        const result = await checkDatabaseAvailability();
        expect(result.status).toBe('healthy');
        expect(result.mode).toBe('in-memory');
      } finally {
        if (originalUrl) process.env.DATABASE_URL = originalUrl;
      }
    });

    test('GET /api/health/ready returns HTTP 200 in default in-memory mode when DATABASE_URL is unset', async () => {
      const originalUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      try {
        const response = await request(app).get('/api/health/ready');

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe('success');
        expect(response.body.code).toBe('READY');
        expect(response.body.data.ready).toBe(true);
        expect(response.body.data.dependencies.database.mode).toBe('in-memory');
      } finally {
        if (originalUrl) process.env.DATABASE_URL = originalUrl;
      }
    });
  });

  describe('3. Unhealthy / Dependency Failure Scenarios', () => {
    test('GET /api/health/ready returns HTTP 503 SERVICE_UNAVAILABLE when database is down', async () => {
      // Inject database failure
      app.locals.dbProbe = async () => ({
        status: 'unhealthy',
        mode: 'postgresql',
        latencyMs: 1500,
        error: 'connection to server at "127.0.0.1", port 5432 failed: Connection refused',
      });

      const response = await request(app).get('/api/health/ready');

      expect(response.statusCode).toBe(503);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
      expect(response.body.message).toBe('Server is not ready to accept traffic');

      const data = response.body.data;
      expect(data.ready).toBe(false);
      expect(data.dependencies.database.status).toBe('unhealthy');
      expect(data.dependencies.database.error).toContain('Connection refused');
    });

    test('GET /api/health?detailed=true returns HTTP 503 when critical dependency fails', async () => {
      app.locals.dbProbe = async () => ({
        status: 'unhealthy',
        mode: 'postgresql',
        latencyMs: 2000,
        error: 'database timeout exceeded',
      });

      const response = await request(app).get('/api/health?detailed=true');

      expect(response.statusCode).toBe(503);
      expect(response.body.status).toBe('error');
      expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
      expect(response.body.data.ready).toBe(false);
      expect(response.body.data.dependencies.database.status).toBe('unhealthy');
    });

    test('Basic liveness GET /api/health/live stays HTTP 200 even when database is failing', async () => {
      // Liveness probe should verify the process itself is alive, preventing restart loops
      app.locals.dbProbe = async () => ({
        status: 'unhealthy',
        error: 'DB connection timeout',
      });

      const response = await request(app).get('/api/health/live');

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.code).toBe('ALIVE');
    });

    test('getReadiness service handles database probe exceptions gracefully', async () => {
      const readiness = await getReadiness({
        dbProbe: async () => {
          throw new Error('Fatal socket connection drop');
        },
      });

      expect(readiness.ready).toBe(false);
      expect(readiness.status).toBe('unhealthy');
    });

    test('checkDatabaseAvailability handles real pg connection failure gracefully without hanging', async () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://invalid_test_user:invalid_pass@127.0.0.1:1/nonexistent';

      try {
        const result = await checkDatabaseAvailability({ timeoutMs: 500 });
        expect(result.status).toBe('unhealthy');
        expect(result.mode).toBe('postgresql');
        expect(result.error).toBeDefined();
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      } finally {
        if (originalUrl) {
          process.env.DATABASE_URL = originalUrl;
        } else {
          delete process.env.DATABASE_URL;
        }
      }
    });
  });
});
