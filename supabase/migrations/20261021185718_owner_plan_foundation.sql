-- Additive ownership and licensing foundation; existing cycle-store tables are untouched.
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  -- Who created this business. Provisioning a tenant is two rows that each
  -- depend on the other (a business needs a member, a member needs a business),
  -- so the insert policy keys off this column instead of the membership table:
  -- see "Increment 10" at the bottom of this file for why that had to change.
  -- The `on_business_created` trigger below then turns this column into the
  -- owner seat in business_members automatically.
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  business_type TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  description TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','manager','accountant','staff','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, user_id)
);

CREATE TABLE IF NOT EXISTS owner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE, not just indexed: a business has exactly one owner profile, and a
  -- second row would be a second answer to "what is this shop called".
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  -- The owner these details belong to. Kept so a transferred business does not
  -- silently keep answering to somebody who left.
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  owner_name TEXT NOT NULL DEFAULT '',
  owner_phone TEXT NOT NULL DEFAULT '',
  owner_email TEXT NOT NULL DEFAULT '',
  business_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  template_id TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'INR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',

  -- The collection UPI id the QR is derived from, and the bank display details
  -- printed beside it on a receipt. Never credentials.
  upi_id TEXT,
  bank JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Derived from the fields above on every write (see `isSetupComplete` in
  -- `lib/sync/profile.ts`) so a row cannot claim to be finished setup while
  -- missing the UPI id every collection QR needs.
  setup_complete BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The editing device's clock, not the server's: two devices compare this to
  -- decide whose copy is newer, and only their own clocks share a meaning.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Applied after the additive foundation tables.
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_profiles ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION tenant_role(p_business_id UUID) RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT role FROM business_members WHERE business_id=p_business_id AND user_id=auth.uid() LIMIT 1
$$;
REVOKE ALL ON FUNCTION tenant_role(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION tenant_role(UUID) TO authenticated;
CREATE POLICY foundation_business_read ON businesses FOR SELECT TO authenticated USING(tenant_role(id) IS NOT NULL);
CREATE POLICY foundation_business_create ON businesses FOR INSERT TO authenticated WITH CHECK(owner_id=auth.uid());
CREATE POLICY foundation_business_update ON businesses FOR UPDATE TO authenticated USING(tenant_role(id) IN ('owner','manager')) WITH CHECK(tenant_role(id) IN ('owner','manager'));
CREATE POLICY foundation_member_read ON business_members FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY foundation_profile_read ON owner_profiles FOR SELECT TO authenticated USING(tenant_role(business_id) IS NOT NULL);
CREATE POLICY foundation_profile_insert ON owner_profiles FOR INSERT TO authenticated WITH CHECK(tenant_role(business_id) IN ('owner','manager') AND user_id=auth.uid());
CREATE POLICY foundation_profile_update ON owner_profiles FOR UPDATE TO authenticated USING(tenant_role(business_id) IN ('owner','manager')) WITH CHECK(tenant_role(business_id) IN ('owner','manager'));
GRANT SELECT,INSERT,UPDATE ON businesses,owner_profiles TO authenticated;
GRANT SELECT ON business_members TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON business_members FROM authenticated,anon;
CREATE OR REPLACE FUNCTION add_owner_membership() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.owner_id IS NULL THEN RAISE EXCEPTION 'business creator required'; END IF;
 INSERT INTO business_members(business_id,user_id,role) VALUES(NEW.id,NEW.owner_id,'owner') ON CONFLICT(business_id,user_id) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION add_owner_membership() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS on_business_created ON businesses;
CREATE TRIGGER on_business_created AFTER INSERT ON businesses FOR EACH ROW EXECUTE FUNCTION add_owner_membership();

-- Called only by an owner starting their business/profile/plan, not on signup:
-- a fresh teammate must still be able to redeem an invitation first.
CREATE OR REPLACE FUNCTION ensure_owner_business() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b UUID; r TEXT;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT business_id,role INTO b,r FROM business_members WHERE user_id=auth.uid() ORDER BY created_at,business_id LIMIT 1;
 IF b IS NULL THEN
  b:=gen_random_uuid();r:='owner';
  INSERT INTO businesses(id,name,owner_id) VALUES(b,'My Business',auth.uid());
 END IF;
 RETURN jsonb_build_object('businessId',b,'role',r);
END $$;
REVOKE ALL ON FUNCTION ensure_owner_business() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION ensure_owner_business() TO authenticated;

CREATE TABLE business_plan_records (
 business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
 record JSONB NOT NULL CHECK(jsonb_typeof(record)='object'),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE plan_activation_keys (
 code_hash TEXT PRIMARY KEY CHECK(code_hash ~ '^[a-f0-9]{64}$'),
 business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 plan_id TEXT NOT NULL CHECK(plan_id IN ('growth','scale')),
 months INTEGER NOT NULL CHECK(months BETWEEN 1 AND 36),
 payment_reference TEXT NOT NULL UNIQUE CHECK(length(payment_reference) BETWEEN 2 AND 80),
 expires_at TIMESTAMPTZ NOT NULL,
 redeemed_at TIMESTAMPTZ,
 redeemed_by UUID REFERENCES auth.users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE business_plan_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_activation_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_record_read ON business_plan_records FOR SELECT TO authenticated USING(tenant_role(business_id) IS NOT NULL);
GRANT SELECT ON business_plan_records TO authenticated;
REVOKE ALL ON plan_activation_keys FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON business_plan_records FROM anon,authenticated;
GRANT ALL ON business_plan_records,plan_activation_keys TO service_role;

CREATE OR REPLACE FUNCTION read_business_plan() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE scope JSONB; result JSONB;
BEGIN
 scope:=ensure_owner_business();
 SELECT record INTO result FROM business_plan_records WHERE business_id=(scope->>'businessId')::uuid;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION read_business_plan() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION read_business_plan() TO authenticated;

CREATE OR REPLACE FUNCTION change_business_plan(p_action TEXT,p_code_hash TEXT DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE scope JSONB; b UUID; current_record JSONB; result JSONB; key_row plan_activation_keys%ROWTYPE;
 n BIGINT:=floor(extract(epoch FROM now())); base_time BIGINT; finish BIGINT; used BIGINT;
BEGIN
 scope:=ensure_owner_business();b:=(scope->>'businessId')::uuid;
 IF scope->>'role' NOT IN ('owner','manager') THEN RAISE EXCEPTION 'owner or manager required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM businesses WHERE id=b FOR UPDATE;
 SELECT record INTO current_record FROM business_plan_records WHERE business_id=b;
 used:=COALESCE((current_record->>'trialUsedAt')::bigint,0);
 IF p_action='start-trial' THEN
  IF used>0 OR (current_record->>'planId' NOT IN ('starter','trial') AND (current_record->>'renewsAt')::bigint>n) THEN RAISE EXCEPTION 'trial already used or paid plan active' USING ERRCODE='23505'; END IF;
  result:=jsonb_build_object('planId','trial','since',n,'renewsAt',0,'trialEndsAt',n+7*86400,'trialUsedAt',n,'activatedBy','self');
 ELSIF p_action='choose-plan' THEN
  result:=jsonb_build_object('planId','starter','since',COALESCE((current_record->>'since')::bigint,n),'renewsAt',0,'trialEndsAt',0,'trialUsedAt',used,'activatedBy','self');
 ELSIF p_action='activate' THEN
  SELECT * INTO key_row FROM plan_activation_keys WHERE code_hash=p_code_hash AND business_id=b FOR UPDATE;
  IF NOT FOUND OR key_row.expires_at<=now() THEN RAISE EXCEPTION 'invalid activation key' USING ERRCODE='22023'; END IF;
  IF key_row.redeemed_at IS NOT NULL THEN
   IF current_record->>'reference'=key_row.payment_reference THEN RETURN current_record; END IF;
   RAISE EXCEPTION 'activation key already used' USING ERRCODE='22023';
  END IF;
  base_time:=n;
  IF current_record->>'planId'=key_row.plan_id THEN base_time:=GREATEST(n,COALESCE((current_record->>'renewsAt')::bigint,0)); END IF;
  finish:=floor(extract(epoch FROM (to_timestamp(base_time) AT TIME ZONE 'UTC' + make_interval(months=>key_row.months)) AT TIME ZONE 'UTC'));
  result:=jsonb_build_object('planId',key_row.plan_id,'since',CASE WHEN current_record->>'planId'=key_row.plan_id THEN COALESCE((current_record->>'since')::bigint,n) ELSE n END,'renewsAt',finish,'trialEndsAt',0,'trialUsedAt',used,'activatedBy','activation-code','reference',key_row.payment_reference,'priceLockedUntil',floor(extract(epoch FROM (to_timestamp(n) AT TIME ZONE 'UTC' + make_interval(months=>GREATEST(key_row.months,12))) AT TIME ZONE 'UTC')));
  UPDATE plan_activation_keys SET redeemed_at=now(),redeemed_by=auth.uid() WHERE code_hash=p_code_hash;
 ELSE RAISE EXCEPTION 'invalid plan action' USING ERRCODE='22023'; END IF;
 INSERT INTO business_plan_records(business_id,record) VALUES(b,result) ON CONFLICT(business_id) DO UPDATE SET record=EXCLUDED.record,updated_at=now();
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION change_business_plan(TEXT,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION change_business_plan(TEXT,TEXT) TO authenticated;

-- The old deployment had Auth accounts but no businesses. Give each existing,
-- unassigned account its own business; never alter an existing teammate's seat.
INSERT INTO businesses(name,owner_id)
 SELECT 'My Business',u.id FROM auth.users u WHERE NOT EXISTS(SELECT 1 FROM business_members m WHERE m.user_id=u.id);
