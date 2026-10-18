/**
 * Verify the database repairs against a real Postgres engine.
 *
 * The static checks in verify-recovery only read the SQL. This runs it:
 *
 *   1. Loads the schema as it was before the repair (schema.sql cut at the
 *      "Increment 11" marker) and REPRODUCES the membership takeover.
 *   2. Applies the repair migration on the same database.
 *   3. Asserts the takeover is closed, tenants stay isolated, and the atomic
 *      push replaces a business's records all-or-nothing, and refuses an empty
 *      snapshot over a populated business.
 *
 * Engine: PGlite (Postgres compiled to WebAssembly, in-process). Supabase's
 * `auth.uid()` and roles are shimmed; pgcrypto is not in PGlite, and
 * gen_random_uuid() is built into Postgres 13+, so that extension line is skipped.
 *
 *   npm run verify:database
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { PGlite } = await import('@electric-sql/pglite');

const schema = readFileSync(join(root, 'supabase/schema.sql'), 'utf8');
const MARKER = '-- Increment 11 (October 2026)';
const markerAt = schema.indexOf(MARKER);
if (markerAt === -1) throw new Error('schema.sql has no Increment 11 marker; cannot build the pre-repair baseline');
const baseline = schema.slice(0, markerAt).replace(/CREATE EXTENSION[^;]*;/g, '-- extension skipped (PGlite)');
const migration = readFileSync(join(root, 'supabase/migrations/20261019000000_recovery_authorization_and_atomic_sync.sql'), 'utf8');

const SHIM = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;
const GRANTS = `
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
GRANT SELECT ON auth.users TO authenticated;
`;

let passed = 0;
let failed = 0;
const check = (label, cond, detail = '') => {
  if (cond) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
};

const db = new PGlite();
await db.exec(SHIM);
await db.exec(baseline);
await db.exec(GRANTS);
await db.exec(`INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b')`);

const OWNER = '00000000-0000-0000-0000-00000000000a';
const ATTACKER = '00000000-0000-0000-0000-00000000000b';
const BIZ = '11111111-1111-1111-1111-111111111111';

/** Run SQL as an end user, the way PostgREST does: role + JWT subject. */
async function as(user, sql, params = []) {
  await db.exec('BEGIN');
  try {
    await db.exec('SET LOCAL ROLE authenticated');
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [user]);
    const result = await db.query(sql, params);
    await db.exec('COMMIT');
    return { ok: true, rows: result.rows };
  } catch (error) {
    await db.exec('ROLLBACK');
    return { ok: false, error: error.message, code: error.code };
  }
}

const snapshot = (names, { broken = false } = {}) => ({
  categories: [{ id: '22222222-2222-2222-2222-222222222222', name: 'Food' }],
  products: names.map((name, i) => ({
    id: `33333333-3333-3333-3333-33333333333${i}`,
    name,
    item_type: broken && i === names.length - 1 ? 'bogus' : 'product',
    category_id: '22222222-2222-2222-2222-222222222222',
    selling_price: 100,
    cost_price: 60,
    tax_rate: 0,
    current_stock: 5,
    reorder_level: 1,
    active: true,
  })),
  transactions: [
    {
      id: '44444444-4444-4444-4444-444444444444',
      type: 'sale',
      amount: 100,
      account_type: 'revenue',
      direction: 'in',
      notes: 'sale',
      items: [{ productId: '33333333-3333-3333-3333-333333333330', quantity: 1 }],
      created_at: '2026-10-01T12:00:00Z',
    },
  ],
});

console.log('Before the repair (the schema as reviewed):');
const made = await as(OWNER, `INSERT INTO businesses (id, name, owner_id, currency) VALUES ($1, 'Shop A', $2, 'INR')`, [BIZ, OWNER]);
check('owner can provision a business', made.ok, made.error);
const takeover = await as(ATTACKER, `INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'owner')`, [BIZ, ATTACKER]);
check('reproduced: a stranger can seat themselves as owner (the old hole)', takeover.ok, takeover.error);
const leaked = await as(ATTACKER, `SELECT name FROM businesses WHERE id = $1`, [BIZ]);
check('reproduced: that stranger can read the victim business', leaked.ok && leaked.rows.length === 1);
await db.exec(`DELETE FROM business_members WHERE user_id = '${ATTACKER}'`);

console.log('\nApplying the repair migration:');
await db.exec(migration);
await db.exec(GRANTS);
check('migration applies on top of the reviewed schema', true);

console.log('\nAfter the repair — authorization:');
const takeover2 = await as(ATTACKER, `INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'owner')`, [BIZ, ATTACKER]);
check('a stranger can no longer insert a membership row', !takeover2.ok, 'insert still allowed');
const own = await as(OWNER, `SELECT role FROM business_members WHERE business_id = $1`, [BIZ]);
check('the owner still sees their own owner seat (written by the trigger)', own.ok && own.rows[0]?.role === 'owner', JSON.stringify(own));
const leaked2 = await as(ATTACKER, `SELECT name FROM businesses WHERE id = $1`, [BIZ]);
check('a stranger can no longer read the business', leaked2.ok && leaked2.rows.length === 0);
const peek = await as(ATTACKER, `SELECT user_id FROM business_members`);
check('a stranger sees no membership rows of anyone else', peek.ok && peek.rows.every((r) => r.user_id === ATTACKER));
const escalate = await as(OWNER, `UPDATE business_members SET role = 'owner' WHERE business_id = $1 AND user_id = $2`, [BIZ, OWNER]);
const escalated = await db.query(`SELECT role FROM business_members WHERE business_id = $1 AND user_id = $2`, [BIZ, OWNER]);
check('no client can change a role directly', (escalate.ok ? escalate.rows.length === 0 : true) && escalated.rows[0].role === 'owner');

console.log('\nAfter the repair — atomic sync:');
const first = await as(OWNER, `SELECT push_tenant_snapshot($1, $2::jsonb)`, [BIZ, JSON.stringify(snapshot(['Soap', 'Tea']))]);
check('owner push succeeds', first.ok, first.error);
const count = await db.query(`SELECT COUNT(*)::int AS c FROM products WHERE business_id = $1`, [BIZ]);
check('both products stored', count.rows[0].c === 2);
const items = await db.query(`SELECT items FROM transactions WHERE business_id = $1`, [BIZ]);
check('sale line items survive the push', items.rows[0]?.items?.[0]?.quantity === 1, JSON.stringify(items.rows));

const intruder = await as(ATTACKER, `SELECT push_tenant_snapshot($1, $2::jsonb)`, [BIZ, JSON.stringify(snapshot(['Evil']))]);
check('a non-member cannot push into the business', !intruder.ok && intruder.code === '42501', JSON.stringify(intruder));

const wipe = await as(OWNER, `SELECT push_tenant_snapshot($1, $2::jsonb)`, [BIZ, JSON.stringify({})]);
check('an empty snapshot is refused while the cloud has records', !wipe.ok && wipe.code === 'P0001', JSON.stringify(wipe));
const kept = await db.query(`SELECT COUNT(*)::int AS c FROM products WHERE business_id = $1`, [BIZ]);
check('records are intact after the refused wipe', kept.rows[0].c === 2);

const broken = await as(OWNER, `SELECT push_tenant_snapshot($1, $2::jsonb)`, [BIZ, JSON.stringify(snapshot(['Rice', 'Dal', 'Oil'], { broken: true }))]);
check('a push with one invalid row is rejected', !broken.ok);
const names = await db.query(`SELECT name FROM products WHERE business_id = $1 ORDER BY name`, [BIZ]);
check('an interrupted push leaves the previous data intact (all-or-nothing)', names.rows.map((r) => r.name).join() === 'Soap,Tea', JSON.stringify(names.rows));

const replace = await as(OWNER, `SELECT push_tenant_snapshot($1, $2::jsonb)`, [BIZ, JSON.stringify(snapshot(['Rice']))]);
const replaced = await db.query(`SELECT name FROM products WHERE business_id = $1`, [BIZ]);
check('a normal push replaces the catalogue', replace.ok && replaced.rows.length === 1 && replaced.rows[0].name === 'Rice');

await db.close();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
