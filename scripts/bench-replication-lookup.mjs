#!/usr/bin/env node
/**
 * IV2-004 benchmark harness: the durable duplicate-operation lookup.
 *
 * Semantic operation identity is `(business_id, stream, operation_id)` —
 * `restore_generation` is deliberately excluded so a restore's replay is
 * recognised as a duplicate. The physical uniqueness constraint leads with
 * `business_id, restore_generation, ...`, so the shipped lookup cannot use it
 * and PostgreSQL scans + filters instead.
 *
 * This harness measures the shipped query at increasing event counts and
 * compares it with a candidate additive index, including INSERT overhead.
 *
 * Usage:
 *   DATABASE_URL=postgres://… node scripts/bench-replication-lookup.mjs 10000,100000,1000000
 *
 * It creates and drops a scratch schema named `iv2004_bench`; it never touches
 * `native_replication` or any production schema.
 */
import pg from 'pg';

const url = process.env.DATABASE_URL || process.env.SORNIO_PG_URL;
if (!url) {
  console.error('bench-replication-lookup: DATABASE_URL is required.');
  process.exit(2);
}
const SIZES = (process.argv[2] || '10000,100000').split(',').map((n) => Number(n.trim()));
const S = 'iv2004_bench';
const BIZ = 'biz-bench';
const STREAMS = ['billing', 'retail', 'customer', 'inventory'];

const LOOKUP = `
  SELECT e.payload_sha256, a.cursor
  FROM ${S}.events e
  LEFT JOIN ${S}.acks a
    ON a.business_id = e.business_id AND a.restore_generation = e.restore_generation
   AND a.stream = e.stream AND a.operation_id = e.operation_id
  WHERE e.business_id = $1 AND e.stream = $2 AND e.operation_id = $3
  ORDER BY e.event_pk ASC
  LIMIT 1`;

const client = new pg.Client({ connectionString: url });
await client.connect();

const scalar = async (sql, params = []) => (await client.query(sql, params)).rows[0];
const ms = (start) => Number(process.hrtime.bigint() - start) / 1e6;

async function reset() {
  await client.query(`DROP SCHEMA IF EXISTS ${S} CASCADE`);
  await client.query(`CREATE SCHEMA ${S}`);
  // Mirrors the shipped constraint set (schema/20261103000000_native_financial_replication.sql)
  // for the two tables under test.
  await client.query(`CREATE TABLE ${S}.businesses (
    business_id TEXT PRIMARY KEY, business_name TEXT NOT NULL, portal_id TEXT NOT NULL)`);
  await client.query(`CREATE TABLE ${S}.devices (
    device_id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL REFERENCES ${S}.businesses(business_id),
    role TEXT NOT NULL, restore_generation TEXT NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE)`);
  await client.query(`CREATE TABLE ${S}.events (
    event_pk BIGSERIAL PRIMARY KEY,
    business_id TEXT NOT NULL, device_id TEXT NOT NULL,
    restore_generation TEXT NOT NULL, stream TEXT NOT NULL,
    stream_sequence BIGINT NOT NULL, operation_id TEXT NOT NULL,
    event_type TEXT NOT NULL, payload JSONB NOT NULL,
    payload_sha256 TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL,
    UNIQUE (business_id, restore_generation, stream, operation_id),
    UNIQUE (business_id, restore_generation, stream, stream_sequence))`);
  await client.query(`CREATE TABLE ${S}.acks (
    business_id TEXT NOT NULL, restore_generation TEXT NOT NULL,
    stream TEXT NOT NULL, operation_id TEXT NOT NULL, cursor BIGINT NOT NULL,
    PRIMARY KEY (business_id, restore_generation, stream, operation_id))`);
  await client.query(`CREATE TABLE ${S}.writebench (LIKE ${S}.events INCLUDING ALL)`);
  await client.query(`INSERT INTO ${S}.businesses VALUES ($1,'Bench','bench')`, [BIZ]);
}

/** Bulk-load `n` events across 4 streams and 20 restore generations. */
async function load(n) {
  const perStream = Math.ceil(n / STREAMS.length);
  const genSpan = Math.max(1, Math.floor(perStream / 20));
  const started = process.hrtime.bigint();
  for (const stream of STREAMS) {
    const CHUNK = 5000;
    for (let start = 0; start < perStream; start += CHUNK) {
      const end = Math.min(start + CHUNK, perStream);
      const values = [];
      const params = [];
      let p = 1;
      for (let i = start; i < end; i += 1) {
        values.push(
          `($${p++},'device-pub',$${p++},'${stream}',$${p++},$${p++},'invoice.posted','{}'::jsonb,$${p++},now())`,
        );
        params.push(BIZ, `gen-${Math.floor(i / genSpan)}`, i + 1, `${stream}-op-${i}`, 'a'.repeat(64));
      }
      await client.query(
        `INSERT INTO ${S}.events (business_id,device_id,restore_generation,stream,stream_sequence,operation_id,event_type,payload,payload_sha256,occurred_at)
         VALUES ${values.join(',')}`,
        params,
      );
    }
  }
  await client.query(
    `INSERT INTO ${S}.acks (business_id,restore_generation,stream,operation_id,cursor)
     SELECT business_id,restore_generation,stream,operation_id,event_pk FROM ${S}.events`,
  );
  await client.query(`ANALYZE ${S}.events`);
  await client.query(`ANALYZE ${S}.acks`);
  return Math.round(ms(started));
}

async function timed(fn, iterations) {
  await fn(0);
  const started = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) await fn(i + 1);
  return ms(started) / iterations;
}

async function explain(params, analyze) {
  const prefix = analyze ? 'EXPLAIN (ANALYZE, BUFFERS, TIMING)' : 'EXPLAIN (COSTS OFF)';
  const rows = (await client.query(`${prefix} ${LOOKUP}`, params)).rows;
  const text = rows.map((r) => r['QUERY PLAN']).join('\n');
  const exec = /Execution Time: ([0-9.]+) ms/.exec(text);
  return { text, execMs: exec ? Number(exec[1]) : null };
}

async function writeCost() {
  await client.query(`TRUNCATE ${S}.writebench`);
  const started = process.hrtime.bigint();
  for (let i = 0; i < 2000; i += 1) {
    await client.query(
      `INSERT INTO ${S}.writebench (business_id,device_id,restore_generation,stream,stream_sequence,operation_id,event_type,payload,payload_sha256,occurred_at)
       VALUES ($1,'d',$2,'billing',$3,$4,'invoice.posted','{}'::jsonb,$5,now())`,
      [BIZ, `wgen-${i % 50}`, i + 1, `w-op-${i}`, 'b'.repeat(64)],
    );
  }
  return Math.round(ms(started));
}

const results = [];
for (const target of SIZES) {
  await reset();
  const loadMs = await load(target);
  const { n } = await scalar(`SELECT count(*)::int AS n FROM ${S}.events`);
  const dupParams = [BIZ, 'billing', 'billing-op-0'];
  const missParams = [BIZ, 'billing', 'billing-op-does-not-exist'];

  const plainPlan = await explain(dupParams, false);
  const analysed = await explain(dupParams, true);
  const duplicateMs = await timed(async () => { await client.query(LOOKUP, dupParams); }, 200);
  const missMs = await timed(async () => { await client.query(LOOKUP, missParams); }, 200);
  const writeMsBase = await writeCost();

  await client.query(`CREATE INDEX iv2004_identity ON ${S}.events (business_id, stream, operation_id, event_pk)`);
  await client.query(`ANALYZE ${S}.events`);
  const analysedIdx = await explain(dupParams, true);
  const duplicateMsIdx = await timed(async () => { await client.query(LOOKUP, dupParams); }, 200);
  const writeMsIdx = await writeCost();
  const sizes = await scalar(
    `SELECT pg_size_pretty(pg_relation_size('${S}.events')) AS table,
            pg_size_pretty(pg_relation_size('${S}.iv2004_identity')) AS index`,
  );

  results.push({
    events: n,
    loadMs,
    planWithoutIndex: plainPlan.text,
    analysedPlanWithoutIndex: analysed.text,
    explainedExecutionMs: analysed.execMs,
    duplicateLookupMs: +duplicateMs.toFixed(3),
    absentLookupMs: +missMs.toFixed(3),
    planWithIndex: analysedIdx.text,
    duplicateLookupMsWithIndex: +duplicateMsIdx.toFixed(3),
    explainedExecutionMsWithIndex: analysedIdx.execMs,
    write2000RowsMs: { withoutIndex: writeMsBase, withIndex: writeMsIdx },
    bytes: sizes,
  });
}
console.log(JSON.stringify(results, null, 2));
await client.query(`DROP SCHEMA IF EXISTS ${S} CASCADE`);
await client.end();
