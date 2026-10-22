import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function moduleAt(file, mocks) {
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, require: (name) => name in mocks ? mocks[name] : require(name), process, Date, URL, Response, Request }, { filename: file });
  return compiled.exports;
}
const policy = moduleAt('lib/plans/platform-policy.ts', {});
let user = null;
const operatorId = '11111111-1111-4111-8111-111111111111';
const businessId = '22222222-2222-4222-8222-222222222222';
process.env.DUKAANOS_PLATFORM_ADMIN_IDS = operatorId;
const server = moduleAt('lib/plans/platform-server.ts', {
  '@/lib/security/guard': { getSessionUser: async () => user },
  './platform-policy': policy,
});
let calls = 0, inserted, dbError = null, active = true;
const service = { from(table) {
  calls++;
  return {
    select(fields) {
      if (table === 'plan_activation_keys') assert(!fields.includes('code_hash'));
      return { eq() { return { maybeSingle: async () => ({ data: { id: businessId, name: 'Test Shop', status: active ? 'active' : 'closed' } }), order() { return { limit: async () => ({ data: [] }) }; } }; } };
    },
    insert: async (row) => { inserted = row; return { error: dbError }; },
  };
} };
const route = moduleAt('app/api/platform/keys/route.ts', {
  '@/lib/plans/platform-server': server,
  '@/lib/plans/platform-policy': policy,
  '@/lib/supabase/admin': { getServiceRoleClient: () => service },
});
const body = { businessId, planId: 'growth', months: 3, reference: 'utr-12345', paymentVerified: true };
const request = (value = body) => new Request('https://test.invalid/api/platform/keys', { method: 'POST', body: JSON.stringify(value) });
let passed = 0;
async function check(label, test) { await test(); passed++; console.log('ok ' + label); }
await check('anonymous callers never reach privileged storage', async () => { calls = 0; assert.equal((await route.POST(request())).status, 403); assert.equal(calls, 0); });
await check('a shop owner cannot issue keys using a role or user metadata', async () => { user = { id: businessId, role: 'owner', user_metadata: { platform_admin: true } }; calls = 0; assert.equal((await route.POST(request())).status, 403); assert.equal(calls, 0); });
await check('administrator IDs match exactly and missing configuration denies all', async () => { assert(!policy.isPlatformOperator(operatorId, operatorId + '0')); assert(!policy.isPlatformOperator(operatorId, '')); assert(policy.isPlatformOperator(operatorId, ' other, ' + operatorId)); });
user = { id: operatorId };
await check('unverified payments and unsupported grants are rejected before storage', async () => { calls = 0; for (const value of [{ ...body, paymentVerified: false }, { ...body, months: 36 }, { ...body, planId: 'trial' }, { ...body, planId: 'scale', months: 1 }, { ...body, businessId: 'not-a-business' }]) assert.equal((await route.POST(request(value))).status, 422); assert.equal(calls, 0); });
await check('inactive businesses cannot receive keys', async () => { active = false; assert.equal((await route.POST(request())).status, 422); active = true; });
await check('successful issuance stores only a business-bound digest, never the raw key', async () => {
 const response = await route.POST(request()); assert.equal(response.status, 201);
 const value = await response.json(); assert.match(value.code, /^DKK1-[a-f0-9]{64}$/);
 assert.equal(inserted.code_hash, createHash('sha256').update(value.code).digest('hex'));
 assert.equal(inserted.business_id, businessId); assert.equal(inserted.months, 3); assert.equal(inserted.payment_reference, 'UTR-12345');
 assert(!JSON.stringify(inserted).includes(value.code)); assert.match(response.headers.get('cache-control'), /no-store/);
});
await check('duplicate bank references return conflict without a second usable key', async () => { dbError = { code: '23505' }; const r = await route.POST(request()); assert.equal(r.status, 409); assert.equal((await r.json()).code, undefined); });
await check('database failures never return an unpersisted key', async () => { dbError = { code: '42501' }; const r = await route.POST(request()); assert.equal(r.status, 503); assert.equal((await r.json()).code, undefined); dbError = null; });
await check('history omits key digests and is not cached', async () => { const r = await route.GET(new Request('https://test.invalid/api/platform/keys?business=' + businessId)); assert.equal(r.status, 200); assert.match(r.headers.get('cache-control'), /no-store/); });
await check('non-operators cannot list another business history', async () => { user = { id: businessId }; calls = 0; assert.equal((await route.GET(new Request('https://test.invalid/api/platform/keys?business=' + businessId))).status, 403); assert.equal(calls, 0); });
console.log(`${passed} key-console scenarios passed`);
