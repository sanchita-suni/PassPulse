const healthService = require('./health.service');
const db = require('../config/db');
const redisConfig = require('../config/redis');

describe('Health Service (NFR-004 / Issue #35)', () => {
  beforeEach(() => {
    healthService.resetHealthState();
  });

  afterEach(() => {
    healthService.resetHealthState();
    jest.restoreAllMocks();
  });

  describe('getLiveness', () => {
    test('returns 200 OK and status success independently of external dependencies', () => {
      const liveness = healthService.getLiveness();
      expect(liveness.httpCode).toBe(200);
      expect(liveness.status).toBe('success');
      expect(liveness.message).toBe('PassPulse API is alive');
      expect(typeof liveness.uptime).toBe('number');
      expect(new Date(liveness.timestamp).toString()).not.toBe('Invalid Date');
    });
  });

  describe('withTimeout helper', () => {
    test('resolves when inner promise completes before timeout', async () => {
      const result = await healthService.withTimeout(Promise.resolve('ok'), 500);
      expect(result).toBe('ok');
    });

    test('rejects with specified message when timeout elapses', async () => {
      const slowPromise = new Promise((resolve) => setTimeout(resolve, 200));
      await expect(
        healthService.withTimeout(slowPromise, 20, 'Custom timeout error')
      ).rejects.toThrow('Custom timeout error');
    });

    test('handles environments where timer.unref is undefined', async () => {
      const origSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn().mockImplementation((fn, ms) => {
        const id = origSetTimeout(fn, ms);
        return { id }; // No unref method
      });

      const res = await healthService.withTimeout(Promise.resolve(42), 100);
      expect(res).toBe(42);
      global.setTimeout = origSetTimeout;
    });
  });

  describe('checkDatabase', () => {
    test('returns status up with latency when query succeeds (using default options)', async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
      };
      db.setPool(mockPool);

      const result = await healthService.checkDatabase();
      expect(result.status).toBe('up');
      expect(typeof result.latencyMs).toBe('number');
      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1 AS ok');
    });

    test('returns status down and sanitizes error when database rejects', async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error('FATAL: password authentication failed for user postgres')),
      };
      db.setPool(mockPool);

      const result = await healthService.checkDatabase({ timeoutMs: 1000 });
      expect(result.status).toBe('down');
      expect(result).not.toHaveProperty('error');
      expect(JSON.stringify(result)).not.toContain('postgres');
      expect(JSON.stringify(result)).not.toContain('password');
    });

    test('returns status down when database query times out', async () => {
      const mockPool = {
        query: jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 300))),
      };
      db.setPool(mockPool);

      const result = await healthService.checkDatabase({ timeoutMs: 30 });
      expect(result.status).toBe('down');
    });

    test('returns status down when getPool fails', async () => {
      db.setPool({
        query: jest.fn().mockImplementation(() => {
          throw new Error('Pool error');
        }),
      });
      const result = await healthService.checkDatabase({ timeoutMs: 100 });
      expect(result.status).toBe('down');
    });
  });

  describe('checkRedis', () => {
    test('returns status up when ping returns PONG (using default options)', async () => {
      const mockClient = {
        isOpen: true,
        ping: jest.fn().mockResolvedValue('PONG'),
      };
      redisConfig.setRedisClient(mockClient);

      const result = await healthService.checkRedis();
      expect(result.status).toBe('up');
      expect(typeof result.latencyMs).toBe('number');
      expect(mockClient.ping).toHaveBeenCalled();
    });

    test('returns status down when ping returns unexpected response', async () => {
      const mockClient = {
        isOpen: true,
        ping: jest.fn().mockResolvedValue('NOPE'),
      };
      redisConfig.setRedisClient(mockClient);

      const result = await healthService.checkRedis({ timeoutMs: 1000 });
      expect(result.status).toBe('down');
    });

    test('returns status down when ping rejects or fails', async () => {
      const mockClient = {
        isOpen: true,
        ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379')),
      };
      redisConfig.setRedisClient(mockClient);

      const result = await healthService.checkRedis({ timeoutMs: 1000 });
      expect(result.status).toBe('down');
      expect(JSON.stringify(result)).not.toContain('ECONNREFUSED');
    });

    test('returns status down when redis ping times out', async () => {
      const mockClient = {
        isOpen: true,
        ping: jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 300))),
      };
      redisConfig.setRedisClient(mockClient);

      const result = await healthService.checkRedis({ timeoutMs: 30 });
      expect(result.status).toBe('down');
    });
  });

  describe('checkHealth & getReadiness', () => {
    test('returns 200 OK and status success when both dependencies are up', async () => {
      const dbChecker = jest.fn().mockResolvedValue({ status: 'up', latencyMs: 5 });
      const redisChecker = jest.fn().mockResolvedValue({ status: 'up', latencyMs: 2 });

      const result = await healthService.checkHealth({ dbChecker, redisChecker });
      expect(result.httpCode).toBe(200);
      expect(result.status).toBe('success');
      expect(result.message).toBe('PassPulse API is healthy');
      expect(result.services.database.status).toBe('up');
      expect(result.services.redis.status).toBe('up');
    });

    test('handles checker promise rejection with fallback status down', async () => {
      const dbChecker = jest.fn().mockRejectedValue(new Error('Checker throw'));
      const redisChecker = jest.fn().mockRejectedValue(new Error('Redis throw'));

      const result = await healthService.checkHealth({ dbChecker, redisChecker });
      expect(result.httpCode).toBe(503);
      expect(result.status).toBe('error');
      expect(result.services.database.status).toBe('down');
      expect(result.services.redis.status).toBe('down');
    });

    test('returns 503 Service Unavailable when database is down', async () => {
      const dbChecker = jest.fn().mockResolvedValue({ status: 'down' });
      const redisChecker = jest.fn().mockResolvedValue({ status: 'up', latencyMs: 2 });

      const result = await healthService.checkHealth({ dbChecker, redisChecker });
      expect(result.httpCode).toBe(503);
      expect(result.status).toBe('error');
      expect(result.message).toBe('PassPulse API dependency unavailable');
      expect(result.services.database.status).toBe('down');
      expect(result.services.redis.status).toBe('up');
    });

    test('returns 503 Service Unavailable when Redis is down', async () => {
      const dbChecker = jest.fn().mockResolvedValue({ status: 'up', latencyMs: 4 });
      const redisChecker = jest.fn().mockResolvedValue({ status: 'down' });

      const result = await healthService.checkHealth({ dbChecker, redisChecker });
      expect(result.httpCode).toBe(503);
      expect(result.status).toBe('error');
      expect(result.services.database.status).toBe('up');
      expect(result.services.redis.status).toBe('down');
    });

    test('returns 503 Service Unavailable when both dependencies are down', async () => {
      const dbChecker = jest.fn().mockResolvedValue({ status: 'down' });
      const redisChecker = jest.fn().mockResolvedValue({ status: 'down' });

      const result = await healthService.checkHealth({ dbChecker, redisChecker });
      expect(result.httpCode).toBe(503);
      expect(result.status).toBe('error');
      expect(result.services.database.status).toBe('down');
      expect(result.services.redis.status).toBe('down');
    });

    test('returns 503 when application is shutting down', async () => {
      healthService.setShuttingDown(true);
      expect(healthService.isShutdown()).toBe(true);

      const result = await healthService.checkHealth();
      expect(result.httpCode).toBe(503);
      expect(result.status).toBe('error');
      expect(result.message).toBe('PassPulse API is shutting down');
    });

    test('getReadiness behaves consistently with checkHealth', async () => {
      const dbChecker = jest.fn().mockResolvedValue({ status: 'up', latencyMs: 1 });
      const redisChecker = jest.fn().mockResolvedValue({ status: 'up', latencyMs: 1 });

      const result = await healthService.getReadiness({ dbChecker, redisChecker });
      expect(result.httpCode).toBe(200);
      expect(result.status).toBe('success');
    });
  });
});
