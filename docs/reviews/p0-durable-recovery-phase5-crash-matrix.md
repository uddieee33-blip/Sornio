# P0 Durable Recovery — Phase 5 Crash-Consistency Matrix

Baseline `1cc5c798`; candidate schema v13. "Crash" = process termination (SIGKILL,
power loss semantics via SQLite WAL + `synchronous=FULL`) at the stated point.
The candidate keeps the baseline's single-transaction restore and adds durable
admission/ownership/fence state around it.

## Durable transaction boundaries (candidate)

- **TX-A** admission: operation(`admitted`) + fence + audits — one `IMMEDIATE` tx.
- **TX-Q** quiescence: state → `quiescing` + audit — one `IMMEDIATE` tx (after
  in-process `FlushLock` drain).
- **TX-S1/S2** safety export: `backup_prepared` audit (S1), encrypted file publish,
  `backup_exported` audit (S2) — baseline two-tx export, owner-token exempt.
- **TX-R** restore: state → `executing`, DROP/import, generation rotation, imported
  operation resolution, state → `verifying`, staff/LAN disable, structural integrity,
  state → `completed` + `result_generation`, `restore_committed` + `recovery.completed`
  audits, fence removal — **one** `IMMEDIATE` tx. Commit is the only success point.
- **TX-J** rejection: state → `rejected` + reason, fence DELETE, audit — one tx.
- **TX-I** interruption resolution (manual, Owner): state → `interrupted`, fence
  DELETE, audit — one tx.
- Sidecar ack saves are single tx in the separate sidecar file; they never touch
  financial state and are generation-keyed.

## Matrix

| # | Crash point | Durable state after restart | Business data | Resume / reject / manual | Why |
|---|---|---|---|---|---|
| 1 | Before TX-A (preview/verification only) | none | untouched | normal operation; retry recovery freely | preview is read-only on the live store; staging copy is a temp file |
| 2 | During TX-A, before commit | none (rollback) | untouched | normal; retry | atomic tx |
| 3 | Immediately after TX-A commit | `admitted` + fence | untouched, **writes barred** | **manual** (TX-I) or explicit rejection; never auto-resume | token lost with process; no silent adoption |
| 4 | During FlushLock drain / before TX-Q | `admitted` + fence | untouched, barred | manual (TX-I) | same as 3 |
| 5 | After TX-Q commit | `quiescing` + fence | untouched, barred | manual (TX-I) | same as 3 |
| 6 | During safety export TX-S1 | `quiescing` + fence; `backup_prepared` audit maybe committed | untouched, barred | manual (TX-I); orphan audit is append-only history | S1 atomic |
| 7 | After S1, during file write/publish | as 6 + possibly partial temp file | untouched, barred | manual; temp file never published under final name (`persist_noclobber`) | publish is atomic rename + dir fsync |
| 8 | After safety file published, before S2 | as 6 + complete safety file | untouched, barred | manual; safety file is a valid bonus backup | S2 only audits |
| 9 | During TX-R before DROP | `quiescing` + fence (TX-R rolled back) | untouched, barred | manual (TX-I) | atomic tx |
| 10 | During TX-R after DROP, mid-import | as 9 | untouched (rollback restores dropped objects), barred | manual | DROP+import are inside TX-R; WAL rollback is complete |
| 11 | During TX-R after financial import, before integrity | as 9 | untouched, barred | manual | uncommitted import invisible to readers; rollback |
| 12 | During TX-R integrity verification | as 9 | untouched, barred | manual | same |
| 13 | During TX-R after `completed` UPDATE, **before COMMIT** | as 9 | untouched, barred | manual | the completion row is uncommitted; rollback erases it |
| 14 | Immediately after TX-R COMMIT | `completed` + `result_generation`, no fence, new generation | **restored image**, consistent | normal operation on restored data; old sessions invalid | commit is the single success point; staff/LAN disabled in same tx |
| 15 | After TX-R commit, before DETACH/FK-ON/session lock | as 14 | restored, consistent | normal; next `Store::open` sets FK ON; sessions already invalid by generation | connection-local cleanup only |
| 16 | During TX-J (rejection) before commit | `admitted`/`quiescing` + fence | untouched, barred | manual (TX-I) | rejection atomic |
| 17 | After TX-J commit | `rejected`, no fence | untouched (pre-restore) | normal operation | terminal failure recorded |
| 18 | During TX-I before commit | non-terminal + fence | untouched, barred | manual again | atomic |
| 19 | After TX-I commit | `interrupted`, no fence | untouched (pre-restore) | normal operation | explicit Owner resolution |
| 20 | Publisher mid-batch, before ack save | sidecar cursors at last durable ack | outbox rows durable | publisher restarts from last ack; at-least-once, cloud dedups | sidecar save atomic; generation-keyed |
| 21 | Publisher mid-batch after fence appears | as 20; publisher aborts at next per-row check | barred | recovery proceeds; publisher restarts post-recovery under new generation | per-row fence+generation re-check |
| 22 | Crash between TX-R commit and (removed) sidecar deletion | n/a — candidate performs **no sidecar deletion** | restored | sidecar `load(new_generation)` resets cursors; old ack history preserved | generation-keyed design |

## Cross-transaction honesty

- **No atomicity is claimed across TX-A/TX-Q/TX-S/TX-R/TX-J/TX-I.** They are separate
  transactions. What is guaranteed: every intermediate committed state is non-terminal
  **and fenced** (business writes barred by engine triggers), and every terminal state
  is unfenced with an audit trail. The only state that changes business data is TX-R,
  and it is atomic.
- The safety export's two transactions can leave a `backup_prepared` audit without
  `backup_exported` (rows 6–8). This is append-only history of an attempt, never
  interpreted as recovery success; startup accepts it as a known legacy action pair.
- A crash can never produce: partial financial import (TX-R atomic), a `completed`
  operation without its audits (same tx), a released fence with a non-terminal
  operation (trigger + same-tx ordering), or a successful-looking interrupted state
  (reconciliation refuses to advance state).

## Executable evidence

- Baseline crash harness retained: `forced_termination_does_not_publish_partial_backup_or_commit_partial_restore`
  (real subprocess SIGKILL at `backup` and `restore` crash points via
  `SORNIO_RECOVERY_CRASH_PHASE`/`SORNIO_RECOVERY_CRASH_MARKER`).
- Candidate additions (real subprocess kills at each new phase):
  `crash_after_admission_stays_fenced_and_requires_owner_resolution`,
  `crash_during_drain_stays_fenced`,
  `crash_mid_restore_rolls_back_and_never_looks_completed`,
  `crash_after_restore_commit_is_consistent_and_sessions_invalid`,
  `crash_before_rejection_commit_stays_fenced`.
- Financial verifier runs against the actual post-crash/post-restart database files
  (see financial integrity section of the report).
