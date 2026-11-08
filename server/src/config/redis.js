const { createClient } = require('redis');

let client;
let connecting;

function getRedisClient() {
  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is not configured');
  }
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (error) => {
      console.error('Redis client error:', error.message);
    });
  }
  return client;
}

async function connectRedis() {
  const redis = getRedisClient();
  if (redis.isOpen) return redis;
  if (!connecting) {
    connecting = redis.connect().finally(() => {
      connecting = null;
    });
  }
  await connecting;
  return redis;
}

function setRedisClient(customClient) {
  client = customClient;
  connecting = null;
}

async function closeRedis() {
  if (client && client.isOpen && typeof client.quit === 'function') {
    await client.quit();
  }
  client = null;
  connecting = null;
}

module.exports = { getRedisClient, connectRedis, setRedisClient, closeRedis };
