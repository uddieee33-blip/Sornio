-- Phase 2 native financial replication.
-- REVIEW ONLY. Do not apply to production automatically.
-- Isolated from hosted sync_operating_records.
-- Paise and milli quantities are stored as BIGINT (exact integers).
-- Bounds match native MAX_VALUE: 9_000_000_000_000.

CREATE SCHEMA IF NOT EXISTS native_replication;

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
  UNIQUE (business_id, operation_id),
  UNIQUE (business_id, restore_generation, stream, stream_sequence)
);

CREATE TABLE native_replication.stream_heads (
  business_id TEXT NOT NULL REFERENCES native_replication.businesses(business_id),
  restore_generation TEXT NOT NULL,
  stream TEXT NOT NULL,
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
  operation_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  counterparty TEXT NOT NULL,
  total_paise BIGINT NOT NULL CHECK (total_paise BETWEEN 0 AND 9000000000000),
  cash_paise BIGINT NOT NULL CHECK (cash_paise BETWEEN 0 AND 9000000000000),
  credit_paise BIGINT NOT NULL CHECK (credit_paise BETWEEN 0 AND 9000000000000),
  split_complete BOOLEAN NOT NULL,
  PRIMARY KEY (business_id, operation_id),
  CHECK (cash_paise + credit_paise = total_paise)
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

CREATE TABLE native_replication.acks (
  business_id TEXT NOT NULL REFERENCES native_replication.businesses(business_id),
  operation_id TEXT NOT NULL,
  cursor TEXT NOT NULL,
  PRIMARY KEY (business_id, operation_id)
);

ALTER TABLE native_replication.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_replication.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_replication.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE native_replication.customers ENABLE ROW LEVEL SECURITY;

-- RLS uses authenticated JWT business_id. Service-role is not granted to clients.
CREATE POLICY events_tenant ON native_replication.events
  USING (business_id = current_setting('request.jwt.claims', true)::json->>'business_id');
CREATE POLICY invoices_tenant ON native_replication.invoices
  USING (business_id = current_setting('request.jwt.claims', true)::json->>'business_id');
CREATE POLICY inventory_tenant ON native_replication.inventory
  USING (business_id = current_setting('request.jwt.claims', true)::json->>'business_id');
CREATE POLICY customers_tenant ON native_replication.customers
  USING (business_id = current_setting('request.jwt.claims', true)::json->>'business_id');

REVOKE ALL ON SCHEMA native_replication FROM PUBLIC;
GRANT USAGE ON SCHEMA native_replication TO authenticated;
GRANT SELECT ON native_replication.invoices, native_replication.inventory, native_replication.customers, native_replication.projection_cursor TO authenticated;
-- Ingest uses a dedicated publisher role, never the companion reader role.
GRANT INSERT ON native_replication.events TO sornio_publisher;
