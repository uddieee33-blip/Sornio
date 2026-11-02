/**
 * Verifies the money rules behind receivables, payables and stock.
 *
 * It transpiles the real lib/business-data.ts (and the modules it imports) with
 * the TypeScript compiler, so the tested code is the shipped code. Each case is
 * a ledger the app writes, checked against the figure the owner sees.
 */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
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
    let rel = relative(dirname(target), dep).split(sep).join('/');
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

  // Execute the actual command bodies with synchronous stateRef commits.
  // React rendering may be queued; subsequent commands must see the committed ledger.
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
  let state = { invoices: [invoice], paymentRecords: payments, transactions: [], products: [], customers: [], stockMovements: [], settings: { receiptMode: 'both' }, profile: { timezone: 'Asia/Kolkata' } };
  const stateRef = { current: state };
  const invoiceSequence = { current: 1000 };
  const settlingInvoices = { current: new WeakSet() };
  const queued = [];
  let refusal = false;
  const deps = {
    calculateInvoice: I.calculateInvoice, invoiceBalance: I.invoiceBalance, nextInvoiceId: I.nextInvoiceId,
    stateRef, invoiceSequence, settlingInvoices, identityRef: { current: { userId: 'test-owner' } },
    setState: (update) => { const next = typeof update === 'function' ? update(stateRef.current) : update; stateRef.current = next; queued.push(next); }, track: () => {},
    ...(await import(compile(join(root, 'lib/accounting.ts')))),
    ...(await import(compile(join(root, 'lib/accounting-posting.ts')))),
    ...(await import(compile(join(root, 'lib/offline-payments.ts')))),
    meterCollection: () => refusal ? { ok: false, code: 'collection-limit' } : { ok: true },
  };
  const js = ts.transpileModule([...helpers.values()].join('\n') + '\nconst actions = {' + [...methods.values()].join(',\n') + '};', {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const actions = new Function(...Object.keys(deps), js + '\nreturn actions;')(...Object.values(deps));
  const flush = () => { for (const fn of queued.splice(0)) state = fn; stateRef.current = state; };
  const draft = { customerName: '', lines: [base], taxRate: 18, method: 'Cash' };
  const created = actions.createInvoice(draft);
  const second = actions.createInvoice(draft);
  check('rapid bill creation reserves two different invoice numbers', created.ok && second.ok && created.invoiceId !== second.invoiceId && Boolean(created.invoiceId) && Boolean(second.invoiceId));
  flush();
  const saved = state.invoices.find((item) => item.id === created.invoiceId);
  check('walk-in bills save as unpaid and return the id to open', saved?.customerName === 'Walk-in customer' && saved.paymentStatus === 'pending' && saved.totalAmount === 531.89 && summarizeFinancials(state.transactions, state.products, state.customers).cashIn === 0 && saved.posted === true);
  const rejected = actions.createInvoice({ ...draft, lines: [base, { ...base, name: '' }] });
  check('an incomplete row prevents the whole bill from being saved', !rejected.ok && queued.length === 0);
  check('credit cannot be mistaken for money received', !actions.markInvoicePaid(invoice.id, 'Credit').ok && queued.length === 0);
  refusal = true;
  check('a collection limit leaves payments untouched', !actions.markInvoicePaid(invoice.id, 'UPI', { reference: 'UPI-12345' }).ok && queued.length === 0);
  refusal = false;
  const transactionsBefore = state.transactions.length;
  const settled = actions.markInvoicePaid(invoice.id, 'Cash');
  const repeated = actions.markInvoicePaid(invoice.id, 'Cash');
  check('the last collection uses only the unpaid balance', settled.ok && settled.amount === 465);
  check('a second confirmation before React commits cannot duplicate payment', !repeated.ok && queued.length === 1);
  flush();
  check('settling a part-paid bill records only remaining cash and revenue', state.paymentRecords.at(-1).amount === 465 && state.transactions.length === transactionsBefore + 2 && state.transactions.slice(-2).every((tx) => tx.amount === 465));
  check('settled bills remain uncollectible after commit', !actions.markInvoicePaid(invoice.id, 'Cash').ok && I.invoiceBalance(state.invoices[0], state.paymentRecords) === 0);

  for (const [quantity, unitPrice, expected] of [
    [4.85, 0.50, 2.43],
    [4.85, 0.70, 3.40],
    [2.9, 0.75, 2.18],
    [4.265, 1.00, 4.27],
    [4.395, 1.00, 4.40],
  ]) {
    const txStart = state.transactions.length;
    const halfBill = actions.createInvoice({
      customerName: 'Half-paise walk-in',
      lines: [{ name: 'Bulk grain', category: 'Grains', quantity, unitPrice }],
      taxRate: 0,
      method: 'Cash',
    });
    flush();
    const savedHalf = state.invoices.find((item) => item.id === halfBill.invoiceId);
    const postedHalf = state.transactions.slice(txStart);
    check(
      `saved invoice and posted ledger agree on half-paise ${quantity} x ${unitPrice} = ${expected}`,
      halfBill.ok &&
        savedHalf?.items[0]?.total === expected &&
        savedHalf?.subtotal === expected &&
        savedHalf?.totalAmount === expected &&
        postedHalf.length === 2 &&
        postedHalf.every((tx) => tx.amount === expected),
    );
  }

  const taxTxStart = state.transactions.length;
  const halfTaxBill = actions.createInvoice({
    customerName: 'Half-paise tax',
    lines: [{ name: 'Flour', category: 'Grains', quantity: 1, unitPrice: 48.50 }],
    taxRate: 5,
    method: 'Cash',
  });
  flush();
  const savedHalfTax = state.invoices.find((item) => item.id === halfTaxBill.invoiceId);
  const postedHalfTax = state.transactions.slice(taxTxStart);
  check(
    'half-paise invoice tax posts identical paise across saved bill and ledger',
    halfTaxBill.ok &&
      savedHalfTax?.subtotal === 48.50 &&
      savedHalfTax?.tax === 2.43 &&
      savedHalfTax?.totalAmount === 50.93 &&
      postedHalfTax.find((tx) => tx.type === 'sale')?.amount === 48.50 &&
      postedHalfTax.find((tx) => tx.account === 'tax')?.amount === 2.43 &&
      postedHalfTax.find((tx) => tx.account === 'receivables')?.amount === 50.93,
  );

  const grain = { id: 'p-grain', name: 'Loose grain', sku: 'GRN-1', category: 'Grains', itemType: 'product', price: 0.50, cost: 0.50, stock: 10, minStock: 1, unit: 'kg', status: 'Active' };
  const postedStockSale = deps.postSale(
    { products: [grain], transactions: [], stockMovements: [] },
    { lines: [{ productId: 'p-grain', name: 'Loose grain', quantity: 4.85, rate: 0.50 }], method: 'Cash', description: 'Weighed grain', date: '2026-11-02', taxRate: 0 },
  );
  check(
    'counter postSale rounds 4.85 x 0.50 revenue and cost to 2.43 and deducts exact stock',
    postedStockSale.subtotal === 2.43 &&
      postedStockSale.total === 2.43 &&
      postedStockSale.products[0].stock === 5.15 &&
      postedStockSale.transactions.every((tx) => tx.amount === 2.43),
  );
  let overPrecisionRejected = false;
  try {
    deps.postSale(
      { products: [grain], transactions: [], stockMovements: [] },
      { lines: [{ name: 'Sub-paise', quantity: 1, rate: 1.234 }], method: 'Cash', description: 'Invalid rate', date: '2026-11-02' },
    );
  } catch {
    overPrecisionRejected = true;
  }
  let overflowRejected = false;
  try {
    deps.postSale(
      { products: [grain], transactions: [], stockMovements: [] },
      { lines: [{ name: 'Overflow', quantity: 1000, rate: 90000000.01 }], method: 'Cash', description: 'Overflow sale', date: '2026-11-02' },
    );
  } catch {
    overflowRejected = true;
  }
  check('counter postSale refuses sub-paise rates and totals beyond native paise cap', overPrecisionRejected && overflowRejected);
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

// Phase 2 hardening: QuantityMilli aggregation, BigInt COGS, explicit rejection, rollback & idempotent replay.
{
  const postingSource = readFileSync(join(root, 'lib/accounting-posting.ts'), 'utf8');
  check('postSale never falls back to legacy float money() rounding', !/\bmoney\s*\(/.test(postingSource));

  const { validateSaleStock } = await import(compile(join(root, 'lib/sale-stock.ts')));
  const { postSale } = await import(compile(join(root, 'lib/accounting-posting.ts')));
  const { buildMovement, reconcileLedger } = await import(compile(join(root, 'lib/inventory/index.ts')));

  const makeItem = (id, name, stock, cost, price = 100, unit = 'kg') => ({
    id,
    name,
    category: 'Grocery',
    itemType: 'product',
    price,
    cost,
    stock,
    reorderLevel: 1,
    unit,
    supplier: 'Direct',
    status: 'Active',
  });

  // 1. 0.1 + 4.01 exact QuantityMilli (4110) and half-paisa COGS boundary (4.11 * 0.50 = 2.055 -> ₹2.06, never float ₹2.05).
  {
    const grain = makeItem('grain', 'Loose grain', 10, 0.5, 1.0);
    const opening = buildMovement({
      id: 'mv-open-grain',
      productId: grain.id,
      productName: grain.name,
      at: '2026-11-01T00:00:00.000Z',
      reason: 'opening',
      delta: 10,
      balanceBefore: 0,
      note: 'Opening count',
      unit: 'kg',
    });
    const validated = validateSaleStock(
      [
        { productId: 'grain', quantity: 0.1, rate: 1.0 },
        { productId: 'grain', quantity: 4.01, rate: 1.0 },
      ],
      [grain],
    );
    check(
      'validateSaleStock aggregates 0.1 + 4.01 as exact 4110 QuantityMilli (4.11)',
      validated.ok && validated.quantitiesMilli.get('grain') === 4110 && validated.quantities.get('grain') === 4.11,
    );

    const posted = postSale(
      { products: [grain], transactions: [], stockMovements: [opening] },
      {
        operationId: 'sale-01-401',
        lines: [
          { productId: 'grain', quantity: 0.1, rate: 1.0 },
          { productId: 'grain', quantity: 4.01, rate: 1.0 },
        ],
        method: 'Cash',
        description: 'Counter grain sale',
        date: '2026-11-02',
        taxRate: 5,
      },
    );
    const snap = summarizeFinancials(posted.transactions, posted.products, []);
    const ledger = reconcileLedger(posted.products, posted.stockMovements);
    const revenueEntry = posted.transactions.find((t) => t.type === 'sale' && t.account === 'revenue');
    const taxEntry = posted.transactions.find((t) => t.account === 'tax');
    const cashEntry = posted.transactions.find((t) => t.account === 'cash');
    const cogsEntry = posted.transactions.find((t) => t.type === 'stock_adjustment' && t.account === 'inventory');
    check(
      '0.1 + 4.01 posts exact ₹2.06 COGS (eliminating 1-paisa float drift), clean movement note, single stock deduction and balanced journal',
      snap.cogs === 2.06 &&
        cogsEntry?.amount === 2.06 &&
        posted.products[0].stock === 5.89 &&
        posted.stockChanges.length === 1 &&
        posted.stockChanges[0].delta === -4.11 &&
        posted.stockChanges[0].note === 'Sold — 4.11 × Loose grain' &&
        ledger.ok &&
        Math.round((revenueEntry.amount + taxEntry.amount) * 100) === Math.round(cashEntry.amount * 100) &&
        cashEntry.amount === posted.total,
    );
  }

  // 2. 0.001 + 0.002 exact milli-unit aggregation (3 milli = 0.003).
  {
    const saffron = makeItem('saffron', 'Saffron', 1, 1000, 1500, 'kg');
    const validated = validateSaleStock(
      [
        { productId: 'saffron', quantity: 0.001, rate: 1500 },
        { productId: 'saffron', quantity: 0.002, rate: 1500 },
      ],
      [saffron],
    );
    const posted = postSale(
      { products: [saffron], transactions: [], stockMovements: [] },
      {
        lines: [
          { productId: 'saffron', quantity: 0.001, rate: 1500 },
          { productId: 'saffron', quantity: 0.002, rate: 1500 },
        ],
        method: 'UPI',
        description: 'Weighed saffron',
        date: '2026-11-02',
      },
    );
    const snap = summarizeFinancials(posted.transactions, posted.products, []);
    check(
      '0.001 + 0.002 aggregates to 3 QuantityMilli (0.003) with exact ₹4.50 revenue, ₹3.00 COGS and 0.997 remaining stock',
      validated.ok &&
        validated.quantitiesMilli.get('saffron') === 3 &&
        posted.total === 4.5 &&
        snap.revenue === 4.5 &&
        snap.cogs === 3 &&
        snap.upiBalance === 4.5 &&
        posted.products[0].stock === 0.997 &&
        posted.stockChanges.length === 1,
    );
  }

  // 3. Multiple duplicate SKU lines across multiple products + half-paisa rounding boundaries.
  {
    const rice = makeItem('rice', 'Basmati rice', 20, 0.3, 5.0, 'kg');
    const dal = makeItem('dal', 'Moong dal', 10, 5.0, 10.0, 'kg');
    const deliveryFee = { ...makeItem('fee', 'Packing', 0, 0, 10, 'pcs'), itemType: 'service' };
    const posted = postSale(
      { products: [rice, dal, deliveryFee], transactions: [], stockMovements: [] },
      {
        lines: [
          { productId: 'rice', quantity: 0.1, rate: 5.0 },
          { productId: 'dal', quantity: 0.001, rate: 5.0 }, // 0.005 rupee -> 1 paisa half-up
          { productId: 'rice', quantity: 4.01, rate: 5.0 },
          { productId: 'dal', quantity: 1.999, rate: 10.0 },
          { productId: 'fee', quantity: 1, rate: 10.0 },
        ],
        method: 'Credit',
        credit: true,
        customerId: 'cust-1',
        invoiceId: 'INV-MULTI-1',
        description: 'Multi-SKU duplicate lines',
        date: '2026-11-02',
        taxRate: 5,
      },
    );
    const snap = summarizeFinancials(posted.transactions, posted.products, [{ openingBalance: 0 }]);
    // rice COGS: 4110 milli * 30 paise = 123300 -> +500 / 1000 = 123 paise (₹1.23)
    // dal COGS: 2000 milli * 500 paise = 1000000 -> +500 / 1000 = 1000 paise (₹10.00) -> total COGS = ₹11.23
    check(
      'multiple duplicate SKU lines emit one stock movement per physical SKU, exact half-up paise COGS (₹11.23) and balanced receivables',
      posted.stockChanges.length === 2 &&
        posted.products.find((p) => p.id === 'rice').stock === 15.89 &&
        posted.products.find((p) => p.id === 'dal').stock === 8 &&
        snap.cogs === 11.23 &&
        snap.customerReceivables === posted.total &&
        Math.round((posted.subtotal + posted.tax) * 100) === Math.round(posted.total * 100),
    );
  }

  // 4. Zero-value rejection & integer overflow rejection (both revenue and COGS).
  {
    const item = makeItem('item', 'Test item', 1_000_000_000, 10, 100);
    let zeroQty = false,
      zeroSubtotal = false,
      subPaisaZero = false,
      qtyOverflow = false,
      cogsOverflow = false;
    try {
      postSale({ products: [item], transactions: [], stockMovements: [] }, { lines: [{ productId: 'item', quantity: 0, rate: 100 }], method: 'Cash', description: 'z', date: '2026-11-02' });
    } catch {
      zeroQty = true;
    }
    try {
      postSale({ products: [item], transactions: [], stockMovements: [] }, { lines: [{ productId: 'item', quantity: 1, rate: 0 }], method: 'Cash', description: 'z', date: '2026-11-02' });
    } catch {
      zeroSubtotal = true;
    }
    try {
      postSale({ products: [item], transactions: [], stockMovements: [] }, { lines: [{ productId: 'item', quantity: 0.001, rate: 4.99 }], method: 'Cash', description: 'z', date: '2026-11-02' });
    } catch {
      subPaisaZero = true;
    }
    const maxLineQty = 6_000_000_000; // 6e12 milli each -> 12e12 > 9e12 NATIVE_INVOICE_MAX
    qtyOverflow = !validateSaleStock(
      [
        { productId: 'item', quantity: maxLineQty, rate: 1 },
        { productId: 'item', quantity: maxLineQty, rate: 1 },
      ],
      [{ id: 'item', name: 'Test item', itemType: 'product', stock: 9_000_000_000 }],
    ).ok;
    const priceyCostItem = makeItem('costly', 'High cost', 2000, 90_000_000, 1);
    try {
      postSale(
        { products: [priceyCostItem], transactions: [], stockMovements: [] },
        { lines: [{ productId: 'costly', quantity: 1000.001, rate: 1 }], method: 'Cash', description: 'overflow cogs', date: '2026-11-02' },
      );
    } catch {
      cogsOverflow = true;
    }
    check(
      'zero-value sales and integer overflows in repeated quantities or COGS are explicitly rejected',
      zeroQty && zeroSubtotal && subPaisaZero && qtyOverflow && cogsOverflow,
    );
  }

  // 5. Insufficient stock, multi-line sale rollback & failed ledger posting (invalid product cost).
  {
    const grain = makeItem('grain', 'Loose grain', 4.109, 0.5, 1.0);
    const exactBoundaryFail = validateSaleStock(
      [
        { productId: 'grain', quantity: 0.1, rate: 1.0 },
        { productId: 'grain', quantity: 4.01, rate: 1.0 },
      ],
      [grain],
    );
    const goodSku = makeItem('good', 'Good SKU', 10, 20, 50);
    const shortSku = makeItem('short', 'Short SKU', 1, 20, 50);
    const badCostSku = makeItem('badcost', 'Sub-paise cost SKU', 10, 12.345, 50);
    const negCostSku = makeItem('negcost', 'Negative cost SKU', 10, -5, 50);
    const initialState = {
      products: [goodSku, shortSku, badCostSku, negCostSku],
      transactions: [],
      stockMovements: [],
    };
    let insufficientRolledBack = false,
      subPaiseCostRejected = false,
      negativeCostRejected = false;
    try {
      postSale(initialState, {
        lines: [
          { productId: 'good', quantity: 2, rate: 50 },
          { productId: 'short', quantity: 1.001, rate: 50 },
        ],
        method: 'Cash',
        description: 'Rollback check',
        date: '2026-11-02',
      });
    } catch {
      insufficientRolledBack = true;
    }
    try {
      postSale(initialState, {
        lines: [
          { productId: 'good', quantity: 2, rate: 50 },
          { productId: 'badcost', quantity: 1, rate: 50 },
        ],
        method: 'Cash',
        description: 'Sub-paise COGS fail',
        date: '2026-11-02',
      });
    } catch {
      subPaiseCostRejected = true;
    }
    try {
      postSale(initialState, {
        lines: [{ productId: 'negcost', quantity: 1, rate: 50 }],
        method: 'Cash',
        description: 'Negative COGS fail',
        date: '2026-11-02',
      });
    } catch {
      negativeCostRejected = true;
    }
    check(
      'insufficient stock and failed COGS ledger postings reject explicitly and roll back without mutating prior lines',
      !exactBoundaryFail.ok &&
        insufficientRolledBack &&
        subPaiseCostRejected &&
        negativeCostRejected &&
        initialState.products[0].stock === 10 &&
        initialState.transactions.length === 0 &&
        initialState.stockMovements.length === 0,
    );
  }

  // 6. Idempotent operation replay (including when initial commit exhausted stock to 0) & conflicting replay rejection.
  {
    const exactStock = makeItem('exact', 'Exact pouch', 4.11, 0.5, 1.0);
    const first = postSale(
      { products: [exactStock], transactions: [], stockMovements: [] },
      {
        operationId: 'op-replay-411',
        lines: [
          { productId: 'exact', quantity: 0.1, rate: 1.0 },
          { productId: 'exact', quantity: 4.01, rate: 1.0 },
        ],
        method: 'Cash',
        description: 'Replayable sale',
        date: '2026-11-02',
      },
    );
    const replayed = postSale(first, {
      operationId: 'op-replay-411',
      lines: [
        { productId: 'exact', quantity: 0.1, rate: 1.0 },
        { productId: 'exact', quantity: 4.01, rate: 1.0 },
      ],
      method: 'Cash',
      description: 'Replayable sale',
      date: '2026-11-02',
    });
    let conflictRejected = false;
    try {
      postSale(first, {
        operationId: 'op-replay-411',
        lines: [{ productId: 'exact', quantity: 1, rate: 1.0 }],
        method: 'Cash',
        description: 'Conflicting replay',
        date: '2026-11-02',
      });
    } catch {
      conflictRejected = true;
    }
    check(
      'idempotent operation replay preserves single stock deduction and exact ledger entries while rejecting altered payloads',
      first.products[0].stock === 0 &&
        replayed.products[0].stock === 0 &&
        replayed.transactions.length === first.transactions.length &&
        replayed.stockMovements.length === first.stockMovements.length &&
        replayed.stockChanges.length === 1 &&
        conflictRejected,
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

