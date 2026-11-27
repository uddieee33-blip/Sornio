#!/usr/bin/env node
/**
 * IV2-004 follow-up: index-variant selection and write-overhead measurement.
 *
 * Compares the shipped lookup against three candidate index shapes at a fixed
 * event count, using:
 *  - repeated write benchmarks (bulk COPY inside one transaction) so the
 *    measurement is dominated by index maintenance, not client round-trips;
 *  - 5 timed repetitions per read benchmark, reporting the median.
 *
 * Usage: DATABASE_URL=… node scripts/bench-replication-index-variants.mjs [events]
 */
import pg from 'pg';

const url = process.env.DATABASE_URL || process.env.SORNIO_PG_URL;
if (!url) {
  console.error('bench-replication-index-variants: DATABASE_URL is required.');
  process.exit(2);
}
const TARGET = Number(process.argv[2] || 200000);
const S = 'iv2004_variants';
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

const VARIANTS = [
  { name: 'none', ddl: null },
  {
    name: 'identity_only',
    ddl: `CREATE INDEX v_identity ON ${S}.events (business_id, stream, operation_id)`,
  },
  {
    name: 'identity_with_pk',
    ddl: `CREATE INDEX v_identity ON ${S}.events (business_id, stream, operation_id, event_pk)`,
  },
  {
    name: 'identity_include_pk',
    ddl: `CREATE INDEX v_identity ON ${S}.events (business_id, stream, operation_id) INCLUDE (event_pk)`,
  },
  {
    name: 'identity_include_payload',
    ddl: `CREATE INDEX v_identity ON ${S}.events (business_id, stream, operation_id)
          INCLUDE (event_pk, payload_sha256)`,
  },
];

const client = new pg.Client({ connectionString: url });
await client.connect();
const ms = (t) => Number(process.hrtime.bigint() - t) / 1e6;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function reset() {
  await client.query(`DROP SCHEMA IF EXISTS ${S} CASCADE`);
  await client.query(`CREATE SCHEMA ${S}`);
  await client.query(`CREATE TABLE ${S}.businesses (business_id TEXT PRIMARY KEY,
    business_name TEXT NOT NULL, portal_id TEXT NOT NULL)`);
  await client.query(`CREATE TABLE ${S}.events (
    event_pk BIGSERIAL PRIMARY KEY, business_id TEXT NOT NULL, device_id TEXT NOT NULL,
    restore_generation TEXT NOT NULL, stream TEXT NOT NULL, stream_sequence BIGINT NOT NULL,
    operation_id TEXT NOT NULL, event_type TEXT NOT NULL, payload JSONB NOT NULL,
    payload_sha256 TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL,
    UNIQUE (business_id, restore_generation, stream, operation_id),
    UNIQUE (business_id, restore_generation, stream, stream_sequence))`);
  await client.query(`CREATE TABLE ${S}.acks (business_id TEXT NOT NULL,
    restore_generation TEXT NOT NULL, stream TEXT NOT NULL, operation_id TEXT NOT NULL,
    cursor BIGINT NOT NULL, PRIMARY KEY (business_id, restore_generation, stream, operation_id))`);
  await client.query(`CREATE TABLE ${S}.writebench (LIKE ${S}.events INCLUDING ALL)`);
  await client.query(`INSERT INTO ${S}.businesses VALUES ($1,'Bench','bench')`, [BIZ]);
}

async function load(n) {
  const perStream = Math.ceil(n / STREAMS.length);
  const genSpan = Math.max(1, Math.floor(perStream / 20));
  for (const stream of STREAMS) {
    for (let start = 0; start < perStream; start += 5000) {
      const end = Math.min(start + 5000, perStream);
      const values = [];
      const params = [];
      let p = 1;
      for (let i = start; i < end; i += 1) {
        values.push(`($${p++},'device-pub',$${p++},'${stream}',$${p++},$${p++},'invoice.posted','{}'::jsonb,$${p++},now())`);
        params.push(BIZ, `gen-${Math.floor(i / genSpan)}`, i + 1, `${stream}-op-${i}`, 'a'.repeat(64));
      }
      await client.query(
        `INSERT INTO ${S}.events (business_id,device_id,restore_generation,stream,stream_sequence,operation_id,event_type,payload,payload_sha256,occurred_at)
         VALUES ${values.join(',')}`, params);
    }
  }
  await client.query(`INSERT INTO ${S}.acks (business_id,restore_generation,stream,operation_id,cursor)
    SELECT business_id,restore_generation,stream,operation_id,event_pk FROM ${S}.events`);
  await client.query(`ANALYZE ${S}.events`);
  await client.query(`ANALYZE ${S}.acks`);
}

/**
 * Write cost under one index variant: insert N rows across 50 generations in a
 * single transaction using a generate_series-driven INSERT … SELECT, which
 * removes client round-trip time from the measurement. Repeated and medianed.
 */
async function writeCost(rows = 20000, reps = 3) {
  const times = [];
  for (let r = 0; r < reps; r += 1) {
    await client.query('BEGIN');
    await client.query(`TRUNCATE ${S}.writebench`);
    const started = process.hrtime.bigint();
    await client.query(
      `INSERT INTO ${S}.writebench (business_id,device_id,restore_generation,stream,stream_sequence,operation_id,event_type,payload,payload_sha256,occurred_at)
       SELECT $1,'d','wgen-'||(g % 50),'billing',g,'w-op-'||g,'invoice.posted','{}'::jsonb,$2,now()
       FROM generate_series(1, $3) AS g`, [BIZ, 'b'.repeat(64), rows]);
    times.push(ms(started));
    await client.query('ROLLBACK');
  }
  return { medianMs: Math.round(median(times)), runs: times.map((t) => Math.round(t)) };
}

async function readBench(params, reps = 5) {
  const times = [];
  const plans = [];
  for (let r = 0; r < reps; r += 1) {
    const rows = (await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, TIMING) ${LOOKUP}`, params)).rows;
    const text = rows.map((x) => x['QUERY PLAN']).join('\n');
    const exec = /Execution Time: ([0-9.]+) ms/.exec(text);
    times.push(Number(exec[1]));
    if (r === 0) plans.push(text);
  }
  return { medianExecutionMs: +median(times).toFixed(4), runs: times.map((t) => +t.toFixed(3)), plan: plans[0] };
}

await reset();
await load(TARGET);
const { rows: [{ n }] } = await client.query(`SELECT count(*)::int AS n FROM ${S}.events`);
const dupParams = [BIZ, 'billing', 'billing-op-0'];
const genParams = [BIZ, 'billing', `billing-op-${Math.floor(TARGET / 4 / 20)}`]; // older generation id

const out = { events: n, variants: [] };
for (const variant of VARIANTS) {
  if (variant.ddl) {
    await client.query(`DROP INDEX IF EXISTS ${S}.v_identity`);
    await client.query(variant.ddl);
    await client.query(`ANALYZE ${S}.events`);
  }
  const dup = await readBench(dupParams);
  const cross = await readBench(genParams);
  const write = await writeCost();
  const { rows: [size] } = await client.query(
    `SELECT pg_size_pretty(pg_relation_size('${S}.events')) AS table,
            COALESCE(pg_size_pretty(pg_relation_size(to_regclass('${S}.v_identity'))),'-') AS index`,
  );
  out.variants.push({
    variant: variant.name,
    duplicateLookup: dup,
    olderGenerationLookup: cross,
    writeInsert20000Rows: write,
    size,
  });
}
console.log(JSON.stringify(out, null, 2));
await client.query(`DROP SCHEMA IF EXISTS ${S} CASCADE`);
await client.end();
