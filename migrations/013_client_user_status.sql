ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

UPDATE organization_memberships
   SET status = 'active'
 WHERE status IS NULL;

DO $$ BEGIN
  ALTER TABLE organization_memberships
    ADD CONSTRAINT organization_memberships_status_check
    CHECK (status IN ('active', 'disabled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS organization_memberships_user_status_idx
  ON organization_memberships (user_id, status);
