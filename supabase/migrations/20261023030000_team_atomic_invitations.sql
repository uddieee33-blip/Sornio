-- Team-only incremental migration. Do not apply until the deployed Vercel
-- project has been matched to the intended Supabase project and backed up.
-- Requires existing public.businesses and public.business_members from
-- the DukaanOS foundation schema. Does not touch sales, invoices or ledgers.
--
-- Invitation rows are inaccessible to anon/authenticated through PostgREST:
-- only server-side service_role code may mint, inspect or consume them.
CREATE TABLE IF NOT EXISTS public.team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('manager','accountant','staff','viewer')),
  code_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  created_by UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  used_by UUID,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_invites_business_id ON public.team_invites(business_id);
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.team_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.team_invites TO service_role;

-- One RPC = one Postgres transaction. Two different users racing the same code
-- lock the same invite row; only one can insert a membership and consume it.
-- Two codes racing for the same user serialize on that user's advisory lock,
-- so the user cannot accidentally join two businesses through concurrent RPCs.
--
-- SECURITY INVOKER is intentional: the route calls this with its server-only
-- service role client *after* verifying the real Supabase user and CSRF/rate
-- limits. A browser's anon/authenticated tokens cannot call this RPC.
CREATE OR REPLACE FUNCTION public.redeem_team_invite_atomic(
  p_code_hash TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_invite public.team_invites%ROWTYPE;
  v_existing_business UUID;
BEGIN
  IF p_user_id IS NULL OR p_code_hash IS NULL OR p_code_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'invalid');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::TEXT, 20261023));

  SELECT * INTO v_invite
  FROM public.team_invites
  WHERE code_hash = p_code_hash
    AND used_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > pg_catalog.now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'invalid');
  END IF;

  SELECT business_id INTO v_existing_business
  FROM public.business_members
  WHERE user_id = p_user_id
  LIMIT 1;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'status',
      CASE WHEN v_existing_business = v_invite.business_id
           THEN 'already-member' ELSE 'already-assigned' END
    );
  END IF;

  INSERT INTO public.business_members(business_id, user_id, role)
  VALUES (v_invite.business_id, p_user_id, v_invite.role);

  UPDATE public.team_invites
  SET used_at = pg_catalog.now(), used_by = p_user_id
  WHERE id = v_invite.id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'joined',
    'businessId', v_invite.business_id::TEXT,
    'role', v_invite.role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_team_invite_atomic(TEXT,UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_team_invite_atomic(TEXT,UUID)
  TO service_role;
