CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

-- Single-use, expiring invitations into a business. The owner mints a code on
-- the Team screen; only its SHA-256 hash lives here, so reading this table
-- hands out nothing. `role` is deliberately not allowed to be 'owner' — a
-- second owner is an ownership transfer, which is a different ceremony.
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

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('product','service')),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  opening_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  current_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(12,3) NOT NULL DEFAULT 0,
  sku TEXT,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  unit TEXT,
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  sale_number TEXT,
  sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','partial','unpaid','refunded')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name IN ('cash','upi','card','bank_transfer','other')),
  account_label TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','upi','card','bank_transfer','other')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','pending','failed','reversed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  expense_type TEXT NOT NULL,
  vendor TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','upi','card','bank_transfer','other')),
  expense_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase','sale','adjustment','return','opening')),
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2),
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The stock ledger (see lib/inventory). A movement is signed and carries the
-- balance it produced, so "108 packets became 105" is checkable on any device
-- rather than being a number only the counter's own browser can explain.
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS delta NUMERIC(12,3);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS balance_after NUMERIC(12,3);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS reference_text TEXT;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS unit TEXT;
-- The id the device minted for this movement, so a re-sync updates the same
-- ledger line instead of writing a second, contradictory one.
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS movement_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_movement_key
  ON inventory_movements (business_id, movement_key) WHERE movement_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements (product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sale','payment','expense','refund','stock_adjustment','transfer','opening_balance','other')),
  subtype TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  account_type TEXT NOT NULL CHECK (account_type IN ('cash','bank','upi','card','receivables','payables','revenue','cogs','expense','inventory','equity')),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  actor_user_id UUID,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_members_business_id ON business_members (business_id);
CREATE INDEX IF NOT EXISTS idx_products_business_id ON products (business_id);
CREATE INDEX IF NOT EXISTS idx_sales_business_id ON sales (business_id);
CREATE INDEX IF NOT EXISTS idx_payments_business_id ON payments (business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_business_id ON expenses (business_id);
CREATE INDEX IF NOT EXISTS idx_transactions_business_id ON transactions (business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_business_id ON inventory_movements (business_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_id ON audit_logs (business_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_business_id ON team_invites (business_id);

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;
-- RLS enabled with *no policies on purpose*: every keyhole open, no keys.
-- Only the service-role server code in app/api/team reads or writes invites,
-- and it justifies each access itself (owner role, tenant match) first.
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business members view their businesses" ON businesses
  FOR SELECT USING (id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- The original INSERT policy below is the deadlock "Increment 10" repairs at
-- the bottom of this file: a membership cannot exist before the business it
-- points at, so demanding one here blocks first provisioning. That increment
-- drops and recreates it keyed on `owner_id`. Kept byte-identical for the
-- historical record; do not "fix" it in place.
CREATE POLICY "Business members manage their businesses" ON businesses
  FOR INSERT WITH CHECK (id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- Renames, timezone and the like: owner and manager seats may update the row
-- their business actually owns; nobody else may touch it. Increment 10 fixed
-- insertion; this covers the update path it did not (the sync client renames
-- the tenant row on every push).
CREATE POLICY "Owners and managers update their business" ON businesses
  FOR UPDATE USING (id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid() AND role IN ('owner','manager')))
  WITH CHECK (id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid() AND role IN ('owner','manager')));

CREATE POLICY "User can manage own business membership records" ON business_members
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Business members view tenant records" ON customers
  FOR SELECT USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members insert tenant records" ON customers
  FOR INSERT WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members update tenant records" ON customers
  FOR UPDATE USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members delete tenant records" ON customers
  FOR DELETE USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members view suppliers" ON suppliers
  FOR SELECT USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage suppliers" ON suppliers
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage categories" ON categories
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage products" ON products
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage sales" ON sales
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage sale items" ON sale_items
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage payment methods" ON payment_methods
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage payments" ON payments
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage expenses" ON expenses
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage inventory movements" ON inventory_movements
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage transactions" ON transactions
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members view audit logs" ON audit_logs
  FOR SELECT USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- Every new business automatically seats its creator as owner. This is what
-- makes "who is using the app" true from the very first record: no business
-- can exist without an accountable owner, and the client never has to
-- remember to enrol itself.
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

-- ---------------------------------------------------------------------------
-- Universal business, billing, membership, and AI insight models
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  receipt_mode TEXT NOT NULL DEFAULT 'both' CHECK (receipt_mode IN ('digital','physical','both')),
  send_sms_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  send_whatsapp_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  auto_generate_invoice_number BOOLEAN NOT NULL DEFAULT TRUE,
  tax_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  allow_memberships BOOLEAN NOT NULL DEFAULT TRUE,
  allow_inventory BOOLEAN NOT NULL DEFAULT TRUE,
  allow_appointments BOOLEAN NOT NULL DEFAULT FALSE,
  allow_digital_receipts BOOLEAN NOT NULL DEFAULT TRUE,
  allow_physical_receipts BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_number TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash','UPI','Card','Bank Transfer','Other')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('paid','pending','partial','failed')),
  receipt_mode TEXT NOT NULL DEFAULT 'both' CHECK (receipt_mode IN ('digital','physical','both')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash','UPI','Card','Bank Transfer','Other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid','pending','partial','failed')),
  gateway TEXT NOT NULL DEFAULT 'Manual' CHECK (gateway IN ('Razorpay','UPI','Cash','Manual')),
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('monthly','quarterly','half_yearly','annual')),
  duration_months INTEGER NOT NULL DEFAULT 1,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  preferred_channel TEXT NOT NULL DEFAULT 'both' CHECK (preferred_channel IN ('sms','whatsapp','both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS membership_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES membership_plans(id) ON DELETE RESTRICT,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expiry_date TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expiring_soon','expired','paused')),
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminder_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'both' CHECK (channel IN ('sms','whatsapp','both')),
  message TEXT NOT NULL,
  days_before_expiry INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('trend','warning','opportunity','growth')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  metric NUMERIC(14,2) NOT NULL DEFAULT 0,
  metric_label TEXT,
  actionable BOOLEAN NOT NULL DEFAULT FALSE,
  action TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('membership','revenue','customers','inventory','growth')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  implementation TEXT,
  expected_impact TEXT,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  estimated_time TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_business_id ON invoices (business_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_business_id ON payment_records (business_id);
CREATE INDEX IF NOT EXISTS idx_membership_plans_business_id ON membership_plans (business_id);
CREATE INDEX IF NOT EXISTS idx_members_business_id ON members (business_id);
CREATE INDEX IF NOT EXISTS idx_membership_subscriptions_business_id ON membership_subscriptions (business_id);
CREATE INDEX IF NOT EXISTS idx_membership_subscriptions_expiry ON membership_subscriptions (business_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_reminder_templates_business_id ON reminder_templates (business_id);
CREATE INDEX IF NOT EXISTS idx_insights_business_id ON insights (business_id);
CREATE INDEX IF NOT EXISTS idx_ai_tips_business_id ON ai_tips (business_id);

ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business members manage business settings" ON business_settings
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage invoices" ON invoices
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage invoice items" ON invoice_items
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage payment records" ON payment_records
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage membership plans" ON membership_plans
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage members" ON members
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage membership subscriptions" ON membership_subscriptions
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage reminder templates" ON reminder_templates
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage insights" ON insights
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage AI tips" ON ai_tips
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- ============================================================================
-- Increment 7: marketing activity tracking (campaigns + spend)
-- Spend recorded here should also be mirrored in expenses when money is spent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('Social Media','Google Ads','Print','Radio','Events','Referrals','Other')),
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_business_id ON marketing_campaigns (business_id);

ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business members manage marketing campaigns" ON marketing_campaigns
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- ============================================================================
-- Increment 8: scanning & capture (barcodes at the counter, fingers at the desk)
--
-- Two records live here. `scan_events` is the log of what a counter actually
-- read — including the reads that matched nothing, which is the queue of items
-- still waiting for a code. `biometric_credentials` stores the *credential id*
-- a platform authenticator returns and nothing else: no fingerprint image, no
-- template, no biometric hash exists in this schema, because the WebAuthn API
-- never exposes one (see lib/scanning/fingerprint.ts). Deleting the row is the
-- whole of "forget this finger".
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS internal_code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS loose_mode TEXT CHECK (loose_mode IN ('none','weight','price'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS scale_number INTEGER;

-- One code, one item — per shop. A duplicate here would make a scan ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique
  ON products (business_id, UPPER(barcode)) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_internal_code_unique
  ON products (business_id, UPPER(internal_code)) WHERE internal_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS scan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  symbology TEXT,
  source TEXT NOT NULL CHECK (source IN ('wedge','camera','manual','import')),
  context TEXT NOT NULL CHECK (context IN ('counter','inward','catalog','label','link')),
  outcome TEXT NOT NULL CHECK (outcome IN ('matched','ambiguous','unmatched','invalid')),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  quantity NUMERIC(12,3),
  scanned_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS biometric_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- The authenticator's credential id (base64url). Not a biometric template:
  -- the sensor keeps the finger, this row only remembers which member it was.
  credential_id TEXT NOT NULL,
  attachment TEXT NOT NULL DEFAULT 'platform' CHECK (attachment IN ('platform')),
  label TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, credential_id)
);

CREATE INDEX IF NOT EXISTS idx_scan_events_business_id ON scan_events (business_id);
CREATE INDEX IF NOT EXISTS idx_scan_events_code ON scan_events (business_id, code);
CREATE INDEX IF NOT EXISTS idx_biometric_credentials_business_id ON biometric_credentials (business_id);
CREATE INDEX IF NOT EXISTS idx_biometric_credentials_member_id ON biometric_credentials (member_id);

ALTER TABLE scan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business members manage scan events" ON scan_events
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Business members manage biometric credentials" ON biometric_credentials
  FOR ALL USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- ============================================================================
-- Increment 9 — what the business pays DukaanOS
--
-- The plan layer is enforced at the edge from a signed cookie, and this is the
-- record that cookie is derived from: one row per business saying which plan it
-- is on, when that period ends, how it was granted, and which payment it came
-- from. Two properties matter, and both are deliberate:
--
--   * The state is a *derived* value, never a flag anyone sets. The console and
--     middleware recompute it from the dates below against the current time, so
--     a stale row can never extend a plan.
--   * A business may *read* its own plan and *request* a payment, and nothing
--     more. Marking a request paid — which is what grants a plan — is not
--     available to the browser at all: RLS gives members select + insert on
--     requests only, so activation happens through the service role (the
--     operator minting an activation code, or a payment webhook), never from a
--     client that could be edited in devtools.
--
-- `platform_payments` is the receipt book: one row per rupee the platform was
-- paid, kept separate from the business's own `payments`, because mixing our
-- revenue into a tenant's ledger would corrupt both.
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('trial','starter','growth','scale')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL renews_at means "no period" (the free plan, or an unused trial).
  renews_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  trial_used_at TIMESTAMPTZ,
  price_locked_until TIMESTAMPTZ,
  activated_by TEXT NOT NULL DEFAULT 'self' CHECK (activated_by IN ('self','activation-code','provider')),
  -- The payment this plan came from (UPI txn id, bank UTR, receipt number).
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One live plan per business: a second row would be a second truth.
  UNIQUE (business_id)
);

CREATE TABLE IF NOT EXISTS platform_payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('growth','scale')),
  interval TEXT NOT NULL CHECK (interval IN ('month','quarter','year')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  -- Quoted by the owner in the UPI note; unique so one payment maps to one plan.
  reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','paid','cancelled')),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  UNIQUE (reference)
);

CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_business_id ON platform_subscriptions (business_id);
CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_renews_at ON platform_subscriptions (renews_at);
CREATE INDEX IF NOT EXISTS idx_platform_payment_requests_business_id ON platform_payment_requests (business_id);
CREATE INDEX IF NOT EXISTS idx_platform_payment_requests_status ON platform_payment_requests (status);

ALTER TABLE platform_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_payment_requests ENABLE ROW LEVEL SECURITY;

-- Read your own plan. Never write it: the cookie is issued from this row by the
-- server, not by the browser.
CREATE POLICY "Business members read their own plan" ON platform_subscriptions
  FOR SELECT USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- Request a payment: insert only, and only as 'requested'. A member cannot mark
-- their own request paid, cannot change the amount, and cannot delete the record
-- of what they asked for.
CREATE POLICY "Business members request a plan payment" ON platform_payment_requests
  FOR INSERT WITH CHECK (
    status = 'requested'
    AND settled_at IS NULL
    AND business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Business members read their payment requests" ON platform_payment_requests
  FOR SELECT USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Increment 10 — the remembered owner profile
-- ---------------------------------------------------------------------------
--
-- Until now everything an owner typed during setup lived only in the encrypted
-- vault of the browser that typed it. The console could therefore say "Welcome
-- back" — the session cookie knows who signed in — and then ask that person for
-- their own name, phone, business name, trade and UPI id, because none of it had
-- ever left the first device. This table is the copy that outlives a device.
--
-- One row per business, keyed to the owner who set it up. What it holds is the
-- profile and the collection details a QR is built from. What it never holds is
-- a UPI PIN, an OTP, a card number or a password — the app does not collect
-- those, so there is nothing here for a leaked row to give away beyond the
-- business's own contact and bank display details.

-- Provisioning a tenant used to be impossible under RLS. The old insert policy
-- on `businesses` required a membership row for the new business to already
-- exist, and a membership row cannot exist before the business it points at —
-- so a brand-new owner's first sync failed with a policy violation and the app
-- reported "new row violates row-level security". Owning the row you are
-- inserting is the check that breaks the deadlock, and it grants no more than
-- the membership insert beside it already did.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses (owner_id);

DROP POLICY IF EXISTS "Business members manage their businesses" ON businesses;
CREATE POLICY "Business members manage their businesses" ON businesses
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    OR id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid())
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

CREATE INDEX IF NOT EXISTS idx_owner_profiles_business_id ON owner_profiles (business_id);
CREATE INDEX IF NOT EXISTS idx_owner_profiles_user_id ON owner_profiles (user_id);

ALTER TABLE owner_profiles ENABLE ROW LEVEL SECURITY;

-- Postgres has no `CREATE POLICY IF NOT EXISTS`, and this increment is the one
-- an owner is most likely to paste into the SQL editor twice — once when they
-- set up, again when they are told to "just re-run the bottom of the file". A
-- second run that dies halfway leaves the table live and its policies half
-- applied, which is worse than either outcome on its own. So each policy is
-- dropped first, and this whole increment can be run as many times as needed.

-- Every member can read the profile: the desk needs the business name on a
-- receipt and the UPI id on a collection panel, and a staff member who could
-- not see them would have to ask the owner at every sale.
DROP POLICY IF EXISTS "Business members view the owner profile" ON owner_profiles;
CREATE POLICY "Business members view the owner profile" ON owner_profiles
  FOR SELECT USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- Writing is the same shape as reshaping the console: it reroutes where the
-- shop's money lands, so it is the owner and the manager, and nobody else.
DROP POLICY IF EXISTS "Owners and managers save the owner profile" ON owner_profiles;
CREATE POLICY "Owners and managers save the owner profile" ON owner_profiles
  FOR INSERT WITH CHECK (
    business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid() AND role IN ('owner','manager'))
  );

DROP POLICY IF EXISTS "Owners and managers update the owner profile" ON owner_profiles;
CREATE POLICY "Owners and managers update the owner profile" ON owner_profiles
  FOR UPDATE USING (
    business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid() AND role IN ('owner','manager'))
  );


-- ============================================================================
-- Increment 11 (October 2026): membership authorization, atomic sync, sale items.
-- Mirrors supabase/migrations/20261019000000_recovery_authorization_and_atomic_sync.sql.
-- ============================================================================
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

-- Increment 12: complete operating-record recovery
-- Versioned, complete operating records. Existing relational history is preserved.
-- All changes for one business serialize on its business row; a reset advances
-- its generation so offline snapshots cannot resurrect deleted records.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS operating_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS sync_generation BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS operating_records (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('products','transactions','customers','plans','members','subscriptions','reminderTemplates','invoices','paymentRecords','checkIns','scanEvents','biometricCredentials','appointments','stockMovements','audit','campaigns','settings')),
  record_id TEXT NOT NULL CHECK (length(record_id) BETWEEN 1 AND 160),
  data JSONB NOT NULL CHECK (jsonb_typeof(data)='object'),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_id,kind,record_id)
);
ALTER TABLE operating_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read operating records" ON operating_records FOR SELECT TO authenticated
  USING (tenant_role(business_id) IS NOT NULL);
GRANT SELECT ON operating_records TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON operating_records FROM anon, authenticated;

-- Existing data enters the new store under the same stable UUIDs the old adapter used.
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT p.business_id,'products',p.id::text,jsonb_build_object('id',p.id::text,'name',p.name,'category',COALESCE(c.name,p.description,'General'),'itemType',p.item_type,'sellingPrice',p.selling_price,'cost',p.cost_price,'stock',0,'reorderLevel',p.reorder_level,'status',CASE WHEN p.active THEN 'Active' ELSE 'Inactive' END,'taxRate',p.tax_rate,'description',p.description,'sku',p.sku,'unit',p.unit,'barcode',p.barcode,'internalCode',p.internal_code,'looseMode',p.loose_mode,'scaleNumber',p.scale_number)
FROM products p LEFT JOIN categories c ON c.id=p.category_id AND c.business_id=p.business_id
ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'transactions',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'type',type,'description',notes,'amount',amount,'direction',direction,'account',account_type,'paymentMethod',subtype,'date',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD'),'items',items)) FROM transactions ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'customers',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'name',name,'phone',phone,'email',email,'details',notes,'openingBalance',opening_balance,'bank',bank_details,'createdAt',created_at)) FROM customers ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT m.business_id,'stockMovements',m.id::text,jsonb_strip_nulls(jsonb_build_object('id',m.id::text,'productId',m.product_id::text,'productName',p.name,'at',m.created_at,'reason',CASE m.movement_type WHEN 'purchase' THEN 'goods-inward' WHEN 'adjustment' THEN 'count' ELSE m.movement_type END,'delta',m.delta,'balance',m.balance_after,'note',COALESCE(m.notes,''),'reference',m.reference_text,'unit',m.unit)) FROM inventory_movements m JOIN products p ON p.id=m.product_id AND p.business_id=m.business_id ON CONFLICT DO NOTHING;
-- Legacy items without any movement still need a recoverable opening count.
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT p.business_id,'stockMovements','legacy-opening-'||p.id,jsonb_build_object('id','legacy-opening-'||p.id,'productId',p.id::text,'productName',p.name,'at',NOW(),'reason','opening','delta',p.current_stock,'balance',p.current_stock,'note','Opening stock migrated from the previous cloud store')
FROM products p WHERE p.item_type='product' AND p.current_stock<>0 AND NOT EXISTS(SELECT 1 FROM inventory_movements m WHERE m.business_id=p.business_id AND m.product_id=p.id) ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'campaigns',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'name',name,'channel',channel,'spend',spend,'notes',notes,'startDate',start_date)) FROM marketing_campaigns ON CONFLICT DO NOTHING;

-- Backfill older invoice and membership tables if they were populated directly.
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT i.business_id,'invoices',i.id::text,jsonb_strip_nulls(jsonb_build_object('id',i.id::text,'businessId',i.business_id,'customerId',i.customer_id,'customerName',i.customer_name,'customerPhone',i.customer_phone,'createdAt',i.created_at,'dueDate',i.due_date,'paymentMethod',i.payment_method,'paymentStatus',i.payment_status,'receiptMode',i.receipt_mode,'subtotal',i.subtotal,'tax',i.tax,'totalAmount',i.total_amount,'notes',i.notes,'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',it.id,'name',it.name,'category',COALESCE(it.category,'General'),'quantity',it.quantity,'unitPrice',it.unit_price,'total',it.total)) FROM invoice_items it WHERE it.business_id=i.business_id AND it.invoice_id=i.id),'[]'::jsonb))) FROM invoices i ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'paymentRecords',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'businessId',business_id,'invoiceId',invoice_id,'customerName',customer_name,'amount',amount,'paymentMethod',payment_method,'status',status,'gateway',gateway,'paymentDate',payment_date)) FROM payment_records ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'plans',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'businessId',business_id,'name',name,'type',type,'durationMonths',duration_months,'price',price,'description',description,'isActive',is_active)) FROM membership_plans ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'members',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'businessId',business_id,'name',name,'phone',COALESCE(phone,''),'email',email,'preferredChannel',preferred_channel,'createdAt',created_at)) FROM members ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'subscriptions',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'businessId',business_id,'memberId',member_id,'planId',plan_id,'startDate',start_date,'expiryDate',expiry_date,'autoRenew',auto_renew,'status',status,'reminderSentAt',reminder_sent_at,'createdAt',created_at)) FROM membership_subscriptions ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'reminderTemplates',id::text,jsonb_build_object('id',id::text,'businessId',business_id,'name',name,'channel',channel,'message',message,'daysBeforeExpiry',days_before_expiry,'isActive',is_active) FROM reminder_templates ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'scanEvents',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'code',code,'symbology',symbology,'source',source,'context',context,'outcome',outcome,'productId',product_id,'productName',product_name,'quantity',quantity,'by',scanned_by,'at',created_at)) FROM scan_events ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT b.business_id,'biometricCredentials',b.id::text,jsonb_strip_nulls(jsonb_build_object('id',b.id::text,'memberId',b.member_id,'memberName',m.name,'credentialId',b.credential_id,'attachment',b.attachment,'label',COALESCE(b.label,'This device'),'useCount',b.use_count,'lastUsedAt',b.last_used_at,'createdAt',b.created_at)) FROM biometric_credentials b JOIN members m ON m.business_id=b.business_id AND m.id=b.member_id ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'audit',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'type',entity_type,'actor',COALESCE(details->>'actor','Recorded user'),'summary',COALESCE(details->>'summary',action),'reference',details->>'reference','createdAt',created_at)) FROM audit_logs ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'settings','settings',jsonb_build_object('id',id,'businessId',business_id,'receiptMode',receipt_mode,'sendSmsReminders',send_sms_reminders,'sendWhatsappReminders',send_whatsapp_reminders,'autoGenerateInvoiceNumber',auto_generate_invoice_number,'taxRate',tax_rate,'allowMemberships',allow_memberships,'allowInventory',allow_inventory,'allowAppointments',allow_appointments,'allowDigitalReceipts',allow_digital_receipts,'allowPhysicalReceipts',allow_physical_receipts,'activeRole','owner','createdAt',created_at,'updatedAt',updated_at) FROM business_settings ON CONFLICT DO NOTHING;

-- Resolve ownership from the provider, never from a browser business id.
CREATE OR REPLACE FUNCTION operating_business() RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  SELECT business_id INTO b FROM business_members WHERE user_id=auth.uid() ORDER BY created_at,business_id LIMIT 1;
  IF b IS NULL THEN
    b:=gen_random_uuid();
    INSERT INTO businesses(id,name,owner_id,currency) VALUES(b,'My Business',auth.uid(),'INR');
  END IF;
  RETURN b;
END $$;
REVOKE ALL ON FUNCTION operating_business() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION operating_business() TO authenticated;

CREATE OR REPLACE FUNCTION read_operating_snapshot() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b UUID:=operating_business(); g BIGINT;
BEGIN
  SELECT sync_generation INTO g FROM businesses WHERE id=b FOR SHARE;
  IF tenant_role(b) IS NULL THEN RAISE EXCEPTION 'membership required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('businessId',b,'generation',g,'records',COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',kind,'id',record_id,'data',data,'revision',revision) ORDER BY kind,record_id) FROM operating_records WHERE business_id=b),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION read_operating_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION read_operating_snapshot() TO authenticated;

CREATE OR REPLACE FUNCTION sync_operating_records(p_generation BIGINT,p_changes JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b UUID:=operating_business(); g BIGINT; role_name TEXT; item JSONB; previous operating_records%ROWTYPE; k TEXT; ident TEXT; value JSONB; expected BIGINT;
BEGIN
  SELECT sync_generation INTO g FROM businesses WHERE id=b FOR UPDATE;
  role_name:=tenant_role(b);
  IF role_name NOT IN ('owner','manager','staff') OR role_name IS NULL THEN RAISE EXCEPTION 'write permission required' USING ERRCODE='42501'; END IF;
  IF g<>p_generation THEN RAISE EXCEPTION 'stale business generation' USING ERRCODE='40001'; END IF;
  IF jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes)>100000 THEN RAISE EXCEPTION 'invalid changes'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    k:=item->>'kind';ident:=item->>'id';value:=item->'data';expected:=(item->>'revision')::bigint;
    IF k NOT IN ('products','transactions','customers','plans','members','subscriptions','reminderTemplates','invoices','paymentRecords','checkIns','scanEvents','biometricCredentials','appointments','stockMovements','audit','campaigns','settings') OR ident IS NULL OR length(ident) NOT BETWEEN 1 AND 160 OR jsonb_typeof(value)<>'object' OR expected IS NULL OR expected<0 THEN RAISE EXCEPTION 'invalid record'; END IF;
    IF k<>'settings' AND value->>'id' IS DISTINCT FROM ident THEN RAISE EXCEPTION 'record id mismatch'; END IF;
    IF k='settings' AND ident<>'settings' THEN RAISE EXCEPTION 'invalid settings key'; END IF;
    IF role_name='staff' AND k IN ('products','plans','reminderTemplates','campaigns','settings') THEN RAISE EXCEPTION 'manager permission required' USING ERRCODE='42501'; END IF;
    IF k='transactions' AND (jsonb_typeof(value->'amount') IS DISTINCT FROM 'number' OR (value->>'amount')::numeric<0 OR abs((value->>'amount')::numeric)>90000000000 OR value->>'direction' NOT IN ('in','out') OR value->>'type' NOT IN ('sale','expense','payment','stock_adjustment','refund','transfer') OR value->>'account' NOT IN ('cash','bank','upi','card','receivables','payables','revenue','expense','inventory','tax')) THEN RAISE EXCEPTION 'invalid transaction'; END IF;
    IF k='stockMovements' AND (jsonb_typeof(value->'delta') IS DISTINCT FROM 'number' OR value->>'productId' IS NULL) THEN RAISE EXCEPTION 'invalid stock movement'; END IF;
    IF k='paymentRecords' AND (jsonb_typeof(value->'amount') IS DISTINCT FROM 'number' OR (value->>'amount')::numeric<=0) THEN RAISE EXCEPTION 'invalid payment'; END IF;
    SELECT * INTO previous FROM operating_records WHERE business_id=b AND kind=k AND record_id=ident;
    IF FOUND THEN
      IF previous.data=value THEN CONTINUE; END IF;
      IF k IN ('transactions','stockMovements','paymentRecords','scanEvents','audit') THEN RAISE EXCEPTION 'ledger is append only' USING ERRCODE='40001'; END IF;
      IF previous.revision<>expected THEN RAISE EXCEPTION 'concurrent edit' USING ERRCODE='40001'; END IF;
      UPDATE operating_records SET data=value,revision=revision+1,updated_at=NOW() WHERE business_id=b AND kind=k AND record_id=ident;
    ELSE
      IF expected<>0 THEN RAISE EXCEPTION 'missing prior revision' USING ERRCODE='40001'; END IF;
      INSERT INTO operating_records(business_id,kind,record_id,data,created_by) VALUES(b,k,ident,value,auth.uid());
    END IF;
  END LOOP;
  -- All referenced products must belong to this same tenant's record set.
  IF EXISTS(SELECT 1 FROM operating_records m WHERE m.business_id=b AND m.kind='stockMovements' AND NOT EXISTS(SELECT 1 FROM operating_records p WHERE p.business_id=b AND p.kind='products' AND p.record_id=m.data->>'productId')) THEN RAISE EXCEPTION 'unknown stock item'; END IF;
  -- Serialize competing sales against the combined stock ledger, including
  -- movements uploaded by another device since this device last pulled.
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_changes) x
    WHERE x->>'kind'='stockMovements' AND x->'data'->>'reason'='sale'
    AND (x->'data'->>'delta')::numeric<0
    AND (SELECT COALESCE(SUM((m.data->>'delta')::numeric),0) FROM operating_records m
      WHERE m.business_id=b AND m.kind='stockMovements'
      AND m.data->>'productId'=x->'data'->>'productId')<-0.0005
  ) THEN RAISE EXCEPTION 'sale exceeds available stock' USING ERRCODE='40001'; END IF;
  -- Concurrent collections may not overdraw a customer's account.
  IF EXISTS(
    SELECT 1 FROM operating_records c WHERE c.business_id=b AND c.kind='customers'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_changes) x WHERE x->>'kind'='transactions' AND x->'data'->>'customerId'=c.record_id AND x->'data'->>'account'='receivables' AND x->'data'->>'direction'='out')
    AND COALESCE((c.data->>'openingBalance')::numeric,0)+COALESCE((SELECT SUM(CASE WHEN t.data->>'direction'='in' THEN 1 ELSE -1 END*(t.data->>'amount')::numeric) FROM operating_records t WHERE t.business_id=b AND t.kind='transactions' AND t.data->>'account'='receivables' AND t.data->>'customerId'=c.record_id),0)<-0.005
  ) THEN RAISE EXCEPTION 'customer collection exceeds dues' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM operating_records i WHERE i.business_id=b AND i.kind='invoices' AND (SELECT COALESCE(SUM((p.data->>'amount')::numeric),0) FROM operating_records p WHERE p.business_id=b AND p.kind='paymentRecords' AND p.data->>'invoiceId'=i.record_id AND p.data->>'status' IN ('paid','partial'))>(i.data->>'totalAmount')::numeric+0.005) THEN RAISE EXCEPTION 'invoice overpaid' USING ERRCODE='40001'; END IF;
  UPDATE businesses SET operating_sync_enabled=TRUE WHERE id=b;
  RETURN read_operating_snapshot();
END $$;
REVOKE ALL ON FUNCTION sync_operating_records(BIGINT,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION sync_operating_records(BIGINT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION reset_operating_records(p_generation BIGINT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b UUID:=operating_business(); g BIGINT;
BEGIN
 SELECT sync_generation INTO g FROM businesses WHERE id=b FOR UPDATE;
 IF tenant_role(b) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'owner required' USING ERRCODE='42501'; END IF;
 IF p_generation<>g THEN RAISE EXCEPTION 'stale reset' USING ERRCODE='40001'; END IF;
 DELETE FROM operating_records WHERE business_id=b AND kind<>'audit';
 DELETE FROM payment_records WHERE business_id=b;
 DELETE FROM invoice_items WHERE business_id=b;
 DELETE FROM invoices WHERE business_id=b;
 DELETE FROM membership_subscriptions WHERE business_id=b;
 DELETE FROM biometric_credentials WHERE business_id=b;
 DELETE FROM members WHERE business_id=b;
 DELETE FROM membership_plans WHERE business_id=b;
 DELETE FROM reminder_templates WHERE business_id=b;
 DELETE FROM expenses WHERE business_id=b;
 PERFORM reset_tenant_data(b);
 UPDATE businesses SET sync_generation=g+1 WHERE id=b;
 RETURN read_operating_snapshot();
END $$;
REVOKE ALL ON FUNCTION reset_operating_records(BIGINT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION reset_operating_records(BIGINT) TO authenticated;

-- Consume the invitation and insert the member under the same row lock/transaction.
CREATE OR REPLACE FUNCTION redeem_team_invite(p_hash TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE invite team_invites%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO invite FROM team_invites WHERE code_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR invite.used_at IS NOT NULL OR invite.revoked_at IS NOT NULL OR invite.expires_at<=NOW() THEN RAISE EXCEPTION 'invalid invitation'; END IF;
 IF EXISTS(SELECT 1 FROM business_members WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'account already belongs to a business'; END IF;
 INSERT INTO business_members(business_id,user_id,role) VALUES(invite.business_id,auth.uid(),invite.role);
 UPDATE team_invites SET used_at=NOW(),used_by=auth.uid() WHERE id=invite.id;
 INSERT INTO audit_logs(business_id,actor_user_id,entity_type,action,details) VALUES(invite.business_id,auth.uid(),'team','team.member.joined',jsonb_build_object('role',invite.role));
 RETURN jsonb_build_object('businessId',invite.business_id,'role',invite.role,'businessName',(SELECT name FROM businesses WHERE id=invite.business_id));
END $$;
REVOKE ALL ON FUNCTION redeem_team_invite(TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION redeem_team_invite(TEXT) TO authenticated;

-- Once a business upgrades, old snapshot APIs must not keep writing a parallel ledger.

ALTER FUNCTION sync_tenant_snapshot(UUID,JSONB) RENAME TO legacy_sync_tenant_snapshot;
REVOKE ALL ON FUNCTION legacy_sync_tenant_snapshot(UUID,JSONB) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION sync_tenant_snapshot(p_business_id UUID,p_snapshot JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF tenant_role(p_business_id) IS NULL THEN RAISE EXCEPTION 'membership required' USING ERRCODE='42501'; END IF;
 IF (SELECT operating_sync_enabled FROM businesses WHERE id=p_business_id) THEN RAISE EXCEPTION 'refresh the app before syncing' USING ERRCODE='40001'; END IF;
 RETURN legacy_sync_tenant_snapshot(p_business_id,p_snapshot);
END $$;
REVOKE ALL ON FUNCTION sync_tenant_snapshot(UUID,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION sync_tenant_snapshot(UUID,JSONB) TO authenticated;
