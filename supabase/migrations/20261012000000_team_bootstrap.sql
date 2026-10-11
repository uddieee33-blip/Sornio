-- Team bootstrap: multi-user roles for existing deployments.
--
-- Companion to "Increment 10" at the bottom of supabase/schema.sql — that
-- increment broke the provisioning deadlock (the old businesses INSERT policy
-- demanded a membership in the business being created, which is impossible);
-- this migration adds what it did not: the update path, the automatic owner
-- seat, and the invite machinery the team screens run on.
--
-- Safe to re-run: everything is IF EXISTS / IF NOT EXISTS / OR REPLACE.

-- Increment 10 may or may not have created this with the foreign key; the
-- column only needs to *hold* the creator's id for everything below to work.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses (owner_id);

-- Converge the insert policy on exactly what Increment 10 specifies (owning
-- the row you insert, or already being a member of it).
DROP POLICY IF EXISTS "Business members manage their businesses" ON businesses;
CREATE POLICY "Business members manage their businesses" ON businesses
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    OR id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())
  );

-- The update path Increment 10 did not cover: the sync client renames the
-- tenant row on every push, and only owner/manager seats may do it.
DROP POLICY IF EXISTS "Owners and managers update their business" ON businesses;
CREATE POLICY "Owners and managers update their business" ON businesses
  FOR UPDATE USING (id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid() AND role IN ('owner','manager')))
  WITH CHECK (id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid() AND role IN ('owner','manager')));

-- Seat the creator as owner automatically, for every new business — the
-- client also upserts the seat, and both paths converge to one row, so a
-- duplicated enrolment attempt is success rather than a sync-aborting error.
CREATE OR REPLACE FUNCTION add_owner_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO business_members (business_id, user_id, role)
  VALUES (NEW.id, COALESCE(NEW.owner_id, auth.uid()), 'owner')
  ON CONFLICT (business_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_business_created ON businesses;
CREATE TRIGGER on_business_created
  AFTER INSERT ON businesses
  FOR EACH ROW EXECUTE FUNCTION add_owner_membership();

-- Invite codes (hashes only) for adding teammates. No public policies: the
-- service-role team API is the only reader and writer. `owner` is
-- deliberately not an invitable role.
CREATE TABLE IF NOT EXISTS team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('manager','accountant','staff','viewer')),
  code_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  created_by UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  used_by UUID,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_invites_business_id ON team_invites (business_id);
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;

-- Backfill: any business created before the trigger existed gets its owner
-- seat from owner_id.
INSERT INTO business_members (business_id, user_id, role)
SELECT id, owner_id, 'owner' FROM businesses
WHERE owner_id IS NOT NULL
ON CONFLICT (business_id, user_id) DO NOTHING;
