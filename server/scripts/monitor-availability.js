#!/usr/bin/env node
/**
 * Standalone Availability Monitor Poller CLI (NFR-004 / Issue #35)
 *
 * Usage:
 *   node scripts/monitor-availability.js [--once]
 *   npm run monitor:availability
 */
require('dotenv').config(
  process.env.DOTENV_CONFIG_PATH ? { path: process.env.DOTENV_CONFIG_PATH } : undefined
);
const availabilityService = require('../src/services/availability.service');
const { closePool } = require('../src/config/db');
const { closeRedis } = require('../src/config/redis');

const runOnce = process.argv.includes('--once');

async function tick() {
  console.log(`[${new Date().toISOString()}] Polling service health...`);
  const result = await availabilityService.runPollCycle();
  const summary = availabilityService.getAvailabilitySummary();
  console.log(
    `  Result: ${result.status.toUpperCase()} (${result.httpCode}) | Availability: ${summary.availabilityPercentage.toFixed(2)}% | Total checks: ${summary.totalChecks}`
  );
  if (summary.activeIncident) {
    console.log(`  ALERT: Active incident on ${summary.activeIncident.service} (${summary.activeIncident.failureCause})`);
  }
}

async function main() {
  if (runOnce) {
    await tick();
    await Promise.allSettled([closePool(), closeRedis()]);
    process.exit(0);
  }

  console.log('Starting PassPulse 60-second availability poller (Ctrl+C to stop)...');
  await tick();
  setInterval(tick, availabilityService.DEFAULT_POLL_INTERVAL_MS);
}

main().catch(async (err) => {
  console.error('Fatal poller error:', err);
  await Promise.allSettled([closePool(), closeRedis()]);
  process.exit(1);
});
