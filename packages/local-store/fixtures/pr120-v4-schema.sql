-- Frozen PR #120 schema (merged main fc57404cec4ded352a1d8fcef8efd8a5a53ccfec).
-- Independent legacy fixture: do not generate it through the current Store migrations.
CREATE TABLE workspace_draft (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                revision INTEGER NOT NULL CHECK (revision > 0),
                payload TEXT NOT NULL
                );
CREATE TABLE workspace_history (
                    revision INTEGER PRIMARY KEY CHECK (revision > 0),
                    payload TEXT NOT NULL
                );
                INSERT INTO workspace_history(revision, payload)
                    SELECT revision, payload FROM workspace_draft;
                PRAGMA user_version = 2;
CREATE TABLE workspace_access (
                    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                    password_hash TEXT,
                    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
                    retry_after INTEGER NOT NULL DEFAULT 0 CHECK (retry_after >= 0)
                );
                INSERT INTO workspace_access(singleton) VALUES (1);
                PRAGMA user_version = 3;
CREATE TABLE local_products (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        unit TEXT NOT NULL CHECK(unit IN ('pcs','kg','litre','metre')),
        unit_price_paise INTEGER NOT NULL CHECK(unit_price_paise BETWEEN 0 AND 9000000000000),
        stock_milli INTEGER NOT NULL CHECK(stock_milli BETWEEN 0 AND 9000000000000),
        revision INTEGER NOT NULL CHECK(revision > 0)
    );
    CREATE UNIQUE INDEX local_products_sku ON local_products(sku) WHERE sku <> '';
    CREATE TABLE local_inventory_events (
        operation_id TEXT PRIMARY KEY NOT NULL,
        product_id TEXT NOT NULL REFERENCES local_products(id),
        kind TEXT NOT NULL CHECK(kind IN ('product_added','stock_adjusted')),
        request TEXT NOT NULL,
        result TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TRIGGER local_inventory_no_update BEFORE UPDATE ON local_inventory_events
        BEGIN SELECT RAISE(ABORT, 'Inventory history is append only'); END;
    CREATE TRIGGER local_inventory_no_delete BEFORE DELETE ON local_inventory_events
        BEGIN SELECT RAISE(ABORT, 'Inventory history is append only'); END;
    PRAGMA user_version = 4;
