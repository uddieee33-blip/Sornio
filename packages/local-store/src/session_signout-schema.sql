CREATE TABLE local_hub_session_handles(handle TEXT PRIMARY KEY NOT NULL CHECK(length(handle)=32), token_hash TEXT NOT NULL UNIQUE REFERENCES local_hub_sessions(token_hash) ON DELETE CASCADE);
INSERT INTO local_hub_session_handles(handle,token_hash) SELECT lower(hex(randomblob(16))),token_hash FROM local_hub_sessions;
PRAGMA user_version=22;
