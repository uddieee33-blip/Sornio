# Cloud replication deduplication — semantic contract

**Remediation of P5-ADV-009 (Phase 5).** Status: in-memory path **FIXED and executable-verified**; durable PostgreSQL path **FIXED — runtime BLOCKED** (no PostgreSQL available in this environment).

---

## 1. What was compared

| Aspect | In-memory (`ingest.ts`) before | Durable PostgreSQL (`postgres.ts`) before |
|---|---|---|
| Dedup key | `businessId \| operationId` (**cross-generation**) | `(business_id, restore_generation, stream, operation_id)` (**per-generation**) |
| Restore-generation check | `envelope.restoreGeneration !== publisher.restoreGeneration` → `STALE_GENERATION` | same |
| Operation identity | client-generated business operation id | same |
| Payload reuse | `payloadSha256` mismatch → `CONFLICT` | same |
| Stream ordering | per-`(business, generation, stream)` head, `sequence == last + 1` | same, `FOR UPDATE` |
| Retry of seen sequence | duplicate check ran **first** → idempotent | duplicate check ran first → idempotent |
| Cursor scope | business-scoped | `projection_cursor` keyed by `business_id` only |
| Projection | `projectEvent` on a cloned store, adopted atomically | full rebuild from hydrated state; `bumpCustomer` **applies a delta** |

The two paths disagreed on the single most important question: **is a restore generation part of business identity?**

## 2. Verdict: cross-generation dedup is intentional and required

A restore generation is a **transport epoch**, not part of business identity. `operationId` identifies a business operation (an invoice, a credit entry). After a restore, the local outbox is restored from the snapshot and the publisher's sidecar resets, so the *same* business operations are legitimately re-sent under a new generation.

Therefore:

* Dedup **must** be cross-generation. Otherwise the same credit entry is projected twice, and because `bumpCustomer` *applies a delta* rather than recomputing a balance, customer outstanding would be **double-counted**.
* The per-generation key in the durable path was the **defect**.

## 3. Second defect found while establishing the contract

The in-memory path had the right dedup scope but the wrong ordering behaviour: it returned early for a duplicate **without advancing the new generation's stream head**. After a restore, the replayed snapshot rows are all duplicates, so the head stayed at `0` and the **first genuinely new sale** was rejected with `GAP` — permanently unpublishable.

Reproduced before the fix (`phase5-remediation-evidence/rule5-probe-before.txt`):

```
gen-2 billing seq1 (bill-1) => {"duplicate":true}
gen-2 billing seq2 (bill-2, duplicate) => {"duplicate":true}
gen-2 billing seq3 (bill-3-NEW) => ERROR GAP - Stream sequence skipped a gap.
```

After the fix (`rule5-probe-after.txt`):

```
gen-2 billing seq3 (bill-3-NEW) => {"operationId":"bill-3-NEW","cursor":"6","duplicate":false}
gen-2 outstanding: 5000
OUTSTANDING_PRESERVED: true
```

## 4. The contract (both paths must satisfy all of it)

1. **Identity.** An operation is identified by `(business_id, operation_id)`. `restore_generation` is **not** part of identity.
2. **Generation fence.** An envelope whose `restoreGeneration` differs from the enrolled publisher's is rejected `STALE_GENERATION`.
3. **Dedup is cross-generation.** A known operation is never re-projected, in any generation.
4. **Conflict.** Reusing a known `operation_id` with a different `payloadSha256` is rejected `CONFLICT`.
5. **Ordering advances on replay.** If a duplicate arrives at exactly `last + 1` for its `(business, generation, stream)`, the head advances. This is what makes the first new post-restore operation publishable.
6. **Retry stays idempotent.** A duplicate at an already-seen sequence leaves the head untouched and returns `duplicate: true` with the **original cursor**. It must not raise `DUPLICATE_SEQUENCE`.
7. **Cursor is business-scoped.** The returned cursor is the original projection cursor (`projection_cursor` is keyed by `business_id`), so it is valid across generations.
8. **Acks are per-generation bookkeeping.** A duplicate is also acked against the current generation, pointing at the same cursor, so the current publisher's ack history is complete.
9. **New operations still require strict contiguity.** A non-duplicate must be exactly `last + 1`, else `GAP` / `DUPLICATE_SEQUENCE`.

## 5. Implementation

* `packages/replication-cloud/src/ingest.ts` — sequence/head are computed before the duplicate branch; a duplicate at `last + 1` advances the head via the same clone/adopt transaction used for normal ingest.
* `packages/replication-cloud/src/postgres.ts` — the duplicate lookup drops `restore_generation` and selects the **earliest** event (`ORDER BY e.event_pk ASC LIMIT 1`); on a duplicate it advances the current generation's head when contiguous (`FOR UPDATE`) and inserts a per-generation ack row `ON CONFLICT DO NOTHING`.

## 6. Verification status

| Item | Status | Evidence |
|---|---|---|
| Contract checks 1–7, 9 (in-memory) | **FIXED — executable-verified** | `node scripts/verify-replication.mjs` → 129 checks passed, exit 0 |
| Before/after behavioural probe | **executed** | `rule5-probe-before.txt`, `rule5-probe-after.txt` |
| TypeScript strict compilation | **executed** | `tsc 6.0.3 --strict`, exit 0 |
| Durable PostgreSQL runtime | **BLOCKED** | No `postgres`/`initdb`/`psql` binaries, no server, no container runtime in this environment |
| Postgres dedup key shape | source-level governance assertion only | harness check "durable Postgres dedup is keyed by business and operation, not restore generation" |

**No PostgreSQL runtime behaviour is claimed.** TypeScript compilation is not evidence of durable-path correctness. The SQL change must be re-verified against a real disposable PostgreSQL instance (ingest → restore → replay → new operation, asserting no double-counted outstanding and no `GAP`) before release.
