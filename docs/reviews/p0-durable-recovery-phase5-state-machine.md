# P0 Durable Recovery — Phase 5 Recovery State Machine

Status: design of record for the Phase 5 candidate implementation.
Baseline: `1cc5c798d1eada9a16463213b0776c01e99d36f9` (`main`), schema `user_version = 12`.
Candidate schema: `user_version = 13` (adds `local_recovery_operations`, `local_recovery_fence`, fence triggers).

This document is written against the **actual** baseline schema and code paths
(`packages/local-store/src/recovery.rs`, `lib.rs`, `identity.rs`, `billing.rs`,
`checkout.rs`, `customers.rs`, `payments.rs`, `catalog.rs`, `inventory_recovery.rs`,
`lan_authority.rs`, `replication.rs`, `access.rs`, `apps/desktop/src-tauri/src/main.rs`).
No Phase 3/Phase 4 patch was stacked: those artifacts were not found in the repository,
its full history, or any remote branch (see the Phase 5 report, baseline section).

## 1. Actors and authorities

- **Owner session**: a live `identity::Session` with `Permission::Settings`, verified
  *inside* the writing transaction (`identity::verify` re-checks scope, recovery
  generation, principal enabled/revision, role). Only Owner holds `Settings`.
- **Recovery owner token**: a 256-bit random capability (`owner_token`) minted at
  admission, stored in `local_recovery_operations` and `local_recovery_fence`,
  held in process memory only by the admitting process. Every recovery transition
  requires an exact `(operation_id, owner_token, expected_state)` match under the
  SQLite writer lock.
- **Business publisher**: any code path that writes business state (invoices,
  ledger, inventory, customers, retail, checkout, staff, LAN operations, drafts).
- **Replication publisher**: `replication::publish_unpublished` — reads outbox rows
  and performs network sends *without* holding the financial writer lock, then
  commits acks to the generation-keyed sidecar.
- **Startup reconciler**: `Store::open` after migration; fail-closed, never
  interprets ambiguity as success, never auto-resolves an interrupted operation.

## 2. Durable objects (schema v13)

```sql
CREATE TABLE local_recovery_operations (
  operation_id TEXT PRIMARY KEY NOT NULL,          -- 64-hex random, minted at admission
  kind TEXT NOT NULL CHECK(kind IN ('restore')),
  state TEXT NOT NULL CHECK(state IN
    ('admitted','quiescing','executing','verifying','completed','rejected','interrupted')),
  business_id TEXT NOT NULL,                       -- bound at admission, immutable
  generation TEXT NOT NULL,                        -- pre-restore generation, immutable
  owner_token TEXT NOT NULL,                       -- 64-hex capability, immutable
  backup_id TEXT NOT NULL,                         -- bound at admission, immutable
  expected_fingerprint TEXT NOT NULL,              -- bound at admission, immutable
  actor_id TEXT,                                   -- authorizing Owner (NULL only for pristine target)
  result_generation TEXT,                          -- set only when state becomes 'completed'
  detail TEXT,                                     -- JSON reason for rejected/interrupted
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE local_recovery_fence (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  operation_id TEXT NOT NULL REFERENCES local_recovery_operations(operation_id),
  business_id TEXT NOT NULL,
  owner_token TEXT NOT NULL,
  activated_at INTEGER NOT NULL
);
```

Engine-enforced invariants (SQLite triggers, apply to **every** connection/process):

1. `local_recovery_operations` DELETE: always `RAISE(ABORT)` (history is permanent).
2. `local_recovery_operations` UPDATE: identity columns
   (`operation_id, kind, business_id, generation, owner_token, backup_id,
   expected_fingerprint, actor_id, created_at`) are immutable; `state` may only move
   along the edges in §3; `result_generation` may only be set when entering
   `completed`; `updated_at` must not decrease.
3. `local_recovery_operations` INSERT: `state` must be `admitted` (normal admission)
   or `verifying` (re-establishment inside the restore transaction after
   `sqlcipher_export` replaced the table); `result_generation` must be NULL.
4. `local_recovery_fence` INSERT: referenced operation must exist in a non-terminal
   state with matching `business_id`/`owner_token`; singleton PK admits one fence.
5. `local_recovery_fence` UPDATE: always `RAISE(ABORT)` (immutable while active).
6. `local_recovery_fence` DELETE: referenced operation must be terminal
   (`completed`/`rejected`/`interrupted`).
7. **Business-write barrier**: BEFORE INSERT/UPDATE/DELETE triggers on every business
   table (§5) `RAISE(ABORT)` whenever a fence row exists. This is the universal,
   engine-level fence: it applies to stale processes, session-less trusted writes,
   LAN posts and raw SQL alike, for the whole admitted→terminal window.

## 3. States

| State | Meaning | Fence | Visible to other processes |
|---|---|---|---|
| *(none)* | no recovery operation exists | absent | yes |
| `admitted` | ownership acquired; business writes barred | active | yes (durable) |
| `quiescing` | in-process publishers drained; writer lock next | active | yes (durable) |
| `executing` | destructive restore transaction in progress | active | **no** — uncommitted intermediate |
| `verifying` | imported image under structural verification | active | **no** — uncommitted intermediate |
| `completed` | terminal success; new generation live | absent | yes (durable) |
| `rejected` | terminal failure, explicitly recorded; fence released | absent | yes (durable) |
| `interrupted` | terminal; crash/ambiguity resolved by explicit Owner action | absent | yes (durable) |

`executing`/`verifying` are written inside the single restore transaction. They are
durable *only if that transaction commits* (in which case the row is re-established
post-import and advanced to `completed` before commit). A crash before commit rolls
back to the last committed state (`quiescing`, or `admitted`), which is exactly what
startup reconciliation expects. No other process can ever observe `executing` or
`verifying` (SQLite WAL single-writer + read snapshots).

## 4. Transitions

Notation: **T** = transition, **tx** = transaction boundary, all writes below happen
inside the stated tx; `IMMEDIATE` = `BEGIN IMMEDIATE` (acquires the SQLite writer lock).

### T0 — Admission: *(none)* → `admitted`
- **Preconditions**: live Owner session with `Settings` (or pristine, unconfigured
  target — the only session-less case, matching baseline `writer()`); backup preview
  verified (`verified()`); `check_business` passes; **no fence row**; **no non-terminal
  operation** (else `RecoveryInterrupted` — resolution required first).
- **tx**: one `IMMEDIATE` tx. The writer lock itself drains all in-flight *write*
  transactions of every process before the fence becomes visible.
- **Durable changes**: INSERT operation (`admitted`, fresh `operation_id`/`owner_token`,
  bound `business_id`/`generation`/`backup_id`/`expected_fingerprint`/`actor_id`);
  INSERT fence singleton (PK conflict ⇒ second concurrent admission fails).
- **Ownership**: token minted here; returned to the caller in memory only.
- **Audit**: `recovery.admitted` (recovery audit + identity audit with actor).
- **Failure**: any error rolls back both rows ⇒ no fence, no operation, no partial state.
- **Restart**: crash before commit ⇒ nothing durable; crash after commit ⇒ `admitted`
  + fence ⇒ reconciliation path (§6), never success.

### T1 — Publisher quiescence: `admitted` → `quiescing`
- **Preconditions**: T0 committed; token matches; fence still references this operation.
- **Drain**: acquire the process-local `FlushLock` (waits for any in-process
  `publish_unpublished` batch; that batch re-checks fence+generation per row and aborts
  early once the fence is visible). Cross-process writers are already barred by the
  fence triggers; cross-process replication publishers abort at their next per-row
  re-check. In-flight network sends may complete (truthful pre-restore events; the cloud
  dedups by business/generation/operation — see fencing analysis). No network-wide fence
  is claimed.
- **tx**: one `IMMEDIATE` tx; UPDATE state with `(operation_id, owner_token, state='admitted')`
  match, exactly 1 row.
- **Durable changes**: state → `quiescing`, `updated_at`.
- **Audit**: `recovery.quiescing`.
- **Failure**: token/state mismatch ⇒ `RecoveryOwnership`, no change. Crash ⇒ `admitted`
  or `quiescing` + fence ⇒ reconciliation.
- **Restart**: both states are non-terminal; business writes remain barred by the fence.

### T2 — Execution: `quiescing` → `executing` (inside the restore transaction)
- **Preconditions**: confirmation phrase matched; archive re-verified (`verified()`);
  safety export completed (its own two tx + file publish, owner-token exempt);
  archive attached read-only as `recovery_import`; `foreign_keys=OFF` for the import
  (baseline behavior, restored to ON afterwards).
- **tx**: the single restore `IMMEDIATE` tx (T2–T4 share it).
- **Durable changes (pre-import)**: UPDATE state → `executing` (token+state matched).
  Then DROP every schema object (including fence triggers — this is the authorized
  exemption for recovery's own writes), `sqlcipher_export('main','recovery_import')`,
  DROP manifest, `user_version=13`, rotate `local_recovery_identity.generation`.
- **Ownership**: re-validated under the writer lock: token, state, business identity,
  and `fingerprint == expected_fingerprint` (detects any committed change since preview).
- **Audit**: `recovery.executing`.
- **Failure**: any error ⇒ whole tx rolls back ⇒ pre-restore data intact, state stays
  `quiescing`, fence active. Explicit rejection (T5) follows in a new tx.
- **Restart**: crash mid-tx ⇒ WAL rollback ⇒ `quiescing` + fence ⇒ reconciliation.

### T3 — Verification: `executing` → `verifying` (same tx, post-import)
- **Preconditions**: import complete; generation rotated.
- **Durable changes**: resolve any *imported* non-terminal operations (safety-backup
  case) → `interrupted` with audit `recovery.imported_interrupted`; re-establish this
  operation's row (INSERT `verifying` if absent — normal backups; step
  `admitted→quiescing→executing→verifying` if the imported image contains it — safety
  backups); delete any imported fence row (now legal: referenced operations terminal);
  disable restored staff + LAN devices (baseline behavior, now after fence removal so
  the barrier does not block recovery's own authorized writes); set `result_generation`
  candidate; run `integrity()` — `cipher_integrity_check`, `integrity_check`,
  `foreign_key_check` on the imported image.
- **Audit**: `recovery.verifying`, `recovery.staff_disabled` (per staff),
  `recovery.device_disabled` (per device), `recovery.imported_interrupted` (if any).
- **Failure**: integrity failure ⇒ rollback of the whole restore tx ⇒ `quiescing` + fence.
- **Restart**: same as T2 (uncommitted).
- **Note**: deep financial-invariant verification is **test-only** (mission constraint);
  production verification is structural. The executable financial verifier runs against
  real restored databases in the test suite.

### T4 — Completion: `verifying` → `completed` (same tx, then COMMIT)
- **Preconditions**: T3 checks passed inside the tx.
- **Durable changes**: UPDATE state → `completed`, `result_generation` = new generation;
  fence already absent (T3); `restore_committed` audit row (legacy action, kept for
  `last_restore` compatibility) + `recovery.completed`.
- **Ownership**: token+state matched UPDATE; after commit the token is inert (terminal).
- **Audit**: `restore_committed`, `recovery.completed`.
- **Failure**: error ⇒ rollback ⇒ `quiescing` + fence (never silent success).
- **Restart**: crash before COMMIT ⇒ rollback ⇒ reconciliation. Crash after COMMIT ⇒
  `completed` + `result_generation` == live generation ⇒ consistent, business resumes;
  all pre-restore sessions are invalid (generation rotated), staff/LAN disabled.

### T5 — Rejection: `admitted`|`quiescing` → `rejected`
- **Preconditions**: a recovery step failed *outside* the restore tx (verification,
  safety export, fingerprint drift, confirmation, storage) or the restore tx rolled back.
- **tx**: one `IMMEDIATE` tx; token+state matched UPDATE; DELETE fence (legal: terminal).
- **Durable changes**: state → `rejected`, `detail` = reason code; fence removed.
- **Audit**: `recovery.rejected`.
- **Failure**: if the rejection tx itself fails (e.g. process dies), state stays
  non-terminal + fence ⇒ reconciliation. Rejection never touches business data.
- **Restart**: `rejected` is terminal; business writes resume on the **pre-restore** data.

### T6 — Interruption resolution: `admitted`|`quiescing` → `interrupted` (manual)
- **Preconditions**: startup found a non-terminal operation (crash survivor). A live
  Owner session with `Settings` + explicit `operation_id`. **No token required** — the
  crashed owner's token is gone; authority comes from the live Owner, and the action is
  explicit, audited, and never automatic.
- **tx**: one `IMMEDIATE` tx; UPDATE state → `interrupted` (valid edge), `detail`;
  DELETE fence.
- **Durable changes**: terminal state + fence removed. **Zero business-data changes.**
- **Audit**: `recovery.interrupted` (with actor).
- **Failure**: error ⇒ fence stays ⇒ still contained.
- **Restart**: idempotent — a second resolution finds a terminal state and rejects.

### T7 — Startup re-fence (containment, not a state transition)
- If a non-terminal operation exists but the fence row is missing (only possible via
  corruption/tamper — triggers normally prevent it), startup re-INSERTs the fence from
  the operation's bound identity and audits `recovery.reconciled_fence`. This **restores
  the fail-closed barrier**; it never advances state, never cleans up, never marks success.

## 5. Fenced business tables (barrier triggers)

`workspace_draft`, `workspace_history`, `local_products`, `local_inventory_events`,
`local_inventory_actors`, `local_inventory_pending`, `local_inventory_outbox`,
`local_invoices`, `local_invoice_actors`, `local_invoice_stock`, `local_billing_ledger`,
`local_billing_outbox`, `local_checkout`, `local_checkout_canceled`, `local_customers`,
`local_customer_ops`, `local_credit_entries`, `local_customer_journal`,
`local_customer_outbox`, `local_customer_pending`, `local_customer_canceled`,
`local_retail_ops`, `local_retail_pending`, `local_retail_canceled`,
`local_retail_payments`, `local_retail_events`, `local_retail_journal`,
`local_retail_activity`, `local_retail_returns`, `local_retail_return_items`,
`local_retail_return_parts`, `local_retail_refunds`, `local_retail_floats`,
`local_retail_float_corrections`, `local_retail_closings`, `local_retail_outbox`,
`local_principals`, `local_identity`, `local_lan_devices`, `local_lan_operations`.

**Exempt by design** (recovery/auth/audit metadata, needed to run and resolve recovery):
`local_recovery_identity`, `local_recovery_audit`, `local_recovery_operations`,
`local_recovery_fence`, `local_identity_audit`, `local_billing_audit`,
`workspace_access` (login/rate-limit counters — Owner must be able to authenticate to
resolve an interruption), `sornio_backup_manifest` (transient, export-only).
Business *audit* rows are only written inside business transactions that the barrier
already aborts at the business tables; exempting them lets recovery write its own audits.

## 6. Startup reconciliation (fail-closed)

Runs in `Store::open` after migration, before the store is handed out:

| Condition | Outcome |
|---|---|
| no operations, no fence, all audit actions known | open normally |
| non-terminal operation + fence present | open **contained**: business writes barred by triggers; admission refused (`RecoveryInterrupted`); Owner resolution (T6) required |
| non-terminal operation + fence missing | T7 re-fence, then as above |
| fence references terminal operation | `RecoveryCorrupt` — refuse to open (keep files) |
| fence references missing operation | `RecoveryCorrupt` (FK would prevent; tamper) |
| >1 non-terminal operation | `RecoveryCorrupt` |
| operation `business_id` ≠ live business identity | `RecoveryCorrupt` (identity substitution) |
| unknown `local_recovery_audit.action` | `RecoveryCorrupt` |
| `completed` operation with NULL `result_generation` | `RecoveryCorrupt` |
| recovery tables missing after migration | `RecoveryCorrupt` |
| legacy (pre-v13) audits without operation rows | accepted as legacy history; consistency checks apply only to operations that exist |

Startup **never** transitions a non-terminal operation to `completed`, never deletes
ambiguous rows, and never releases a fence except via T6 (explicit Owner action) or T4
(committed restore). An interrupted restore is always resolved against the
**pre-restore** database: the restore transaction is atomic, so interruption implies it
never committed.

## 7. Impossible / ambiguous / dangerous combinations

| Combination | Status | Defense |
|---|---|---|
| two active operations | impossible | fence singleton PK + admission precondition + trigger 4 |
| active operation, no fence | containment gap | T7 re-fence at startup; triggers prevent fence DELETE while non-terminal |
| fence, terminal operation | impossible via API | trigger 6; startup ⇒ `RecoveryCorrupt` |
| fence, missing operation | impossible via API | FK + trigger 4; startup ⇒ `RecoveryCorrupt` |
| `completed` without `restore_committed` audit | impossible | same transaction (T4) |
| `restore_committed` audit without operation | legacy only | pre-v13 history; flagged in report as a legacy limitation |
| stale owner committing after ownership change | impossible | token+state matched UPDATE under writer lock; terminal states final |
| business identity substitution | impossible | immutable `business_id` (trigger 2) + `check_business` + backup identity re-check under lock |
| session-less business write during recovery | blocked | barrier triggers (engine-level, not session-level) |
| `executing` observed by another process | impossible | uncommitted; WAL single-writer |
| restore commits but fence survives | impossible | fence removal and completion in one tx |
| safety backup imported with active fence | handled | T3 resolves imported operations → `interrupted`, removes imported fence, all inside the restore tx |

## 8. Crash-consistency summary

See `p0-durable-recovery-phase5-crash-matrix.md` for the full matrix. Core argument:
every durable recovery effect is either (a) inside the single atomic restore
transaction, or (b) an admission/quiescence/rejection/resolution transaction whose
committed state is non-terminal + fenced (contained) or terminal + unfenced (resolved).
There is no window where business data is partially restored, and no window where an
interrupted recovery looks successful.

## 12. Implementation notes (final, as built and tested)

These record decisions made during implementation that refine the design above.
All are covered by executable tests in `packages/local-store/src/recovery/phase5_tests.rs`
and `packages/local-store/examples/security/tests.rs`.

1. **Live fingerprint excludes recovery bookkeeping.** `digest_inner(live=true)`
   skips `local_recovery_audit`, `local_identity_audit`, `local_recovery_operations`,
   and `local_recovery_fence`. A restore legitimately appends operation/audit rows;
   including them would invalidate the restore's own bound fingerprint. Backup
   digests (`live=false`) still cover every table, so archive integrity is unchanged.
2. **Business-identity trigger is conditional.** `local_recovery_operations_insert`
   enforces `business_id` equality only when the store is configured (`local_principals`
   non-empty). A pristine new device legitimately adopts the backup's identity
   (`check_business` allows it); a configured store may never substitute identity.
   `check_business` (admission + under-lock recheck) and `reconcile_startup`
   (post-import, every operation must match the imported identity) remain the
   primary fail-closed guards.
3. **Owner resolution authenticates read-only.** While fenced, the normal login
   writes attempt counters to fenced tables and is itself barred. `resolve_interrupted`
   therefore verifies the Owner password against the stored verifier read-only,
   honors the persistent lockout (`retry_after`), and then writes only recovery
   metadata (operation → `interrupted`, fence release, audit). It is the single
   authorized write path through a live fence and never touches business tables.
   `login_at` gained a clean `ensure_open` early check so a fenced login returns
   `RecoveryActive` rather than a raw constraint error.
4. **Recovery status is lock-free operational metadata.** `Workspace::recovery_status`
   reads without a session so a fenced+locked workspace is diagnosable before
   resolution. Resolution still requires Owner re-authentication.
5. **Desktop governance.** `read_recovery_status` / `resolve_interrupted_recovery`
   are registered through a new audited `with_recovery_review_workspace` wrapper that
   verifies the workspace scope read-only (`verify_scope_readonly`) — no session is
   required or granted. They are a distinct capability (`local-recovery-review`) and
   are covered by a dedicated negative security test (wrong scope → `WorkspaceMismatch`,
   wrong password → `InvalidPassword`, nothing-to-resolve → `RecoveryOwnership`). All
   pre-existing commands keep their exact session guards; the security governance test
   (`every_registered_command_has_an_explicit_security_case_and_scoped_wrapper`) passes.
6. **Sidecar deletion stays disabled.** The desktop restore no longer calls
   `reset_sidecar_file`; the generation-keyed sidecar starts the new generation at
   cursor 0 while preserving the old generation's ack history as evidence.
7. **Imported interrupted operations are terminated explicitly.** A safety backup
   captured mid-recovery can contain a non-terminal operation; after import the
   restore moves any such row to `interrupted` with a `recovery.imported_interrupted`
   audit, then re-establishes the current operation's durable record.
