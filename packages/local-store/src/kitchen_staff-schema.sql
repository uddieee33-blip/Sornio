CREATE TABLE local_kitchen_staff(actor_id TEXT PRIMARY KEY REFERENCES local_principals(id), mode TEXT NOT NULL CHECK(mode IN('preparer','supervisor')));
CREATE TABLE local_kitchen_ticket_staff(ticket_id TEXT PRIMARY KEY REFERENCES local_restaurant_tickets(id), actor_id TEXT NOT NULL REFERENCES local_principals(id));
CREATE TABLE local_kitchen_staff_events(sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL REFERENCES local_principals(id), ticket_id TEXT REFERENCES local_restaurant_tickets(id), request TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TRIGGER kitchen_staff_events_no_update BEFORE UPDATE ON local_kitchen_staff_events BEGIN SELECT RAISE(ABORT,'Preserve kitchen staff history'); END;
CREATE TRIGGER kitchen_staff_events_no_delete BEFORE DELETE ON local_kitchen_staff_events BEGIN SELECT RAISE(ABORT,'Preserve kitchen staff history'); END;
PRAGMA user_version=19;
