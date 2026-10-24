#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
const modules = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  modules.set(filename, loaded);
  const imported = (name) => {
    const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : null;
    return base ? load(base.endsWith('.ts') ? base : base + '.ts') : require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(imported, loaded, loaded.exports);
  return loaded.exports;
}
const { shopkeeperSummary, DAILY_TASKS } = load('lib/shopkeeper.ts');
const { getCustomerDueReminders, normalizePhoneForLink } = load('lib/reminders.ts');
const { offlineCollectionError } = load('lib/offline-payments.ts');
let passed = 0;
function check(label, fn) { fn(); passed++; console.log(`ok ${label}`); }
check('offline cash and unpaid credit can proceed without claiming digital settlement', () => {
  assert.equal(offlineCollectionError('Cash', false), null);
  assert.equal(offlineCollectionError('Credit', false), null);
  for (const method of ['UPI', 'Card', 'Bank Transfer']) {
    assert.match(offlineCollectionError(method, false), /Keep the bill unpaid/);
    assert.equal(offlineCollectionError(method, true), null);
  }
});

const state = {
  profile: { name: 'Counter & Co', timezone: 'Asia/Kolkata' },
  products: [
    { status: 'Active', itemType: 'product', stock: 1, reorderLevel: 2 },
    { status: 'Inactive', itemType: 'product', stock: 0, reorderLevel: 2 },
    { status: 'Active', itemType: 'service', stock: 0, reorderLevel: 2 },
  ],
  customers: [{ id: 'customer-1', name: 'Aman Singh', phone: '98765 43210', openingBalance: 100.25 }],
  transactions: [
    { id: 'sale', customerId: 'customer-1', type: 'sale', account: 'receivables', direction: 'in', amount: 50.50, date: '2026-10-24' },
    { id: 'collection-due', customerId: 'customer-1', type: 'payment', account: 'receivables', direction: 'out', amount: 20.25, date: '2026-10-24' },
    { id: 'collection-cash', type: 'payment', account: 'cash', direction: 'in', amount: 20.25, date: '2026-10-24' },
    { id: 'revenue', type: 'sale', account: 'revenue', direction: 'in', amount: 50.50, date: '2026-10-24' },
    { id: 'transfer', type: 'transfer', account: 'bank', direction: 'in', amount: 500, date: '2026-10-24' },
    { id: 'yesterday', type: 'payment', account: 'cash', direction: 'in', amount: 999, date: '2026-10-23' },
  ],
};
check('today uses the business timezone and counts collections without revenue or transfer duplication', () => {
  const result = shopkeeperSummary(state, new Date('2026-10-23T20:00:00Z'));
  assert.equal(result.receivedToday, 20.25);
  assert.equal(result.customersOwe, 130.50);
  assert.equal(result.lowStock, 1);
});
check('customer credits cannot hide what other customers owe', () => {
  assert.equal(shopkeeperSummary({ ...state, customers: [...state.customers, { id: 'credit', openingBalance: -500 }] }).customersOwe, 130.50);
});
check('payment reminder amount agrees with the current customer ledger', () => {
  const [draft] = getCustomerDueReminders(state);
  assert.equal(draft.amount, 130.50);
  assert.equal(draft.phone, '919876543210');
  assert.match(draft.message, /INR 130\.50/);
  assert.equal(new URL(draft.whatsappHref).searchParams.get('text'), draft.message);
  assert.equal(new URL(draft.smsHref).searchParams.get('body'), draft.message);
});
check('paying a due removes the draft instead of leaving a stale demand', () => {
  const paid = { ...state, transactions: [...state.transactions, { customerId: 'customer-1', type: 'payment', account: 'receivables', direction: 'out', amount: 130.50 }] };
  assert.equal(getCustomerDueReminders(paid).length, 0);
});
check('invalid contact details never generate a message link', () => {
  for (const phone of ['', '123', '1234567890', '98765x43210', '+910123456789', 'https://evil.example/9876543210']) {
    assert.equal(normalizePhoneForLink(phone), '');
    assert.equal(getCustomerDueReminders({ ...state, customers: [{ ...state.customers[0], phone }] }).length, 0);
  }
  assert.equal(normalizePhoneForLink('+44 20 7946 0958'), '442079460958');
  assert.equal(normalizePhoneForLink('0091 9876543210'), '919876543210');
});
check('drafts contain no delivery claim or mutation of the business records', () => {
  const before = JSON.stringify(state);
  const [draft] = getCustomerDueReminders(state);
  assert.equal('sentAt' in draft, false);
  assert.equal('deliveredAt' in draft, false);
  assert.equal(JSON.stringify(state), before);
});
check('daily tasks use unique internal paths', () => {
  assert.equal(new Set(DAILY_TASKS.map(task => task.href)).size, DAILY_TASKS.length);
  assert.ok(DAILY_TASKS.every(task => task.href.startsWith('/') && !task.href.startsWith('//')));
});
check('the service worker Trusted Types policy approves only the fixed local worker', () => {
  const { serviceWorkerUrl } = load('lib/pwa/worker-url.ts');
  assert.equal(serviceWorkerUrl({}), '/sw.js');
  let rules;
  const trusted = { fixed: true };
  const value = serviceWorkerUrl({ trustedTypes: { createPolicy: (name, callbacks) => {
    assert.equal(name, 'dukaanos#service-worker');
    rules = callbacks;
    return { createScriptURL: (url) => { callbacks.createScriptURL(url); return trusted; } };
  } } });
  assert.equal(value, trusted);
  assert.throws(() => rules.createScriptURL('https://evil.example/sw.js'), /Unexpected/);
  assert.throws(() => rules.createScriptURL('/sw.js?other=1'), /Unexpected/);
});
console.log(`${passed} shopkeeper scenarios passed`);
