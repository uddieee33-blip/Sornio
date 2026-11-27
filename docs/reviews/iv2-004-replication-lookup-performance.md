# IV2-004 — durable duplicate-operation lookup: plan, benchmark and index decision

| Field | Value |
|---|---|
| Finding | IV2-004 (raised by the Phase 5 acceptance review, severity Info) |
| Status | **RESOLVED — additive index added and measured** |
| Branch | `arena/475a4866-sornio` |
| Server | PostgreSQL **16.2**, `pgserver` install, port 55432, this sandbox |
| Client | Node 22.22.3, `pg` driver |
| Harnesses | `scripts/bench-replication-lookup.mjs`, `scripts/bench-replication-index-variants.mjs` |
| Raw results | `docs/reviews/iv2-004-benchmark-results.json` |

## 1. The problem, stated precisely

Operation identity is **semantic**: `(business_id, stream, operation_id)`.
`restore_generation` is deliberately **not** part of it, because a restore replays the same operations
under a new transport epoch and those replays must be recognised as duplicates rather than re-projected
(projecting them again double-counts customer credit, because `bumpCustomer` applies a delta).

The physical constraints are:

```sql
UNIQUE (business_id, restore_generation, stream, operation_id)
UNIQUE (business_id, restore_generation, stream, stream_sequence)
PRIMARY KEY (business_id, restore_generation, stream, operation_id)   -- on acks
```

Both `events` indexes lead with `business_id, restore_generation`. The duplicate lookup omits
`restore_generation` on purpose, so **neither unique index can serve it**. PostgreSQL falls back to a
scan of `events` filtered on `business_id + stream + operation_id`.

## 2. Measured before the index

`EXPLAIN (ANALYZE, BUFFERS)` on the shipped query, warm cache, whole-schema load:

| Events | Plan | Execution | Lookup avg (200 iterations) |
|---|---|---|---|
| 10,000 | Seq Scan, 9,999 rows removed by filter | 1.32 ms | 1.36 ms |
| 100,000 | Seq Scan, 99,999 rows removed | 11.86 ms | 12.45 ms |
| 1,000,000 | Seq Scan, 999,999 rows removed | 71.34 ms | 67.25 ms |

This is linear in table size and it is paid **on every envelope**, including the common
non-duplicate case, because the duplicate check runs before the insert.

Why 1M is reachable: `ingestDurable` sits on the checkout → cloud path, one event per outbox row across
four streams. A busy shop produces thousands per day; nothing prunes the table today, so growth is
unbounded. The pathological case is not the average shop day but a large or long-lived deployment and
a retry storm, where every retried envelope costs a full scan inside the ingest transaction while it
holds `FOR UPDATE` locks on business, device and stream head.

## 3. What must not change

Every candidate design was rejected unless it preserved all of these, which the existing suites assert:

1. Cross-generation deduplication (a replayed snapshot row is a duplicate).
2. Stream-scoped identity (a retail and a billing envelope of one sale are distinct).
3. Original cursor returned on a duplicate retry.
4. Payload-conflict detection (`payloadSha256` mismatch → `CONFLICT`).
5. Transaction atomicity of the ingest.
6. Strict sequence ordering (`last + 1`, else `GAP` / `DUPLICATE_SEQUENCE`).

**Semantic identity was not changed to gain index usage.** That option (keying on
`(business_id, stream, operation_id)` in SQL by dropping the generation from the constraint) would
break cross-generation dedup and was never on the table.

## 4. Candidate index designs, all measured at 200,000 events

Built on a scratch schema with the shipped constraint set. Read timings are the median of 5
`EXPLAIN ANALYZE` runs; write timings are the median of 3 × 20,000-row single-transaction inserts.

| Index | Duplicate lookup | Older-generation lookup | 20k-row insert | Index size |
|---|---|---|---|---|
| **none (current)** | 16.46 ms | 16.93 ms | 150 ms | – |
| `(business_id, stream, operation_id)` | 0.036 ms | 0.023 ms | 147 ms | 11 MB |
| **`(business_id, stream, operation_id, event_pk)`** | **0.022 ms** | **0.021 ms** | **145 ms** | 13 MB |
| `… ) INCLUDE (event_pk)` | 0.028 ms | 0.025 ms | 146 ms | 13 MB |
| `… ) INCLUDE (event_pk, payload_sha256)` | 0.025 ms | 0.027 ms | 147 ms | 29 MB |

Observations that drove the choice:

* **794× on the duplicate path, 806× on an older generation.** The improvement is not specific to the
  newest generation, which matters because a restore replays old operations.
* **`event_pk` as the fourth key column beats `INCLUDE`.** The query is
  `ORDER BY e.event_pk ASC LIMIT 1` ("earliest event wins"); with `event_pk` in the key the sort is
  satisfied by index order, so the plan loses the `Sort` node entirely.
* **Write overhead is not measurable at this scale**: 145–150 ms for 20k rows across all variants,
  i.e. inside run-to-run noise. The index is not free on disk (13 MB per 200k events, ≈ 32 % of the
  table) and that is stated rather than hidden.
* `INCLUDE (payload_sha256)` would allow an index-only scan but costs 29 MB and buys 0.003 ms. Rejected
  as redundant — the join to `acks` is a primary-key lookup either way.

## 5. Decision

```sql
CREATE INDEX IF NOT EXISTS events_operation_identity
  ON native_replication.events (business_id, stream, operation_id, event_pk);
```

Added **additively** to `packages/replication-cloud/sql/20261103000000_native_financial_replication.sql`.
No table, constraint, predicate, policy or identity changes.

## 6. Effect on the shipped query

| Events | Before | After | Speedup |
|---|---|---|---|
| 10,000 | 1.32 ms | 0.051 ms | 26× |
| 100,000 | 11.86 ms | 0.057 ms | 208× |
| 1,000,000 | 71.34 ms | **0.092 ms** | **775×** |

After the index the plan is flat: `Index Scan using events_operation_identity`, ~2–4 buffers, no sort
node. On the live schema (13 rows) the planner picks the same index, confirming it is used and not
merely present.

## 7. Migration safety

The file is the schema and is re-runnable; it is applied via `applyReplicationMigration`.

| Check | Result |
|---|---|
| Three consecutive applies from empty | `{tables:11, policies:7, rls:8, idx:15, view:1}` stable each round |
| Apply over a schema built by the previous file (pre-index) | OK, index added, `idx` 14 → 15 |
| **Upgrade with a row already present** | OK, the pre-existing event survived (count 1 before and after) |
| Re-apply after upgrade (rerun) | OK, index count unchanged at 15 |
| Rollback (`DROP INDEX`) | OK, `idx` 15 → 14, rows intact; the lookup simply reverts to the old plan |
| Re-apply after rollback | OK, index restored |
| Failure behaviour | `CREATE INDEX IF NOT EXISTS` is a no-op when present; the only failure mode is a lock timeout during build on a very large table, which leaves no index and no partial state |

**Rollout note for a large production table:** `CREATE INDEX` takes a lock that blocks writes for its
duration. At 1M events the build took a few seconds here, but on a much larger table use
`CREATE INDEX CONCURRENTLY` manually (it cannot run inside a transaction, so it is deliberately *not*
in the migration file).

## 8. Residual limitation

This is a benchmark on a laptop-class sandbox with a warm cache, synthetic rows and a single client.
It is representative of plan shape and relative cost, not of absolute production latency. The
concurrent-ingest path is covered functionally (79 → 100 checks in the first pass, 139 in the second
hardening pass, including a three-connection rotation race), not under production load.

The plan shape is no longer evidenced only by this document: `verify:replication-postgres` asserts
the index identity, the plan that uses it, the degradation when it is dropped inside a rolled-back
transaction, and its restoration by re-applying the migration. See
`docs/reviews/iv2-evidence/iv2-004-migration.txt`. The numbers here remain the recorded measurement;
the gate is the plan, not the stopwatch.
