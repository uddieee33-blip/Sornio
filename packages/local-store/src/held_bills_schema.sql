CREATE TABLE local_held_bills (
    id TEXT PRIMARY KEY NOT NULL,
    actor_id TEXT NOT NULL REFERENCES local_principals(id),
    revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
    state TEXT NOT NULL CHECK(state IN ('held','active','checkout','completed','discarded')),
    payload TEXT NOT NULL CHECK(length(payload)<=262144),
    updated_at TEXT NOT NULL,
    last_request TEXT NOT NULL,
    checkout_id TEXT UNIQUE,
    checkout_request TEXT,
    CHECK((state IN ('checkout','completed')) = (checkout_id IS NOT NULL)),
    CHECK((checkout_id IS NULL) = (checkout_request IS NULL))
);
CREATE INDEX local_held_bills_owner ON local_held_bills(actor_id,state,updated_at);
CREATE UNIQUE INDEX local_held_bills_one_active ON local_held_bills(actor_id) WHERE state IN ('active','checkout');
CREATE TRIGGER local_held_bills_revision BEFORE UPDATE ON local_held_bills
WHEN NEW.id<>OLD.id OR NEW.actor_id<>OLD.actor_id OR NEW.revision<>OLD.revision+1
    OR OLD.state IN ('completed','discarded')
BEGIN SELECT RAISE(ABORT,'Held bill is stale or finished'); END;
CREATE TRIGGER local_held_bills_no_delete BEFORE DELETE ON local_held_bills
BEGIN SELECT RAISE(ABORT,'Keep held bill identity to prevent replay'); END;
PRAGMA user_version=13;
