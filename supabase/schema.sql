CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
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

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;
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

CREATE POLICY "Business members manage their businesses" ON businesses
  FOR INSERT WITH CHECK (id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

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
