import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const root = new URL('..', import.meta.url).pathname;
const data = source => 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64');
const config = data(fs.readFileSync(root + 'lib/supabase/config.ts', 'utf8'));
const routes = await import(data(fs.readFileSync(root + 'lib/auth/routes.ts', 'utf8').replace('@/lib/supabase/config', config)));
let passed = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); passed++; }
for (const target of [undefined, '/home', '/audit?locked=1', '/subscription?plan=growth&interval=year']) equal(routes.hostedSignInDestination(target, false), '/onboarding');
equal(routes.hostedSignInDestination('/audit?locked=1', true), '/audit?locked=1');
equal(routes.hostedSignInDestination(undefined, true), '/home');
for (const target of ['https://evil.example', '//evil.example', '/auth', '/api/auth/session', '/\\evil.example']) equal(routes.hostedSignInDestination(target, true), '/home');
for (const role of ['manager', 'cashier', 'auditor']) equal(routes.hostedSignInDestination('/home', false, role), '/home');
const source = fs.readFileSync(root + 'app/onboarding/page.tsx', 'utf8');
const body = source.slice(source.indexOf('  const finish = async () => {') + '  const finish = async () => {'.length, source.indexOf('\n  };', source.indexOf('  const finish = async () => {')));
async function finishTest(result, overrides = {}) {
  const effects = { routes: [], errors: [], finishing: [], steps: [], saved: [], updates: 0 };
  const context = {
    setError: x => effects.errors.push(x), setStep: x => effects.steps.push(x), setFinishing: x => effects.finishing.push(x), setSavedTo: x => effects.saved.push(x),
    ownerName: 'Shop Owner', ownerPhone: '9876543210', ownerEmail: '', businessName: 'Test Shop', templateId: 'template-retail', description: '',
    gstin: '', isValidGstin: () => true, isEmail: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), upiId: '', upiValid: false, ifsc: '', accountNumber: '', accountHolder: '', bankName: '', profile: {}, pinned: {current: false}, accountBacked: true,
    isValidIfsc: () => true, actions: { updateProfile: () => { effects.updates++; return { ok: true }; }, applyTemplate: () => {} }, publishPortal: () => {},
    saveStoredProfile: async () => result, snapshotFromProfile: x => x, router: { push: x => effects.routes.push(x) }, setTimeout: fn => fn(), ...overrides,
  };
  await new Function(...Object.keys(context), 'return (async () => {' + body + '})();')(...Object.values(context));
  return effects;
}
let r = await finishTest({ ok: false, error: 'Save failed' });
equal(r.routes, []); equal(r.errors.at(-1), 'Save failed'); equal(r.finishing.at(-1), false); equal(r.updates, 0);
r = await finishTest({ ok: true, mode: 'local' }); equal(r.routes, []); equal(r.updates, 0);
r = await finishTest({ ok: true, mode: 'supabase' }); equal(r.routes, ['/home']); equal(r.saved, [{ account: true }]); equal(r.updates, 1);
for (const overrides of [{ownerName:''}, {ownerPhone:'12'}, {businessName:''}, {templateId:''}]) {
 r = await finishTest({ok:true,mode:'supabase'}, overrides); equal(r.routes, []); equal(r.updates, 0);
}
r = await finishTest({ ok: true, mode: 'supabase' }, { ownerEmail: 'wrong@' });
equal(r.routes, []); equal(r.updates, 0);
equal(r.errors.at(-1), 'Enter a valid email address, or leave it blank.');
r = await finishTest({ ok: true, mode: 'supabase' }, { gstin: 'INVALID', isValidGstin: () => false });
equal(r.routes, []); equal(r.updates, 0);
equal(r.errors.at(-1), 'Enter a valid 15-character GSTIN, or leave it blank if unregistered.');
equal(/disabled=\{finishing \|\| s.id > step\}/.test(source), true);
console.log(`${passed} focused onboarding assertions passed`);
