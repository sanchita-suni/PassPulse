const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const db = require('../../src/config/db');
const { runMigrations } = require('../../src/config/migration-runner');

const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');

async function createPostgresTestDatabase() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) return null;

  const schemaName = `passpulse_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  const adminPool = new Pool({ connectionString });
  let testPool;
  let schemaCreated = false;

  try {
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    schemaCreated = true;
    testPool = new Pool({
      connectionString,
      options: `-c search_path=${schemaName}`,
    });
    await testPool.query(fs.readFileSync(schemaPath, 'utf8'));
    await runMigrations({ pool: testPool });
    db.setPool(testPool);
  } catch (error) {
    if (testPool) await testPool.end();
    if (schemaCreated) await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    await adminPool.end();
    throw error;
  }

  return async () => {
    let cleanupError;
    try {
      await db.closePool();
    } catch (error) {
      cleanupError = error;
    }
    try {
      await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    } catch (error) {
      cleanupError = cleanupError || error;
    }
    try {
      await adminPool.end();
    } catch (error) {
      cleanupError = cleanupError || error;
    }
    if (cleanupError) throw cleanupError;
  };
}

async function seedPersistentTicket(pool, ticket) {
  const organizerId = `${ticket.eventId}-ORGANIZER`;
  const tierId = `${ticket.ticketId}-TIER`;
  const bookingId = `${ticket.ticketId}-BOOKING`;
  const organizerEmail = `${organizerId}@test.invalid`;
  const attendeeEmail = ticket.attendeeEmail || `${ticket.userId}@test.invalid`;
  const price = ticket.price || 0;

  await pool.query(
    `INSERT INTO users (id, full_name, email, password_hash, role)
     VALUES ($1, 'Test Organizer', $2, 'test-hash', 'ORGANIZER'),
            ($3, $4, $5, 'test-hash', 'ATTENDEE')`,
    [organizerId, organizerEmail, ticket.userId, ticket.attendeeName || 'Test Attendee', attendeeEmail]
  );
  await pool.query(
    `INSERT INTO events
      (id, organizer_id, title, category, venue, event_date, capacity, status)
     VALUES ($1, $2, $3, $4, $5, $6, 10, 'PUBLISHED')`,
    [
      ticket.eventId,
      organizerId,
      ticket.eventName || 'Test Event',
      ticket.eventCategory || 'Test',
      ticket.venue || 'Test Venue',
      ticket.eventDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ]
  );
  await pool.query(
    `INSERT INTO ticket_tiers (id, event_id, name, price, quota)
     VALUES ($1, $2, $3, $4, 10)`,
    [tierId, ticket.eventId, ticket.ticketTier || 'Test Tier', price]
  );
  await pool.query(
    `INSERT INTO bookings (id, user_id, event_id, status, total_amount)
     VALUES ($1, $2, $3, $4, $5)`,
    [bookingId, ticket.userId, ticket.eventId, ticket.bookingConfirmationStatus || 'CONFIRMED', price]
  );
  await pool.query(
    `INSERT INTO tickets (id, booking_id, tier_id, status)
     VALUES ($1, $2, $3, $4)`,
    [ticket.ticketId, bookingId, tierId, ticket.ticketStatus || 'VALID']
  );
}

module.exports = { createPostgresTestDatabase, seedPersistentTicket };
