/**
 * Verify the counter lock.
 *
 * A PIN is one of the few security controls a shopkeeper will judge by feel —
 * "does it let me in, does it keep others out" — so the things that must not be
 * wrong are exactly the things a feel-test cannot see: that the PIN is never
 * stored, that the hash is salted, that a wrong attempt is not free, and that
 * the pause after too many attempts cannot be walked around.
 *
 *   npm run verify:lock
 *
 * Runs the real `lib/security/lock.ts` — the same PBKDF2 the browser runs —
 * with no mocks: Web Crypto is the implementation on both sides.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const root = new URL('..', import.meta.url).pathname;
const outDir = mkdtempSync(join(tmpdir(), 'dukaan-lock-'));

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok    ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${label}\n        ${error.message}`);
  }
}

/** Assertions that have to await the real hashing. */
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

console.log('Compiling the counter lock…');

const tsconfig = join(outDir, 'tsconfig.json');
writeFileSync(
  tsconfig,
  JSON.stringify(
    {
      compilerOptions: {
        target: 'es2022',
        module: 'commonjs',
        moduleResolution: 'node',
        skipLibCheck: true,
        esModuleInterop: true,
        strict: true,
        lib: ['es2022', 'dom'],
        outDir,
        rootDir: join(root, 'lib'),
        baseUrl: root,
        paths: { '@/*': ['./*'] },
      },
      files: [join(root, 'lib/security/lock.ts')],
    },
    null,
    2,
  ),
);

execFileSync('npx', ['tsc', '-p', tsconfig], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });

const require = createRequire(import.meta.url);
const L = require(join(outDir, 'security/lock.js'));

/** A localStorage that behaves like the real one, faults included. */
function fakeStorage({ fail = false, seed = null } = {}) {
  const map = new Map(seed ? Object.entries(seed) : []);
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      if (fail) throw new Error('QuotaExceededError');
      map.set(key, String(value));
    },
    removeItem: (key) => map.delete(key),
    _dump: () => Object.fromEntries(map),
  };
}

const PIN = '492713';
const OTHER = '492714';

await checkAsync('the PIN is never stored — only a salted PBKDF2 hash', async () => {
  const created = await L.createLockRecord(PIN, 5);
  assert(created.ok, 'a normal PIN is accepted');
  const record = created.record;
  const serialised = JSON.stringify(record);
  assert(!serialised.includes(PIN), 'the PIN itself appears nowhere in what gets written to disk');
  assertEqual(record.hash.length, 64, 'the hash is 32 bytes of hex');
  assert(record.salt.length >= 32, 'the salt is a real random salt, not a constant');
  assertEqual(record.iterations, L.PIN_ITERATIONS, 'the work factor is recorded, so it can be raised later');
  assertEqual(record.enabled, true, 'and the lock is on');

  const again = await L.createLockRecord(PIN, 5);
  assert(again.record.salt !== record.salt, 'every install gets a fresh salt');
  assert(again.record.hash !== record.hash, 'so the same PIN does not produce the same hash');
});

await checkAsync('the right PIN opens it, the wrong one does not', async () => {
  const { record } = await L.createLockRecord(PIN, 5);
  const good = await L.verifyPin(PIN, record);
  assert(good.ok, 'the owner gets in');
  assertEqual(good.record.failures, 0, 'and the failure count is cleared');

  const bad = await L.verifyPin(OTHER, record);
  assert(!bad.ok, 'a wrong PIN does not');
  assertEqual(bad.code, 'wrong', 'and is reported as wrong, not as a system error');
  assertEqual(bad.record.failures, 1, 'with the attempt counted');
  assertEqual(bad.record.lockedUntil, null, 'the first wrong try is free');

  const short = await L.verifyPin('1234', record);
  assert(!short.ok && short.code === 'invalid', 'a PIN of the wrong length is refused before hashing');
});

await checkAsync('five wrong tries pause the keypad — even for the correct PIN', async () => {
  let record = (await L.createLockRecord(PIN, 5)).record;
  const start = 1_000_000;
  for (let attempt = 1; attempt <= L.MAX_ATTEMPTS; attempt += 1) {
    const verdict = await L.verifyPin(OTHER, record, start);
    record = verdict.record ?? record;
    assert(!verdict.ok, `attempt ${attempt} is refused`);
  }
  assertEqual(record.failures, L.MAX_ATTEMPTS, 'all five attempts are on the record');
  assert(record.lockedUntil > start, 'the keypad is paused');

  const wait = L.lockoutRemainingMs(record, start);
  assertEqual(wait, L.BASE_LOCKOUT_MS, 'the first pause is the base pause');

  // The important one: the correct PIN must not work its way through the pause.
  const duringPause = await L.verifyPin(PIN, record, start + 1000);
  assert(!duringPause.ok && duringPause.code === 'locked-out', 'the right PIN is refused while the pause is on');
  assertEqual(duringPause.record.failures, L.MAX_ATTEMPTS, 'and the pause is not extended by trying again while paused');

  const afterPause = await L.verifyPin(PIN, record, start + L.BASE_LOCKOUT_MS + 1);
  assert(afterPause.ok, 'once the pause passes, the right PIN works');
  assertEqual(afterPause.record.failures, 0, 'and the slate is clean again');
  assertEqual(afterPause.record.lockedUntil, null, 'with no pause left over');
});

check('each further failure costs more, up to a cap', () => {
  assertEqual(L.lockoutFor(L.MAX_ATTEMPTS), 30_000, 'five failures: 30 seconds');
  assertEqual(L.lockoutFor(L.MAX_ATTEMPTS + 1), 60_000, 'six: a minute');
  assertEqual(L.lockoutFor(L.MAX_ATTEMPTS + 2), 120_000, 'seven: two minutes');
  assertEqual(L.lockoutFor(L.MAX_ATTEMPTS + 20), L.MAX_LOCKOUT_MS, 'and it never exceeds the cap');
  assertEqual(L.describeWait(45_000), '45 seconds', 'waits are said in words');
  assertEqual(L.describeWait(90_000), '2 minutes', 'rounded up, never down');
  assertEqual(L.describeWait(1_000_000_000), '16667 minutes', 'and a huge number still reads as a number');
});

check('PINs anyone could guess are refused at setup', () => {
  for (const weak of ['123456', '654321', '000000', '111111', '121212', '112233', '123123']) {
    assert(L.weakPinReason(weak) !== null, `${weak} is refused`);
  }
  assert(L.weakPinReason('12345') !== null, 'five digits is not a PIN here');
  assert(L.weakPinReason('12345a') !== null, 'letters are not digits');
  assertEqual(L.weakPinReason('492713'), null, 'an ordinary PIN is accepted');
});

await checkAsync('a bad PIN is refused and the good one is not guessed at', async () => {
  const created = await L.createLockRecord('908172', 5);
  const record = created.record;
  const candidate = await L.hashPin('908173', record.salt, record.iterations);
  assert(!L.equalHashes(candidate, record.hash), 'a neighbouring PIN does not collide');
  assert(L.equalHashes(record.hash, record.hash), 'and the same hash compares equal');
  assert(!L.equalHashes(record.hash, record.hash.slice(0, -1)), 'a truncated hash is not accepted');
});

check('nothing read from storage is trusted', () => {
  const good = {
    version: 1,
    enabled: true,
    salt: 'a'.repeat(32),
    hash: 'b'.repeat(64),
    iterations: 120000,
    autoLockMinutes: 5,
    failures: 0,
    lockedUntil: null,
    updatedAt: new Date().toISOString(),
  };
  assert(L.isLockRecord(good), 'a well-formed record is accepted');
  assert(!L.isLockRecord({ ...good, hash: 'b'.repeat(32) }), 'a short hash is rejected');
  assert(!L.isLockRecord({ ...good, salt: 'abc' }), 'a short salt is rejected');
  assert(!L.isLockRecord({ ...good, version: 2 }), 'an unknown version is rejected');
  assert(!L.isLockRecord(null), 'and nothing at all is not a lock record');

  const store = fakeStorage({ seed: { [L.LOCK_STORAGE_KEY]: '{not json' } });
  assertEqual(L.readLockRecord(store), null, 'corrupt storage reads as "no lock", never as a crash');
  assertEqual(L.readLockRecord(fakeStorage()), null, 'an empty device has no lock');
});

check('the lock survives a reload, and says so when it cannot', () => {
  const store = fakeStorage();
  const record = { version: 1, enabled: true, salt: 'c'.repeat(32), hash: 'd'.repeat(64), iterations: 120000, autoLockMinutes: 15, failures: 0, lockedUntil: null, updatedAt: 'now' };
  assert(L.writeLockRecord(record, store).ok, 'the lock is written');
  const readBack = L.readLockRecord(store);
  assertEqual(readBack?.autoLockMinutes, 15, 'and comes back with the owner’s choice intact');

  L.clearLockRecord(store);
  assertEqual(L.readLockRecord(store), null, 'clearing it really removes it');

  const broken = L.writeLockRecord(record, fakeStorage({ fail: true }));
  assert(!broken.ok && typeof broken.error === 'string', 'a device that cannot store the lock is told, not deceived');
});

check('auto-lock choices are sane whatever is passed in', () => {
  assertEqual(L.normalizeAutoLock(5), 5, 'a normal choice is kept');
  assertEqual(L.normalizeAutoLock(0), 0, 'never is never');
  assertEqual(L.normalizeAutoLock(-3), 0, 'a negative is treated as never, not as nonsense');
  assertEqual(L.normalizeAutoLock(99999), 1440, 'a day is the longest acceptable gap');
  assertEqual(L.normalizeAutoLock('soon'), L.DEFAULT_AUTO_LOCK_MINUTES, 'a non-number falls back to the default');
  assert(L.AUTO_LOCK_CHOICES.includes(0), 'the option to disable auto-lock is offered, not hidden');
});

check('turning the lock off is a state change, not a deletion of the PIN by accident', () => {
  const record = { version: 1, enabled: true, salt: 'e'.repeat(32), hash: 'f'.repeat(64), iterations: 120000, autoLockMinutes: 5, failures: 3, lockedUntil: 12345, updatedAt: 'now' };
  const off = L.disableLock(record);
  assertEqual(off.enabled, false, 'the lock is off');
  assertEqual(off.failures, 0, 'the failure count is cleared with it');
  assertEqual(off.lockedUntil, null, 'and no stale pause is left behind');
  assertEqual(off.hash, record.hash, 'the PIN material is untouched, so re-enabling starts from the same record shape');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\n${passed} verification group${passed === 1 ? '' : 's'} passed${failed > 0 ? `, ${failed} failed` : ''}.`);
if (failed > 0) process.exit(1);
