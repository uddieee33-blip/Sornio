CREATE TABLE local_identity (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 business_id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL UNIQUE,
 business_name TEXT NOT NULL, business_type TEXT NOT NULL,
 origin TEXT NOT NULL CHECK(origin IN ('new','legacy'))
);
CREATE TRIGGER identity_no_update BEFORE UPDATE ON local_identity
 WHEN OLD.business_id<>NEW.business_id OR OLD.workspace_id<>NEW.workspace_id
 BEGIN SELECT RAISE(ABORT,'Workspace identity is immutable'); END;
CREATE TRIGGER identity_no_delete BEFORE DELETE ON local_identity
 BEGIN SELECT RAISE(ABORT,'Workspace identity is immutable'); END;
CREATE TABLE local_principals (
 id TEXT PRIMARY KEY NOT NULL, business_id TEXT NOT NULL REFERENCES local_identity(business_id),
 username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','manager','assistant_manager','cashier')),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 revision INTEGER NOT NULL CHECK(revision>0), password_hash TEXT NOT NULL,
 failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 5),
 retry_after INTEGER NOT NULL DEFAULT 0 CHECK(retry_after>=0)
);
CREATE UNIQUE INDEX single_local_owner ON local_principals(role) WHERE role='owner';
CREATE TRIGGER owner_no_change BEFORE UPDATE ON local_principals
 WHEN OLD.role='owner' AND (NEW.role<>'owner' OR NEW.enabled<>1 OR NEW.id<>OLD.id)
 BEGIN SELECT RAISE(ABORT,'The owner cannot be disabled or demoted'); END;
CREATE TRIGGER principal_no_delete BEFORE DELETE ON local_principals
 BEGIN SELECT RAISE(ABORT,'Disable staff instead of deleting identity'); END;
CREATE TABLE local_identity_audit (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 business_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
 actor_id TEXT, actor_role TEXT, action TEXT NOT NULL, target TEXT, details TEXT NOT NULL DEFAULT('{}'),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER identity_audit_no_update BEFORE UPDATE ON local_identity_audit
 BEGIN SELECT RAISE(ABORT,'Identity audit is append only'); END;
CREATE TRIGGER identity_audit_no_delete BEFORE DELETE ON local_identity_audit
 BEGIN SELECT RAISE(ABORT,'Identity audit is append only'); END;
CREATE TABLE local_invoice_actors (
 invoice_id TEXT PRIMARY KEY REFERENCES local_invoices(id), actor_id TEXT REFERENCES local_principals(id)
);
INSERT INTO local_invoice_actors(invoice_id) SELECT id FROM local_invoices;
CREATE TRIGGER invoice_actor_no_update BEFORE UPDATE ON local_invoice_actors
 BEGIN SELECT RAISE(ABORT,'Invoice attribution is immutable'); END;
CREATE TRIGGER invoice_actor_no_delete BEFORE DELETE ON local_invoice_actors
 BEGIN SELECT RAISE(ABORT,'Invoice attribution is immutable'); END;
ALTER TABLE local_checkout ADD COLUMN actor_id TEXT REFERENCES local_principals(id);
PRAGMA user_version=7;
