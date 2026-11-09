/**
 * NFR-002 / STP TC-PERF-02: QR Verification & Check-in Latency Target (p99 < 200 ms).
 *
 * Acceptance Criteria (GitHub Issue #33):
 * 1. Benchmark 1,000 sequential scans.
 * 2. Verify the p99 server time is below 200 ms.
 * 3. Record benchmark results.
 *
 * Timing Distinction:
 * - Server-Timing header (checkin;dur=<ms>): Captures controller execution time
 *   (HMAC signature verification + ticket status validation + check-in transaction + response build).
 * - Client round-trip: Captures complete end-to-end latency including network socket, body parsing,
 *   JWT verification, and RBAC authorization.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || 'test-qr-secret-for-perf';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-perf';

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');
const { createToken } = require('../../src/middleware/auth.middleware');
const { clearCheckInRecords } = require('../../src/services/checkin.service');
const { clearTickets } = require('../../src/services/ticket.service');
const {
  createPostgresTestDatabase,
} = require('../helpers/postgres-test-database');
const {
  generateBenchmarkPasses,
  seedInMemoryCheckinData,
  seedPersistentBenchmarkData,
} = require('./checkinPerfData');

jest.setTimeout(60000);

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

describe('NFR-002: In-Process Check-in Pipeline Latency Benchmark (1,000 Scans)', () => {
  const SCANS = 1000;
  const eventId = 'EVT-PERF-INPROC-001';
  let passes = [];
  let gateStaffToken;

  beforeAll(() => {
    passes = generateBenchmarkPasses({
      count: SCANS,
      eventId,
      userIdPrefix: 'USR-PERF-INP',
      ticketIdPrefix: 'TKT-PERF-INP',
    });
    seedInMemoryCheckinData(passes);

    gateStaffToken = createToken({
      userId: 'USR-STAFF-PERF-001',
      role: 'GATE_STAFF',
      name: 'Perf Gate Operator',
    });
  });

  afterAll(() => {
    clearCheckInRecords();
    clearTickets();
  });

  test('p99 server processing time is below 200 ms across 1,000 sequential scans', async () => {
    const serverDurations = [];
    const clientDurations = [];

    for (let i = 0; i < SCANS; i += 1) {
      const pass = passes[i];
      const t0 = process.hrtime.bigint();

      const res = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send({
          qrData: pass.qrData,
          eventId: pass.eventId,
          ticketStatus: pass.ticketStatus,
          bookingConfirmationStatus: pass.bookingConfirmationStatus,
        });

      const clientMs = Number(process.hrtime.bigint() - t0) / 1e6;
      clientDurations.push(clientMs);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('CHECKED_IN');
      expect(res.headers['server-timing']).toBeDefined();

      const match = res.headers['server-timing'].match(/checkin;dur=([\d.]+)/);
      expect(match).not.toBeNull();
      serverDurations.push(parseFloat(match[1]));
    }

    serverDurations.sort((a, b) => a - b);
    clientDurations.sort((a, b) => a - b);

    const serverP50 = percentile(serverDurations, 50);
    const serverP95 = percentile(serverDurations, 95);
    const serverP99 = percentile(serverDurations, 99);
    const clientP99 = percentile(clientDurations, 99);

    expect(serverDurations).toHaveLength(SCANS);
    expect(clientDurations).toHaveLength(SCANS);

    // Assert p99 latency target (< 200 ms) per GitHub Issue #33 & SRS NFR-002
    expect(serverP99).toBeLessThan(200);
    expect(clientP99).toBeLessThan(200);

    // Sanity assertion that p50 is substantially lower than limit
    expect(serverP50).toBeLessThan(50);
  });

  test('Server-Timing header is formatted correctly and emitted on check-in responses', async () => {
    const testPass = passes[0];

    // Rescan of pass[0] should produce 409 DUPLICATE_ENTRY with Server-Timing header
    const res = await request(app)
      .post('/api/checkin/verify')
      .set('Authorization', `Bearer ${gateStaffToken}`)
      .send({
        qrData: testPass.qrData,
        eventId: testPass.eventId,
        ticketStatus: testPass.ticketStatus,
        bookingConfirmationStatus: testPass.bookingConfirmationStatus,
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_ENTRY');
    expect(res.headers['server-timing']).toMatch(/^checkin;dur=\d+(\.\d+)?$/);
  });

  test('Duplicate check-in rejections also resolve with p99 latency below 200 ms', async () => {
    const duplicateDurations = [];
    // Rescan first 50 tickets to evaluate duplicate rejection path latency
    for (let i = 0; i < 50; i += 1) {
      const pass = passes[i];
      const res = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send({
          qrData: pass.qrData,
          eventId: pass.eventId,
          ticketStatus: pass.ticketStatus,
          bookingConfirmationStatus: pass.bookingConfirmationStatus,
        });

      expect(res.status).toBe(409);
      const match = res.headers['server-timing'].match(/checkin;dur=([\d.]+)/);
      duplicateDurations.push(parseFloat(match[1]));
    }

    duplicateDurations.sort((a, b) => a - b);
    const p99 = percentile(duplicateDurations, 99);
    expect(p99).toBeLessThan(200);
  });
});

const describePostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describePostgres('NFR-002: Persistent PostgreSQL Check-in Latency Benchmark (1,000 Scans)', () => {
  const SCANS = 1000;
  const eventId = 'EVT-PERF-PG-001';
  let passes = [];
  let gateStaffToken;
  let cleanupTestDb;

  beforeAll(async () => {
    cleanupTestDb = await createPostgresTestDatabase();
    passes = generateBenchmarkPasses({
      count: SCANS,
      eventId,
      userIdPrefix: 'USR-PERF-PG',
      ticketIdPrefix: 'TKT-PERF-PG',
    });

    await seedPersistentBenchmarkData(db.getPool(), {
      eventId,
      organizerId: 'USR-PERF-PG-ORG',
      staffId: 'USR-PERF-PG-STAFF',
      tierId: 'TIER-PERF-PG-001',
      passes,
    });

    gateStaffToken = createToken({
      userId: 'USR-PERF-PG-STAFF',
      role: 'GATE_STAFF',
      name: 'PostgreSQL Perf Operator',
    });
  });

  afterAll(async () => {
    if (cleanupTestDb) await cleanupTestDb();
  });

  test('p99 persistent PostgreSQL transaction time is below 200 ms across 1,000 sequential scans', async () => {
    const serverDurations = [];

    for (let i = 0; i < SCANS; i += 1) {
      const pass = passes[i];
      const res = await request(app)
        .post('/api/checkin/verify')
        .set('Authorization', `Bearer ${gateStaffToken}`)
        .send({
          qrData: pass.qrData,
          eventId: pass.eventId,
          ticketStatus: pass.ticketStatus,
          bookingConfirmationStatus: pass.bookingConfirmationStatus,
        });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('CHECKED_IN');
      const match = res.headers['server-timing'].match(/checkin;dur=([\d.]+)/);
      expect(match).not.toBeNull();
      serverDurations.push(parseFloat(match[1]));
    }

    serverDurations.sort((a, b) => a - b);
    const serverP99 = percentile(serverDurations, 99);
    expect(serverDurations).toHaveLength(SCANS);
    expect(serverP99).toBeLessThan(200);
  });
});
