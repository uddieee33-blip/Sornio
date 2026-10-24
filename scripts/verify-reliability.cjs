/* eslint-disable @typescript-eslint/no-require-imports -- This harness intercepts the CommonJS loader to run real store commands. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
let state,
  stateIndex = 0,
  initial;
const react = {
  createContext: () => ({ Provider: Symbol('provider') }),
  useContext: () => null,
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  useState: (value) => {
    const i = stateIndex++;
    let local =
      i === 0
        ? (initial ?? (typeof value === 'function' ? value() : value))
        : i === 1
          ? true
          : typeof value === 'function'
            ? value()
            : value;
    if (i === 0) state = local;
    return [
      local,
      (next) => {
        local = typeof next === 'function' ? next(local) : next;
        if (i === 0) state = local;
      },
    ];
  },
};
const data = new Map();
global.window = {
  localStorage: {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  },
};

const client = {
  auth: {
    getUser: async () => ({
      data: { user: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } },
    }),
  },
  from: () => {
    const q = {
      select: () => q,
      eq: () => q,
      limit: () => q,
      maybeSingle: async () => ({
        data: {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          business_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        },
      }),
    };
    return q;
  },
  rpc: async () => ({ error: null }),
};
const originalLoad = Module._load;
Module._load = function (spec, parent, isMain) {
  if (spec === 'react') return react;
  if (spec === 'react/jsx-runtime')
    return {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    };
  if (spec === '@/lib/supabase/client') return { getBrowserSupabaseClient: () => client };
  if (spec.startsWith('@/')) spec = path.join(root, spec.slice(2));
  return originalLoad.call(this, spec, parent, isMain);
};
for (const ext of ['.ts', '.tsx'])
  Module._extensions[ext] = function (mod, file) {
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    mod._compile(output, file);
  };
const store = require(path.join(root, 'lib/store.tsx'));
function mount(seed) {
  stateIndex = 0;
  initial = seed;
  const rendered = store.DukaanStoreProvider({
    children: null,
    initialIdentity: {
      userId: 'test-owner',
      role: 'owner',
      provider: 'local',
      displayName: 'Owner',
      expiresAt: null,
      remember: false,
    },
  });
  return rendered.props.children.props.value;
}
const product = {
  id: 'p-test',
  name: 'Soap',
  category: 'Goods',
  itemType: 'product',
  sellingPrice: 100,
  cost: 60,
  stock: 5,
  reorderLevel: 1,
  status: 'Active',
};

const assert = require('node:assert/strict');
const { customerBalance, businessDate } = require(path.join(root, 'lib/accounting.ts'));
const { mergeSnapshot, stateRecords, changesFor } = require(path.join(root, 'lib/sync/records.ts'));
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok', name);
}
check('duplicate sale lines validate their combined stock', () => {
  const a = mount({ ...store.buildEmptyState(), products: [product] });
  const result = a.recordSale({
    lines: [
      { productId: product.id, quantity: 3, rate: 100 },
      { productId: product.id, quantity: 3, rate: 100 },
    ],
    method: 'Cash',
  });
  assert.equal(result.ok, false);
  assert.equal(state.products[0].stock, 5);
  assert.equal(state.transactions.length, 0);
});
check('duplicate lines deduct the entire quantity exactly once', () => {
  const a = mount({
    ...store.buildEmptyState(),
    products: [{ ...product, stock: 10 }],
  });
  assert.equal(
    a.recordSale({
      lines: [
        { productId: product.id, quantity: 3, rate: 100 },
        { productId: product.id, quantity: 2, rate: 90 },
      ],
      method: 'Cash',
    }).ok,
    true,
  );
  assert.equal(state.products[0].stock, 5);
  assert.equal(
    state.stockMovements.reduce((n, m) => n + m.delta, 0),
    -5,
  );
  assert.equal(state.transactions.find((t) => t.type === 'sale').amount, 480);
});
check('repeated delivery lines keep the catalogue and stock ledger in agreement', () => {
  const a = mount({ ...store.buildEmptyState(), products: [product] });
  assert.equal(
    a.recordStockInward({
      lines: [
        { productId: product.id, quantity: 2, cost: 60 },
        { productId: product.id, quantity: 3, cost: 60 },
      ],
      payment: { mode: 'credit' },
    }).ok,
    true,
  );
  assert.equal(state.products[0].stock, 10);
  assert.equal(
    state.stockMovements.reduce((sum, m) => sum + m.delta, 0),
    5,
  );
  assert.equal(state.transactions.find((t) => t.account === 'payables').amount, 300);
});
check('rapid successive actions read the latest committed stock', () => {
  const a = mount({ ...store.buildEmptyState(), products: [product] });
  assert.equal(
    a.recordSale({
      lines: [{ productId: product.id, quantity: 3, rate: 100 }],
      method: 'Cash',
    }).ok,
    true,
  );
  assert.equal(
    a.recordSale({
      lines: [{ productId: product.id, quantity: 3, rate: 100 }],
      method: 'Cash',
    }).ok,
    false,
  );
});
check('invoice issue posts stock, net revenue, tax and customer dues', () => {
  const a = mount({ ...store.buildEmptyState(), products: [product] });
  assert.equal(
    a.createInvoice({
      customerName: 'A',
      lines: [
        {
          productId: product.id,
          name: 'Soap',
          category: 'Goods',
          quantity: 1,
          unitPrice: 100,
        },
      ],
      method: 'Cash',
      taxRate: 18,
    }).ok,
    true,
  );
  assert.equal(state.products[0].stock, 4);
  assert.equal(state.invoices[0].totalAmount, 118);
  let money = require(path.join(root, 'lib/business-data.ts')).summarizeFinancials(
    state.transactions,
    state.products,
    state.customers,
  );
  assert.equal(money.revenue, 100);
  assert.equal(money.cogs, 60);
  assert.equal(money.netProfit, 40);
  assert.equal(money.customerReceivables, 118);
  assert.equal(money.cashIn, 0);
  const inv = state.invoices[0];
  const b = mount(state);
  assert.equal(b.markInvoicePaid(inv.id, 'Cash', { amount: 50 }).ok, true);
  assert.equal(state.invoices[0].paymentStatus, 'partial');
  assert.equal(
    b.markInvoicePaid(inv.id, 'Bank Transfer', {
      reference: 'UTR-123',
      amount: 68,
    }).ok,
    true,
  );
  assert.equal(state.invoices[0].paymentStatus, 'paid');
  assert.equal(state.paymentRecords[1].reference, 'UTR-123');
  assert.equal(b.markInvoicePaid(inv.id, 'Cash').ok, false);
  money = require(path.join(root, 'lib/business-data.ts')).summarizeFinancials(
    state.transactions,
    state.products,
    state.customers,
  );
  assert.equal(money.revenue, 100);
  assert.equal(money.customerReceivables, 0);
  assert.equal(money.cashIn, 118);
});
check('an invoice cannot be marked paid on credit or without a bank reference', () => {
  const a = mount(store.buildEmptyState());
  a.createInvoice({
    customerName: 'A',
    lines: [{ name: 'Service', category: 'Services', quantity: 1, unitPrice: 10 }],
    method: 'Cash',
    taxRate: 0,
  });
  const id = state.invoices[0].id,
    b = mount(state);
  assert.equal(b.markInvoicePaid(id, 'Credit').ok, false);
  assert.equal(b.markInvoicePaid(id, 'Bank Transfer').ok, false);
});
check('customer collection changes the same balance every screen uses', () => {
  const c = {
    id: 'a',
    name: 'A',
    openingBalance: 100,
    createdAt: new Date().toISOString(),
  };
  const a = mount({ ...store.buildEmptyState(), customers: [c] });
  assert.equal(a.collectDue({ amount: 100, method: 'Cash', customerId: 'a' }).ok, true);
  assert.equal(customerBalance(c, state.transactions), 0);
  assert.equal(a.collectDue({ amount: 1, method: 'Cash', customerId: 'a' }).ok, false);
});
check('customer dues collections allocate to open invoices', () => {
  const a = mount(store.buildEmptyState());
  a.createInvoice({
    customerName: 'A',
    lines: [{ name: 'Service', category: 'Services', quantity: 1, unitPrice: 100 }],
    method: 'Cash',
    taxRate: 0,
  });
  const customer = state.customers[0],
    invoice = state.invoices[0],
    b = mount(state);
  assert.equal(b.collectDue({ amount: 40, method: 'Cash', customerId: customer.id }).ok, true);
  assert.equal(state.invoices[0].paymentStatus, 'partial');
  assert.equal(b.markInvoicePaid(invoice.id, 'Cash').ok, true);
  assert.equal(customerBalance(customer, state.transactions), 0);
  assert.equal(
    state.paymentRecords.reduce((sum, p) => sum + p.amount, 0),
    100,
  );
});
check('money retains paise and dates follow the business timezone', () => {
  const a = mount(store.buildEmptyState());
  a.createInvoice({
    customerName: 'A',
    lines: [{ name: 'Service', category: 'Services', quantity: 1, unitPrice: 10 }],
    method: 'Cash',
    taxRate: 18,
  });
  assert.equal(state.invoices[0].tax, 1.8);
  assert.equal(businessDate(new Date('2026-10-21T18:45:00Z'), 'Asia/Kolkata'), '2026-10-22');
});
check('demo exploration can return to the untouched real business', () => {
  const a = mount({ ...store.buildEmptyState(), products: [product] });
  a.loadDemoBusiness();
  assert.equal(state.demoMode, true);
  a.leaveDemo();
  assert.equal(state.demoMode, false);
  assert.equal(state.products[0].id, product.id);
});
check('every durable collection is represented in sync', () => {
  const seeded = store.buildSeedState(),
    keys = new Set(stateRecords(seeded).map((row) => row.kind));
  for (const key of ['invoices', 'paymentRecords', 'members', 'plans', 'subscriptions', 'stockMovements', 'audit'])
    assert(keys.has(key), key);
});
check('a populated device adopts another devices new ledger records', () => {
  let local = store.buildEmptyState();
  local.audit = [];
  const snapshot = {
    businessId: 'shop',
    generation: 0,
    records: [
      {
        kind: 'transactions',
        id: 't1',
        data: {
          id: 't1',
          type: 'sale',
          amount: 10,
          account: 'revenue',
          direction: 'in',
          date: '2026-10-21',
        },
        revision: 1,
      },
    ],
  };
  local = mergeSnapshot(local, snapshot);
  local = mergeSnapshot(local, {
    ...snapshot,
    records: [
      ...snapshot.records,
      {
        kind: 'transactions',
        id: 't2',
        data: { ...snapshot.records[0].data, id: 't2' },
        revision: 1,
      },
    ],
  });
  assert.equal(local.transactions.length, 2);
  assert.throws(() => mergeSnapshot(local, { ...snapshot, generation: 1 }), /reset/);
  assert.throws(() => mergeSnapshot(local, { ...snapshot, businessId: 'other' }), /different business/);
});
check('acknowledged saves preserve edits made while a request was in flight', () => {
  let local = { ...store.buildEmptyState(), products: [product] };
  local = mergeSnapshot(local, {
    businessId: 'shop',
    generation: 0,
    records: [],
  });
  const sent = local;
  const after = { ...local, products: [{ ...product, name: 'New name' }] };
  const row = stateRecords(sent).find((r) => r.kind === 'products');
  const merged = mergeSnapshot(after, { businessId: 'shop', generation: 0, records: [{ ...row, revision: 1 }] }, sent);
  assert.equal(merged.products[0].name, 'New name');
  assert(changesFor(merged).some((r) => r.kind === 'products'));
  const conflict = {
    ...merged,
    products: [{ ...merged.products[0], name: 'Local' }],
  };
  assert.throws(
    () =>
      mergeSnapshot(conflict, {
        businessId: 'shop',
        generation: 0,
        records: [{ ...row, data: { ...row.data, name: 'Remote' }, revision: 2 }],
      }),
    /same record/,
  );
});
check('a revoked device credential stays revoked through pull-before-push', () => {
  const credential = {
    id: 'bio',
    memberId: 'm',
    credentialId: 'credential',
    memberName: 'Member',
    createdAt: '2026-10-21',
    useCount: 0,
    attachment: 'platform',
    label: 'Desk',
  };
  let local = store.buildEmptyState();
  local.biometricCredentials = [credential];
  const snapshot = {
    businessId: 'shop',
    generation: 0,
    records: [{ kind: 'biometricCredentials', id: 'bio', data: credential, revision: 1 }],
  };
  local = mergeSnapshot(local, snapshot);
  local = { ...local, biometricCredentials: [] };
  local = mergeSnapshot(local, snapshot);
  assert.equal(local.biometricCredentials.length, 0);
  assert.equal(changesFor(local).find((r) => r.kind === 'biometricCredentials').data.revoked, true);
});
console.log(passed + ' reliability scenarios passed');
