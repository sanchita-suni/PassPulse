jest.mock('redis', () => ({ createClient: jest.fn() }));

const { createClient } = require('redis');
const redisConfig = require('./redis');

describe('Redis client configuration', () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    createClient.mockReset();
    redisConfig.setRedisClient(null);
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
    redisConfig.setRedisClient(null);
  });

  test('requires a Redis URL before creating a client', () => {
    delete process.env.REDIS_URL;

    expect(() => redisConfig.getRedisClient()).toThrow('REDIS_URL is not configured');
    expect(createClient).not.toHaveBeenCalled();
  });

  test('creates one client and reports its connection errors', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const client = { on: jest.fn() };
    createClient.mockReturnValue(client);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(redisConfig.getRedisClient()).toBe(client);
    expect(redisConfig.getRedisClient()).toBe(client);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith({ url: process.env.REDIS_URL });

    const errorHandler = client.on.mock.calls[0][1];
    errorHandler(new Error('connection failed'));
    expect(consoleError).toHaveBeenCalledWith('Redis client error:', 'connection failed');
  });

  test('reuses an open client without reconnecting', async () => {
    const client = { isOpen: true, connect: jest.fn() };
    redisConfig.setRedisClient(client);

    await expect(redisConfig.connectRedis()).resolves.toBe(client);
    expect(client.connect).not.toHaveBeenCalled();
  });

  test('shares an in-flight connection and allows retry after failure', async () => {
    let resolveConnection;
    const client = {
      isOpen: false,
      connect: jest.fn()
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveConnection = resolve;
        }))
        .mockRejectedValueOnce(new Error('connection failed'))
        .mockResolvedValueOnce(),
    };
    redisConfig.setRedisClient(client);

    const first = redisConfig.connectRedis();
    const second = redisConfig.connectRedis();
    expect(client.connect).toHaveBeenCalledTimes(1);
    resolveConnection();
    await expect(Promise.all([first, second])).resolves.toEqual([client, client]);

    await expect(redisConfig.connectRedis()).rejects.toThrow('connection failed');
    await expect(redisConfig.connectRedis()).resolves.toBe(client);
    expect(client.connect).toHaveBeenCalledTimes(3);
  });

  test('closes open clients and safely resets closed or missing clients', async () => {
    const openClient = { isOpen: true, quit: jest.fn().mockResolvedValue() };
    redisConfig.setRedisClient(openClient);
    await redisConfig.closeRedis();
    expect(openClient.quit).toHaveBeenCalledTimes(1);

    const closedClient = { isOpen: false, quit: jest.fn() };
    redisConfig.setRedisClient(closedClient);
    await redisConfig.closeRedis();
    expect(closedClient.quit).not.toHaveBeenCalled();

    redisConfig.setRedisClient(null);
    await expect(redisConfig.closeRedis()).resolves.toBeUndefined();
  });
});
