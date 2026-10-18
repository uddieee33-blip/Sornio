-- Recovery increment (October 2026). Idempotent: safe to run more than once.
--
-- 1. Membership. Members read their own membership row. Only the owner trigger
--    (SECURITY DEFINER) and the service role write membership rows. The reviewed
--    policy let any signed-in user seat themselves as owner of any business.
--
-- 2. Roles enforced in the database. The app's matrix (lib/security/rbac.ts) is
--    mirrored here through the membership vocabulary (lib/team/roles.ts):
--      owner, manager  — manage the catalogue, settings, expenses, billing, team
--      staff           — the counter: customers, sales, collections, ledger lines
--      accountant,
--      viewer          — read only
--    Every operational table gets the same shape: read for any member; the
--    counter and catalogue write rules above; ledger tables are APPEND-ONLY (no
--    update or delete policy for anyone). Only the owner's reset may delete, and
--    it does so through a function that checks the role first.
--
-- 3. Sync is one atomic, role-aware call (sync_tenant_snapshot). It upserts by
--    stable id, never deletes, and never lets one tenant's row be overwritten by
--    another tenant's payload (every conflict update is guarded by business_id).
--    Ledger lines (sales, stock movements, audit) are union-merged, so two devices
--    selling offline can never lose each other's sales. Product stock is then
--    recomputed from the stock ledger, so an oversold item shows as negative
--    stock instead of silently disappearing.
--
-- 4. Customers carry their opening balance and bank/UPI details to the cloud.

-- ------------------------------------------------------------ 0. helper
CREATE OR REPLACE FUNCTION tenant_role(p_business_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM business_members WHERE business_id = p_business_id AND user_id = auth.uid() LIMIT 1
$$;
REVOKE ALL ON FUNCTION tenant_role(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tenant_role(UUID) TO authenticated;

-- ---------------------------------------------------------- 1. membership
DROP POLICY IF EXISTS "User can manage own business membership records" ON business_members;
DROP POLICY IF EXISTS "Users view their own membership rows" ON business_members;
CREATE POLICY "Users view their own membership rows" ON business_members
  FOR SELECT USING (user_id = auth.uid());

-- ------------------------------------------------- 2. columns the sync carries
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS items JSONB;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bank_details JSONB;

-- ------------------------------------------------- 3. role-based row policies
-- Replace every existing policy on the operational tables with the role matrix.
DO $$
DECLARE
  r RECORD;
  operational TEXT[] := ARRAY[
    'customers','suppliers','categories','products','sales','sale_items','payment_methods',
    'payments','expenses','inventory_movements','transactions','audit_logs','business_settings',
    'invoices','invoice_items','payment_records','membership_plans','members',
    'membership_subscriptions','reminder_templates','insights','ai_tips','marketing_campaigns',
    'scan_events','biometric_credentials'
  ];
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public' AND tablename = ANY (operational)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

DO $$
DECLARE
  t TEXT;
  -- Catalogue and back-office: owner and manager write; everyone in the business reads.
  catalogue TEXT[] := ARRAY[
    'suppliers','categories','products','expenses','payment_methods','business_settings',
    'invoices','invoice_items','membership_plans','members','membership_subscriptions',
    'reminder_templates','insights','ai_tips','marketing_campaigns'
  ];
  -- The counter: owner, manager and staff record customers and sales; only managers remove.
  counter TEXT[] := ARRAY['customers','sales','sale_items','payment_records','biometric_credentials'];
  -- Ledger: append-only. Staff and managers add lines; nobody edits or removes them.
  ledger TEXT[] := ARRAY['transactions','inventory_movements','payments','scan_events','audit_logs'];
BEGIN
  FOREACH t IN ARRAY catalogue LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_role(business_id) IS NOT NULL)', 'read ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (tenant_role(business_id) IN (''owner'',''manager'')) WITH CHECK (tenant_role(business_id) IN (''owner'',''manager''))',
      'manage ' || t, t);
  END LOOP;

  FOREACH t IN ARRAY counter LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_role(business_id) IS NOT NULL)', 'read ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_role(business_id) IN (''owner'',''manager'',''staff''))',
      'record ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (tenant_role(business_id) IN (''owner'',''manager'',''staff'')) WITH CHECK (tenant_role(business_id) IN (''owner'',''manager'',''staff''))',
      'update ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (tenant_role(business_id) IN (''owner'',''manager''))',
      'remove ' || t, t);
  END LOOP;

  FOREACH t IN ARRAY ledger LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_role(business_id) IS NOT NULL)', 'read ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_role(business_id) IN (''owner'',''manager'',''staff''))',
      'append ' || t, t);
  END LOOP;
END $$;

-- Customers gain the sync columns; the counter role may already edit them.
-- Businesses keep their own policies (owner/manager update, membership read).

-- ------------------------------------------------------- 4. atomic sync
CREATE OR REPLACE FUNCTION sync_tenant_snapshot(p_business_id UUID, p_snapshot JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := tenant_role(p_business_id);
  v_manager BOOLEAN;
BEGIN
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not a member of this business' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('owner', 'manager', 'staff') THEN
    RAISE EXCEPTION 'this role cannot change the business records' USING ERRCODE = '42501';
  END IF;
  v_manager := v_role IN ('owner', 'manager');

  -- Business name and settings belong to managers. A counter device's copy is ignored.
  IF v_manager THEN
    IF p_snapshot ? 'businessName' THEN
      UPDATE businesses SET name = p_snapshot->>'businessName', updated_at = NOW() WHERE id = p_business_id;
    END IF;
    IF p_snapshot ? 'settings' THEN
      -- One settings row per business. business_settings has no unique key on
      -- business_id, so the insert is guarded explicitly to avoid duplicates.
      IF NOT EXISTS (SELECT 1 FROM business_settings WHERE business_id = p_business_id) THEN
        INSERT INTO business_settings (business_id) VALUES (p_business_id);
      END IF;
      -- Only the fields the device actually sent change. A missing key keeps the
      -- stored value (a NULL here would violate the table's NOT NULL columns).
      UPDATE business_settings bs SET
        receipt_mode = COALESCE(s.receipt_mode, bs.receipt_mode),
        send_sms_reminders = COALESCE(s.send_sms_reminders, bs.send_sms_reminders),
        send_whatsapp_reminders = COALESCE(s.send_whatsapp_reminders, bs.send_whatsapp_reminders),
        auto_generate_invoice_number = COALESCE(s.auto_generate_invoice_number, bs.auto_generate_invoice_number),
        tax_rate = COALESCE(s.tax_rate, bs.tax_rate),
        allow_memberships = COALESCE(s.allow_memberships, bs.allow_memberships),
        allow_inventory = COALESCE(s.allow_inventory, bs.allow_inventory),
        allow_appointments = COALESCE(s.allow_appointments, bs.allow_appointments),
        allow_digital_receipts = COALESCE(s.allow_digital_receipts, bs.allow_digital_receipts),
        allow_physical_receipts = COALESCE(s.allow_physical_receipts, bs.allow_physical_receipts),
        updated_at = NOW()
      FROM jsonb_to_record(p_snapshot->'settings') AS s(receipt_mode TEXT, send_sms_reminders BOOLEAN,
        send_whatsapp_reminders BOOLEAN, auto_generate_invoice_number BOOLEAN, tax_rate NUMERIC,
        allow_memberships BOOLEAN, allow_inventory BOOLEAN, allow_appointments BOOLEAN,
        allow_digital_receipts BOOLEAN, allow_physical_receipts BOOLEAN)
      WHERE bs.business_id = p_business_id;
    END IF;

    INSERT INTO categories (id, business_id, name)
    SELECT r.id, p_business_id, r.name
    FROM jsonb_to_recordset(COALESCE(p_snapshot->'categories', '[]'::jsonb)) AS r(id UUID, name TEXT)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
      WHERE categories.business_id = p_business_id;

    INSERT INTO products (id, business_id, name, item_type, category_id, description, selling_price,
      cost_price, tax_rate, current_stock, reorder_level, sku, unit, barcode, internal_code,
      loose_mode, scale_number, active)
    SELECT r.id, p_business_id, r.name, r.item_type, r.category_id, r.description, r.selling_price,
      r.cost_price, r.tax_rate, r.current_stock, r.reorder_level, r.sku, r.unit, r.barcode, r.internal_code,
      r.loose_mode, r.scale_number, r.active
    FROM jsonb_to_recordset(COALESCE(p_snapshot->'products', '[]'::jsonb)) AS r(
      id UUID, name TEXT, item_type TEXT, category_id UUID, description TEXT, selling_price NUMERIC,
      cost_price NUMERIC, tax_rate NUMERIC, current_stock NUMERIC, reorder_level NUMERIC, sku TEXT,
      unit TEXT, barcode TEXT, internal_code TEXT, loose_mode TEXT, scale_number INT, active BOOLEAN)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, item_type = EXCLUDED.item_type,
      category_id = EXCLUDED.category_id, description = EXCLUDED.description,
      selling_price = EXCLUDED.selling_price, cost_price = EXCLUDED.cost_price, tax_rate = EXCLUDED.tax_rate,
      reorder_level = EXCLUDED.reorder_level, sku = EXCLUDED.sku, unit = EXCLUDED.unit,
      barcode = EXCLUDED.barcode, internal_code = EXCLUDED.internal_code, loose_mode = EXCLUDED.loose_mode,
      scale_number = EXCLUDED.scale_number, active = EXCLUDED.active, updated_at = NOW()
      WHERE products.business_id = p_business_id;

    INSERT INTO marketing_campaigns (id, business_id, name, channel, spend, notes, start_date)
    SELECT r.id, p_business_id, r.name, r.channel, r.spend, r.notes, r.start_date
    FROM jsonb_to_recordset(COALESCE(p_snapshot->'campaigns', '[]'::jsonb)) AS r(
      id UUID, name TEXT, channel TEXT, spend NUMERIC, notes TEXT, start_date DATE)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, channel = EXCLUDED.channel, spend = EXCLUDED.spend,
      notes = EXCLUDED.notes, start_date = EXCLUDED.start_date, updated_at = NOW()
      WHERE marketing_campaigns.business_id = p_business_id;
  END IF;

  -- Customers: the counter may add and correct them.
  INSERT INTO customers (id, business_id, name, phone, email, notes, active, opening_balance, bank_details)
  SELECT r.id, p_business_id, r.name, r.phone, r.email, r.notes, COALESCE(r.active, TRUE),
    COALESCE(r.opening_balance, 0), r.bank_details
  FROM jsonb_to_recordset(COALESCE(p_snapshot->'customers', '[]'::jsonb)) AS r(
    id UUID, name TEXT, phone TEXT, email TEXT, notes TEXT, active BOOLEAN,
    opening_balance NUMERIC, bank_details JSONB)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email,
    notes = EXCLUDED.notes, active = EXCLUDED.active, opening_balance = EXCLUDED.opening_balance,
    bank_details = EXCLUDED.bank_details, updated_at = NOW()
    WHERE customers.business_id = p_business_id;

  -- Ledger: append-only. A line already in the cloud is kept as it is.
  INSERT INTO transactions (id, business_id, type, subtype, amount, account_type, direction, notes, items, created_at)
  SELECT r.id, p_business_id, r.type, r.subtype, r.amount, r.account_type, r.direction, r.notes, r.items, r.created_at
  FROM jsonb_to_recordset(COALESCE(p_snapshot->'transactions', '[]'::jsonb)) AS r(
    id UUID, type TEXT, subtype TEXT, amount NUMERIC, account_type TEXT, direction TEXT,
    notes TEXT, items JSONB, created_at TIMESTAMPTZ)
  ON CONFLICT DO NOTHING;

  INSERT INTO inventory_movements (id, business_id, product_id, movement_type, quantity, delta,
    balance_after, reference_text, movement_key, unit, notes, created_at)
  SELECT r.id, p_business_id, r.product_id, r.movement_type, r.quantity, r.delta,
    r.balance_after, r.reference_text, r.movement_key, r.unit, r.notes, r.created_at
  FROM jsonb_to_recordset(COALESCE(p_snapshot->'stockMovements', '[]'::jsonb)) AS r(
    id UUID, product_id UUID, movement_type TEXT, quantity NUMERIC, delta NUMERIC,
    balance_after NUMERIC, reference_text TEXT, movement_key TEXT, unit TEXT, notes TEXT,
    created_at TIMESTAMPTZ)
  ON CONFLICT DO NOTHING;

  INSERT INTO scan_events (id, business_id, code, symbology, source, context, outcome, product_id,
    product_name, quantity, scanned_by, created_at)
  SELECT r.id, p_business_id, r.code, r.symbology, r.source, r.context, r.outcome, r.product_id,
    r.product_name, r.quantity, r.scanned_by, r.created_at
  FROM jsonb_to_recordset(COALESCE(p_snapshot->'scanEvents', '[]'::jsonb)) AS r(
    id UUID, code TEXT, symbology TEXT, source TEXT, context TEXT, outcome TEXT, product_id UUID,
    product_name TEXT, quantity NUMERIC, scanned_by TEXT, created_at TIMESTAMPTZ)
  ON CONFLICT DO NOTHING;

  INSERT INTO audit_logs (id, business_id, actor_user_id, entity_type, action, details, created_at)
  SELECT r.id, p_business_id, auth.uid(), r.entity_type, r.action, r.details, r.created_at
  FROM jsonb_to_recordset(COALESCE(p_snapshot->'audit', '[]'::jsonb)) AS r(
    id UUID, entity_type TEXT, action TEXT, details JSONB, created_at TIMESTAMPTZ)
  ON CONFLICT DO NOTHING;

  -- Stock is what the ledger says it is. Every product with a ledger line takes
  -- the sum of its signed movements, so lines from every device are counted once.
  UPDATE products p SET current_stock = s.total, updated_at = NOW()
  FROM (
    SELECT product_id, SUM(delta) AS total
    FROM inventory_movements
    WHERE business_id = p_business_id AND product_id IS NOT NULL
    GROUP BY product_id
  ) s
  WHERE p.id = s.product_id AND p.business_id = p_business_id;

  RETURN jsonb_build_object('ok', TRUE, 'role', v_role, 'catalogue_written', v_manager);
END;
$$;

REVOKE ALL ON FUNCTION sync_tenant_snapshot(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_tenant_snapshot(UUID, JSONB) TO authenticated;

-- The first version of the sync function, superseded by the one above.
DROP FUNCTION IF EXISTS push_tenant_snapshot(UUID, JSONB, BOOLEAN);

-- ------------------------------------------------------- 5. owner reset
-- "Start a fresh business" on the console wipes the business's operating
-- records. Audit history is never wiped. Owner only, checked inside.
CREATE OR REPLACE FUNCTION reset_tenant_data(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF tenant_role(p_business_id) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'only the owner can reset business data' USING ERRCODE = '42501';
  END IF;
  DELETE FROM inventory_movements WHERE business_id = p_business_id;
  DELETE FROM scan_events WHERE business_id = p_business_id;
  DELETE FROM biometric_credentials WHERE business_id = p_business_id;
  DELETE FROM payments WHERE business_id = p_business_id;
  DELETE FROM sale_items WHERE business_id = p_business_id;
  DELETE FROM sales WHERE business_id = p_business_id;
  DELETE FROM transactions WHERE business_id = p_business_id;
  DELETE FROM marketing_campaigns WHERE business_id = p_business_id;
  DELETE FROM customers WHERE business_id = p_business_id;
  DELETE FROM products WHERE business_id = p_business_id;
  DELETE FROM categories WHERE business_id = p_business_id;
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION reset_tenant_data(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reset_tenant_data(UUID) TO authenticated;
