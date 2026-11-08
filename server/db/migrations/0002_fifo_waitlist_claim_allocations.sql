ALTER TABLE waitlist_entries
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE waitlist_entries
  DROP CONSTRAINT IF EXISTS waitlist_entries_quantity_check;
ALTER TABLE waitlist_entries
  ADD CONSTRAINT waitlist_entries_quantity_check CHECK (quantity > 0);

ALTER TABLE waitlist_claims
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS tier_id TEXT,
  ADD COLUMN IF NOT EXISTS quantity INTEGER;

UPDATE waitlist_entries AS entry
SET quantity = GREATEST(
  entry.quantity,
  (SELECT max(hold.quantity)
   FROM waitlist_claims AS claim
   JOIN ticket_holds AS hold ON hold.id = claim.hold_id
   WHERE claim.waitlist_entry_id = entry.id)
)
WHERE EXISTS (
  SELECT 1
  FROM waitlist_claims AS claim
  JOIN ticket_holds AS hold ON hold.id = claim.hold_id
  WHERE claim.waitlist_entry_id = entry.id
);

UPDATE waitlist_claims AS claim
SET user_id = entry.user_id,
    event_id = entry.event_id,
    tier_id = entry.tier_id,
    quantity = COALESCE(
      (SELECT hold.quantity FROM ticket_holds AS hold WHERE hold.id = claim.hold_id),
      entry.quantity
    )
FROM waitlist_entries AS entry
WHERE entry.id = claim.waitlist_entry_id
  AND (claim.user_id IS NULL OR claim.event_id IS NULL
       OR claim.tier_id IS NULL OR claim.quantity IS NULL);

ALTER TABLE waitlist_claims
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN event_id SET NOT NULL,
  ALTER COLUMN tier_id SET NOT NULL,
  ALTER COLUMN quantity SET NOT NULL;
ALTER TABLE waitlist_claims
  DROP CONSTRAINT IF EXISTS waitlist_claims_quantity_check;
ALTER TABLE waitlist_claims
  ADD CONSTRAINT waitlist_claims_quantity_check CHECK (quantity > 0);
ALTER TABLE waitlist_claims
  DROP CONSTRAINT IF EXISTS waitlist_claims_user_id_fkey,
  ADD CONSTRAINT waitlist_claims_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS waitlist_claims_event_id_fkey,
  ADD CONSTRAINT waitlist_claims_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS waitlist_claims_tier_event_fkey,
  ADD CONSTRAINT waitlist_claims_tier_event_fkey
    FOREIGN KEY (tier_id, event_id) REFERENCES ticket_tiers(id, event_id) ON DELETE RESTRICT;

ALTER TABLE waitlist_claims
  DROP CONSTRAINT IF EXISTS waitlist_claims_waitlist_entry_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_claims_active_entry
  ON waitlist_claims (waitlist_entry_id)
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_waitlist_claims_tier_status_expiry
  ON waitlist_claims (tier_id, status, expires_at);

CREATE OR REPLACE FUNCTION passpulse_validate_waitlist_claim_hold()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  entry waitlist_entries%ROWTYPE;
BEGIN
  SELECT * INTO entry
  FROM waitlist_entries
  WHERE id = NEW.waitlist_entry_id;

  IF NOT FOUND
     OR NEW.user_id IS DISTINCT FROM entry.user_id
     OR NEW.event_id IS DISTINCT FROM entry.event_id
     OR NEW.tier_id IS DISTINCT FROM entry.tier_id
     OR NEW.quantity > entry.quantity THEN
    RAISE EXCEPTION 'Claim must match its waitlist entry'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.hold_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM ticket_holds AS hold
    WHERE hold.id = NEW.hold_id
      AND hold.user_id = NEW.user_id
      AND hold.event_id = NEW.event_id
      AND hold.tier_id = NEW.tier_id
      AND hold.quantity = NEW.quantity
  ) THEN
    RAISE EXCEPTION 'Claim hold must match the same user, event, tier and quantity'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waitlist_claims_hold_match_guard ON waitlist_claims;
CREATE TRIGGER waitlist_claims_hold_match_guard
  BEFORE INSERT OR UPDATE OF hold_id, waitlist_entry_id, user_id, event_id, tier_id, quantity
  ON waitlist_claims
  FOR EACH ROW EXECUTE FUNCTION passpulse_validate_waitlist_claim_hold();
