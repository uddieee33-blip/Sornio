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
    isValidIfsc: () => true, actions: { updateProfile: () => { effects.updates++; return { ok: true }; }, applyTemplate: () => ({ ok: true }) }, publishPortal: async () => ({ ok: true }),
    saveStoredProfile: async () => result, snapshotFromProfile: x => x, router: { push: x => effects.routes.push(x) }, window: { location: { assign: x => effects.routes.push(x) } }, setTimeout: fn => fn(), ...overrides,
  };
  await new Function(...Object.keys(context), 'return (async () => {' + body + '})();')(...Object.values(context));
  return effects;
}
let r = await finishTest({ ok: false, error: 'Save failed' });
equal(r.routes, []); equal(r.errors.at(-1), 'Save failed'); equal(r.finishing.at(-1), false); equal(r.updates, 0);
r = await finishTest({ ok: true, mode: 'local' }); equal(r.routes, []); equal(r.updates, 0);
r = await finishTest({ ok: true, mode: 'supabase' }); equal(r.routes, ['/home']); equal(r.saved, [{ account: true }]); equal(r.updates, 1);
r = await finishTest({ ok: true, mode: 'supabase' }, { publishPortal: async () => ({ ok: false, error: 'Publication failed' }) });
equal(r.routes, []); equal(r.saved, []); equal(r.errors.at(-1), 'Publication failed'); equal(r.finishing.at(-1), false);
r = await finishTest({ ok: true, mode: 'supabase' }, { actions: { updateProfile: () => ({ ok: true }), applyTemplate: () => ({ ok: false, error: 'Template failed' }) } });
equal(r.routes, []); equal(r.saved, []); equal(r.errors.at(-1), 'Template failed'); equal(r.finishing.at(-1), false);
r = await finishTest({ ok: true, mode: 'local' }, { accountBacked: false, publishPortal: async () => ({ ok: false }) });
equal(r.routes, ['/home']); equal(r.saved, [{ account: false }]);
for (const overrides of [{ownerName:''}, {ownerPhone:'12'}, {businessName:''}, {templateId:''}]) {
 r = await finishTest({ok:true,mode:'supabase'}, overrides); equal(r.routes, []); equal(r.updates, 0);
}
r = await finishTest({ ok: true, mode: 'supabase' }, { ownerEmail: 'wrong@' });
equal(r.routes, []); equal(r.updates, 0);
equal(r.errors.at(-1), 'Enter a valid email address.');
r = await finishTest({ ok: true, mode: 'supabase' }, { gstin: 'INVALID', isValidGstin: () => false });
equal(r.routes, []); equal(r.updates, 0);
equal(r.errors.at(-1), 'Enter a valid 15-character GSTIN, or leave it blank if unregistered.');
equal(/disabled=\{finishing \|\| s.id > step\}/.test(source), true);
const ownerStep = fs.readFileSync(root + 'components/onboarding/owner-details-step.tsx', 'utf8');
const bankStep = fs.readFileSync(root + 'components/onboarding/bank-details-step.tsx', 'utf8');
equal(source.includes('<OwnerDetailsStep'), true);
equal(source.includes('<BankDetailsStep'), true);
equal(ownerStep.includes('autoComplete="name"'), true);
equal(ownerStep.includes('type="tel"'), true);
equal(ownerStep.includes('type="email"'), true);
equal(bankStep.includes("showAccountNumber ? 'text' : 'password'"), true);
equal(bankStep.includes('maskAccountNumber(accountNumber)'), true);
equal(bankStep.includes('QRCodeCanvas value={deepLink}'), true);
r = await finishTest({ ok: true, mode: 'supabase' }, { accountNumber: '123456789', ifsc: '' });
equal(r.routes, []);
equal(r.updates, 0);
equal(r.errors.at(-1), 'Enter a valid IFSC code (e.g. HDFC0001234).');
r = await finishTest({ ok: true, mode: 'supabase' }, { accountNumber: '123456789', ifsc: 'HDFC0001234', accountHolder: '' });
equal(r.routes, []); equal(r.updates, 0);
equal(r.errors.at(-1), 'Enter the account holder name as shown by your bank.');
r = await finishTest({ ok: true, mode: 'supabase' }, { accountNumber: '123456789', ifsc: 'HDFC0001234', accountHolder: 'Actual Account Holder' });
equal(r.routes, ['/home']);
equal(source.includes('<BusinessDetailsStep'), true);
const businessStep = fs.readFileSync(root + 'components/onboarding/business-details-step.tsx', 'utf8');
equal(businessStep.includes('dailyWorkspace(portalForTemplate(templateId).id)'), true);
equal(bankStep.includes('id="setup-gstin"'), true);
console.log(`${passed} focused onboarding assertions passed`);
