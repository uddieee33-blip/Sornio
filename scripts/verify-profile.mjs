#!/usr/bin/env node

/**
 * Verify the remembered owner profile — the fix for "welcome back, now tell me
 * your phone number again".
 *
 * The bug this exists because of was invisible to every other check in the repo.
 * Nothing crashed, no type was wrong, no policy was violated: a form seeded its
 * inputs on the first render, before the records had been read, so it seeded
 * them from the empty default profile and asked an owner who had already
 * answered for their own name. Only the owner could see it, and only on the
 * second login.
 *
 * So this script runs the real modules and asks the questions the owner asked:
 *
 *   1. **A profile survives the trip.** Store shape → wire shape → row → wire
 *      shape → store shape, and every field is the same at both ends. A field
 *      dropped in the middle is a field the next device asks for.
 *   2. **"Setup is finished" is derived, never trusted.** A row that says
 *      `setup_complete` while missing required owner/business fields must
 *      read back as incomplete. UPI activation is deliberately optional.
 *   3. **The newer copy wins, and only the newer copy.** A pull must never undo
 *      what the owner is typing, a clock set to 2099 must not win every merge
 *      forever, and a device that has forgotten must lose to the account.
 *   4. **The payload is an allow-list.** Unknown keys are dropped, control
 *      characters are stripped, lengths are capped, and an invalid UPI id is
 *      emptied rather than stored.
 *   5. **The doors around it are still closed.** The write is owner/manager
 *      only, the business is resolved from the session, the endpoint has its own
 *      rate bucket, and the row is under RLS.
 *   6. **The endpoint works against the policies it will actually meet.** The
 *      route handlers are compiled and run against a client that enforces
 *      Increment 10 of `supabase/schema.sql` — including the rule that a
 *      `RETURNING` row is served through the table's SELECT policies. Provisioning
 *      a tenant is two writes that each depend on the other, and that rule is
 *      what turns the obvious implementation into a permanent failure on a real
 *      project. No Supabase instance is involved, and none is needed.
 *
 *   npm run verify:profile
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

import { compiler } from './compilers.mjs';

const root = new URL('..', import.meta.url).pathname;
const outDir = join(root, '.cache', 'verify-profile');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') throw new Error(`${label} is async — await it with checkAsync`);
    passed += 1;
    console.log(`  ok    ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${label}\n        ${error.message}`);
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok    ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${label}\n        ${error.message}`);
  }
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const assertEqual = (actual, expected, message) => {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

console.log('Compiling the profile layer…');

/*
 * The output lands inside the repository rather than in a temp directory, and
 * `.cache` is ignored: the route handler requires `next/server`, and Node
 * resolves that from the directory the compiled file sits in. A build in `/tmp`
 * would fail on a module that has nothing to do with what is being tested.
 */
const tsconfig = join(outDir, 'tsconfig.json');
writeFileSync(
  tsconfig,
  JSON.stringify(
    {
      compilerOptions: {
        target: 'es2020',
        lib: ['dom', 'dom.iterable', 'esnext'],
        types: ['node'],
        typeRoots: [join(root, 'node_modules/@types')],
        module: 'node16',
        moduleResolution: 'node16',
        skipLibCheck: true,
        esModuleInterop: true,
        strict: true,
        outDir,
        rootDir: root,
        paths: { '@/*': [`${relative(outDir, root)}/*`] },
      },
      // Entry points only — TypeScript follows the imports from here.
      files: [
        join(root, 'lib/sync/profile.ts'),
        join(root, 'lib/auth/routes.ts'),
        join(root, 'app/api/profile/route.ts'),
      ],
    },
    null,
    2,
  ),
);

execFileSync(process.execPath, [compiler('api', root).file, '-p', tsconfig], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
});

/** See `verify-billing.mjs`: `paths` is a type-checking map, not an emit map. */
const require = createRequire(import.meta.url);
const nodeModule = require('node:module');
const resolveFilename = nodeModule._resolveFilename;
nodeModule._resolveFilename = function aliased(request, ...rest) {
  if (typeof request === 'string' && request.startsWith('@/')) {
    // `rootDir` is the repository, so the emitted tree keeps `lib/` and `app/`.
    return resolveFilename.call(this, join(outDir, request.slice(2)), ...rest);
  }
  return resolveFilename.call(this, request, ...rest);
};

const profile = require(join(outDir, 'lib/sync/profile.js'));
const routes = require(join(outDir, 'lib/auth/routes.js'));

const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const iso = (offsetMs = 0) => new Date(Date.UTC(2026, 9, 11, 12, 0, 0) + offsetMs).toISOString();
const MINUTE = 60_000;

/** A complete profile, as the store on the owner's first device would hold it. */
const COMPLETE = {
  name: 'Cult Fitness',
  templateId: 'template-gym',
  description: 'Two-floor gym in Ludhiana',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  ownerName: 'Rohit Kapoor',
  ownerPhone: '+91 98123 45678',
  ownerEmail: 'Rohit@CultFitness.com',
  upiId: 'cultfitness@okhdfcbank',
  bank: {
    upiId: 'cultfitness@okhdfcbank',
    bankName: 'HDFC Bank',
    accountHolder: 'Rohit Kapoor',
    accountNumber: '50100 1234 56789',
    ifsc: 'hdfc0001234',
  },
  updatedAt: iso(),
};

/** The same profile in the shape it crosses the wire in (`businessName`, not `name`). */
const WIRE = profile.snapshotFromProfile(COMPLETE);

/* ------------------------------------------------------- 1. the round trip */

console.log('\n1. A profile survives the trip to the database and back');

check('every field comes back the same after row → snapshot → row', () => {
  const snapshot = profile.snapshotFromProfile(COMPLETE);
  const row = profile.rowFromSnapshot(snapshot);
  const back = profile.snapshotFromRow(row);
  assertEqual(back.ownerName, 'Rohit Kapoor', 'the owner’s name');
  assertEqual(back.ownerPhone, '+91 98123 45678', 'the phone number');
  assertEqual(back.businessName, 'Cult Fitness', 'the business name');
  assertEqual(back.templateId, 'template-gym', 'the trade that shapes the console');
  assertEqual(back.description, 'Two-floor gym in Ludhiana', 'the description');
  assertEqual(back.upiId, 'cultfitness@okhdfcbank', 'the UPI id the QR is built from');
  assertEqual(back.bank.bankName, 'HDFC Bank', 'the bank name on a receipt');
  assertEqual(back.bank.accountNumber, '50100123456789', 'the account number, spaces gone');
  assertEqual(back.bank.ifsc, 'HDFC0001234', 'the IFSC, upper-cased');
  assertEqual(back.updatedAt, COMPLETE.updatedAt, 'the timestamp the merge is decided by');
  assertEqual(back.setupComplete, true, 'and it still counts as finished setup');
});

check('the email is normalised, so a lookup cannot miss on capitalisation', () => {
  const snapshot = profile.snapshotFromProfile(COMPLETE);
  assertEqual(snapshot.ownerEmail, 'rohit@cultfitness.com', 'the address is folded to lower case');
});

check('the store shape and the wire shape agree in both directions', () => {
  const snapshot = profile.snapshotFromProfile(COMPLETE);
  const restored = profile.profileFromSnapshot(snapshot);
  assertEqual(restored.name, COMPLETE.name, 'the business name');
  assertEqual(restored.ownerPhone, COMPLETE.ownerPhone, 'the phone');
  assertEqual(restored.templateId, COMPLETE.templateId, 'the template');
  assertEqual(restored.updatedAt, COMPLETE.updatedAt, 'and the timestamp travels with it');
  const again = profile.snapshotFromProfile(restored);
  assertEqual(again.upiId, snapshot.upiId, 'a second pass changes nothing');
});

check('an empty profile is empty in every field, not partly undefined', () => {
  const empty = profile.emptySnapshot();
  assertEqual(empty.ownerName, '', 'no owner name');
  assertEqual(empty.bank.upiId, undefined, 'no bank UPI id');
  assertEqual(empty.setupComplete, false, 'and it is not finished setup');
  assertEqual(profile.isSetupComplete(empty), false, 'the predicate agrees');
});

/* ------------------------------------------- 2. setup is derived, not trusted */

console.log('\n2. "Setup is finished" is derived from the fields, never trusted');

check('four business details required and UPI is optional', () => {
  assertEqual(profile.isSetupComplete(profile.snapshotFromProfile(COMPLETE)), true, 'the complete profile is complete');
  for (const [field, why] of [
    ['ownerName', 'a name'],
    ['ownerPhone', 'a phone number'],
    ['name', 'a business name'],
    ['templateId', 'a trade'],
  ]) {
    const partial = profile.snapshotFromProfile({ ...COMPLETE, [field]: '' });
    assertEqual(partial.setupComplete, false, `missing ${why} is not finished setup`);
  }
  assertEqual(profile.snapshotFromProfile({ ...COMPLETE, upiId: '' }).setupComplete, true, 'payment setup is optional');
});

check('a phone number too short to dial is not finished setup', () => {
  const snapshot = profile.snapshotFromProfile({ ...COMPLETE, ownerPhone: '98123' });
  assertEqual(snapshot.setupComplete, false, 'five digits cannot be a phone number');
});

check('a stored setup_complete flag cannot override required fields', () => {
  // The exact row a client that wanted to skip setup would write.
  const row = { ...profile.rowFromSnapshot(profile.snapshotFromProfile(COMPLETE)), setup_complete: true, owner_name: '' };
  const back = profile.snapshotFromRow(row);
  assertEqual(back.setupComplete, false, 'a row without owner name is not finished, whatever the column says');
});

check('the sign-in destination follows the same derivation', () => {
  assertEqual(routes.signInFallback(true), '/home', 'a set-up owner goes to the console');
  assertEqual(routes.signInFallback(false), '/onboarding', 'everybody else goes to setup');
  assertEqual(routes.CONSOLE_HOME, '/home', 'and the console door is where the shell is');
});

/* --------------------------------------------------- 3. whose copy is newer */

console.log('\n3. The newer copy wins, and only the newer copy');

check('a device that has forgotten loses to the account', () => {
  const local = { ...COMPLETE, updatedAt: undefined };
  const stored = profile.snapshotFromProfile({ ...COMPLETE, updatedAt: iso(-MINUTE) });
  const adopted = profile.adoptRemoteProfile(local, stored);
  assert(adopted, 'a profile with no local timestamp loses to anything the account holds');
  assertEqual(adopted.ownerName, 'Rohit Kapoor', 'and the owner’s name comes back with it');
});

check('the newer local copy is never overwritten by an older pull', () => {
  const local = { ...COMPLETE, updatedAt: iso() };
  const stored = profile.snapshotFromProfile({ ...COMPLETE, ownerName: 'Stale Name', updatedAt: iso(-5 * MINUTE) });
  assertEqual(profile.adoptRemoteProfile(local, stored), null, 'the older stored copy changes nothing');
});

check('an edit made while the pull was in flight survives it', () => {
  const typedAt = iso();
  const local = { ...COMPLETE, ownerName: 'Just Typed', updatedAt: typedAt };
  const stored = profile.snapshotFromProfile({ ...COMPLETE, ownerName: 'From The Server', updatedAt: iso(-MINUTE) });
  const adopted = profile.adoptRemoteProfile(local, stored);
  assertEqual(adopted, null, 'the reply cannot undo what the owner typed');
});

check('equal timestamps go to the device, so a pull cannot churn', () => {
  const stamp = iso();
  const local = { ...COMPLETE, updatedAt: stamp };
  const stored = profile.snapshotFromProfile({ ...COMPLETE, updatedAt: stamp });
  assertEqual(profile.remoteWins(local.updatedAt, stored.updatedAt), false, 'a tie is not a win');
});

check('an invented timestamp is worth nothing', () => {
  for (const bogus of ['', 'not-a-date', '9999-01-01T00:00:00.000Z', '1999-01-01T00:00:00.000Z', '2026-10-11', 12345, null]) {
    assertEqual(profile.remoteWins(undefined, bogus), false, `${JSON.stringify(bogus)} must not win a merge`);
    assertEqual(profile.isTimestamp(bogus), false, `${JSON.stringify(bogus)} is not a timestamp this module compares`);
  }
  assertEqual(profile.isTimestamp(iso()), true, 'a real ISO timestamp is');
});

check('a payload with a forged or missing timestamp is stamped on the server', () => {
  const forged = profile.parseProfilePayload({ ...WIRE, updatedAt: '9999-01-01T00:00:00.000Z' });
  assert(forged.ok, 'the payload is still accepted');
  assert(!forged.snapshot.updatedAt.startsWith('9999'), 'but the clock it claimed is replaced');
  const missing = profile.parseProfilePayload({ ...WIRE, updatedAt: undefined });
  assert(missing.ok && profile.isTimestamp(missing.snapshot.updatedAt), 'and a missing one is filled in');
});

/* ------------------------------------------------------ 4. the allow-list */

console.log('\n4. A payload coming in from a browser is an allow-list, not a trust');

check('unknown keys are dropped on the way to the row', () => {
  const parsed = profile.parseProfilePayload({
    ...WIRE,
    role: 'root',
    plan_id: 'scale',
    is_admin: true,
    setup_complete: true,
  });
  assert(parsed.ok, 'the known fields are accepted');
  const row = profile.rowFromSnapshot(parsed.snapshot);
  assertEqual(row.role, undefined, 'a role cannot ride in on a profile save');
  assertEqual(row.plan_id, undefined, 'nor a plan');
  assertEqual(row.is_admin, undefined, 'nor an admin flag');
  assertEqual(Object.keys(row).length, 12, 'and the row carries exactly the twelve columns, no more');
});

check('control characters and runaway whitespace are stripped', () => {
  const parsed = profile.parseProfilePayload({ ...WIRE, ownerName: 'Roh\u0000it\u0007  Kapoor' });
  assert(parsed.ok, 'accepted');
  assertEqual(parsed.snapshot.ownerName, 'Rohit Kapoor', 'the name is clean');
  assert(!parsed.snapshot.ownerName.includes('\n'), 'and carries no line break');
});

check('an over-long field is capped, not refused', () => {
  const parsed = profile.parseProfilePayload({ ...WIRE, businessName: 'x'.repeat(5000) });
  assert(parsed.ok, 'accepted');
  assert(parsed.snapshot.businessName.length <= 120, `capped at 120, got ${parsed.snapshot.businessName.length}`);
});

check('an invalid UPI id is emptied rather than stored', () => {
  const parsed = profile.parseProfilePayload({ ...WIRE, upiId: 'not a vpa at all' });
  assert(parsed.ok, 'the rest of the profile is still worth saving');
  assertEqual(parsed.snapshot.upiId, '', 'the address is dropped');
  assertEqual(parsed.snapshot.setupComplete, true, 'business setup remains complete without an active UPI ID');
});

check('bank details that are not bank details are dropped field by field', () => {
  const parsed = profile.parseProfilePayload({
    ...WIRE,
    bank: { accountNumber: '12ab34', ifsc: 'NOPE', bankName: 'HDFC', pin: '1234', otp: '999999' },
  });
  assert(parsed.ok, 'accepted');
  assertEqual(parsed.snapshot.bank.accountNumber, undefined, 'a non-numeric account number is dropped');
  assertEqual(parsed.snapshot.bank.ifsc, undefined, 'so is a malformed IFSC');
  assertEqual(parsed.snapshot.bank.bankName, 'HDFC', 'the bank name stays');
  assertEqual(parsed.snapshot.bank.pin, undefined, 'and no credential of any kind is carried');
});

check('the fields an owner must have are refused, with a sentence they can act on', () => {
  const noName = profile.parseProfilePayload({ ...WIRE, ownerName: '' });
  assertEqual(noName.ok, false, 'no name is refused');
  assert(/name/i.test(noName.error), 'and the message says so');
  const noPhone = profile.parseProfilePayload({ ...WIRE, ownerPhone: '12' });
  assertEqual(noPhone.ok, false, 'a two-digit phone is refused');
  const badEmail = profile.parseProfilePayload({ ...WIRE, ownerEmail: 'rohit@' });
  assertEqual(badEmail.ok, false, 'a half-typed address is refused');
  assertEqual(profile.parseProfilePayload(null).ok, false, 'and so is no body at all');
  assertEqual(profile.parseProfilePayload([]).ok, false, 'or an array wearing one');
});

check('an unknown business type is refused when the server can check it', () => {
  const known = (value) => value === 'template-gym';
  assertEqual(profile.parseProfilePayload(WIRE, { isKnownTemplateId: known }).ok, true, 'a real template passes');
  const invented = profile.parseProfilePayload({ ...WIRE, templateId: 'template-evil' }, { isKnownTemplateId: known });
  assertEqual(invented.ok, false, 'an invented one does not');
  assertEqual(profile.parseProfilePayload({ ...WIRE, templateId: 'template-evil' }).ok, true, 'without a checker it is still stored as text, never executed');
});

/* --------------------------------------------------- 5. the doors around it */

console.log('\n5. The endpoint, the schema and the store around it');

const route = read('app', 'api', 'profile', 'route.ts');
const schema = read('supabase', 'schema.sql');
const store = read('lib', 'store.tsx');
const onboarding = read('app', 'onboarding', 'page.tsx');
const rateLimit = read('lib', 'security', 'rate-limit.ts');
const policy = JSON.parse(read('lib', 'security', 'policy.json'));

check('the write is owner or manager, and says so', () => {
  assert(/PROFILE_WRITE_ROLES/.test(route), 'the route names the roles it allows');
  assert(/owner/.test(route) && /manager/.test(route), 'owner and manager are in that set');
  assert(/403/.test(route), 'and a refusal is a refusal, not a silent no-op');
});

check('the business is resolved from the session, never from the body', () => {
  assert(!/body\??\.businessId|payload\??\.businessId/.test(route), 'no business id is read from a request body');
  assert(/business_members/.test(route) || /readStoredProfile/.test(route), 'it comes from the membership table');
});

check('the profile payload is validated before it reaches Postgres', () => {
  const parseAt = route.indexOf('parseProfilePayload(payload');
  const upsertAt = route.indexOf(".upsert({ business_id");
  assert(parseAt > -1, 'the route parses the payload');
  assert(upsertAt > -1, 'the route upserts a row');
  assert(parseAt < upsertAt, 'and the parse happens first');
});

check('the endpoint has its own rate-limit bucket', () => {
  assert(rateLimit.includes('/api/profile'), 'ruleForPath has a branch for it');
  assert(policy.rateLimits.profile?.limit > 0, 'and policy.json gives that branch a real ceiling');
  assert(policy.rateLimits.profile.limit <= policy.rateLimits.api.limit, 'tighter than the general API bucket');
});

check('the row is tenant-scoped and under row-level security', () => {
  assert(/CREATE TABLE IF NOT EXISTS owner_profiles/.test(schema), 'owner_profiles exists');
  assert(/ALTER TABLE owner_profiles ENABLE ROW LEVEL SECURITY/.test(schema), 'RLS is on');
  const policies = schema.match(/CREATE POLICY "[^"]+" ON owner_profiles/g) ?? [];
  assert(policies.length >= 3, `select, insert and update are all covered (found ${policies.length})`);
  assert(/business_id UUID NOT NULL UNIQUE/.test(schema), 'one profile per business, enforced by the database');
});

check('provisioning a tenant no longer deadlocks against its own policy', () => {
  // The old insert policy on `businesses` demanded a membership row that cannot
  // exist before the business it points at, so a new owner's first sync failed.
  const insertPolicy = schema.slice(schema.lastIndexOf('CREATE POLICY "Business members manage their businesses"'));
  assert(/owner_id = auth\.uid\(\)/.test(insertPolicy), 'owning the row is enough to insert it');
  assert(/ADD COLUMN IF NOT EXISTS owner_id/.test(schema), 'and existing projects get the column too');
});

check('the store reads the account copy after hydration and before it paints a form', () => {
  assert(/fetchStoredProfile/.test(store), 'the store asks the account for the profile');
  assert(/adoptRemoteProfile/.test(store), 'and lets one function decide whose copy is newer');
  assert(/hydrated/.test(store), 'after the local vault has hydrated');
});

check('a local edit is stamped, so the merge has something to compare', () => {
  const updateProfile = store.slice(store.indexOf('updateProfile(patch)'), store.indexOf('applyTemplate(templateId)'));
  assert(/updatedAt: new Date\(\)\.toISOString\(\)/.test(updateProfile), 'updateProfile stamps the edit');
});

check('the setup screen does not render a form before the records are read', () => {
  assert(/if \(!hydrated\)/.test(onboarding), 'it waits for hydration');
  assert(/hydrated, profile\]/.test(onboarding), 'and re-seeds when a profile arrives');
  assert(/touched\.current/.test(onboarding), 'without ever typing over what the owner is typing');
});

check('the setup screen says where the details are kept', () => {
  assert(/accountBacked/.test(onboarding), 'it knows whether an account exists to keep them');
  assert(/saveStoredProfile/.test(onboarding), 'and it saves to that account rather than hoping a debounce runs');
});

/* ------------------------------------- 6. the endpoint, against a live policy */

console.log('\n6. The endpoint against a client that enforces the schema’s own policies');

/*
 * A Supabase client that is not Supabase, but keeps its promises.
 *
 * Two things have to be right for these checks to mean anything:
 *
 *   • **The builder is a thenable, like supabase-js.** `insert(p).eq(…)` and
 *     `update(p).eq(…)` execute only when awaited, so a fake that ran the write
 *     eagerly would let the real code get away with an ordering bug.
 *   • **The policies are enforced** — transcribed from Increment 10 of
 *     `supabase/schema.sql`, including the rule that a `RETURNING` row is served
 *     through the table's SELECT policies. That last one is not pedantry: it is
 *     what makes `insert(…).select('id').single()` come back *empty* for a
 *     brand-new tenant, because the only SELECT policy on `businesses` asks for
 *     a membership row that cannot exist before the business it points at. The
 *     first version of this endpoint did exactly that, and provisioning failed
 *     on every real project while looking perfectly correct in review.
 *
 * Anything the route calls that is not implemented here throws, so a change that
 * reaches for a new method fails loudly instead of passing silently.
 */
function createFakeSupabase({ uid, tables, violations, missing = [] }) {
  const membershipsFor = (userId, roles) =>
    tables.business_members.filter((row) => row.user_id === userId && (!roles || roles.includes(row.role)));
  const businessesFor = (userId) => membershipsFor(userId).map((row) => row.business_id);

  const canSelect = (table, row) => {
    if (table === 'businesses') return businessesFor(uid).includes(row.id);
    if ('business_id' in row) return businessesFor(uid).includes(row.business_id);
    return true;
  };
  const insertViolation = (table, row) => {
    if (table === 'businesses') {
      return row.owner_id === uid || businessesFor(uid).includes(row.id)
        ? null
        : 'new row violates row-level security policy for table "businesses"';
    }
    if (table === 'business_members') {
      return row.user_id === uid ? null : 'new row violates row-level security policy for table "business_members"';
    }
    if (table === 'owner_profiles') {
      return membershipsFor(uid, ['owner', 'manager']).some((member) => member.business_id === row.business_id)
        ? null
        : 'new row violates row-level security policy for table "owner_profiles"';
    }
    return null;
  };
  const updateViolation = (table, row) => {
    if (table === 'owner_profiles') {
      return membershipsFor(uid, ['owner', 'manager']).some((member) => member.business_id === row.business_id)
        ? null
        : 'new row violates row-level security policy for table "owner_profiles"';
    }
    if (table === 'businesses') {
      return businessesFor(uid).includes(row.id) ? null : 'new row violates row-level security policy for table "businesses"';
    }
    return null;
  };

  const build = (table) => {
    // A deployment whose owner shipped the code before running the SQL. Postgres
    // answers with a relation error; the app has to degrade rather than throw.
    if (missing.includes(table)) {
      const error = { message: `relation "public.${table}" does not exist` };
      /*
       * The resolved value has to be a plain object. Resolving a thenable with
       * *itself* makes `await` call `.then` again, forever — the first version of
       * this did exactly that and hung the suite, which is a fair warning that a
       * fake builder has to be as careful as the one it stands in for.
       */
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        insert: () => chain,
        update: () => chain,
        upsert: () => chain,
        maybeSingle: () => Promise.resolve({ data: null, error }),
        single: () => Promise.resolve({ data: null, error }),
        then: (resolve, reject) => Promise.resolve({ data: null, error }).then(resolve, reject),
      };
      return chain;
    }
    const rows = () => (tables[table] ??= []);
    const filters = [];
    let limitCount = null;
    let pending = null;
    const matches = (row) => filters.every(([column, value]) => row[column] === value);
    const visible = (source) => source.filter((row) => canSelect(table, row));

    const run = () => {
      if (!pending) {
        const found = visible(rows().filter(matches));
        return { data: limitCount === null ? found : found.slice(0, limitCount), error: null };
      }
      if (pending.kind === 'insert') {
        const payload = Array.isArray(pending.payload) ? pending.payload : [pending.payload];
        const created = [];
        for (const row of payload) {
          const reason = insertViolation(table, row);
          if (reason) { violations.push(`${table}: ${reason}`); return { data: null, error: { message: reason } }; }
          const stored = { created_at: new Date().toISOString(), ...row, id: row.id ?? randomUUID() };
          rows().push(stored);
          if (table === 'businesses') tables.business_members.push({ id: randomUUID(), business_id: stored.id, user_id: stored.owner_id, role: 'owner', created_at: new Date().toISOString() });
          // A RETURNING row is served through the SELECT policies, as PostgREST
          // does it: a row the caller cannot select yet comes back as nothing.
          if (canSelect(table, stored)) created.push(stored);
        }
        return { data: created, error: null };
      }
      if (pending.kind === 'update') {
        const updated = [];
        for (const row of rows()) {
          if (!matches(row)) continue;
          const reason = updateViolation(table, row);
          if (reason) { violations.push(`${table}: ${reason}`); return { data: null, error: { message: reason } }; }
          Object.assign(row, pending.payload);
          if (canSelect(table, row)) updated.push(row);
        }
        return { data: updated, error: null };
      }
      if (pending.kind === 'upsert') {
        const payload = Array.isArray(pending.payload) ? pending.payload[0] : pending.payload;
        const key = pending.options?.onConflict ?? 'id';
        const existing = rows().find((candidate) => candidate[key] === payload[key]);
        if (existing) {
          const reason = updateViolation(table, existing);
          if (reason) { violations.push(`${table}: ${reason}`); return { data: null, error: { message: reason } }; }
          Object.assign(existing, payload);
          return { data: canSelect(table, existing) ? [existing] : [], error: null };
        }
        const reason = insertViolation(table, payload);
        if (reason) { violations.push(`${table}: ${reason}`); return { data: null, error: { message: reason } }; }
        const stored = { created_at: new Date().toISOString(), ...payload, id: payload.id ?? randomUUID() };
        rows().push(stored);
        return { data: canSelect(table, stored) ? [stored] : [], error: null };
      }
      throw new Error(`the fake client does not implement "${pending.kind}"`);
    };

    const api = {
      select: () => api,
      eq: (column, value) => { filters.push([column, value]); return api; },
      order: () => api,
      limit: (count) => { limitCount = count; return api; },
      insert: (payload) => { pending = { kind: 'insert', payload }; return api; },
      update: (payload) => { pending = { kind: 'update', payload }; return api; },
      upsert: (payload, options) => { pending = { kind: 'upsert', payload, options }; return api; },
      maybeSingle: () => { const result = run(); return Promise.resolve({ data: result.data?.[0] ?? null, error: result.error }); },
      single: () => {
        const result = run();
        if (result.error) return Promise.resolve({ data: null, error: result.error });
        return result.data.length === 1
          ? Promise.resolve({ data: result.data[0], error: null })
          : Promise.resolve({ data: null, error: { message: `expected exactly one row, found ${result.data.length}` } });
      },
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
      catch: (reject) => Promise.resolve(run()).catch(reject),
    };
    return api;
  };

  return {
    from: build,
    auth: { getUser: async () => ({ data: { user: { id: uid, email: 'rohit@cultfitness.com' } }, error: null }) },
  };
}

// The two modules the route reaches for that this script cannot provide for
// real: the cookie jar, and the guard that hands out a server client.
const stubDir = join(outDir, 'stubs');
mkdirSync(stubDir, { recursive: true });
writeFileSync(join(stubDir, 'headers.js'), `
let jar = new Map();
exports.__setCookie = (name, value) => jar.set(name, { name, value });
exports.cookies = async () => ({
  get: (name) => jar.get(name),
  getAll: () => [...jar.values()],
  set: (name, value) => jar.set(name, { name, value }),
});
`);
writeFileSync(join(stubDir, 'guard.js'), `
const state = globalThis.__verifyProfileFake;
exports.getGuardedServerClient = async () => state.client();
exports.getSessionUser = async () =>
  state.signedOut() ? null : { id: state.uid(), email: 'rohit@cultfitness.com' };
exports.requireUser = (user) => user;
exports.apiError = (status, message) => new Response(JSON.stringify({ error: message }), { status });
`);

const SECRET = 'a'.repeat(32);
const OWNER_ID = '0f6f1f7a-2b6c-4d55-9a10-5b0f1a2b3c4d';
const STRANGER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
process.env.DUKAANOS_SESSION_SECRET = SECRET;

const tables = { businesses: [], business_members: [], owner_profiles: [] };
const violations = [];
const session = { uid: OWNER_ID, signedOut: false };
let client = createFakeSupabase({ uid: session.uid, tables, violations });
globalThis.__verifyProfileFake = {
  client: () => client,
  uid: () => session.uid,
  signedOut: () => session.signedOut,
};
const actAs = (uid) => {
  session.uid = uid;
  client = createFakeSupabase({ uid, tables, violations });
};

// The `@/` alias has to be re-pointed for the route's own imports, and the two
// stubs have to win over it.
nodeModule._resolveFilename = function aliased(request, ...rest) {
  if (request === 'next/headers') return resolveFilename.call(this, join(stubDir, 'headers.js'), ...rest);
  if (request === '@/lib/security/guard') return resolveFilename.call(this, join(stubDir, 'guard.js'), ...rest);
  if (typeof request === 'string' && request.startsWith('@/')) {
    return resolveFilename.call(this, join(outDir, request.slice(2)), ...rest);
  }
  return resolveFilename.call(this, request, ...rest);
};

const headersStub = require(join(stubDir, 'headers.js'));
const cookie = require(join(outDir, 'lib/auth/cookie.js'));
const endpoint = require(join(outDir, 'app/api/profile/route.js'));

const PAYLOAD = {
  ownerName: 'Rohit Kapoor',
  ownerPhone: '+91 98123 45678',
  ownerEmail: 'Rohit@CultFitness.com',
  businessName: 'Cult Fitness',
  description: 'Two-floor gym in Ludhiana',
  templateId: 'template-gym',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  upiId: 'cultfitness@okhdfcbank',
  // `pin` and `otp` are here on purpose: the allow-list has to drop them.
  bank: { bankName: 'HDFC Bank', accountHolder: 'Rohit Kapoor', accountNumber: '50100 1234 56789', ifsc: 'hdfc0001234', pin: '1234', otp: '999999' },
  updatedAt: '2026-10-11T12:00:00.000Z',
  role: 'root',
  setup_complete: true,
};

async function signIn(role) {
  for (const row of tables.business_members) if (row.user_id === OWNER_ID) row.role = role === 'cashier' ? 'staff' : role;
  const issued = await cookie.sealOwnerSession(
    { tenantId: tables.business_members.find((row) => row.user_id === OWNER_ID)?.business_id ?? '', userId: OWNER_ID, role, displayName: 'ro•••', remember: true },
    { secret: SECRET },
  );
  headersStub.__setCookie('dukaan.session', issued.value);
  session.signedOut = false;
}
const save = (body) =>
  endpoint.PUT(
    new Request('http://localhost:3000/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

await checkAsync('an anonymous request is refused before anything is read', async () => {
  session.signedOut = true;
  headersStub.__setCookie('dukaan.session', '');
  const response = await endpoint.GET();
  assertEqual(response.status, 401, 'status');
  assertEqual(tables.owner_profiles.length, 0, 'and nothing was written');
});

await signIn('owner');

await checkAsync('a first save provisions the tenant and stores the profile', async () => {
  const response = await save(PAYLOAD);
  const body = await response.json();
  assertEqual(response.status, 200, `status (body: ${JSON.stringify(body)})`);
  assertEqual(tables.businesses.length, 1, 'one business row');
  assertEqual(tables.businesses[0].owner_id, OWNER_ID, 'owned by the signed-in user');
  assertEqual(tables.business_members.length, 1, 'one membership row');
  assertEqual(tables.business_members[0].role, 'owner', 'as owner');
  assertEqual(tables.owner_profiles.length, 1, 'one profile row');
  assertEqual(violations.length, 0, `no policy violations (${violations.join('; ')})`);
});

await checkAsync('the row holds the details an owner would otherwise be asked for again', async () => {
  const row = tables.owner_profiles[0];
  assertEqual(row.owner_name, 'Rohit Kapoor', 'owner name');
  assertEqual(row.owner_phone, '+91 98123 45678', 'phone');
  assertEqual(row.owner_email, 'rohit@cultfitness.com', 'email, folded to lower case');
  assertEqual(row.business_name, 'Cult Fitness', 'business name');
  assertEqual(row.template_id, 'template-gym', 'the trade that shapes the console');
  assertEqual(row.upi_id, 'cultfitness@okhdfcbank', 'the UPI id the QR is built from');
  assertEqual(row.bank.accountNumber, '50100123456789', 'account number, spaces gone');
  assertEqual(row.bank.ifsc, 'HDFC0001234', 'IFSC, upper-cased');
  assertEqual(row.bank.pin, undefined, 'no PIN was stored');
  assertEqual(row.bank.otp, undefined, 'no OTP was stored');
  assertEqual(row.role, undefined, 'and no role rode in on the payload');
  assertEqual(row.updated_at, '2026-10-11T12:00:00.000Z', 'the editing device’s own timestamp');
});

await checkAsync('setup_complete is derived on the server, not copied from the client', async () => {
  assertEqual(tables.owner_profiles[0].setup_complete, true, 'a complete profile is complete');
  const response = await save({ ...PAYLOAD, upiId: 'not a vpa' });
  assertEqual(response.status, 200, 'the save still succeeds — the rest is worth keeping');
  assertEqual(tables.owner_profiles[0].upi_id, null, 'the unusable address is emptied');
  assertEqual(tables.owner_profiles[0].setup_complete, true, 'setup remains complete without a valid payment address');
});

await checkAsync('a second save updates the one row instead of adding another', async () => {
  const response = await save({ ...PAYLOAD, businessName: 'Cult Fitness Ludhiana' });
  assertEqual(response.status, 200, 'status');
  assertEqual(tables.owner_profiles.length, 1, 'still one profile row');
  assertEqual(tables.businesses.length, 1, 'still one business row');
  assertEqual(tables.business_members.length, 1, 'still one membership row');
  assertEqual(tables.businesses[0].name, 'Cult Fitness Ludhiana', 'and the tenant row follows the rename');
  assertEqual(violations.length, 0, `no policy violations (${violations.join('; ')})`);
});

await checkAsync('a read hands back exactly what was stored', async () => {
  const body = await (await endpoint.GET()).json();
  assertEqual(body.ok, true, 'ok');
  assertEqual(body.mode, 'supabase', 'mode');
  assertEqual(body.profile.ownerName, 'Rohit Kapoor', 'owner name');
  assertEqual(body.profile.businessName, 'Cult Fitness Ludhiana', 'business name');
  assertEqual(body.profile.upiId, 'cultfitness@okhdfcbank', 'UPI id');
  assertEqual(body.profile.bank.ifsc, 'HDFC0001234', 'IFSC');
  assertEqual(body.profile.setupComplete, true, 'and it counts as finished setup');
});

await checkAsync('a cashier cannot reroute where the money lands', async () => {
  await signIn('cashier');
  const response = await save({ ...PAYLOAD, upiId: 'attacker@okhdfcbank' });
  assertEqual(response.status, 403, 'status');
  assertEqual(tables.owner_profiles[0].upi_id, 'cultfitness@okhdfcbank', 'and the payee did not move');
  await signIn('owner');
});

await checkAsync('a payload with no owner is refused rather than half-stored', async () => {
  const before = JSON.stringify(tables.owner_profiles[0]);
  const response = await save({ ...PAYLOAD, ownerName: '' });
  assertEqual(response.status, 422, 'status');
  assertEqual(JSON.stringify(tables.owner_profiles[0]), before, 'the stored row is untouched');
});

await checkAsync('a business id in the body is not a permission', async () => {
  const response = await save({ ...PAYLOAD, businessId: tables.businesses[0].id, business_id: STRANGER_ID });
  assertEqual(response.status, 200, 'accepted');
  assertEqual(tables.owner_profiles[0].business_id, tables.businesses[0].id, 'written against the session’s own business');
  assertEqual(tables.owner_profiles.length, 1, 'and no second row appeared');
});

await checkAsync('another user cannot read this business’s profile', async () => {
  actAs(STRANGER_ID);
  const body = await (await endpoint.GET()).json();
  assertEqual(body.ok, true, 'the request itself is fine');
  assertEqual(body.businessId, null, 'they have no business here');
  assertEqual(body.profile, null, 'so they see no profile');
  actAs(OWNER_ID);
});

// The state an owner is actually in between deploying this branch and running
// Increment 10: the code is live and the table is not there yet. Nothing may
// throw, nothing may claim to have saved, and the console must still open.
await checkAsync('a deployment that has not run the migration degrades instead of breaking', async () => {
  const unmigrated = { businesses: [], business_members: [], owner_profiles: [] };
  const before = client;
  const beforeUid = session.uid;
  globalThis.__verifyProfileFake.client = () =>
    createFakeSupabase({ uid: beforeUid, tables: unmigrated, violations, missing: ['owner_profiles'] });

  const read = await endpoint.GET();
  const readBody = await read.json();
  assertEqual(read.status, 200, `the read still answers (body: ${JSON.stringify(readBody)})`);
  assertEqual(readBody.profile, null, 'with no profile to show');

  const write = await save(PAYLOAD);
  const writeBody = await write.json();
  assertEqual(write.status, 500, 'the save says it did not work');
  assertEqual(writeBody.ok, false, 'and never claims otherwise');
  assert(/could not save/i.test(writeBody.error ?? ''), `the reason is a sentence, not a stack (${writeBody.error})`);

  globalThis.__verifyProfileFake.client = () => before;
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
