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
console.log(`${passed} workspace scenarios passed.`);
