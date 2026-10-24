import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd(), cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} }; cache.set(filename, loaded);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const imported = name => {
    const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : null;
    return base ? load(base.endsWith('.ts') ? base : `${base}.ts`) : require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(imported, loaded, loaded.exports);
  return loaded.exports;
}
const W = load('lib/workspace.ts');
const { MODULE_CATALOGUE } = load('lib/portals/catalogue.ts');
const { PORTALS } = load('lib/portals/registry.ts');
const { resolveNav } = load('lib/portals/nav.ts');
const { moduleForPath, checkPortalAccess } = load('lib/portals/routes.ts');
const { checkPlanAccess } = load('lib/plans/routes.ts');
const { resolveEntitlement } = load('lib/plans/lifecycle.ts');
let passed = 0;
function check(label, fn) { fn(); passed++; console.log(`ok ${label}`); }
check('each existing module has exactly one work area', () => {
  const modules = W.WORK_AREAS.flatMap(area => area.modules);
  assert.equal(modules.length, MODULE_CATALOGUE.length);
  assert.equal(new Set(modules).size, modules.length);
  assert.deepEqual([...modules].sort(), MODULE_CATALOGUE.map(entry => entry.module).sort());
});
for (const portal of PORTALS) check(`${portal.id}: every granted tool remains reachable, without duplicates`, () => {
  const sections = resolveNav(portal);
  const areas = W.workspaceAreas(sections);
  const source = sections.flatMap(section => section.links).map(link => link.href);
  const output = areas.flatMap(area => area.links).map(link => link.href);
  assert.deepEqual(output.slice().sort(), [...new Set(source)].sort());
  assert.equal(output.length, new Set(output).size);
  assert(areas.length <= 7);
  for (const href of output) assert(source.includes(href));
  assert.deepEqual(W.workspaceAreas(sections), W.workspaceAreas([...sections].reverse()));
});
check('revealing more tools retains one destination per route', () => {
  const links = MODULE_CATALOGUE.map(entry => ({ ...entry, icon: null }));
  const areas = W.workspaceAreas([{ title: 'Normal', links }, { title: 'Revealed', links }]);
  assert.equal(areas.flatMap(area => area.links).length, MODULE_CATALOGUE.length);
  assert.equal(areas.length, 7);
});
check('nested bill creation retains the existing billing access boundary', () => {
  assert.equal(moduleForPath('/billing/new'), 'billing');
  const free = resolveEntitlement(null, Date.now());
  for (const portal of PORTALS) assert.equal(checkPortalAccess(portal.id, '/billing/new').allowed, checkPortalAccess(portal.id, '/billing').allowed);
  assert.equal(checkPlanAccess(free, '/billing/new').allowed, checkPlanAccess(free, '/billing').allowed);
});
check('route matching does not confuse neighboring or unknown routes', () => {
  assert(W.workspaceLinkMatches('/billing', '/billing/new'));
  assert(W.workspaceLinkMatches('/billing', '/billing?invoice=1'));
  assert(!W.workspaceLinkMatches('/billing', '/billing-export'));
  const areas = W.workspaceAreas([{ title: 'All', links: MODULE_CATALOGUE.map(entry => ({ ...entry, icon: null })) }]);
  assert.equal(W.activeWorkArea(areas, '/billing/new').id, 'billing');
  assert.equal(W.workspacePageTitle(areas, '/billing/new'), 'New bill');
  assert.equal(W.activeWorkArea(areas, '/not-a-tool'), undefined);
});
const { dailyWorkspace, dailyWorkspaceSnapshot } = load('lib/portals/daily-workspace.ts');
const { canUseDailyTask, canUseDailySetup } = load('lib/portals/daily-access.ts');
for (const portal of PORTALS) check(`${portal.id}: daily actions use verified role permissions`, () => {
  const config = dailyWorkspace(portal.id);
  for (const task of config.tasks) {
    assert(canUseDailyTask('owner', task.href), `owner action missing permission: ${task.href}`);
    assert(canUseDailyTask('manager', task.href));
    assert(!canUseDailyTask(undefined, task.href), 'unknown identity fails closed');
    assert.equal(canUseDailyTask('auditor', task.href), ['/customers', '/inventory'].includes(task.href));
    assert.equal(canUseDailyTask('cashier', task.href), !['/products', '/expenses'].includes(task.href));
  }
  for (const step of config.setup) {
    assert(canUseDailySetup('owner', step.collection));
    assert(!canUseDailySetup('auditor', step.collection));
    assert(!canUseDailySetup(null, step.collection));
  }
});
check('unconfigured daily actions fail closed', () => {
  assert(!canUseDailyTask('owner', '/not-a-tool'));
  assert(!canUseDailySetup('owner', 'not-a-collection'));
});
for (const portal of PORTALS) check(`${portal.id}: daily jobs and setup belong to the chosen business`, () => {
  const config = dailyWorkspace(portal.id);
  assert.equal(new Set(config.tasks.map(task => task.href)).size, config.tasks.length);
  for (const task of [...config.tasks, ...config.setup]) assert(checkPortalAccess(portal.id, task.href).allowed, `${portal.id} does not carry ${task.href}`);
  assert.equal(config.metrics.length, 4);
});
check('gym and restaurant daily homes do not inherit kirana jobs', () => {
  const gym = dailyWorkspace('gym'), cafe = dailyWorkspace('cafe'), kirana = dailyWorkspace('kirana');
  assert.equal(gym.focus, 'renewals');
  assert(!gym.tasks.some(task => ['/customers', '/billing/new', '/inventory', '/products'].includes(task.href)));
  assert(!cafe.tasks.some(task => ['/customers', '/memberships', '/check-ins'].includes(task.href)));
  assert.equal(kirana.focus, 'dues');
  assert(kirana.tasks.some(task => task.label === 'Udhaar khata'));
  const gymAreas = W.workspaceAreas(resolveNav(PORTALS.find(p => p.id === 'gym')), 'gym');
  assert(gymAreas.some(area => area.label === 'Members & plans'));
  assert(!gymAreas.some(area => area.id === 'stock' || area.id === 'billing'));
  const cafeAreas = W.workspaceAreas(resolveNav(PORTALS.find(p => p.id === 'cafe')), 'cafe');
  assert(cafeAreas.some(area => area.label === 'Menu & pantry'));
  assert(cafeAreas.flatMap(area => area.links).some(link => link.label === 'Menu'));
});
const records = {
  profile: { timezone: 'Asia/Kolkata' }, transactions: [], products: [], customers: [], invoices: [], members: [], plans: [], subscriptions: [], checkIns: [], appointments: [],
};
const now = new Date('2026-10-24T19:30:00Z'); // Already 25 October in this business.
check('gym metrics use current distinct members and the business day', () => {
  const state = { ...records,
    members: [{ id: 'a', name: 'Aman' }],
    subscriptions: [
      { id: 'a', memberId: 'a', startDate: '2026-10-01', expiryDate: '2026-10-30', status: 'active' },
      { id: 'b', memberId: 'a', startDate: '2026-10-01', expiryDate: '2026-10-31', status: 'active' },
      { id: 'c', memberId: 'b', startDate: '2026-10-01', expiryDate: '2026-10-24', status: 'active' },
      { id: 'd', memberId: 'c', startDate: '2026-10-01', expiryDate: '2026-10-30', status: 'paused' },
      { id: 'e', memberId: 'd', startDate: '2026-10-26', expiryDate: '2026-10-31', status: 'active' },
    ],
    checkIns: [{ at: '2026-10-24T19:00:00Z' }, { at: '2026-10-24T10:00:00Z' }],
  };
  const before = JSON.stringify(state), snap = dailyWorkspaceSnapshot('gym', state, now);
  assert.equal(snap.metrics.find(m => m.metric === 'activeMembers').value, 1);
  assert.equal(snap.metrics.find(m => m.metric === 'checkins').value, 1);
  assert.equal(snap.focus.rows.length, 2);
  assert.equal(snap.focus.rows[0].title, 'Aman');
  assert.equal(JSON.stringify(state), before);
});
check('kirana khata is the live ledger balance, not the opening amount', () => {
  const snap = dailyWorkspaceSnapshot('kirana', { ...records,
    customers: [{ id: 'a', name: 'Customer A', openingBalance: 100 }, { id: 'b', name: 'Credit customer', openingBalance: -200 }],
    transactions: [{ customerId: 'a', account: 'receivables', amount: 50, direction: 'in' }, { customerId: 'a', account: 'receivables', amount: 30, direction: 'out' }],
  }, now);
  assert.equal(snap.metrics.find(m => m.metric === 'dues').value, 120);
  assert.equal(snap.focus.rows.length, 1);
  assert.equal(snap.focus.rows[0].amount, 120);
  const { resolveMetric } = load('lib/portals/metrics.ts');
  const detail = resolveMetric('udhaarOutstanding', { ...records, customers: [{ id: 'a', openingBalance: 100 }], transactions: [{ customerId: 'a', account: 'receivables', amount: 50, direction: 'in' }, { customerId: 'a', account: 'receivables', amount: 30, direction: 'out' }], now, formatCurrency: String });
  assert.equal(detail.numeric, 120);
});
check('appointments use the business day and exclude cancelled slots', () => {
  const snap = dailyWorkspaceSnapshot('salon', { ...records, appointments: [
    { id: 'a', customerName: 'Today', startAt: '2026-10-24T19:30:00Z', status: 'booked' },
    { id: 'b', customerName: 'Cancelled', startAt: '2026-10-25T01:00:00Z', status: 'cancelled' },
    { id: 'c', customerName: 'Yesterday', startAt: '2026-10-24T01:00:00Z', status: 'booked' },
  ] }, now);
  assert.equal(snap.metrics.find(m => m.metric === 'appointments').value, 1);
  assert.deepEqual(snap.focus.rows.map(r => r.title), ['Today']);
});

console.log(`${passed} workspace scenarios passed.`);
