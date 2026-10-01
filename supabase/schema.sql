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
