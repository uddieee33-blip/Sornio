-- Recovery increment (October 2026): membership authorization, atomic sync,
-- and sale-item fidelity. Idempotent — safe to run more than once.
--
-- 1. Membership rows are readable by their own user and writable ONLY by the
--    owner trigger (SECURITY DEFINER) and the service role. The old policy let
--    any signed-in user insert a business_members row with role 'owner' for
--    any business_id they knew — a direct tenant takeover through the anon key.
-- 2. The tenant snapshot is replaced inside ONE transaction (push_tenant_snapshot).
--    The old client deleted every table, then inserted; a failure mid-way left
--    the cloud empty. A function body is atomic: all of it or none of it.
-- 3. Sale line items travel with their transaction (transactions.items).

-- ---------------------------------------------------------------- 1. membership
DROP POLICY IF EXISTS "User can manage own business membership records" ON business_members;
DROP POLICY IF EXISTS "Users view their own membership rows" ON business_members;
CREATE POLICY "Users view their own membership rows" ON business_members
  FOR SELECT USING (user_id = auth.uid());

-- ------------------------------------------------------------ 2. sale items
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS items JSONB;

-- ------------------------------------------------------------ 3. atomic push
-- SECURITY INVOKER on purpose: every insert and delete below is still checked
-- by the table's own row-level policies, so the function cannot write into a
-- business the caller is not a member of. The explicit membership check is the
-- clear error message; RLS is the enforcement.
--
-- The empty-snapshot guard stops a device that has not finished restoring (or a
-- fresh install) from wiping a business that already has records in the cloud.
CREATE OR REPLACE FUNCTION push_tenant_snapshot(
  p_business_id UUID,
  p_snapshot JSONB,
  p_allow_empty BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_incoming INT;
  v_existing INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM business_members WHERE business_id = p_business_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a member of this business' USING ERRCODE = '42501';
  END IF;

  v_incoming := COALESCE(jsonb_array_length(p_snapshot->'products'), 0)
              + COALESCE(jsonb_array_length(p_snapshot->'transactions'), 0);
  IF v_incoming = 0 AND NOT p_allow_empty THEN
    SELECT (SELECT COUNT(*) FROM products WHERE business_id = p_business_id)
         + (SELECT COUNT(*) FROM transactions WHERE business_id = p_business_id)
      INTO v_existing;
    IF v_existing > 0 THEN
      RAISE EXCEPTION 'refusing to replace a business that has records with an empty snapshot'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Children first, so every foreign key is satisfied at each step.
  DELETE FROM inventory_movements WHERE business_id = p_business_id;
  DELETE FROM scan_events WHERE business_id = p_business_id;
  DELETE FROM biometric_credentials WHERE business_id = p_business_id;
  DELETE FROM marketing_campaigns WHERE business_id = p_business_id;
  DELETE FROM transactions WHERE business_id = p_business_id;
  DELETE FROM customers WHERE business_id = p_business_id;
  DELETE FROM products WHERE business_id = p_business_id;
  DELETE FROM categories WHERE business_id = p_business_id;

  INSERT INTO categories (id, business_id, name)
  SELECT r.id, p_business_id, r.name
  FROM jsonb_to_recordset(COALESCE(p_snapshot->'categories', '[]'::jsonb)) AS r(id UUID, name TEXT);

  INSERT INTO products (id, business_id, name, item_type, category_id, description, selling_price,
    cost_price, tax_rate, current_stock, reorder_level, sku, unit, barcode, internal_code,
    loose_mode, scale_number, active)
  SELECT r.id, p_business_id, r.name, r.item_type, r.category_id, r.description, r.selling_price,
    r.cost_price, r.tax_rate, r.current_stock, r.reorder_level, r.sku, r.unit, r.barcode, r.internal_code,
    r.loose_mode, r.scale_number, r.active
  FROM jsonb_to_recordset(COALESCE(p_snapshot->'products', '[]'::jsonb)) AS r(
    id UUID, name TEXT, item_type TEXT, category_id UUID, description TEXT, selling_price NUMERIC,
    cost_price NUMERIC, tax_rate NUMERIC, current_stock NUMERIC, reorder_level NUMERIC, sku TEXT,
    unit TEXT, barcode TEXT, internal_code TEXT, loose_mode TEXT, scale_number INT, active BOOLEAN);

  INSERT INTO transactions (id, business_id, type, subtype, amount, account_type, direction, notes, items, created_at)
  SELECT r.id, p_business_id, r.type, r.subtype, r.amount, r.account_type, r.direction, r.notes, r.items, r.created_at
  FROM jsonb_to_recordset(COALESCE(p_snapshot->'transactions', '[]'::jsonb)) AS r(
    id UUID, type TEXT, subtype TEXT, amount NUMERIC, account_type TEXT, direction TEXT,
    notes TEXT, items JSONB, created_at TIMESTAMPTZ);

  INSERT INTO customers (id, business_id, name, phone, email, notes, active)
  SELECT r.id, p_business_id, r.name, r.phone, r.email, r.notes, COALESCE(r.active, TRUE)
  FROM jsonb_to_recordset(COALESCE(p_snapshot->'customers', '[]'::jsonb)) AS r(
    id UUID, name TEXT, phone TEXT, email TEXT, notes TEXT, active BOOLEAN);

  INSERT INTO marketing_campaigns (id, business_id, name, channel, spend, notes, start_date)
  SELECT r.id, p_business_id, r.name, r.channel, r.spend, r.notes, r.start_date
  FROM jsonb_to_recordset(COALESCE(p_snapshot->'campaigns', '[]'::jsonb)) AS r(
    id UUID, name TEXT, channel TEXT, spend NUMERIC, notes TEXT, start_date DATE);

  INSERT INTO scan_events (id, business_id, code, symbology, source, context, outcome, product_id,
    product_name, quantity, scanned_by, created_at)
  SELECT r.id, p_business_id, r.code, r.symbology, r.source, r.context, r.outcome, r.product_id,
    r.product_name, r.quantity, r.scanned_by, r.created_at
  FROM jsonb_to_recordset(COALESCE(p_snapshot->'scanEvents', '[]'::jsonb)) AS r(
    id UUID, code TEXT, symbology TEXT, source TEXT, context TEXT, outcome TEXT, product_id UUID,
    product_name TEXT, quantity NUMERIC, scanned_by TEXT, created_at TIMESTAMPTZ);

  INSERT INTO inventory_movements (id, business_id, product_id, movement_type, quantity, delta,
    balance_after, reference_text, movement_key, unit, notes, created_at)
  SELECT r.id, p_business_id, r.product_id, r.movement_type, r.quantity, r.delta,
    r.balance_after, r.reference_text, r.movement_key, r.unit, r.notes, r.created_at
  FROM jsonb_to_recordset(COALESCE(p_snapshot->'stockMovements', '[]'::jsonb)) AS r(
    id UUID, product_id UUID, movement_type TEXT, quantity NUMERIC, delta NUMERIC,
    balance_after NUMERIC, reference_text TEXT, movement_key TEXT, unit TEXT, notes TEXT,
    created_at TIMESTAMPTZ);

  INSERT INTO biometric_credentials (id, business_id, member_id, credential_id, attachment, label,
    use_count, last_used_at, created_at)
  SELECT r.id, p_business_id, r.member_id, r.credential_id, r.attachment, r.label,
    r.use_count, r.last_used_at, r.created_at
  FROM jsonb_to_recordset(COALESCE(p_snapshot->'biometricCredentials', '[]'::jsonb)) AS r(
    id UUID, member_id UUID, credential_id TEXT, attachment TEXT, label TEXT, use_count INT,
    last_used_at TIMESTAMPTZ, created_at TIMESTAMPTZ);

  RETURN jsonb_build_object('ok', TRUE, 'products', v_incoming);
END;
$$;

REVOKE ALL ON FUNCTION push_tenant_snapshot(UUID, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION push_tenant_snapshot(UUID, JSONB, BOOLEAN) TO authenticated;
