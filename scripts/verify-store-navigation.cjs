/* eslint-disable @typescript-eslint/no-require-imports -- Exercises the actual provider with deterministic hook lifecycles. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const ts = require('typescript');
const slots = [];
const snapshots = new Map();
let cursor = 0, dirty = true, pending = [], rendered, reads = 0, firstKey;
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const react = {
  createContext: () => ({ Provider: Symbol('provider') }),
  useState(initial) {
    const i = cursor++;
    slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [slots[i].value, next => {
      const value = typeof next === 'function' ? next(slots[i].value) : next;
      if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
    }];
  },
  useRef(initial) {
    const i = cursor++;
    slots[i] ??= { current: initial };
    return slots[i];
  },
  useMemo(factory, deps) {
    const i = cursor++;
    if (!same(slots[i]?.deps, deps)) slots[i] = { value: factory(), deps };
    return slots[i].value;
  },
  useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
  useEffect(effect, deps) {
    const i = cursor++;
    if (!same(slots[i]?.deps, deps)) {
      const previous = slots[i];
      slots[i] = { deps, cleanup: previous?.cleanup };
      pending.push(() => { previous?.cleanup?.(); slots[i].cleanup = effect(); });
    }
  },
};
global.window = {
  addEventListener() {}, removeEventListener() {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
const originalLoad = Module._load;
Module._load = function(spec, parent, main) {
  if (spec === 'react') return react;
  if (spec === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  if (spec === '@/lib/supabase/config') return { currentSyncMode: () => 'local' };
  if (spec === '@/lib/security/vault') return {
    vaultRead: async key => { reads++; firstKey ??= key; return snapshots.has(key) ? { ok: true, data: structuredClone(snapshots.get(key)), encrypted: true } : { ok: false, error: 'No saved data yet.' }; },
    vaultRestoreBackup: async () => ({ ok: false, error: 'No backup snapshot available.' }),
    vaultWrite: async (key, data) => { snapshots.set(key, structuredClone(data)); return { ok: true, encrypted: true }; },
  };
  if (spec.startsWith('@/')) spec = path.join(root, spec.slice(2));
  return originalLoad.call(this, spec, parent, main);
};
for (const extension of ['.ts', '.tsx']) Module._extensions[extension] = (mod, file) => {
  mod._compile(ts.transpileModule(fs.readFileSync(file === path.join(root, 'lib/store.tsx') && process.argv[2] ? path.resolve(process.argv[2]) : file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, file);
};
const store = require(path.join(root, 'lib/store.tsx'));
let identity = { userId: 'navigation-owner', businessId: 'business-one', role: 'owner', provider: 'local', displayName: 'Owner', expiresAt: null, remember: false };
function render() {
  cursor = 0; dirty = false;
  rendered = store.DukaanStoreProvider({ initialIdentity: identity, children: null });
  const effects = pending; pending = []; effects.forEach(effect => effect());
}
async function settle() {
  for (let i = 0; i < 12; i++) {
    if (dirty) render();
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(dirty, false, 'provider settles after effects');
}
const state = () => rendered.props.value.state;
const actions = () => rendered.props.children.props.value;
(async () => {
  try {
    render(); await settle();
    const profileBefore = JSON.stringify(state().profile);
    for (const bank of [
      { accountNumber: '12ab34' },
      { accountNumber: '1'.repeat(21), ifsc: 'HDFC0001234', accountHolder: 'Owner' },
      { accountNumber: '123456', accountHolder: 'Owner' },
      { accountNumber: '123456', ifsc: 'HDFC0001234' },
      { upiId: 'bad upi' },
    ]) assert.equal(actions().updateProfile({ bank }).ok, false);
    assert.equal(actions().updateProfile({ upiId: 'one@bank', bank: { upiId: 'other@bank' } }).ok, false);
    await settle();
    assert.equal(JSON.stringify(state().profile), profileBefore, 'invalid bank settings never change the local profile');
    console.log('ok invalid bank settings preserve the local profile');
    const result = actions().createInvoice({ customerName: 'Navigation customer', lines: [{ name: 'Service', category: 'Services', quantity: 1, unitPrice: 200 }], method: 'Cash', taxRate: 0 });
    assert.equal(result.ok, true);
    await settle();
    // A previously saved unpaid bill, while the new payment has not yet hit the debounce.
    snapshots.set(firstKey, structuredClone(state()));
    assert.equal(actions().markInvoicePaid(result.invoiceId, 'Cash').ok, true);
    await settle();
    const readsBeforeNavigation = reads;
    identity = { ...identity }; // The same signed identity, freshly serialized by navigation.
    dirty = true; await settle();
    assert.equal(reads, readsBeforeNavigation, 'same-owner navigation must not reload a stale snapshot');
    assert.equal(state().invoices.find(invoice => invoice.id === result.invoiceId).paymentStatus, 'paid');
    assert.equal(state().paymentRecords.length, 1);
    console.log('ok same-owner navigation preserves an unflushed payment');

    const other = store.buildEmptyState(); other.profile.name = 'Another business';
    snapshots.set(firstKey.replace('navigation-owner.business-one', 'another-owner.another-business'), other);
    identity = { ...identity, userId: 'another-owner', businessId: 'another-business' };
    dirty = true; await settle();
    assert(reads > readsBeforeNavigation, 'a different account must load its own storage scope');
    assert.equal(state().profile.name, 'Another business');
    assert.equal(state().invoices.length, 0);
    console.log('ok different-owner navigation still loads the new storage scope');
  } finally {
    slots.forEach(slot => slot?.cleanup?.());
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
