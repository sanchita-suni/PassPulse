/**
 * NFR-002: QR Verification & Check-in Latency Benchmark (1,000 Sequential Scans).
 *
 * Measures:
 * 1. Server Controller Processing Time: from Server-Timing: checkin;dur=<ms>
 *    (covers QR signature verification, payload check, and PostgreSQL ACID transaction).
 * 2. Full HTTP Round-Trip Latency: measured client-side over HTTP keep-alive
 *    (includes network stack, body parsing, JWT authentication, and RBAC authorization).
 *
 * CRITICAL SAFETY REQUIREMENT:
 * This script mandates a dedicated test/benchmark database (BENCH_DATABASE_URL or TEST_DATABASE_URL).
 * It will FAIL CLOSED if executed against an unconfirmed or non-test database to protect production and dev data.
 *
 * Usage:
 *   BENCH_DATABASE_URL=postgresql://user:pass@localhost:5432/passpulse_test npm run bench:checkin
 *   SCANS=1000 BENCH_DATABASE_URL=... npm run bench:checkin
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
require('dotenv').config();
process.env.QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || 'bench-qr-secret-key-for-nfr-002';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'bench-jwt-secret-key-for-nfr-002';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const app = require('../src/app');
const db = require('../src/config/db');
const { createToken } = require('../src/middleware/auth.middleware');
const {
  generateBenchmarkPasses,
  seedPersistentBenchmarkData,
  cleanupPersistentBenchmarkData,
} = require('../tests/perf/checkinPerfData');

const SCANS = Number(process.env.SCANS || 1000);
const TARGET_P99_MS = 200.0;

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function maskDatabaseUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.username || 'user'}:****@${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
  } catch {
    return 'postgresql://****@localhost:5432/unknown';
  }
}

async function verifyDatabaseSafety(connectionString) {
  if (!connectionString) {
    console.error('================================================================================');
    console.error('[DATABASE SAFETY CHECK FAILED]');
    console.error('No dedicated benchmark/test database connection string provided.');
    console.error('NFR-002 requires running the persistent benchmark against a dedicated test database.');
    console.error('');
    console.error('To run this benchmark, configure:');
    console.error('  BENCH_DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<test_db>');
    console.error('or:');
    console.error('  TEST_DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<test_db>');
    console.error('================================================================================');
    process.exit(1);
  }

  let dbName = '';
  try {
    const parsed = new URL(connectionString);
    dbName = parsed.pathname.replace(/^\//, '');
  } catch (err) {
    console.error('[DATABASE SAFETY CHECK FAILED] Invalid connection string URL format:', err.message);
    process.exit(1);
  }

  const isDedicatedTestDb =
    /test|bench/i.test(dbName) ||
    process.env.CONFIRM_DEDICATED_BENCHMARK_DB === 'true';

  if (!isDedicatedTestDb) {
    console.error('================================================================================');
    console.error(`[DATABASE SAFETY CHECK FAILED] Refusing to run benchmark on database "${dbName}".`);
    console.error('The database name does not contain "test" or "bench".');
    console.error('To protect development and production environments from destructive benchmark data,');
    console.error('this tool requires a dedicated test database.');
    console.error('');
    console.error('If you are certain this database is dedicated and safe to use, set:');
    console.error('  CONFIRM_DEDICATED_BENCHMARK_DB=true');
    console.error('================================================================================');
    process.exit(1);
  }
}

async function ensureSchema(pool) {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
}

async function main() {
  const connectionString = process.env.BENCH_DATABASE_URL || process.env.TEST_DATABASE_URL;
  await verifyDatabaseSafety(connectionString);

  console.log('================================================================================');
  console.log('PassPulse NFR-002: QR Verification & Check-in Latency Benchmark');
  console.log(`Target: p99 Server Processing Time < ${TARGET_P99_MS} ms over ${SCANS} sequential scans`);
  console.log(`Database Target: ${maskDatabaseUrl(connectionString)} [Persistent PostgreSQL Mode]`);
  console.log('================================================================================');

  const pool = new Pool({ connectionString });
  db.setPool(pool);

  // Ensure core schema is initialized
  await ensureSchema(pool);

  const runSuffix = crypto.randomBytes(4).toString('hex');
  const eventId = `EVT-BENCH-${runSuffix}`;
  const organizerId = `USR-BN-ORG-${runSuffix}`;
  const staffId = `USR-BN-STAFF-${runSuffix}`;
  const tierId = `TIER-BN-${runSuffix}`;

  const passes = generateBenchmarkPasses({
    count: SCANS,
    eventId,
    userIdPrefix: `USR-BN-${runSuffix}`,
    ticketIdPrefix: `TKT-BN-${runSuffix}`,
  });

  const gateStaffToken = createToken({
    userId: staffId,
    role: 'GATE_STAFF',
    name: 'Benchmark Gate Staff',
  });

  let server;
  let agent;

  try {
    console.log(`1. Seeding ${SCANS} persistent tickets and passes into PostgreSQL...`);
    const seedStart = Date.now();
    await seedPersistentBenchmarkData(pool, {
      eventId,
      organizerId,
      staffId,
      tierId,
      passes,
    });
    console.log(`   Seeding completed in ${Date.now() - seedStart} ms.`);

    console.log('2. Starting in-process HTTP server with keep-alive agent...');
    server = http.createServer(app).listen(0);
    const { port } = server.address();
    agent = new http.Agent({ keepAlive: true, maxSockets: 10 });

    const serverTimings = [];
    const roundTripTimings = [];
    let errors = 0;

    console.log(`3. Executing ${SCANS} sequential check-in verification scans...`);
    const benchStart = process.hrtime.bigint();

    for (let i = 0; i < SCANS; i += 1) {
      const pass = passes[i];
      const payload = JSON.stringify({
        qrData: pass.qrData,
        eventId: pass.eventId,
        ticketStatus: pass.ticketStatus,
        bookingConfirmationStatus: pass.bookingConfirmationStatus,
      });

      await new Promise((resolve) => {
        const t0 = process.hrtime.bigint();
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            path: '/api/checkin/verify',
            method: 'POST',
            agent,
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
              Authorization: `Bearer ${gateStaffToken}`,
            },
          },
          (res) => {
            let resData = '';
            res.on('data', (chunk) => {
              resData += chunk;
            });
            res.on('end', () => {
              const roundTripMs = Number(process.hrtime.bigint() - t0) / 1e6;
              roundTripTimings.push(roundTripMs);

              const timingHeader = res.headers['server-timing'];
              if (timingHeader) {
                const match = timingHeader.match(/checkin;dur=([\d.]+)/);
                if (match) {
                  serverTimings.push(parseFloat(match[1]));
                }
              }

              if (res.statusCode === 200) {
                try {
                  const parsed = JSON.parse(resData);
                  if (parsed.code !== 'CHECKED_IN') errors += 1;
                } catch {
                  errors += 1;
                }
              } else {
                errors += 1;
              }
              resolve();
            });
          }
        );

        req.on('error', () => {
          errors += 1;
          resolve();
        });

        req.write(payload);
        req.end();
      });
    }

    const totalElapsedMs = Number(process.hrtime.bigint() - benchStart) / 1e6;
    const rps = Math.round((SCANS / totalElapsedMs) * 1000);

    serverTimings.sort((a, b) => a - b);
    roundTripTimings.sort((a, b) => a - b);

    const serverP50 = +pct(serverTimings, 50).toFixed(2);
    const serverP90 = +pct(serverTimings, 90).toFixed(2);
    const serverP95 = +pct(serverTimings, 95).toFixed(2);
    const serverP99 = +pct(serverTimings, 99).toFixed(2);
    const serverMax = +serverTimings[serverTimings.length - 1].toFixed(2);

    const clientP50 = +pct(roundTripTimings, 50).toFixed(2);
    const clientP90 = +pct(roundTripTimings, 90).toFixed(2);
    const clientP95 = +pct(roundTripTimings, 95).toFixed(2);
    const clientP99 = +pct(roundTripTimings, 99).toFixed(2);
    const clientMax = +roundTripTimings[roundTripTimings.length - 1].toFixed(2);

    const meetsP99Target = serverP99 < TARGET_P99_MS;

    const summary = {
      benchmark: 'NFR-002: QR Verification & Check-in Database Write Latency',
      databaseMode: 'PostgreSQL Persistent (ACID transactions on check_in_logs)',
      totalScans: SCANS,
      successfulScans: SCANS - errors,
      errors,
      totalDurationSeconds: +(totalElapsedMs / 1000).toFixed(2),
      throughputRps: rps,
      metrics: {
        serverControllerProcessingTime: {
          definition: 'process.hrtime.bigint() in verifyCheckIn (HMAC verification + PostgreSQL transaction + response build)',
          p50_ms: serverP50,
          p90_ms: serverP90,
          p95_ms: serverP95,
          p99_ms: serverP99,
          max_ms: serverMax,
          target_ms: TARGET_P99_MS,
          targetMet: meetsP99Target,
        },
        clientHttpRoundTripLatency: {
          definition: 'End-to-end client socket request to response end (includes network, JSON parsing, auth & RBAC middleware)',
          p50_ms: clientP50,
          p90_ms: clientP90,
          p95_ms: clientP95,
          p99_ms: clientP99,
          max_ms: clientMax,
        },
      },
      verdict: meetsP99Target && errors === 0 ? 'PASS' : 'FAIL',
    };

    console.log('\n================================================================================');
    console.log('BENCHMARK RESULTS SUMMARY');
    console.log('================================================================================');
    console.log(JSON.stringify(summary, null, 2));

    console.log('\n--------------------------------------------------------------------------------');
    console.log(`Server-Side Controller Processing Time (p99): ${serverP99} ms (Threshold: < ${TARGET_P99_MS} ms)`);
    console.log(`Full HTTP Round-Trip Latency (p99):           ${clientP99} ms`);
    console.log(`Throughput:                                   ${rps} scans/second`);
    console.log(`Failures / Errors:                            ${errors}`);
    console.log(`Verdict:                                      ${summary.verdict}`);
    console.log('--------------------------------------------------------------------------------');

    process.exitCode = meetsP99Target && errors === 0 ? 0 : 1;
  } finally {
    console.log('\n4. Executing scoped cleanup of benchmark records in PostgreSQL...');
    try {
      await cleanupPersistentBenchmarkData(pool, {
        eventId,
        organizerId,
        staffId,
        tierId,
        passes,
      });
      console.log('   Cleanup completed successfully.');
    } catch (cleanupErr) {
      console.error('   Cleanup warning:', cleanupErr.message);
    }
    if (server) server.close();
    if (agent) agent.destroy();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[BENCHMARK CRITICAL ERROR]', err);
  process.exit(1);
});
