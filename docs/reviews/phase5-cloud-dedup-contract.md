# Cloud replication deduplication — semantic contract

**Remediation of P5-ADV-009 and P5-NEW-006 (Phase 5).** Status: in-memory path **FIXED and executable-verified**; durable PostgreSQL path **FIXED and verified on real PostgreSQL 16.2**; operation identity **CORRECTED to `(business_id, stream, operation_id)`** after P5-NEW-006 found that the stream was missing from the in-memory key.

---

## 1. What was compared

| Aspect | In-memory (`ingest.ts`) before | Durable PostgreSQL (`postgres.ts`) before |
|---|---|---|
| Dedup key, **in-memory** | `businessId \| operationId` — cross-generation but **stream-blind** (the P5-NEW-006 defect) | `(business_id, stream, operation_id)` — cross-generation, stream-scoped |
| Dedup lookup, **durable query** | `business_id + stream + operation_id` (already stream-scoped) | unchanged, now matched by the in-memory key |
| Durability constraint, **SQL** | `UNIQUE (business_id, restore_generation, stream, operation_id)` | unchanged — the physical constraint always carried the generation; the *semantic* key never did |
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
* The per-generation **semantic** key in the durable path was the defect (P5-ADV-009): the pre-fix lookup
  matched on `restore_generation`, so replayed snapshot rows were re-projected. The physical `UNIQUE`
  constraint still carries `restore_generation` and is not the defect — it only bounds what one
  generation may write, it does not define business identity.

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

1. **Identity.** An operation is identified by `(business_id, stream, operation_id)`. `restore_generation` is **not** part of identity.
   * `stream` **is** part of identity because one native commit legitimately emits the same `operationId` on several streams: a desktop retail sale writes `local_retail_outbox` (`stream='retail'`) and `local_billing_outbox` (`stream='billing'`) under one `operationId` (`CheckoutPanel.tsx`, `payments.rs::post_retail`, `replication_matrix_tests.rs`). The native outbox export proves it: `bill-cash-upi` appears as billing seq 5 **and** retail seq 3.
   * Keying only on `(business_id, operation_id)` — the pre-P5-NEW-006 in-memory key (P5-ADV-009) — rejected the second envelope of **every** real retail sale with `CONFLICT` and let `hydrateFromPostgres` overwrite one stream's entry with another's. The durable schema already scoped identity with the stream (`UNIQUE (business_id, restore_generation, stream, operation_id)`), so the in-memory key was the defect, not the SQL.
2. **Generation fence.** An envelope whose `restoreGeneration` differs from the enrolled publisher's is rejected `STALE_GENERATION`.
3. **Dedup is cross-generation.** A known operation is never re-projected, in any generation.
4. **Conflict.** Reusing a known `operation_id` with a different `payloadSha256` is rejected `CONFLICT`.
5. **Ordering advances on replay.** If a duplicate arrives at exactly `last + 1` for its `(business, generation, stream)`, the head advances. This is what makes the first new post-restore operation publishable.
6. **Retry stays idempotent.** A duplicate at an already-seen sequence leaves the head untouched and returns `duplicate: true` with the **original cursor**. It must not raise `DUPLICATE_SEQUENCE`.
7. **Cursor is business-scoped.** The returned cursor is the original projection cursor (`projection_cursor` is keyed by `business_id`), so it is valid across generations.
8. **Acks are per-generation bookkeeping.** A duplicate is also acked against the current generation, pointing at the same cursor, so the current publisher's ack history is complete.
9. **New operations still require strict contiguity.** A non-duplicate must be exactly `last + 1`, else `GAP` / `DUPLICATE_SEQUENCE`.

## 5. Implementation

* `packages/replication-cloud/src/store.ts` — `CloudStore.operationKey(businessId, stream, operationId)` is the single source of the identity string; `clone()` rebuilds `byOperation` from the copy's own event log with that key.
* `packages/replication-cloud/src/ingest.ts` — duplicate lookup and insert both use `store.operationKey(...)`; sequence/head are computed before the duplicate branch; a duplicate at `last + 1` advances the head via the same clone/adopt transaction used for normal ingest.
* `packages/replication-cloud/src/postgres.ts` — the duplicate lookup drops `restore_generation` and selects the **earliest** event (`ORDER BY e.event_pk ASC LIMIT 1`); on a duplicate it advances the current generation's head when contiguous (`FOR UPDATE`) and inserts a per-generation ack row `ON CONFLICT DO NOTHING`.

## 6. Verification status

| Item | Status | Evidence |
|---|---|---|
| Contract checks 1–9 (in-memory) | **FIXED — executable-verified** | `node scripts/verify-replication.mjs` → 139 checks passed, exit 0 |
| Shared-`operationId` across `retail` + `billing` (P5-NEW-006) | **FIXED — executable-verified, before/after** | `p5-new-006-probe-before.txt` (candidate: `CONFLICT`) vs `p5-new-006-probe-after.txt` (accepted, distinct cursors, retries idempotent) |
| Durable PostgreSQL runtime | **VERIFIED on real PostgreSQL 16.2** | `verify:replication-postgres` → 79 checks passed; `p5-new-006-postgres-after.txt` |
| Native SQLCipher TEXT → TLS → PostgreSQL | **VERIFIED on real PostgreSQL 16.2** | `verify:replication-native-https` → 123 checks passed |
| Durable hydration of a shared operation id | **FIXED — verified, before/after** | `p5-new-006-postgres-hydrate-before.txt` (candidate: "restart hydrate keeps both stream identities…" fails) vs `p5-new-006-postgres-after.txt` |
| Migration re-run safety (P5-NEW-005) | **FIXED — verified on real PostgreSQL 16.2** | three consecutive applies succeed; candidate failed round 2 with `42P07 relation "businesses" already exists` (`p5-new-005-migration-idempotency-{before,after}.txt`) |
| TypeScript strict compilation | **executed** | `npm run typecheck` (tsc 6.0.3) and `npm run typecheck:native` (tsgo 7.0.2), both exit 0 |
