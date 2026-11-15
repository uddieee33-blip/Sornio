CREATE TABLE local_kitchen_staff_next(actor_id TEXT PRIMARY KEY REFERENCES local_principals(id), mode TEXT NOT NULL CHECK(mode IN('preparer','supervisor','revoked')));
INSERT INTO local_kitchen_staff_next SELECT actor_id,mode FROM local_kitchen_staff;
DROP TABLE local_kitchen_staff;
ALTER TABLE local_kitchen_staff_next RENAME TO local_kitchen_staff;
PRAGMA user_version=21;
