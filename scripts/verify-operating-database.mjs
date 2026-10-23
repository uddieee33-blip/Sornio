/**
 * Verify the database repairs against a real Postgres engine.
 *
 * The static checks in verify-recovery only read the SQL. This file runs it:
 *
 *   1. Loads the schema as it was reviewed (schema.sql cut at the "Increment 11"
 *      marker) and reproduces the membership takeover.
 *   2. Applies the repair migration to the same database.
 *   3. Asserts, role by role, what each member may and may not do, that two
 *      offline devices never lose each other's sales, that one tenant can never
 *      overwrite another's rows, that the ledger is append-only, and that the
 *      owner's reset is the only way records are removed.
 *
 * Engine: PGlite (Postgres compiled to WebAssembly, in-process). Supabase's
 * `auth.uid()` and the roles are shimmed; pgcrypto is not in PGlite, and
 * gen_random_uuid() is built into Postgres 13+, so that extension line is skipped.
 *
 *   npm run verify:database
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { PGlite } = await import('@electric-sql/pglite');

const schema = readFileSync(join(root, 'supabase/schema.sql'), 'utf8');
const MARKER = '-- Increment 11 (October 2026)';
const markerAt = schema.indexOf(MARKER);
if (markerAt === -1) throw new Error('schema.sql has no Increment 11 marker; cannot build the reviewed baseline');
const baseline = schema.slice(0, markerAt).replace(/CREATE EXTENSION[^;]*;/g, '-- extension skipped (PGlite)');
const migration = readFileSync(
  join(root, 'supabase/migrations/20261019000000_recovery_authorization_and_atomic_sync.sql'),
  'utf8',
);

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

const USERS = {
  owner: '00000000-0000-0000-0000-00000000000a',
  attacker: '00000000-0000-0000-0000-00000000000b',
  manager: '00000000-0000-0000-0000-00000000000c',
  staff: '00000000-0000-0000-0000-00000000000d',
  accountant: '00000000-0000-0000-0000-00000000000e',
  viewer: '00000000-0000-0000-0000-00000000000f',
  staff2: '00000000-0000-0000-0000-000000000010',
};
for (const id of Object.values(USERS)) await db.query('INSERT INTO auth.users VALUES ($1)', [id]);

/** Deterministic uuid for a readable label (the client uses uuids for every row id). */
const uuidFor = (label) => {
  const hex = createHash('md5').update(label).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const BIZ = '11111111-1111-1111-1111-111111111111';
const BIZ_ATTACKER = '99999999-9999-9999-9999-999999999999';
const P_SOAP = '33333333-3333-3333-3333-333333333330';
const P_TEA = '33333333-3333-3333-3333-333333333331';
const CAT = '22222222-2222-2222-2222-222222222222';

/** Run SQL as an end user, the way PostgREST does: role + JWT subject. */
async function as(user, sql, params = []) {
  await db.exec('BEGIN');
  try {
    await db.exec('SET LOCAL ROLE authenticated');
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [user]);
    const result = await db.query(sql, params);
    await db.exec('COMMIT');
    return {
      ok: true,
      rows: result.rows,
      affected: result.affectedRows ?? result.rows.length,
    };
  } catch (error) {
    await db.exec('ROLLBACK');
    return { ok: false, error: error.message, code: error.code };
  }
}

/** Seat a member the way the team API does: with the service role, not the client. */
async function seat(user, bizId, role) {
  await db.query(`INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, $3)`, [bizId, user, role]);
}

const count = async (table, where = '1=1', params = []) =>
  (await db.query(`SELECT COUNT(*)::int AS c FROM ${table} WHERE ${where}`, params)).rows[0].c;

/** A full device snapshot. Movements are the ledger; product stock is the device's view. */
function snapshot({
  products = [],
  movements = [],
  transactions = [],
  customers = [],
  settings,
  businessName,
  audit = [],
} = {}) {
  return {
    businessName,
    settings,
    categories: [{ id: CAT, name: 'Food' }],
    products,
    customers,
    transactions,
    stockMovements: movements,
    scanEvents: [],
    audit,
    campaigns: [],
    biometricCredentials: [],
  };
}
const soap = (stock = 5) => ({
  id: P_SOAP,
  name: 'Soap',
  item_type: 'product',
  category_id: CAT,
  selling_price: 100,
  cost_price: 60,
  tax_rate: 0,
  current_stock: stock,
  reorder_level: 1,
  active: true,
});
const tea = () => ({
  id: P_TEA,
  name: 'Tea',
  item_type: 'product',
  category_id: CAT,
  selling_price: 120,
  cost_price: 56,
  tax_rate: 0,
  current_stock: 3,
  reorder_level: 1,
  active: true,
});
const move = (id, delta, balance, productId = P_SOAP) => ({
  id: uuidFor(id),
  product_id: productId,
  movement_type: delta > 0 ? 'opening' : 'sale',
  quantity: Math.abs(delta),
  delta,
  balance_after: balance,
  movement_key: id,
  notes: 'ledger line',
  created_at: '2026-10-01T10:00:00Z',
});
const sale = (id, amount = 100) => ({
  id,
  type: 'sale',
  amount,
  account_type: 'revenue',
  direction: 'in',
  notes: 'sale',
  items: [{ productId: P_SOAP, quantity: 1 }],
  created_at: '2026-10-01T12:00:00Z',
});
const push = (user, bizId, snap) =>
  as(user, `SELECT sync_tenant_snapshot($1, $2::jsonb)`, [bizId, JSON.stringify(snap)]);

// ----------------------------------------------------------------- before
console.log('Before the repair (the schema as reviewed):');
const made = await as(
  USERS.owner,
  `INSERT INTO businesses (id, name, owner_id, currency) VALUES ($1, 'Shop A', $2, 'INR')`,
  [BIZ, USERS.owner],
);
check('owner can provision a business', made.ok, made.error);
const takeover = await as(
  USERS.attacker,
  `INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'owner')`,
  [BIZ, USERS.attacker],
);
check('reproduced: a stranger can seat themselves as owner (the old hole)', takeover.ok, takeover.error);
const leaked = await as(USERS.attacker, `SELECT name FROM businesses WHERE id = $1`, [BIZ]);
check('reproduced: that stranger can read the victim business', leaked.ok && leaked.rows.length === 1);
await db.query(`DELETE FROM business_members WHERE user_id = $1`, [USERS.attacker]);

// ------------------------------------------------------------- migration
console.log('\nApplying the repair migration:');
await db.exec(migration);
await db.exec(readFileSync(join(root, 'supabase/migrations/20261021174000_operating_record_reliability.sql'), 'utf8'));
await db.exec(GRANTS);
await db.exec('REVOKE INSERT,UPDATE,DELETE ON operating_records FROM anon,authenticated');
check('migration applies on top of the reviewed schema', true);

// Seat the rest of the team as the team API does (service role).
await seat(USERS.manager, BIZ, 'manager');
await seat(USERS.staff, BIZ, 'staff');
await seat(USERS.accountant, BIZ, 'accountant');
await seat(USERS.viewer, BIZ, 'viewer');

// ------------------------------------------------------------ authorization
console.log('\nAuthorization:');
const takeover2 = await as(
  USERS.attacker,
  `INSERT INTO business_members (business_id, user_id, role) VALUES ($1, $2, 'owner')`,
  [BIZ, USERS.attacker],
);
check('a stranger can no longer insert a membership row', !takeover2.ok);
const own = await as(USERS.owner, `SELECT role FROM business_members WHERE business_id = $1 AND user_id = $2`, [
  BIZ,
  USERS.owner,
]);
check('the owner still sees their own owner seat (written by the trigger)', own.ok && own.rows[0]?.role === 'owner');
const leaked2 = await as(USERS.attacker, `SELECT name FROM businesses WHERE id = $1`, [BIZ]);
check('a stranger can no longer read the business', leaked2.ok && leaked2.rows.length === 0);
const peek = await as(USERS.attacker, `SELECT user_id FROM business_members`);
check(
  'a stranger sees no membership rows of anyone else',
  peek.ok && peek.rows.every((r) => r.user_id === USERS.attacker),
);
const escalate = await as(
  USERS.staff,
  `UPDATE business_members SET role = 'owner' WHERE business_id = $1 AND user_id = $2`,
  [BIZ, USERS.staff],
);
const staffRole = await db.query(`SELECT role FROM business_members WHERE user_id = $1`, [USERS.staff]);
check('a staff member cannot promote themselves', staffRole.rows[0].role === 'staff', JSON.stringify(escalate));

// Seed the catalogue as the owner (with opening stock ledger lines).
const seed = await push(
  USERS.owner,
  BIZ,
  snapshot({
    businessName: 'Sharma Stores',
    settings: {
      receipt_mode: 'digital',
      send_sms_reminders: false,
      send_whatsapp_reminders: true,
      auto_generate_invoice_number: true,
      tax_rate: 5,
      allow_memberships: false,
      allow_inventory: true,
      allow_appointments: false,
      allow_digital_receipts: true,
      allow_physical_receipts: false,
    },
    products: [soap(5), tea()],
    movements: [move('m-open-soap', 5, 5), move('m-open-tea', 3, 3, P_TEA)],
  }),
);
check('owner seeds the catalogue', seed.ok, seed.error);
const name = await db.query(`SELECT name FROM businesses WHERE id = $1`, [BIZ]);
check('the owner rename reaches the business row', name.rows[0].name === 'Sharma Stores');

console.log('\nRole matrix:');
const staffRename = await push(
  USERS.staff,
  BIZ,
  snapshot({
    products: [{ ...soap(5), name: 'Hacked soap', selling_price: 1 }],
  }),
);
check('staff push succeeds but its catalogue edits are ignored', staffRename.ok, staffRename.error);
const kept = await db.query(`SELECT name, selling_price FROM products WHERE id = $1`, [P_SOAP]);
check(
  'a counter device cannot rename or reprice products',
  kept.rows[0].name === 'Soap' && Number(kept.rows[0].selling_price) === 100,
  JSON.stringify(kept.rows),
);

const acc = await push(
  USERS.accountant,
  BIZ,
  snapshot({ transactions: [sale('11111111-1111-1111-1111-000000000001')] }),
);
check('an accountant cannot push ledger lines', !acc.ok && acc.code === '42501', JSON.stringify(acc));
const view = await push(USERS.viewer, BIZ, snapshot({}));
check('a viewer cannot push anything', !view.ok && view.code === '42501', JSON.stringify(view));
const outsider = await push(USERS.attacker, BIZ, snapshot({ products: [soap(1)] }));
check(
  'a non-member cannot push into the business',
  !outsider.ok && outsider.code === '42501',
  JSON.stringify(outsider),
);

const accRead = await as(USERS.accountant, `SELECT COUNT(*)::int AS c FROM products WHERE business_id = $1`, [BIZ]);
check('an accountant can read the catalogue', accRead.ok && accRead.rows[0].c === 2);
const accWrite = await as(
  USERS.accountant,
  `INSERT INTO transactions (business_id, type, amount, account_type, direction) VALUES ($1, 'expense', 1, 'expense', 'out')`,
  [BIZ],
);
check('an accountant cannot write directly to the ledger', !accWrite.ok);
const staffEditProduct = await as(USERS.staff, `UPDATE products SET selling_price = 1 WHERE id = $1`, [P_SOAP]);
const price = await db.query(`SELECT selling_price FROM products WHERE id = $1`, [P_SOAP]);
check(
  'staff cannot edit products directly (RLS)',
  Number(price.rows[0].selling_price) === 100,
  JSON.stringify(staffEditProduct),
);
const staffDelete = await as(USERS.staff, `DELETE FROM products WHERE id = $1`, [P_SOAP]);
check(
  'staff cannot delete products',
  (await count('products', `id = $1`, [P_SOAP])) === 1,
  JSON.stringify(staffDelete),
);

console.log('\nAppend-only ledger:');
await push(
  USERS.staff,
  BIZ,
  snapshot({
    transactions: [sale('11111111-1111-1111-1111-000000000002')],
    movements: [move('m-sale-1', -1, 4)],
  }),
);
const edit = await as(
  USERS.owner,
  `UPDATE transactions SET amount = 1 WHERE id = '11111111-1111-1111-1111-000000000002'`,
);
const amt = await db.query(`SELECT amount FROM transactions WHERE id = '11111111-1111-1111-1111-000000000002'`);
check('even the owner cannot edit a ledger line', Number(amt.rows[0].amount) === 100, JSON.stringify(edit));
const del = await as(USERS.owner, `DELETE FROM inventory_movements WHERE id = '${uuidFor('m-sale-1')}'`);
check(
  'even the owner cannot delete a stock movement',
  (await count('inventory_movements', `id = '${uuidFor('m-sale-1')}'`)) === 1,
  JSON.stringify(del),
);

console.log('\nOffline devices:');
// Both devices sold the last units while disconnected. Each uploads only its own line.
await push(
  USERS.owner,
  BIZ,
  snapshot({
    products: [soap(5)],
    movements: [move('m-open-soap', 5, 5), move('m-owner-sale', -1, 4)],
  }),
);
await push(
  USERS.staff,
  BIZ,
  snapshot({
    movements: [move('m-open-soap', 5, 5), move('m-sale-1', -1, 4), move('m-staff-sale', -1, 3)],
  }),
);
const soapStock = await db.query(`SELECT current_stock FROM products WHERE id = $1`, [P_SOAP]);
// Ledger: opening 5, owner sale -1, staff sale (earlier test) -1, staff sale -1 = 2.
check(
  'sales from both devices all count (5 - 1 - 1 - 1 = 2)',
  Number(soapStock.rows[0].current_stock) === 2,
  `stock is ${soapStock.rows[0].current_stock}`,
);
const stale = await push(USERS.owner, BIZ, snapshot({ products: [soap(5)], movements: [move('m-open-soap', 5, 5)] }));
const soapAfterStale = await db.query(`SELECT current_stock FROM products WHERE id = $1`, [P_SOAP]);
check(
  'a device that has not seen the other sales cannot undo them',
  stale.ok && Number(soapAfterStale.rows[0].current_stock) === 2,
  `stock is ${soapAfterStale.rows[0].current_stock}`,
);
await push(
  USERS.owner,
  BIZ,
  snapshot({
    movements: [move('m-open-soap', 5, 5), move('m-sale-oversell', -4, -1)],
  }),
);
const oversold = await db.query(`SELECT current_stock FROM products WHERE id = $1`, [P_SOAP]);
check(
  'an oversold item shows negative stock instead of hiding the sale (2 - 4 = -2)',
  Number(oversold.rows[0].current_stock) === -2,
  `stock is ${oversold.rows[0].current_stock}`,
);

console.log('\nTenant isolation on sync:');
// Attacker owns their own business and tries to overwrite a product in ours by reusing its id.
await db.query(`INSERT INTO businesses (id, name, owner_id, currency) VALUES ($1, 'Evil', $2, 'INR')`, [
  BIZ_ATTACKER,
  USERS.attacker,
]);
const crossTenant = await push(USERS.attacker, BIZ_ATTACKER, snapshot({ products: [{ ...soap(0), name: 'Pwned' }] }));
const victim = await db.query(`SELECT name, business_id FROM products WHERE id = $1`, [P_SOAP]);
check(
  'a product id from another tenant cannot be overwritten',
  crossTenant.ok && victim.rows[0].name === 'Soap' && victim.rows[0].business_id === BIZ,
  JSON.stringify(victim.rows),
);
const VICTIM_LINE = '11111111-1111-1111-1111-00000000aaaa';
await push(USERS.owner, BIZ, snapshot({ transactions: [sale(VICTIM_LINE)] }));
const crossLedger = await push(
  USERS.attacker,
  BIZ_ATTACKER,
  snapshot({ transactions: [{ ...sale(VICTIM_LINE), amount: 1 }] }),
);
const victimTx = await db.query(`SELECT amount, business_id FROM transactions WHERE id = '${VICTIM_LINE}'`);
check(
  'a ledger id from another tenant cannot be overwritten',
  crossLedger.ok && victimTx.rows[0]?.amount === '100.00' && victimTx.rows[0]?.business_id === BIZ,
  JSON.stringify(victimTx.rows),
);

console.log('\nCustomers and settings:');
await push(
  USERS.staff,
  BIZ,
  snapshot({
    customers: [
      {
        id: '55555555-5555-5555-5555-555555555555',
        name: 'Riya',
        phone: '9999999999',
        opening_balance: 500,
        bank_details: { upiId: 'riya@upi' },
      },
    ],
  }),
);
const cust = await db.query(
  `SELECT opening_balance, bank_details FROM customers WHERE id = '55555555-5555-5555-5555-555555555555'`,
);
check(
  'customer opening balance and UPI details reach the cloud',
  Number(cust.rows[0].opening_balance) === 500 && cust.rows[0].bank_details?.upiId === 'riya@upi',
);
const s1 = await push(USERS.owner, BIZ, snapshot({ settings: { receipt_mode: 'both', tax_rate: 12 } }));
const s2 = await push(USERS.owner, BIZ, snapshot({ settings: { receipt_mode: 'both', tax_rate: 12 } }));
check('a partial settings push is accepted', s1.ok && s2.ok, s1.error ?? s2.error);
const settings = await db.query(
  `SELECT COUNT(*)::int AS c, MAX(tax_rate) AS t FROM business_settings WHERE business_id = $1`,
  [BIZ],
);
check(
  'settings are kept as one row, updated in place',
  settings.rows[0].c === 1 && Number(settings.rows[0].t) === 12,
  JSON.stringify(settings.rows),
);
const staffSettings = await push(USERS.staff, BIZ, snapshot({ settings: { tax_rate: 99 } }));
const tax = await db.query(`SELECT tax_rate FROM business_settings WHERE business_id = $1`, [BIZ]);
check('a counter device cannot change settings', staffSettings.ok && Number(tax.rows[0].tax_rate) === 12);

console.log('\nAtomicity and empty snapshots:');
const bad = snapshot({
  products: [
    tea(),
    {
      ...soap(9),
      id: '44444444-4444-4444-4444-444444444444',
      item_type: 'bogus',
    },
  ],
});
const broken = await push(USERS.owner, BIZ, bad);
check('a push with one invalid row is rejected', !broken.ok);
const partial = await count('products', `id = '44444444-4444-4444-4444-444444444444'`);
check('the rejected push left no partial rows behind', partial === 0);
const empty = await push(USERS.owner, BIZ, {});
const stillThere = await count('products', `business_id = $1`, [BIZ]);
check(
  'an empty snapshot is a harmless no-op (nothing is removed)',
  empty.ok && stillThere === 2,
  JSON.stringify(empty),
);

console.log('\nOwner reset:');
const staffReset = await as(USERS.staff, `SELECT reset_tenant_data($1)`, [BIZ]);
check('staff cannot reset the business', !staffReset.ok && staffReset.code === '42501');
const auditBefore = await count('audit_logs', `business_id = $1`, [BIZ]);
const ownerReset = await as(USERS.owner, `SELECT reset_tenant_data($1)`, [BIZ]);
check('the owner can reset', ownerReset.ok, ownerReset.error);
check(
  'reset removes the catalogue and the ledger',
  (await count('products', `business_id = $1`, [BIZ])) === 0 &&
    (await count('transactions', `business_id = $1`, [BIZ])) === 0,
);
check('reset keeps the audit history', (await count('audit_logs', `business_id = $1`, [BIZ])) === auditBefore);

{
  console.log('\nVersioned operating records:');
  const row = (kind, id, data, revision = 0) => ({
    kind,
    id,
    data: { id, ...data },
    revision,
  });
  const saveRecords = (user, gen, rows) =>
    as(user, 'SELECT sync_operating_records($1,$2::jsonb)', [gen, JSON.stringify(rows)]);
  const full = [
    row('products', 'product-new', { name: 'Soap', stock: 0 }),
    row('stockMovements', 'opening-new', {
      productId: 'product-new',
      delta: 5,
    }),
    row('customers', 'customer-new', { name: 'A', openingBalance: 100 }),
    row('invoices', 'invoice-new', {
      customerId: 'customer-new',
      totalAmount: 100,
      paymentStatus: 'pending',
    }),
    row('members', 'member-new', { name: 'M' }),
    row('appointments', 'appointment-new', { customerName: 'A' }),
    row('subscriptions', 'subscription-new', { memberId: 'member-new' }),
  ];
  const wrote = await saveRecords(USERS.owner, 0, full);
  check('a complete operating command is stored atomically', wrote.ok, wrote.error);
  const restored = await as(USERS.owner, 'SELECT read_operating_snapshot()');
  const snap = restored.rows[0]?.read_operating_snapshot;
  check('all operating entities restore together', snap?.records.length === full.length);
  const retry = await saveRecords(USERS.owner, 0, full);
  check('retrying identical command ids is idempotent', retry.ok, retry.error);
  const firstDeviceSale = await saveRecords(USERS.owner, 0, [
    row('stockMovements', 'sale-device-a', { productId: 'product-new', reason: 'sale', delta: -4 }),
  ]);
  const staleDeviceSale = await saveRecords(USERS.owner, 0, [
    row('stockMovements', 'sale-device-b', { productId: 'product-new', reason: 'sale', delta: -4 }),
    row('transactions', 'sale-device-b-ledger', { type: 'sale', amount: 80, direction: 'in', account: 'revenue' }),
  ]);
  check('two devices cannot jointly sell more than the stock ledger contains', firstDeviceSale.ok && !staleDeviceSale.ok && staleDeviceSale.code === '40001');
  check('a refused competing sale leaves no stock or money entries',
    (await count('operating_records', `business_id=$1 AND record_id IN ('sale-device-b','sale-device-b-ledger')`, [BIZ])) === 0);
  const altered = await saveRecords(USERS.owner, 0, [
    row('products', 'product-new', { name: 'Manager edit', stock: 0 }, 1),
  ]);
  check('a matching revision permits a catalogue edit', altered.ok, altered.error);
  const stale = await saveRecords(USERS.owner, 0, [
    row('products', 'product-new', { name: 'Stale edit', stock: 0 }, 1),
  ]);
  check('a stale revision cannot overwrite another device', !stale.ok && stale.code === '40001', JSON.stringify(stale));
  const denied = await saveRecords(USERS.staff, 0, [row('products', 'staff-product', { name: 'bad' })]);
  check('staff cannot write catalogue records', !denied.ok && denied.code === '42501');
  const accountantWrite = await saveRecords(USERS.accountant, 0, []);
  check('auditors cannot write operating data', !accountantWrite.ok && accountantWrite.code === '42501');
  const payment = (id, amount) =>
    row('transactions', id, {
      type: 'payment',
      amount,
      direction: 'out',
      account: 'receivables',
      customerId: 'customer-new',
    });
  check('first device can collect part of a due', (await saveRecords(USERS.staff, 0, [payment('pay-one', 70)])).ok);
  const over = await saveRecords(USERS.staff, 0, [payment('pay-two', 70)]);
  check('second stale device cannot collect the same dues twice', !over.ok && over.code === '40001');
  const invalid = await saveRecords(USERS.owner, 0, [
    row('members', 'rollback-member', { name: 'should roll back' }),
    row('transactions', 'invalid-tx', {
      amount: -5,
      type: 'sale',
      account: 'revenue',
      direction: 'in',
    }),
  ]);
  check(
    'invalid commands roll back every entity',
    !invalid.ok && (await count('operating_records', "record_id='rollback-member'")) === 0,
  );
  const unsafe = await as(
    USERS.staff,
    `INSERT INTO operating_records(business_id,kind,record_id,data) VALUES ($1,'products','bypass','{}')`,
    [BIZ],
  );
  check('direct writes cannot bypass the sync protocol', !unsafe.ok);
  const resetNew = await as(USERS.owner, 'SELECT reset_operating_records(0)');
  check(
    'owner reset advances the generation',
    resetNew.ok && resetNew.rows[0]?.reset_operating_records.generation === 1,
  );
  const resurrection = await saveRecords(USERS.owner, 0, full);
  check('a stale device cannot resurrect a reset business', !resurrection.ok && resurrection.code === '40001');
  // Single-use invites are consumed in one database transaction.
  const inviteId = uuidFor('single-use');
  await db.query(
    `INSERT INTO team_invites(id,business_id,code_hash,role,expires_at,created_by) VALUES ($1,$2,'single-use-hash','staff',NOW()+INTERVAL '1 day',$3)`,
    [inviteId, BIZ, USERS.owner],
  );
  await db.query('DELETE FROM business_members WHERE user_id=$1', [USERS.attacker]);
  const inviteFirst = await as(USERS.attacker, `SELECT redeem_team_invite('single-use-hash')`);
  check('a live invite creates exactly one member', inviteFirst.ok, inviteFirst.error);
  await db.query('DELETE FROM business_members WHERE user_id=$1', [USERS.staff2]);
  const inviteSecond = await as(USERS.staff2, `SELECT redeem_team_invite('single-use-hash')`);
  check('the same invite cannot create a second member', !inviteSecond.ok);
}
await db.close();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
