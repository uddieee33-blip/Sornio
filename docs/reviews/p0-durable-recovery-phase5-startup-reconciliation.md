# P0 Durable Recovery — Phase 5 Startup Reconciliation Matrix

Fail-closed reconciliation runs in `Store::open` **after** the v13 migration tx and
**before** the store is returned. It never advances a recovery state, never deletes
ambiguous rows, and never interprets ambiguity as success. The only automatic write it
may perform is **re-fencing** (T7): restoring the fail-closed barrier for a non-terminal
operation whose fence row is missing — containment, not cleanup — and it is audited.

## Decision matrix

| # | Observed condition | Classification | Action at startup | Business writes | Recovery admission | Resolution path |
|---|---|---|---|---|---|---|
| 1 | No operations, no fence, known audit actions | clean | none | allowed | allowed | — |
| 2 | One non-terminal operation (`admitted`/`quiescing`) + matching fence | interrupted recovery (crash survivor) | none (already contained) | **barred by fence triggers** | refused: `RecoveryInterrupted` | Owner `resolve_interrupted_recovery` (TX-I) or a fresh restore after resolution |
| 3 | One non-terminal operation, fence missing | containment gap (tamper/corruption survivor) | **T7 re-fence** + `recovery.reconciled_fence` audit | barred after re-fence | refused: `RecoveryInterrupted` | same as 2 |
| 4 | Fence references a terminal operation | impossible via API; corruption | refuse open: `RecoveryCorrupt` | impossible (no store) | impossible | manual forensic review; keep files |
| 5 | Fence references missing operation | FK violation; corruption | refuse open: `RecoveryCorrupt` | impossible | impossible | manual review |
| 6 | Two or more non-terminal operations | impossible via API; corruption | refuse open: `RecoveryCorrupt` | impossible | impossible | manual review |
| 7 | Operation `business_id` ≠ live `local_recovery_identity.business_id` | identity substitution | refuse open: `RecoveryCorrupt` | impossible | impossible | manual review |
| 8 | Unknown action in `local_recovery_audit` | tamper / newer-era writer | refuse open: `RecoveryCorrupt` | impossible | impossible | manual review |
| 9 | `completed` operation with NULL `result_generation` | invalid terminal state | refuse open: `RecoveryCorrupt` | impossible | impossible | manual review |
| 10 | `completed` operation whose `result_generation` ≠ live generation, with a later `restore_committed` audit | stale epoch (normal after later restores) | none — history | allowed | allowed | — (historical record) |
| 11 | Recovery tables missing after migration | corruption | refuse open: `RecoveryCorrupt` | impossible | impossible | manual review |
| 12 | Legacy (pre-v13) `backup_prepared`/`backup_exported`/`restore_committed` audits, no operation rows | legacy history | none | allowed | allowed | — (cannot retro-fabricate ownership records; documented limitation) |
| 13 | Orphan `backup_prepared` without `backup_exported` (crash during export) | known attempt history | none | allowed | allowed | — (never a success signal) |
| 14 | Interrupted publisher draining (fence active, publisher processes restart) | same as 2/3 | none / T7 | barred | refused | TX-I; publishers abort at first per-row fence check |
| 15 | Inconsistent financial metadata (deep invariants) | **not checked at startup** (cost); structural `integrity_check` runs inside TX-R | — | — | — | covered by the test-only financial verifier and restore-time structural checks; documented limitation |

## Known audit actions (v13)

Legacy: `backup_prepared`, `backup_exported`, `restore_committed`.
Candidate: `recovery.admitted`, `recovery.quiescing`, `recovery.executing`,
`recovery.verifying`, `recovery.completed`, `recovery.rejected`,
`recovery.interrupted`, `recovery.reconciled_fence`, `recovery.imported_interrupted`.
Anything else ⇒ row 8 (fail closed). The set is a constant in `recovery.rs`; adding an
action requires a schema-era change, never a silent acceptance.

## Authentication during containment

`workspace_access` (login/rate-limit counters) and `local_identity_audit` are exempt
from the barrier so the Owner can authenticate and resolve row 2/3. Business state
tables remain barred; `identity::verify` still enforces scope/generation/role. A
non-owner can never resolve an interruption (`Permission::Settings` is Owner-only).

## What startup must never do (and does not)

- mark a non-terminal operation `completed` (no edge, no code path);
- delete or rewrite operation/audit history (DELETE triggers; reconciler only INSERTs
  a fence and an audit row);
- release a fence for a non-terminal operation (DELETE trigger requires terminal);
- adopt a crashed owner's token or resume its restore (resolution is terminal-only,
  explicit, and audited; a new restore requires a fresh admission);
- treat a missing fence as "recovery finished" (row 3 re-fences instead).

## Executable evidence

`startup_reconciliation_matrix` (candidate test): constructs each reachable condition
in a real database file (including raw-SQL tamper for the impossible-via-API rows),
reopens with `Store::open`, and asserts the exact outcome: contained open + barred
writes + refused admission, or `RecoveryCorrupt`, plus audit immutability throughout.
