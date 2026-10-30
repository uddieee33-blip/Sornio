CREATE TABLE local_lan_devices (
 id TEXT PRIMARY KEY NOT NULL,
 business_id TEXT NOT NULL REFERENCES local_identity(business_id),
 workspace_id TEXT NOT NULL REFERENCES local_identity(workspace_id),
 name TEXT NOT NULL,
 certificate_hash TEXT NOT NULL UNIQUE CHECK(length(certificate_hash)=64),
 capability TEXT NOT NULL CHECK(capability IN ('read_only','cashier')),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 revision INTEGER NOT NULL CHECK(revision>0),
 generation TEXT NOT NULL
);
CREATE TRIGGER lan_device_identity_no_update BEFORE UPDATE ON local_lan_devices
 WHEN OLD.id<>NEW.id OR OLD.business_id<>NEW.business_id OR OLD.workspace_id<>NEW.workspace_id OR OLD.certificate_hash<>NEW.certificate_hash
 BEGIN SELECT RAISE(ABORT,'Device identity is immutable'); END;
CREATE TRIGGER lan_device_no_delete BEFORE DELETE ON local_lan_devices
 BEGIN SELECT RAISE(ABORT,'Revoke devices instead of deleting them'); END;
CREATE TABLE local_lan_operations (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL UNIQUE REFERENCES local_invoices(id),
 device_id TEXT NOT NULL REFERENCES local_lan_devices(id),
 actor_id TEXT NOT NULL REFERENCES local_principals(id),
 generation TEXT NOT NULL,
 request TEXT NOT NULL
);
CREATE TRIGGER lan_operation_no_update BEFORE UPDATE ON local_lan_operations
 BEGIN SELECT RAISE(ABORT,'LAN operation history is immutable'); END;
CREATE TRIGGER lan_operation_no_delete BEFORE DELETE ON local_lan_operations
 BEGIN SELECT RAISE(ABORT,'LAN operation history is immutable'); END;
PRAGMA user_version=12;
