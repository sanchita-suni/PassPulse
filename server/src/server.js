require('dotenv').config(
  process.env.DOTENV_CONFIG_PATH ? { path: process.env.DOTENV_CONFIG_PATH } : undefined
);
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
  const applied = await runMigrations();
  if (applied.length) {
    console.log(`Applied database migrations: ${applied.join(', ')}`);
  }
  startHoldExpiryWorker();
  startAvailabilityPoller();
  httpServer = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
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
