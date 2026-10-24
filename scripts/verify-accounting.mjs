/**
 * Verifies the money rules behind receivables, payables and stock.
 *
 * It transpiles the real lib/business-data.ts (and the modules it imports) with
 * the TypeScript compiler, so the tested code is the shipped code. Each case is
 * a ledger the app writes, checked against the figure the owner sees.
 */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'dukaan-acct-'));
const compiled = new Map();

function resolveModule(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// Compile a source file and its relative imports to .mjs files in the temp dir.
function compile(file) {
  if (compiled.has(file)) return compiled.get(file);
  const target = join(out, file.slice(root.length + 1).replace(/\.tsx?$/, '.mjs'));
  compiled.set(file, target);
  const source = readFileSync(file, 'utf8');
  let js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  js = js.replace(/(from\s+|import\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (match, lead, quote, spec) => {
    const resolved = resolveModule(file, spec);
    if (!resolved) return match;
    const dep = compile(resolved);
    let rel = dep.slice(dirname(target).length + 1);
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `${lead}${quote}${rel}${quote}`;
  });
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, js);
  return target;
}

const entry = compile(join(root, 'lib/business-data.ts'));
const { summarizeFinancials, getAlerts } = await import(entry);

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed += 1; console.log(`  ok    ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
};
const near = (a, b) => Math.abs(a - b) < 0.005;
const tx = (over) => ({ id: Math.random().toString(36).slice(2), date: '2026-10-19', description: '', ...over });
const product = (over) => ({
  id: 'p', name: 'Item', itemType: 'product', stock: 0, cost: 10, price: 15, reorderLevel: 1, status: 'Active', unit: 'pcs', ...over,
});

console.log('Receivables (customer dues):');
{
  const sale = [
    tx({ type: 'sale', direction: 'in', account: 'revenue', amount: 100, paymentMethod: 'Credit' }),
    tx({ type: 'payment', direction: 'in', account: 'receivables', amount: 100, paymentMethod: 'Credit' }),
  ];
  const s = summarizeFinancials(sale, [], []);
  check('a credit sale is revenue and owed, not cash', near(s.customerReceivables, 100) && near(s.cashIn, 0) && near(s.revenue, 100), JSON.stringify(s));

  const collected = [
    ...sale,
    tx({ type: 'payment', direction: 'in', account: 'cash', amount: 40, paymentMethod: 'Cash' }),
    tx({ type: 'payment', direction: 'out', account: 'receivables', amount: 40 }),
  ];
  const c = summarizeFinancials(collected, [], []);
  check('collecting dues reduces receivables and adds cash', near(c.customerReceivables, 60) && near(c.cashBalance, 40), JSON.stringify(c));

  const opening = summarizeFinancials([], [], [{ openingBalance: 500 }, { openingBalance: 250 }]);
  check('opening balances count as receivables', near(opening.customerReceivables, 750), String(opening.customerReceivables));
}

console.log('Payables (owed to suppliers):');
{
  const onCredit = [
    tx({ type: 'stock_adjustment', direction: 'in', account: 'inventory', amount: 300 }),
    tx({ type: 'payment', direction: 'in', account: 'payables', amount: 300 }),
  ];
  const s = summarizeFinancials(onCredit, [], []);
  check('goods received on credit are payable and leave cash alone', near(s.payables, 300) && near(s.cashBalance, 0), JSON.stringify(s));

  const paid = [
    tx({ type: 'stock_adjustment', direction: 'in', account: 'inventory', amount: 200 }),
    tx({ type: 'payment', direction: 'out', account: 'bank', amount: 200, paymentMethod: 'Bank Transfer' }),
  ];
  const p = summarizeFinancials(paid, [], []);
  check('goods paid now leave the bank and owe nothing', near(p.bankBalance, -200) && near(p.payables, 0), JSON.stringify(p));

  const settled = [
    ...onCredit,
    tx({ type: 'payment', direction: 'out', account: 'bank', amount: 120, paymentMethod: 'Bank Transfer' }),
    tx({ type: 'payment', direction: 'out', account: 'payables', amount: 120 }),
  ];
  const q = summarizeFinancials(settled, [], []);
  check('a supplier payment reduces payables and the bank', near(q.payables, 180) && near(q.bankBalance, -120), JSON.stringify(q));
}

console.log('Stock and alerts:');
{
  const items = [product({ id: 'a', stock: 4, cost: 10 }), product({ id: 'b', stock: -2, cost: 5 })];
  const s = summarizeFinancials([], items, []);
  check('inventory is on-hand times cost; negative stock is not hidden', near(s.inventoryValue, 40 - 10), String(s.inventoryValue));
  const alerts = getAlerts(s, items);
  check('negative stock raises an oversold alert', alerts.some((a) => a.type === 'oversold' && a.tone === 'red'), JSON.stringify(alerts));
  const clean = getAlerts(summarizeFinancials([], [items[0]], []), [items[0]]);
  check('no oversold alert when stock is not negative', !clean.some((a) => a.type === 'oversold'));
}

console.log('Invoice arithmetic and settlement:');
{
  const I = await import(compile(join(root, 'lib/invoices.ts')));
  const base = { name: 'Cycle service', category: '', quantity: 3, unitPrice: 150.25 };
  const c = I.calculateInvoice([base], 18);
  check('invoice tax keeps paise instead of rounding to rupees', c.ok && c.subtotal === 450.75 && c.tax === 81.14 && c.total === 531.89);
  const rounded = I.calculateInvoice([{ ...base, quantity: 1.005, unitPrice: 1 }], 0);
  check('half-paise line amounts round consistently', rounded.ok && rounded.lines[0].total === 1.01 && rounded.total === 1.01);
  const decimal = I.calculateInvoice([{ ...base, quantity: 0.125, unitPrice: 19.99 }], 0);
  check('fractional quantities produce two-decimal line totals', decimal.ok && decimal.total === 2.5);
  const floats = I.calculateInvoice([{ ...base, quantity: 3, unitPrice: 0.1 }, { ...base, quantity: 1, unitPrice: 0.2 }], 0);
  check('decimal line amounts are summed as paise', floats.ok && floats.total === 0.5);
  for (const bad of [{ name: '' }, { quantity: 0 }, { quantity: -1 }, { quantity: Infinity }, { unitPrice: NaN }, { unitPrice: -1 }, { unitPrice: 1.234 }, { quantity: Number.MAX_VALUE }]) {
    check(`invalid invoice line is refused: ${JSON.stringify(bad)}`, !I.calculateInvoice([base, { ...base, ...bad }], 0).ok);
  }
  for (const tax of [-1, 101, NaN, Infinity]) check(`invalid tax is refused: ${tax}`, !I.calculateInvoice([base], tax).ok);
  check('a bill cannot be empty or worth zero', !I.calculateInvoice([], 0).ok && !I.calculateInvoice([{ ...base, unitPrice: 0 }], 0).ok);
  check('a complimentary line can accompany a paid item', I.calculateInvoice([base, { ...base, unitPrice: 0 }], 0).ok);
  const clean = I.calculateInvoice([{ ...base, key: 99 }], 0);
  check('draft-only row keys do not leak into stored invoice lines', clean.ok && !('key' in clean.lines[0]));
  check('invoice and payment amounts display paise', I.formatInvoiceAmount(81.14, 'en-IN').endsWith('81.14'));
  check('invoice numbering follows the greatest existing number', I.nextInvoiceId([{ id: 'INV-1005' }, { id: 'INV-1001' }, { id: 'imported-bill' }]) === 'INV-1006');

  const invoice = { id: 'INV-1005', businessId: 'biz-1', customerName: 'Customer', totalAmount: 965, paymentMethod: 'Cash', paymentStatus: 'partial' };
  const payment = { invoiceId: invoice.id, businessId: invoice.businessId, status: 'partial', amount: 500 };
  const payments = [payment, { ...payment, status: 'failed', amount: 100 }, { ...payment, status: 'pending', amount: 100 }, { ...payment, businessId: 'other-shop', amount: 100 }];
  check('only successful payments for this business reduce the bill', I.invoiceBalance(invoice, payments) === 465);
  check('overpayments never make a negative amount due', I.invoiceBalance(invoice, [{ ...payment, amount: 1000 }]) === 0);
  check('legacy paid invoices do not become collectible without payment records', I.invoiceBalance({ ...invoice, paymentStatus: 'paid' }, []) === 0);

  // Run the actual store actions with queued React-style updates. This catches
  // duplicate calls before React commits, not just arithmetic in a helper.
  const source = readFileSync(join(root, 'lib/store.tsx'), 'utf8');
  const ast = ts.createSourceFile('store.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const methods = new Map();
  const helpers = new Map();
  const visit = (node) => {
    if (ts.isMethodDeclaration(node) && ['createInvoice', 'markInvoicePaid'].includes(node.name.getText(ast))) methods.set(node.name.getText(ast), node.getText(ast));
    if (ts.isFunctionDeclaration(node) && ['newId', 'todayISO', 'methodAccount', 'methodGateway', 'buildRevenueTransactions'].includes(node.name?.text)) helpers.set(node.name.text, node.getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (methods.size !== 2 || helpers.size !== 5) throw Error('Invoice store action entry points moved; update the regression harness.');
  let state = { invoices: [invoice], paymentRecords: payments, transactions: [], profile: { timezone: 'Asia/Kolkata' } };
  const stateRef = { current: state };
  const invoiceSequence = { current: 1000 };
  const settlingInvoices = { current: new WeakSet() };
  const queued = [];
  let refusal = false;
  const deps = {
    calculateInvoice: I.calculateInvoice, invoiceBalance: I.invoiceBalance, nextInvoiceId: I.nextInvoiceId,
    stateRef, invoiceSequence, settlingInvoices,
    setState: (fn) => queued.push(fn), track: () => {},
    meterCollection: () => refusal ? { ok: false, code: 'collection-limit' } : { ok: true },
  };
  const js = ts.transpileModule([...helpers.values()].join('\n') + '\nconst actions = {' + [...methods.values()].join(',\n') + '};', {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const actions = new Function(...Object.keys(deps), js + '\nreturn actions;')(...Object.values(deps));
  const flush = () => { for (const fn of queued.splice(0)) state = fn(state); stateRef.current = state; };
  const draft = { customerName: '', lines: [base], taxRate: 18, method: 'Cash' };
  const created = actions.createInvoice(draft);
  const second = actions.createInvoice(draft);
  check('rapid bill creation reserves two different invoice numbers', created.ok && second.ok && created.invoiceId === 'INV-1006' && second.invoiceId === 'INV-1007');
  flush();
  const saved = state.invoices.find((item) => item.id === created.invoiceId);
  check('walk-in bills save as unpaid and return the id to open', saved?.customerName === 'Walk-in customer' && saved.paymentStatus === 'pending' && saved.totalAmount === 531.89 && state.transactions.length === 0);
  const rejected = actions.createInvoice({ ...draft, lines: [base, { ...base, name: '' }] });
  check('an incomplete row prevents the whole bill from being saved', !rejected.ok && queued.length === 0);
  check('credit cannot be mistaken for money received', !actions.markInvoicePaid(invoice.id, 'Credit').ok && queued.length === 0);
  refusal = true;
  check('a collection limit leaves payments untouched', !actions.markInvoicePaid(invoice.id, 'UPI').ok && queued.length === 0);
  refusal = false;
  const settled = actions.markInvoicePaid(invoice.id, 'Cash');
  const repeated = actions.markInvoicePaid(invoice.id, 'Cash');
  check('the last collection uses only the unpaid balance', settled.ok && settled.amount === 465);
  check('a second confirmation before React commits cannot duplicate payment', !repeated.ok && queued.length === 1);
  flush();
  check('settling a part-paid bill records only remaining cash and revenue', state.paymentRecords.at(-1).amount === 465 && state.transactions.length === 2 && state.transactions.every((tx) => tx.amount === 465));
  check('settled bills remain uncollectible after commit', !actions.markInvoicePaid(invoice.id, 'Cash').ok && I.invoiceBalance(state.invoices[0], state.paymentRecords) === 0);
}

// Integration groundwork for PR #52: repeated lines must be validated as one basket.
{
  const { validateSaleStock } = await import(compile(join(root, 'lib/sale-stock.ts')));
  const soap = { id: 'soap', name: 'Soap', itemType: 'product', stock: 5 };
  const a = (quantity, rate = 100) => ({ productId: 'soap', quantity, rate });
  const oversold = validateSaleStock([a(3), a(3)], [soap]);
  check('repeated sale lines cannot jointly oversell stock', !oversold.ok);

  const valid = validateSaleStock([a(2), a(3)], [soap]);
  check('sale validation groups repeated items before stock posting', valid.ok && valid.quantities.get('soap') === 5);

  check('sale validation refuses non-finite quantities', !validateSaleStock([a(Number.POSITIVE_INFINITY)], [soap]).ok);
  check('sale validation refuses non-finite rates', !validateSaleStock([a(1, Number.NaN)], [soap]).ok);
  check('sale validation refuses unknown products', !validateSaleStock([a(1)], []).ok);
  const service = { id: 'svc', name: 'Service', itemType: 'service', stock: 0 };
  check('services remain sellable without physical stock', validateSaleStock([{ productId: 'svc', quantity: 2, rate: 100 }], [service]).ok);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

