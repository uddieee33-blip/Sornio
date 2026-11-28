# P0 Durable Recovery — Phase 5 Ownership & Publisher Fencing Analysis

Baseline: `1cc5c798d1eada9a16463213b0776c01e99d36f9`. All file/line references are to
the baseline unless marked **candidate**.

## 1. Complete write-path inventory (baseline)

Every code path that can start recovery, modify recovery metadata, publish business
operations, write financial transactions, update inventory, or change recovery guards:

### Recovery control
| Path | Authority (baseline) | Gap found |
|---|---|---|
| `recovery::export` (`recovery.rs`) | `writer()` → Owner `Settings` under `BEGIN IMMEDIATE`; pristine target exempt | No durable record that an export is part of a recovery; `backup_prepared` committed before file publish, `backup_exported` after — crash leaves an orphan audit row (benign but ambiguous) |
| `recovery::preview` | `verified()` logs into the **archive copy** as its Owner; live store only read | None (read-only on live store) |
| `recovery::restore` | confirmation + `verified()` + `check_business` + fingerprint re-check under writer lock | **No durable ownership**: two processes can both prepare; only the fingerprint re-check serializes them. No admission barrier: business writes continue during the (potentially long) safety export and invalidate the restore repeatedly |
| `access::Workspace::{export_backup,preview_backup,restore_backup}` | `recovery_authorize` (Owner password) | Same as above |
| `apps/desktop` `restore_local_backup` | Owner-gated native command | Calls `replication::reset_sidecar_file` (**destructive sidecar deletion**) after restore |
| `recovery::migrate` | runs in `Store::open` migration tx | creates identity + audit tables; no operations/fence |

### Business / financial publishers (all `BEGIN IMMEDIATE` + `identity::guard` when sessioned)
- `billing::post_invoice_inner` → `post_into`: invoice + actors + stock deltas +
  `local_billing_ledger` (cash/receivables, revenue, tax) + customer credit effects +
  retail parts + audit + outbox — **one transaction**.
- `checkout::{prepare_checkout,clear_checkout}` + `billing::post_prepared_invoice`.
- `payments.rs`: retail prepare/post/clear, returns, refunds, settlement matching,
  floats, drawer closings — journal + activity + outbox in the same tx as effects.
- `customers.rs`: save/credit/repayment/write-off/reversal/link — journal + outbox same tx.
- `catalog.rs`: add product / adjust stock — `local_inventory_events` + outbox same tx
  (`inventory_recovery::committed`).
- `inventory_recovery::{pending_inventory,acknowledge_inventory}`.
- `lan_authority::{enroll,change,post}` — device + human session + **generation** check;
  `post` writes through `post_into` in one tx; `local_lan_operations` idempotent by
  `operation_id`.
- `lib.rs::{save,restore}` (workspace drafts), `access.rs` staff/password/owner-setup
  writes (`local_principals`, `local_identity`, `workspace_access`).
- `replication::publish_unpublished` — **network publisher**: reads outbox without the
  writer lock, sends envelopes, commits acks to the sidecar. Generation checked **once**
  at loop start (baseline gap).

### Guard/identity mutators
- `recovery::restore` rotates `local_recovery_identity.generation` (invalidates every
  session via `identity::verify`'s generation check), disables non-owner staff,
  `lan_authority::disable_after_restore`.
- `identity::verify` is the session gate: scope + generation + enabled/revision + role.
  **Session-less writes skip it entirely** (`guard` is `if let Some(s)`); baseline relies
  on the adapter always supplying a session. Trusted-storage tests and any future
  session-less adapter path are unfenced.

## 2. Authoritative ownership mechanism (candidate)

One mechanism, two layers, both anchored in the database:

1. **Durable capability**: `local_recovery_operations` + `local_recovery_fence`
   (schema v13). The fence singleton is the *only* admission slot; its PK makes two
   simultaneous admissions impossible in any process. The `owner_token` (256-bit random)
   is required, under the writer lock, for every transition before completion.
2. **Engine-level barrier**: BEFORE INSERT/UPDATE/DELETE triggers on all 40 business
   tables raise while the fence exists. This does not trust sessions, adapters, or code
   paths — SQLite itself rejects the write.

### Proof obligations and how they are discharged

**P1 — Two recovery attempts cannot simultaneously own the same recovery operation.**
Admission INSERTs the fence singleton in the same `IMMEDIATE` tx that INSERTs the
operation. SQLite admits one writer; the second admission's fence INSERT hits the PK
(and the admission precondition "no non-terminal operation"). Executable proof:
`concurrent_admissions_have_one_owner` (two connections race; exactly one succeeds, the
other gets `RecoveryActive`/`RecoveryInterrupted`).

**P2 — Ownership cannot silently transfer to an unrelated operation.**
`operation_id`, `business_id`, `generation`, `owner_token`, `backup_id`,
`expected_fingerprint`, `actor_id` are immutable by UPDATE trigger. Transitions match
`(operation_id, owner_token, state)` exactly (1 row) under the writer lock. The only
non-token path is T6 interruption resolution, which requires a **live Owner session**,
an explicit `operation_id`, moves only to the terminal `interrupted` state, and is
audited — it never adopts, resumes, or completes an operation. Executable proof:
`stale_owner_token_cannot_transition`, `foreign_operation_cannot_be_adopted`.

**P3 — Stale owners cannot commit after ownership changes.**
After T4 the operation is terminal (no outgoing edges) and the generation rotated:
a stale process's session fails `identity::verify`, and any token-matched UPDATE finds
a terminal state (0 rows ⇒ `RecoveryOwnership`). After T5/T6 the fence is gone and the
operation terminal. A stale *restore transaction* cannot exist: it either committed
(then it **is** the owner) or rolled back. Executable proof:
`stale_restore_after_completed_restore_is_rejected`,
`duplicate_restore_with_old_preview_cannot_replace_the_workspace_twice` (baseline test,
still passing).

**P4 — Business identity cannot be substituted.**
Admission binds `business_id` from `local_recovery_identity`; `check_business` +
archive identity (`local_recovery_identity` inside the backup, validated by
`validate()`) are re-checked under the restore writer lock; the operation's
`business_id` is immutable; startup rejects operations whose `business_id` differs
from the live identity (`RecoveryCorrupt`). Executable proof: baseline
`other_business_confirmation_stale_preview_storage_and_native_auth_are_checked` +
candidate `operation_business_substitution_is_corrupt`.

**P5 — Recovery metadata cannot be modified outside authorized transitions.**
Operations: no DELETE ever; UPDATE only along §3 edges with immutable identity
(triggers). Fence: no UPDATE; DELETE only when the referenced operation is terminal;
INSERT only for a matching non-terminal operation. Recovery audit: baseline
no-UPDATE/no-DELETE triggers retained. Rust layer adds token/session checks; the
triggers make the graph engine-enforced for every connection. Executable proof:
`recovery_metadata_direct_writes_are_rejected` (raw SQL attempts: delete operation,
skip-state update, change token/business, delete fence while active, update fence,
insert second fence — all abort).

### Remaining limitations (honest)
- A process holding the raw SQLCipher key and file access can bypass any in-database
  control (drop triggers, rewrite pages). Threat model: concurrent/stale/crashed
  *cooperating* processes and accidental misuse — not an attacker with the device key.
  The key never leaves the OS vault (`device.rs`); renderer never sees it.
- Pre-v13 archives contain `restore_committed` audits without operation rows; they are
  accepted as legacy history (cannot be retro-fabricated). Consistency checks apply to
  operations that exist.
- The fence exempts auth/audit metadata tables by design (§5 of the state machine);
  business effects in those tables are only reachable inside transactions the barrier
  already aborts.

## 3. Publisher fencing and draining (candidate)

### What exists today
- SQLite WAL single-writer: `BEGIN IMMEDIATE` serializes all write transactions across
  processes. A restore tx cannot interleave with a business tx.
- `identity::verify` generation check: after a committed restore, every old session
  (local or LAN human) is invalid; LAN devices are disabled and generation-bound.
- Sidecar is generation-keyed: acks for an old generation can never advance the new
  generation's cursors (`load` resets on generation mismatch).

### What was missing (baseline gaps)
1. No durable admission barrier: business writes between preview and the restore tx
   kept succeeding, invalidating the restore via fingerprint drift (livelock under
   load) — and session-less writes were never fenced at all.
2. `publish_unpublished` checked generation once, then sent up to 400 rows and committed
   acks without re-checking: a restore mid-loop left a publisher acking against a
   generation that no longer exists and sending stale-generation envelopes after the
   fact.
3. No durable record of an in-progress recovery: a crash left only an orphan
   `backup_prepared` audit row; nothing barred writes or demanded review.

### Candidate mechanism
- **Admission barrier**: fence triggers (engine-level) bar all new business writes from
  the moment T0 commits until terminal state. This is a *local-database* fence — it
  covers every process on this database file. It is **not** a network-wide fence and is
  not claimed to be one.
- **In-flight write transactions**: T0's `BEGIN IMMEDIATE` waits for them; once the
  fence commits, any later write attempt aborts. Multi-tx operations (checkout
  prepare→post, retail prepare→post, credit prepare→post) are safe: each tx is atomic,
  and a post-fence finalize aborts at the barrier leaving only a pending checkpoint,
  which the restore replaces wholesale (and which reconciliation never auto-completes).
- **In-process replication drain**: T1 acquires `FlushLock`, the same mutex
  `publish_unpublished` holds for a batch. The batch re-checks fence + generation
  **before every send and before every ack commit** (candidate), so it aborts promptly
  once T0 commits; T1 then proceeds. No deadlock: T1 holds no DB lock while waiting.
- **Cross-process replication publishers**: per-row fence + generation re-checks abort
  them before the next send/ack. A send already on the wire may complete: the envelope
  is a truthful pre-restore event tagged with the old generation; the cloud's
  `(business, generation, operation)` uniqueness makes ingestion idempotent, and the
  restored ledger republishes under the new generation. **Limitation**: at-least-once
  delivery across the restore boundary; no distributed coordination is introduced
  because the single-file SQLite architecture does not require it.
- **Operation idempotency**: unchanged baseline guarantees — `local_invoices.id` PK +
  request-equality replay, `local_lan_operations.operation_id` UNIQUE, inventory/retail/
  customer op PKs, canceled-ID tombstones. The fence does not weaken any of them.
- **Process interruption**: a publisher killed mid-batch leaves at most an
  uncommitted sidecar ack (sidecar save is one tx) — cursors never skip unpublished
  rows. Restart re-reads from the last durable ack.
- **Restart after incomplete draining**: the fence is durable; a drained-but-not-restored
  state (`admitted`/`quiescing`) stays fenced until T4/T5/T6. Publishers restarting
  against a fenced store abort at the first per-row check. Executable proof:
  `publisher_aborts_when_fence_appears_mid_batch`,
  `publisher_generation_change_mid_batch_aborts_before_ack`,
  `restart_after_interrupted_drain_stays_fenced`.

### Why no distributed coordinator
All authoritative state is one SQLCipher file with a single-writer lock; the only
cross-machine effects are LAN posts (terminate in the same file, generation-bound) and
cloud replication (idempotent, generation-keyed, at-least-once). A durable local fence +
generation epochs + per-row re-validation cover every local interleaving; the cloud
already dedups. Adding Raft/leases/etc. would add failure modes without closing any
remaining local gap.

## 4. Sidecar deletion

Baseline `restore_local_backup` deletes `replication-sidecar.sqlite` after a successful
restore. The candidate **removes that call**: the sidecar is generation-keyed, so the
new generation starts at cursor 0 without deleting anything, and the old generation's
ack history is preserved as evidence. `reset_sidecar_file` remains available as an
explicit, separately authorized utility but is no longer part of recovery. This
satisfies "sidecar deletion remains disabled" in the recovery path and removes a
destructive step that could fail after the restore committed (baseline: a deletion
failure turned a committed restore into a command error).

## 5. Public restore

No web/public restore surface exists (verified: `lib/` has no restore commands; restore
is a native Windows Tauri command gated by Owner password + scope + confirmation). The
candidate adds no public surface; the new interruption-resolution API is Owner-gated in
the same native boundary. Public restore remains disabled.
