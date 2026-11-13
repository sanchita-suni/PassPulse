const path = require('path');
require('dotenv').config({
  path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '..', '.env'),
});
const app = require('./app');
const { runMigrations } = require('./config/migration-runner');
const { closePool } = require('./config/db');
const { closeRedis } = require('./config/redis');
const { startHoldExpiryWorker, stopHoldExpiryWorker } = require('./services/hold-expiry.worker');
const { startAvailabilityPoller, stopAvailabilityPoller } = require('./services/availability.service');
const { setShuttingDown } = require('./services/health.service');

const PORT = process.env.PORT || 5000;
let httpServer;

async function start() {
  try {
    const applied = await runMigrations();
    if (applied.length) {
      console.log(`Applied database migrations: ${applied.join(', ')}`);
    }
  } catch (error) {
    console.log(`[PassPulse] Database connection note: ${error.message || 'not reachable'}. Running in-memory catalog & auth mode (DEV-001, DEV-002, DEV-006).`);
  }
  startHoldExpiryWorker();
  startAvailabilityPoller();
  httpServer = app.listen(PORT, () => {
    console.log(`PassPulse Server running on port ${PORT}`);
  });
}

start().catch(async (error) => {
  console.error(`Server startup failed: ${error.message}`);
  await Promise.allSettled([
    stopHoldExpiryWorker(),
    stopAvailabilityPoller(),
    closePool(),
    closeRedis(),
  ]);
  process.exitCode = 1;
});

async function shutdown() {
  setShuttingDown(true);
  await Promise.allSettled([
    stopHoldExpiryWorker(),
    stopAvailabilityPoller(),
  ]);
  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await Promise.all([closePool(), closeRedis()]);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    shutdown().catch((error) => {
      console.error(`Server shutdown failed: ${error.message}`);
      process.exitCode = 1;
    });
  });
}
