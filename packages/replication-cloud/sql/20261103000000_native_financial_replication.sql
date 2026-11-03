-- Phase 2 native financial replication.
-- REVIEW ONLY. Do not apply to production automatically.
-- Isolated from hosted sync_operating_records.
-- Paise and milli quantities are BIGINT. Bounds match native MAX_VALUE: 9_000_000_000_000.
-- Incomplete retail allocations are stored as allocation_status = 'pending' and
-- are never visible through companion snapshot views.

CREATE SCHEMA IF NOT EXISTS native_replication;

DO $$ BEGIN CREATE ROLE sornio_publisher NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE sornio_owner NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE sornio_manager NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE sornio_cashier NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE sornio_auditor NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE native_replication.businesses (
  business_id TEXT PRIMARY KEY CHECK (business_id ~ '^[A-Za-z0-9_-]{8,80}$'),
  business_name TEXT NOT NULL CHECK (char_length(business_name) BETWEEN 1 AND 120),
  portal_id TEXT NOT NULL CHECK (portal_id IN ('gym','cafe','kirana','salon','electronics','boutique','service','general')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE native_replication.devices (
  device_id TEXT PRIMARY KEY CHECK (device_id ~ '^[A-Za-z0-9_-]{8,80}$'),
  business_id TEXT NOT NULL REFERENCES native_replication.businesses(business_id),
  role TEXT NOT NULL CHECK (role IN ('publisher','owner','manager','cashier','auditor')),
  restore_generation TEXT NOT NULL CHECK (restore_generation ~ '^[A-Za-z0-9_-]{1,128}$'),
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX devices_one_publisher
  ON native_replication.devices (business_id)
  WHERE role = 'publisher' AND revoked = FALSE;

CREATE TABLE native_replication.events (
  event_pk BIGSERIAL PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES native_replication.businesses(business_id),
  device_id TEXT NOT NULL REFERENCES native_replication.devices(device_id),
  restore_generation TEXT NOT NULL,
  stream TEXT NOT NULL CHECK (stream IN ('billing','customer','retail','inventory')),
  stream_sequence BIGINT NOT NULL CHECK (stream_sequence > 0),
  operation_id TEXT NOT NULL CHECK (operation_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  occurred_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, restore_generation, stream, operation_id),
  UNIQUE (business_id, restore_generation, stream, stream_sequence)
);

CREATE TABLE native_replication.stream_heads (
  business_id TEXT NOT NULL REFERENCES native_replication.businesses(business_id),
  restore_generation TEXT NOT NULL,
  stream TEXT NOT NULL CHECK (stream IN ('billing','customer','retail','inventory')),
  last_sequence BIGINT NOT NULL CHECK (last_sequence >= 0),
  PRIMARY KEY (business_id, restore_generation, stream)
);

CREATE TABLE native_replication.projection_cursor (
  business_id TEXT PRIMARY KEY REFERENCES native_replication.businesses(business_id),
  restore_generation TEXT NOT NULL,
  cursor TEXT NOT NULL CHECK (cursor ~ '^(0|[1-9][0-9]{0,38})$'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE native_replication.invoices (
  business_id TEXT NOT NULL REFERENCES native_replication.businesses(business_id),
  invoice_id TEXT NOT NULL,
  billing_operation_id TEXT NOT NULL,
  retail_operation_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  counterparty TEXT NOT NULL,
  customer_id TEXT,
  tender TEXT NOT NULL CHECK (tender IN ('cash','credit','retail')),
  total_paise BIGINT NOT NULL CHECK (total_paise BETWEEN 0 AND 9000000000000),
  cash_paise BIGINT NOT NULL CHECK (cash_paise BETWEEN 0 AND 9000000000000),
  digital_paise BIGINT NOT NULL CHECK (digital_paise BETWEEN 0 AND 9000000000000),
  customer_credit_paise BIGINT NOT NULL CHECK (customer_credit_paise BETWEEN 0 AND 9000000000000),
  allocation_status TEXT NOT NULL CHECK (allocation_status IN ('pending','posted')),
  PRIMARY KEY (business_id, invoice_id),
  CHECK (
    allocation_status = 'pending'
    OR (cash_paise + digital_paise + customer_credit_paise = total_paise)
  ),
  CHECK (allocation_status = 'pending' OR retail_operation_id IS NOT NULL OR tender <> 'retail')
);

CREATE TABLE native_replication.pending_retail (
  business_id TEXT NOT NULL REFERENCES native_replication.businesses(business_id),
  invoice_id TEXT NOT NULL,
  retail_operation_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (business_id, invoice_id)
);

CREATE TABLE native_replication.inventory (
  business_id TEXT NOT NULL REFERENCES native_replication.businesses(business_id),
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity_milli BIGINT NOT NULL CHECK (quantity_milli BETWEEN 0 AND 9000000000000),
  reorder_milli BIGINT NOT NULL CHECK (reorder_milli BETWEEN 0 AND 9000000000000),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (business_id, product_id)
);

CREATE TABLE native_replication.customers (
  business_id TEXT NOT NULL REFERENCES native_replication.businesses(business_id),
  customer_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  outstanding_paise BIGINT NOT NULL CHECK (outstanding_paise BETWEEN -9000000000000 AND 9000000000000),
  credit_limit_paise BIGINT CHECK (credit_limit_paise BETWEEN 0 AND 9000000000000),
  last_activity_at TIMESTAMPTZ,
  PRIMARY KEY (business_id, customer_id)
);

CREATE TABLE native_replication.customer_statements (
  business_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  line_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  narrative TEXT NOT NULL,
  amount_paise BIGINT NOT NULL CHECK (amount_paise BETWEEN 0 AND 9000000000000),
  direction TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  PRIMARY KEY (business_id, customer_id, line_id),
  FOREIGN KEY (business_id, customer_id) REFERENCES native_replication.customers(business_id, customer_id)
);

CREATE TABLE native_replication.acks (
  business_id TEXT NOT NULL REFERENCES native_replication.businesses(business_id),
  restore_generation TEXT NOT NULL,
  stream TEXT NOT NULL CHECK (stream IN ('billing','customer','retail','inventory')),
  operation_id TEXT NOT NULL,
  cursor TEXT NOT NULL,
  PRIMARY KEY (business_id, restore_generation, stream, operation_id)
);

CREATE OR REPLACE FUNCTION native_replication.jwt_claim(key TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true), '')::json ->> key
$$;

CREATE VIEW native_replication.posted_invoices
  WITH (security_invoker = true) AS
  SELECT * FROM native_replication.invoices WHERE allocation_status = 'posted';

ALTER TABLE native_replication.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_replication.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_replication.pending_retail ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_replication.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_replication.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_replication.projection_cursor ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_replication.acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_replication.customer_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_replication.events FORCE ROW LEVEL SECURITY;
ALTER TABLE native_replication.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE native_replication.pending_retail FORCE ROW LEVEL SECURITY;
ALTER TABLE native_replication.inventory FORCE ROW LEVEL SECURITY;
ALTER TABLE native_replication.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE native_replication.projection_cursor FORCE ROW LEVEL SECURITY;
ALTER TABLE native_replication.customer_statements FORCE ROW LEVEL SECURITY;

CREATE POLICY events_publisher_insert ON native_replication.events
  FOR INSERT TO sornio_publisher
  WITH CHECK (
    business_id = native_replication.jwt_claim('business_id')
    AND native_replication.jwt_claim('role') = 'publisher'
  );

CREATE POLICY invoices_readers ON native_replication.invoices
  FOR SELECT TO sornio_owner, sornio_manager, sornio_cashier, sornio_auditor
  USING (
    business_id = native_replication.jwt_claim('business_id')
    AND allocation_status = 'posted'
  );

CREATE POLICY inventory_readers ON native_replication.inventory
  FOR SELECT TO sornio_owner, sornio_manager, sornio_cashier, sornio_auditor
  USING (business_id = native_replication.jwt_claim('business_id'));

CREATE POLICY customers_restricted ON native_replication.customers
  FOR SELECT TO sornio_owner, sornio_manager, sornio_auditor
  USING (business_id = native_replication.jwt_claim('business_id'));

CREATE POLICY cursor_readers ON native_replication.projection_cursor
  FOR SELECT TO sornio_owner, sornio_manager, sornio_cashier, sornio_auditor
  USING (business_id = native_replication.jwt_claim('business_id'));

CREATE POLICY statements_restricted ON native_replication.customer_statements
  FOR SELECT TO sornio_owner, sornio_manager, sornio_auditor
  USING (business_id = native_replication.jwt_claim('business_id'));

CREATE POLICY pending_retail_hidden ON native_replication.pending_retail
  FOR SELECT TO sornio_owner, sornio_auditor
  USING (business_id = native_replication.jwt_claim('business_id'));

REVOKE ALL ON SCHEMA native_replication FROM PUBLIC;
GRANT USAGE ON SCHEMA native_replication TO sornio_publisher, sornio_owner, sornio_manager, sornio_cashier, sornio_auditor;
GRANT INSERT ON native_replication.events TO sornio_publisher;
GRANT SELECT ON native_replication.invoices, native_replication.posted_invoices, native_replication.inventory, native_replication.projection_cursor TO sornio_owner, sornio_manager, sornio_cashier, sornio_auditor;
GRANT SELECT ON native_replication.customers, native_replication.customer_statements TO sornio_owner, sornio_manager, sornio_auditor;
GRANT SELECT ON native_replication.pending_retail TO sornio_owner, sornio_auditor;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA native_replication TO sornio_publisher;
