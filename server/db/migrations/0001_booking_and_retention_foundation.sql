-- Add durable booking, hold, waitlist, claim, and notification state.
-- Core users, events, tiers, bookings, tickets, check-ins, and audit tables are
-- created by the legacy schema bootstrap; existing rows are retained and evolved.

ALTER TABLE ticket_tiers
  ADD COLUMN IF NOT EXISTS reserved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ticket_tiers
  DROP CONSTRAINT IF EXISTS chk_tier_not_oversold;
ALTER TABLE ticket_tiers
  ADD CONSTRAINT chk_tier_not_oversold
  CHECK (sold + reserved <= quota);
ALTER TABLE ticket_tiers
  DROP CONSTRAINT IF EXISTS chk_tier_reserved_nonnegative;
ALTER TABLE ticket_tiers
  ADD CONSTRAINT chk_tier_reserved_nonnegative
  CHECK (reserved >= 0);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_tiers_id_event
  ON ticket_tiers (id, event_id);

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('CONFIRMED', 'CANCELLED', 'EXPIRED'));
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS retained_until TIMESTAMPTZ;
UPDATE bookings
  SET updated_at = COALESCE(updated_at, created_at, now()),
      retained_until = COALESCE(retained_until, created_at + INTERVAL '1 year')
  WHERE updated_at IS NULL OR retained_until IS NULL;
ALTER TABLE bookings
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN retained_until SET DEFAULT (now() + INTERVAL '1 year'),
  ALTER COLUMN retained_until SET NOT NULL;
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_retention_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_retention_check
  CHECK (retained_until >= created_at + INTERVAL '1 year');

ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS tickets_booking_id_fkey;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT;
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS retained_until TIMESTAMPTZ;
UPDATE tickets
  SET updated_at = COALESCE(updated_at, issued_at, now()),
      retained_until = COALESCE(retained_until, issued_at + INTERVAL '1 year')
  WHERE updated_at IS NULL OR retained_until IS NULL;
ALTER TABLE tickets
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN retained_until SET DEFAULT (now() + INTERVAL '1 year'),
  ALTER COLUMN retained_until SET NOT NULL;
ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS tickets_retention_check;
ALTER TABLE tickets
  ADD CONSTRAINT tickets_retention_check
  CHECK (retained_until >= issued_at + INTERVAL '1 year');

ALTER TABLE check_in_logs
  ADD COLUMN IF NOT EXISTS retained_until TIMESTAMPTZ;
UPDATE check_in_logs
  SET retained_until = COALESCE(retained_until, checked_in_at + INTERVAL '1 year')
  WHERE retained_until IS NULL;
ALTER TABLE check_in_logs
  ALTER COLUMN retained_until SET DEFAULT (now() + INTERVAL '1 year'),
  ALTER COLUMN retained_until SET NOT NULL;
ALTER TABLE check_in_logs
  DROP CONSTRAINT IF EXISTS check_in_logs_retention_check;
ALTER TABLE check_in_logs
  ADD CONSTRAINT check_in_logs_retention_check
  CHECK (retained_until >= checked_in_at + INTERVAL '1 year');

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS retained_until TIMESTAMPTZ;
UPDATE audit_log
  SET retained_until = COALESCE(retained_until, created_at + INTERVAL '1 year')
  WHERE retained_until IS NULL;
ALTER TABLE audit_log
  ALTER COLUMN retained_until SET DEFAULT (now() + INTERVAL '1 year'),
  ALTER COLUMN retained_until SET NOT NULL;
ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_retention_check;
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_retention_check
  CHECK (retained_until >= created_at + INTERVAL '1 year');

CREATE TABLE IF NOT EXISTS ticket_holds (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_id       TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  tier_id        TEXT NOT NULL,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  hold_type      TEXT NOT NULL DEFAULT 'BOOKING'
                 CHECK (hold_type IN ('BOOKING', 'WAITLIST_CLAIM')),
  status         TEXT NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE', 'CONFIRMED', 'EXPIRED', 'RELEASED', 'CANCELLED')),
  expires_at     TIMESTAMPTZ NOT NULL,
  booking_id     TEXT UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  retained_until TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 year'),
  CONSTRAINT ticket_holds_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT ticket_holds_tier_event_fkey
    FOREIGN KEY (tier_id, event_id) REFERENCES ticket_tiers(id, event_id) ON DELETE RESTRICT,
  CONSTRAINT ticket_holds_retention_check CHECK (retained_until >= created_at + INTERVAL '1 year')
);

CREATE INDEX IF NOT EXISTS idx_ticket_holds_active_expiry
  ON ticket_holds (expires_at, tier_id)
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_ticket_holds_user_created
  ON ticket_holds (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id             TEXT PRIMARY KEY,
  queue_position BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_id       TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  tier_id        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'WAITING'
                 CHECK (status IN ('WAITING', 'CLAIMED', 'FULFILLED', 'EXPIRED', 'CANCELLED')),
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  retained_until TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 year'),
  CONSTRAINT waitlist_entries_tier_event_fkey
    FOREIGN KEY (tier_id, event_id) REFERENCES ticket_tiers(id, event_id) ON DELETE RESTRICT,
  CONSTRAINT waitlist_entries_retention_check CHECK (retained_until >= joined_at + INTERVAL '1 year')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_active_user_tier
  ON waitlist_entries (user_id, tier_id)
  WHERE status IN ('WAITING', 'CLAIMED');
CREATE INDEX IF NOT EXISTS idx_waitlist_fifo
  ON waitlist_entries (tier_id, queue_position)
  WHERE status = 'WAITING';

CREATE TABLE IF NOT EXISTS waitlist_claims (
  id                 TEXT PRIMARY KEY,
  waitlist_entry_id  TEXT NOT NULL UNIQUE REFERENCES waitlist_entries(id) ON DELETE RESTRICT,
  hold_id            TEXT UNIQUE REFERENCES ticket_holds(id) ON DELETE RESTRICT,
  token_hash         TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE', 'ACCEPTED', 'EXPIRED', 'DECLINED', 'CANCELLED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '15 minutes'),
  resolved_at        TIMESTAMPTZ,
  retained_until     TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 year'),
  CONSTRAINT waitlist_claims_expiry_check
    CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '15 minutes'),
  CONSTRAINT waitlist_claims_retention_check
    CHECK (retained_until >= created_at + INTERVAL '1 year')
);

CREATE INDEX IF NOT EXISTS idx_waitlist_claims_active_expiry
  ON waitlist_claims (expires_at)
  WHERE status = 'ACTIVE';

CREATE OR REPLACE FUNCTION passpulse_validate_waitlist_claim_hold()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.hold_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM waitlist_entries AS entry
    JOIN ticket_holds AS hold
      ON hold.id = NEW.hold_id
     AND hold.user_id = entry.user_id
     AND hold.event_id = entry.event_id
     AND hold.tier_id = entry.tier_id
    WHERE entry.id = NEW.waitlist_entry_id
  ) THEN
    RAISE EXCEPTION 'Claim hold must belong to the same waitlist user and tier'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waitlist_claims_hold_match_guard ON waitlist_claims;
CREATE TRIGGER waitlist_claims_hold_match_guard
  BEFORE INSERT OR UPDATE OF hold_id, waitlist_entry_id ON waitlist_claims
  FOR EACH ROW EXECUTE FUNCTION passpulse_validate_waitlist_claim_hold();

CREATE TABLE IF NOT EXISTS notifications (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  claim_id       TEXT REFERENCES waitlist_claims(id) ON DELETE RESTRICT,
  notification_type TEXT NOT NULL,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at        TIMESTAMPTZ,
  retained_until TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 year'),
  CONSTRAINT notifications_retention_check CHECK (retained_until >= created_at + INTERVAL '1 year')
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_user_created
  ON bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_event_status
  ON bookings (event_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_booking
  ON tickets (booking_id);
CREATE INDEX IF NOT EXISTS idx_check_in_logs_event_time
  ON check_in_logs (event_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION passpulse_enforce_record_retention()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  created_field TEXT := TG_ARGV[0];
  has_unexpired BOOLEAN;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE retained_until > now())',
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME
    ) INTO has_unexpired;
    IF has_unexpired THEN
      RAISE EXCEPTION 'Cannot truncate % before its one-year retention period ends', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) ->> created_field) IS DISTINCT FROM (to_jsonb(OLD) ->> created_field)
       OR NEW.retained_until IS DISTINCT FROM OLD.retained_until THEN
      RAISE EXCEPTION 'Creation and retention timestamps are immutable for %', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.retained_until > now() THEN
    RAISE EXCEPTION 'Cannot delete % before its one-year retention period ends', TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION passpulse_reject_immutable_record_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Records in % are immutable', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS bookings_retention_guard ON bookings;
CREATE TRIGGER bookings_retention_guard
  BEFORE UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION passpulse_enforce_record_retention('created_at');
DROP TRIGGER IF EXISTS bookings_retention_truncate_guard ON bookings;
CREATE TRIGGER bookings_retention_truncate_guard
  BEFORE TRUNCATE ON bookings
  FOR EACH STATEMENT EXECUTE FUNCTION passpulse_enforce_record_retention();
DROP TRIGGER IF EXISTS tickets_retention_guard ON tickets;
CREATE TRIGGER tickets_retention_guard
  BEFORE UPDATE OR DELETE ON tickets
  FOR EACH ROW EXECUTE FUNCTION passpulse_enforce_record_retention('issued_at');
DROP TRIGGER IF EXISTS tickets_retention_truncate_guard ON tickets;
CREATE TRIGGER tickets_retention_truncate_guard
  BEFORE TRUNCATE ON tickets
  FOR EACH STATEMENT EXECUTE FUNCTION passpulse_enforce_record_retention();
DROP TRIGGER IF EXISTS check_in_logs_retention_guard ON check_in_logs;
CREATE TRIGGER check_in_logs_retention_guard
  BEFORE UPDATE OR DELETE ON check_in_logs
  FOR EACH ROW EXECUTE FUNCTION passpulse_enforce_record_retention('checked_in_at');
DROP TRIGGER IF EXISTS check_in_logs_retention_truncate_guard ON check_in_logs;
CREATE TRIGGER check_in_logs_retention_truncate_guard
  BEFORE TRUNCATE ON check_in_logs
  FOR EACH STATEMENT EXECUTE FUNCTION passpulse_enforce_record_retention();
DROP TRIGGER IF EXISTS check_in_logs_immutable_guard ON check_in_logs;
CREATE TRIGGER check_in_logs_immutable_guard
  BEFORE UPDATE ON check_in_logs
  FOR EACH ROW EXECUTE FUNCTION passpulse_reject_immutable_record_updates();
DROP TRIGGER IF EXISTS audit_log_retention_guard ON audit_log;
CREATE TRIGGER audit_log_retention_guard
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION passpulse_enforce_record_retention('created_at');
DROP TRIGGER IF EXISTS audit_log_retention_truncate_guard ON audit_log;
CREATE TRIGGER audit_log_retention_truncate_guard
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION passpulse_enforce_record_retention();
DROP TRIGGER IF EXISTS audit_log_immutable_guard ON audit_log;
CREATE TRIGGER audit_log_immutable_guard
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION passpulse_reject_immutable_record_updates();
DROP TRIGGER IF EXISTS ticket_holds_retention_guard ON ticket_holds;
CREATE TRIGGER ticket_holds_retention_guard
  BEFORE UPDATE OR DELETE ON ticket_holds
  FOR EACH ROW EXECUTE FUNCTION passpulse_enforce_record_retention('created_at');
DROP TRIGGER IF EXISTS ticket_holds_retention_truncate_guard ON ticket_holds;
CREATE TRIGGER ticket_holds_retention_truncate_guard
  BEFORE TRUNCATE ON ticket_holds
  FOR EACH STATEMENT EXECUTE FUNCTION passpulse_enforce_record_retention();
DROP TRIGGER IF EXISTS waitlist_entries_retention_guard ON waitlist_entries;
CREATE TRIGGER waitlist_entries_retention_guard
  BEFORE UPDATE OR DELETE ON waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION passpulse_enforce_record_retention('joined_at');
DROP TRIGGER IF EXISTS waitlist_entries_retention_truncate_guard ON waitlist_entries;
CREATE TRIGGER waitlist_entries_retention_truncate_guard
  BEFORE TRUNCATE ON waitlist_entries
  FOR EACH STATEMENT EXECUTE FUNCTION passpulse_enforce_record_retention();
DROP TRIGGER IF EXISTS waitlist_claims_retention_guard ON waitlist_claims;
CREATE TRIGGER waitlist_claims_retention_guard
  BEFORE UPDATE OR DELETE ON waitlist_claims
  FOR EACH ROW EXECUTE FUNCTION passpulse_enforce_record_retention('created_at');
DROP TRIGGER IF EXISTS waitlist_claims_retention_truncate_guard ON waitlist_claims;
CREATE TRIGGER waitlist_claims_retention_truncate_guard
  BEFORE TRUNCATE ON waitlist_claims
  FOR EACH STATEMENT EXECUTE FUNCTION passpulse_enforce_record_retention();
DROP TRIGGER IF EXISTS notifications_retention_guard ON notifications;
CREATE TRIGGER notifications_retention_guard
  BEFORE UPDATE OR DELETE ON notifications
  FOR EACH ROW EXECUTE FUNCTION passpulse_enforce_record_retention('created_at');
DROP TRIGGER IF EXISTS notifications_retention_truncate_guard ON notifications;
CREATE TRIGGER notifications_retention_truncate_guard
  BEFORE TRUNCATE ON notifications
  FOR EACH STATEMENT EXECUTE FUNCTION passpulse_enforce_record_retention();
