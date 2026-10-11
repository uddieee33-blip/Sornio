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
 *      `setup_complete` while holding no UPI id must read back as not complete —
 *      otherwise a stale flag skips the screen that collects the address every
 *      collection QR is built from.
 *   3. **The newer copy wins, and only the newer copy.** A pull must never undo
 *      what the owner is typing, a clock set to 2099 must not win every merge
 *      forever, and a device that has forgotten must lose to the account.
 *   4. **The payload is an allow-list.** Unknown keys are dropped, control
 *      characters are stripped, lengths are capped, and an invalid UPI id is
 *      emptied rather than stored.
 *   5. **The doors around it are still closed.** The write is owner/manager
 *      only, the business is resolved from the session, the endpoint has its own
 *      rate bucket, and the row is under RLS.
 *
 *   npm run verify:profile
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

import { compiler } from './compilers.mjs';

const root = new URL('..', import.meta.url).pathname;
const outDir = mkdtempSync(join(tmpdir(), 'dukaan-profile-'));

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

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const assertEqual = (actual, expected, message) => {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

console.log('Compiling the profile layer…');

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
        rootDir: join(root, 'lib'),
        paths: { '@/*': [`${relative(outDir, root)}/*`] },
      },
      // Entry points only — TypeScript follows the imports from here.
      files: [join(root, 'lib/sync/profile.ts'), join(root, 'lib/auth/routes.ts')],
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
    const mapped = request.slice(2).replace(/^lib\//, '');
    return resolveFilename.call(this, join(outDir, mapped), ...rest);
  }
  return resolveFilename.call(this, request, ...rest);
};

const profile = require(join(outDir, 'sync/profile.js'));
const routes = require(join(outDir, 'auth/routes.js'));

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

check('all four details and a valid UPI id are required', () => {
  assertEqual(profile.isSetupComplete(profile.snapshotFromProfile(COMPLETE)), true, 'the complete profile is complete');
  for (const [field, why] of [
    ['ownerName', 'a name'],
    ['ownerPhone', 'a phone number'],
    ['name', 'a business name'],
    ['templateId', 'a trade'],
    ['upiId', 'a UPI id'],
  ]) {
    const partial = profile.snapshotFromProfile({ ...COMPLETE, [field]: '' });
    assertEqual(partial.setupComplete, false, `missing ${why} is not finished setup`);
  }
});

check('a phone number too short to dial is not finished setup', () => {
  const snapshot = profile.snapshotFromProfile({ ...COMPLETE, ownerPhone: '98123' });
  assertEqual(snapshot.setupComplete, false, 'five digits cannot be a phone number');
});

check('a stored setup_complete flag cannot override the fields', () => {
  // The exact row a client that wanted to skip setup would write.
  const row = { ...profile.rowFromSnapshot(profile.snapshotFromProfile(COMPLETE)), setup_complete: true, upi_id: null };
  const back = profile.snapshotFromRow(row);
  assertEqual(back.setupComplete, false, 'a row with no UPI id is not finished, whatever the column says');
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
  assertEqual(parsed.snapshot.setupComplete, false, 'which means setup is not finished');
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

rmSync(outDir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
