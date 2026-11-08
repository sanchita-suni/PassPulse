#!/usr/bin/env node
/**
 * Availability & Uptime Reporting CLI (NFR-004 / Issue #35)
 *
 * Usage:
 *   node scripts/availability-report.js
 *   npm run report:availability
 */
require('dotenv').config(
  process.env.DOTENV_CONFIG_PATH ? { path: process.env.DOTENV_CONFIG_PATH } : undefined
);
const availabilityService = require('../src/services/availability.service');

function run() {
  const summary = availabilityService.getAvailabilitySummary();

  console.log('==================================================================');
  console.log('           PassPulse Availability & Uptime Report (NFR-004)        ');
  console.log('==================================================================');
  console.log(`Availability Target:       ${summary.target}`);
  console.log(`Measured Availability:     ${summary.availabilityPercentage.toFixed(2)}%`);
  console.log(`Target Satisfied:          ${summary.meetsTarget ? 'YES (PASS)' : 'NO (FAIL)'}`);
  console.log('------------------------------------------------------------------');
  console.log(`Total Checks Executed:     ${summary.totalChecks}`);
  console.log(`Successful Checks:         ${summary.successfulChecks}`);
  console.log(`Failed / Degraded Checks:  ${summary.failedChecks}`);
  console.log(`Last Polled At:            ${summary.lastCheckAt || 'No checks recorded yet'}`);
  console.log(
    `Current System Status:     ${summary.activeIncident ? 'DEGRADED / DOWN' : 'HEALTHY'}`
  );

  if (summary.activeIncident) {
    console.log('------------------------------------------------------------------');
    console.log('Active Outage Incident:');
    console.log(`  - Incident ID:   #${summary.activeIncident.id}`);
    console.log(`  - Affected:      ${summary.activeIncident.service}`);
    console.log(`  - Started At:    ${summary.activeIncident.startedAt}`);
    console.log(`  - Cause:         ${summary.activeIncident.failureCause}`);
  }

  if (summary.incidents && summary.incidents.length > 0) {
    console.log('------------------------------------------------------------------');
    console.log(`Historical Incidents (${summary.incidents.length} recorded):`);
    summary.incidents.slice(0, 10).forEach((inc) => {
      console.log(
        `  - #${inc.id} [${inc.service}] Duration: ${inc.durationSeconds}s | Started: ${inc.startedAt} | Cause: ${inc.failureCause}`
      );
    });
  }
  console.log('==================================================================');

  // Exit code 0 if target is met or no checks yet, code 1 if SLA is breached
  if (!summary.meetsTarget && summary.totalChecks > 0) {
    process.exitCode = 1;
  }
}

run();
