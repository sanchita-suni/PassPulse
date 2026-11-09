/**
 * Synthetic pass and ticket generator for NFR-002 check-in latency benchmarks and tests.
 */
process.env.QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || 'bench-qr-secret-key-for-nfr-002';

const { generateSignature } = require('../../src/services/qr.service');
const { registerTicket, clearTickets } = require('../../src/services/ticket.service');
const { clearCheckInRecords } = require('../../src/services/checkin.service');

function generateBenchmarkPasses({
  count = 1000,
  eventId = 'EVT-BENCH-001',
  userIdPrefix = 'USR-BENCH',
  ticketIdPrefix = 'TKT-BENCH',
  expiresInMs = 24 * 60 * 60 * 1000,
} = {}) {
  const now = Date.now();
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + expiresInMs).toISOString();

  const passes = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const seq = String(i + 1).padStart(5, '0');
    const ticketId = `${ticketIdPrefix}-${seq}`;
    const userId = `${userIdPrefix}-${seq}`;

    const payload = {
      ticketId,
      eventId,
      userId,
      issuedAt,
      expiresAt,
    };

    const signature = generateSignature(payload);
    const qrData = JSON.stringify({
      ...payload,
      signature,
    });

    passes[i] = {
      ticketId,
      eventId,
      userId,
      issuedAt,
      expiresAt,
      signature,
      qrData,
      ticketStatus: 'VALID',
      bookingConfirmationStatus: 'CONFIRMED',
      ticketTier: 'General Admission',
      price: 99.0,
      bookingId: `BKG-${ticketId}`,
    };
  }

  return passes;
}

function seedInMemoryCheckinData(passes) {
  clearCheckInRecords();
  clearTickets();

  for (const pass of passes) {
    registerTicket({
      ticketId: pass.ticketId,
      eventId: pass.eventId,
      userId: pass.userId,
      ticketStatus: pass.ticketStatus,
      bookingConfirmationStatus: pass.bookingConfirmationStatus,
      expiresAt: pass.expiresAt,
      ticketTier: pass.ticketTier,
      price: pass.price,
    });
  }
}

async function seedPersistentBenchmarkData(pool, {
  eventId = 'EVT-BENCH-001',
  organizerId = 'USR-BENCH-ORG',
  staffId = 'USR-BENCH-STAFF',
  tierId = 'TIER-BENCH-001',
  passes = [],
} = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Organizer and Staff users
    await client.query(
      `INSERT INTO users (id, full_name, email, password_hash, role)
       VALUES ($1, 'Benchmark Organizer', $2, 'bench-hash', 'ORGANIZER'),
              ($3, 'Benchmark Gate Staff', $4, 'bench-hash', 'GATE_STAFF')
       ON CONFLICT (id) DO UPDATE SET is_active = TRUE`,
      [organizerId, `${organizerId}@passpulse-bench.test`, staffId, `${staffId}@passpulse-bench.test`]
    );

    // 2. Event
    await client.query(
      `INSERT INTO events (id, organizer_id, title, category, venue, event_date, capacity, status)
       VALUES ($1, $2, 'NFR-002 Latency Benchmark Event', 'Tech', 'Bench Arena', now() + INTERVAL '1 day', $3, 'PUBLISHED')
       ON CONFLICT (id) DO UPDATE SET status = 'PUBLISHED'`,
      [eventId, organizerId, Math.max(passes.length * 2, 2000)]
    );

    // 3. Ticket Tier
    await client.query(
      `INSERT INTO ticket_tiers (id, event_id, name, price, quota, sold)
       VALUES ($1, $2, 'General Admission', 99.00, $3, 0)
       ON CONFLICT (id) DO UPDATE SET quota = $3`,
      [tierId, eventId, Math.max(passes.length * 2, 2000)]
    );

    // 4. Batch insert Attendee Users (chunks of 200 for SQL parameter limits)
    const chunkSize = 200;
    for (let i = 0; i < passes.length; i += chunkSize) {
      const chunk = passes.slice(i, i + chunkSize);

      // Insert users
      const userValues = [];
      const userParams = [];
      chunk.forEach((p, idx) => {
        const offset = idx * 3;
        userValues.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, 'bench-hash')`);
        userParams.push(p.userId, `User ${p.userId}`, `${p.userId}@passpulse-bench.test`);
      });
      await client.query(
        `INSERT INTO users (id, full_name, email, password_hash)
         VALUES ${userValues.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        userParams
      );

      // Insert bookings
      const bookingValues = [];
      const bookingParams = [];
      chunk.forEach((p, idx) => {
        const offset = idx * 3;
        bookingValues.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, 'CONFIRMED', 99.00)`);
        bookingParams.push(p.bookingId, p.userId, eventId);
      });
      await client.query(
        `INSERT INTO bookings (id, user_id, event_id, status, total_amount)
         VALUES ${bookingValues.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        bookingParams
      );

      // Insert tickets
      const ticketValues = [];
      const ticketParams = [];
      chunk.forEach((p, idx) => {
        const offset = idx * 3;
        ticketValues.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, 'VALID')`);
        ticketParams.push(p.ticketId, p.bookingId, tierId);
      });
      await client.query(
        `INSERT INTO tickets (id, booking_id, tier_id, status)
         VALUES ${ticketValues.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        ticketParams
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupPersistentBenchmarkData(pool, { eventId, staffId, organizerId, tierId, passes = [] }) {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete check-in logs and audit records for benchmark passes
    if (eventId) {
      await client.query('DELETE FROM check_in_logs WHERE event_id = $1', [eventId]);
    }

    if (passes.length > 0) {
      const ticketIds = passes.map((p) => p.ticketId);
      await client.query('DELETE FROM check_in_logs WHERE ticket_id = ANY($1::text[])', [ticketIds]);
      await client.query('DELETE FROM audit_log WHERE target = ANY($1::text[])', [ticketIds]);
      await client.query('DELETE FROM tickets WHERE id = ANY($1::text[])', [ticketIds]);
      const bookingIds = passes.map((p) => p.bookingId);
      await client.query('DELETE FROM bookings WHERE id = ANY($1::text[])', [bookingIds]);
      const userIds = passes.map((p) => p.userId);
      await client.query('DELETE FROM users WHERE id = ANY($1::text[])', [userIds]);
    }

    if (tierId) {
      await client.query('DELETE FROM tickets WHERE tier_id = $1', [tierId]);
      await client.query('DELETE FROM ticket_tiers WHERE id = $1', [tierId]);
    }

    if (eventId) {
      await client.query('DELETE FROM ticket_tiers WHERE event_id = $1', [eventId]);
      await client.query('DELETE FROM bookings WHERE event_id = $1', [eventId]);
      await client.query('DELETE FROM events WHERE id = $1', [eventId]);
    }

    if (staffId) {
      await client.query('DELETE FROM audit_log WHERE actor_id = $1', [staffId]);
      await client.query('DELETE FROM users WHERE id = $1', [staffId]);
    }
    if (organizerId) {
      await client.query('DELETE FROM users WHERE id = $1', [organizerId]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[BENCH CLEANUP ERROR]', err.message);
  } finally {
    client.release();
  }
}

module.exports = {
  generateBenchmarkPasses,
  seedInMemoryCheckinData,
  seedPersistentBenchmarkData,
  cleanupPersistentBenchmarkData,
};
