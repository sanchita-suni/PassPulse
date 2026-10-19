-- PassPulse PostgreSQL schema (OPS-001)
-- Core entities from SRS section 3 and SAD section 3.6.
-- IDs are TEXT so they match the identifiers already used by the API
-- (USR-..., EVT-..., TKT-...). Apply with: npm run db:init

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  full_name      TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'ATTENDEE'
                 CHECK (role IN ('ATTENDEE', 'ORGANIZER', 'GATE_STAFF', 'STAFF', 'ADMIN')),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,
  organizer_id   TEXT NOT NULL REFERENCES users(id),
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL,
  venue          TEXT NOT NULL,
  event_date     TIMESTAMPTZ NOT NULL,
  capacity       INTEGER NOT NULL CHECK (capacity > 0),
  status         TEXT NOT NULL DEFAULT 'DRAFT'
                 CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'LIVE', 'COMPLETED', 'CANCELLED')),
  is_flagged     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NFR-001: catalog filters run on category and date
CREATE INDEX IF NOT EXISTS idx_events_category ON events (category);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events (event_date);
CREATE INDEX IF NOT EXISTS idx_events_status ON events (status);

CREATE TABLE IF NOT EXISTS ticket_tiers (
  id             TEXT PRIMARY KEY,
  event_id       TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  price          NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  quota          INTEGER NOT NULL CHECK (quota > 0),
  sold           INTEGER NOT NULL DEFAULT 0 CHECK (sold >= 0),
  max_per_order  INTEGER NOT NULL DEFAULT 5 CHECK (max_per_order BETWEEN 1 AND 5),
  CONSTRAINT uq_tier_name_per_event UNIQUE (event_id, name),
  CONSTRAINT chk_tier_not_oversold CHECK (sold <= quota)
);

CREATE TABLE IF NOT EXISTS bookings (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  event_id       TEXT NOT NULL REFERENCES events(id),
  status         TEXT NOT NULL DEFAULT 'CONFIRMED'
                 CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  total_amount   NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id             TEXT PRIMARY KEY,
  booking_id     TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  tier_id        TEXT NOT NULL REFERENCES ticket_tiers(id),
  status         TEXT NOT NULL DEFAULT 'VALID'
                 CHECK (status IN ('VALID', 'CANCELLED', 'USED')),
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FR-014 / BR-003: one successful check-in per ticket
CREATE TABLE IF NOT EXISTS check_in_logs (
  id             SERIAL PRIMARY KEY,
  ticket_id      TEXT NOT NULL UNIQUE REFERENCES tickets(id),
  event_id       TEXT NOT NULL REFERENCES events(id),
  scanned_by     TEXT REFERENCES users(id),
  checked_in_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SEC-005: failed logins, rejected scans and admin actions
CREATE TABLE IF NOT EXISTS audit_log (
  id             SERIAL PRIMARY KEY,
  actor_id       TEXT REFERENCES users(id),
  action         TEXT NOT NULL,
  target         TEXT,
  ip_address     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
