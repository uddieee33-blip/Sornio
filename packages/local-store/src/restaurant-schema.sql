CREATE TABLE local_restaurant_tables (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL CHECK(active IN (0,1)));
CREATE TABLE local_restaurant_orders (id TEXT PRIMARY KEY NOT NULL, table_id TEXT REFERENCES local_restaurant_tables(id), kind TEXT NOT NULL CHECK(kind IN ('dine_in','takeaway')), state TEXT NOT NULL CHECK(state IN ('open','pending_bill','cancelled')), revision INTEGER NOT NULL CHECK(revision>0), CHECK((kind='dine_in')=(table_id IS NOT NULL)));
CREATE UNIQUE INDEX local_restaurant_one_open_table ON local_restaurant_orders(table_id) WHERE state IN ('open','pending_bill') AND table_id IS NOT NULL;
CREATE TABLE local_restaurant_tickets (id TEXT PRIMARY KEY NOT NULL, order_id TEXT NOT NULL REFERENCES local_restaurant_orders(id), items TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','preparing','ready','served')), revision INTEGER NOT NULL CHECK(revision>0));
CREATE TABLE local_restaurant_events (operation_id TEXT PRIMARY KEY NOT NULL, actor_id TEXT NOT NULL REFERENCES local_principals(id), request TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TRIGGER local_restaurant_events_no_update BEFORE UPDATE ON local_restaurant_events BEGIN SELECT RAISE(ABORT,'Restaurant history is append only'); END;
CREATE TRIGGER local_restaurant_events_no_delete BEFORE DELETE ON local_restaurant_events BEGIN SELECT RAISE(ABORT,'Restaurant history is append only'); END;
PRAGMA user_version=14;
