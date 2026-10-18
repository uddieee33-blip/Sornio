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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
