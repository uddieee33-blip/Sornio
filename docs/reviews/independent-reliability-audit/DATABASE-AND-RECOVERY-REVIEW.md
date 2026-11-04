# Database and recovery

Local native suite used isolated synthetic SQLCipher databases, including wrong-key refusal, reopen, SQL write fault injection, transaction rollback, process termination and backup/restore tests. `scripts/verify-local-schema.py` independently applied source-extracted DDL to ordinary SQLite and passed 92 checks including a v4 fixture migration; this is not a SQLCipher upgrade on Windows.

Recovery tests exercise corrupted/wrong-password archives, owner checks and financial preservation. Process termination is not a power cut; real disk flush semantics, Windows filesystem behavior, key-loss procedures and physical backup media remain unverified here. The restored-copy test explicitly does not reconcile two independently active copies; shop operations must not assume conflict-free merging.
