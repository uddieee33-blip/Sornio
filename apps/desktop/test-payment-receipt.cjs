/* eslint-disable @typescript-eslint/no-require-imports -- Node receipt rendering harness. */
/* Render the real receipt component in Node. This is not browser/print acceptance. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename,
  }).outputText, filename);
}
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { SavedInvoice } = require('./src/SavedInvoice.tsx');
const invoice = { id: 'split', invoiceNumber: 'S-1', businessName: 'Test shop', createdAt: '2026-11-11T04:00:00Z',
  tender: 'retail', customerId: 'c1', lines: [{ productId: 'p1', name: 'Product', unit: 'pcs', quantityMilli: 1000, unitPricePaise: 100000, totalPaise: 100000 }],
  subtotalPaise: 100000, taxPaise: 0, taxBasisPoints: 0, totalPaise: 100000 };
const payments = [ { id: 'p1', method: 'cash', amountPaise: 60000, reference: '' }, { id: 'p2', method: 'credit', amountPaise: 40000, reference: '' } ];
const render = props => renderToStaticMarkup(React.createElement(SavedInvoice, { invoice, payments, username: 'owner', ...props }));
test('real receipt renders full total, tender breakdown, and only the unpaid credit due', () => {
  const html = render({});
  assert.match(html, /Cash received<\/span><strong>₹600\.00/);
  assert.match(html, /Customer credit<\/span><strong>₹400\.00/);
  assert.match(html, /Saved total: ₹1,000\.00/);
  assert.match(html, /Amount due at sale: ₹400\.00/);
  for (const layout of ['58mm', '80mm', 'a4']) assert.match(html, new RegExp(`value="${layout}"`));
});
test('digital tender is still labelled unverified and is not customer udhar', () => {
  const html = render({ payments: [{ ...payments[0], amountPaise: 50000 }, { id: 'upi', method: 'upi', amountPaise: 10000, reference: 'UTR1' }, payments[1]] });
  assert.match(html, /UPI \(unverified\)/);
  assert.match(html, /Amount due at sale: ₹400\.00/);
});
test('missing payment breakdown blocks printing rather than showing zero debt', () => {
  const html = render({ payments: [] });
  assert.match(html, /disabled="">Print saved receipt/);
  assert.match(html, /Payment breakdown unavailable/);
  assert.doesNotMatch(html, /Amount due at sale: ₹0/);
});
