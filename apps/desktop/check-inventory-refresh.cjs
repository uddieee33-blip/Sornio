/* Real InventoryPanel; mocked IPC isolates a cross-panel refresh after reply loss. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser regression. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const product = { id: 'rice', name: 'Rice', sku: 'RICE', unit: 'kg', unitPricePaise: 10000, stockMilli: 10000, revision: 1 };
      globalThis.review = { product, receipt: null, writes: 0 };
      globalThis.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
        const s = globalThis.review;
        if (command === 'list_local_products') return structuredClone([s.product]);
        if (command === 'pending_local_inventory') return structuredClone(s.receipt);
        if (command === 'acknowledge_local_inventory') { s.receipt = null; return null; }
        if (command === 'adjust_local_stock' || command === 'add_local_product') {
          if (s.receipt && args.request.operationId !== s.receipt.operationId) {
            throw { code: 'checkout_active', message: 'Another inventory receipt is waiting to be acknowledged.' };
          }
          s.writes++;
          if (command === 'adjust_local_stock') { s.product.stockMilli += args.request.deltaMilli; s.product.revision++; }
          else s.product = { id: args.request.operationId, name: args.request.name, sku: args.request.sku, unit: args.request.unit, unitPricePaise: args.request.unitPricePaise, stockMilli: args.request.openingStockMilli, revision: 1 };
          s.receipt = { operationId: args.request.operationId, command, request: args.request, product: structuredClone(s.product) };
          throw { code: 'unavailable', message: 'Synthetic committed reply lost' };
        }
        throw new Error(`Unexpected command ${command}`);
      } };
    });
    await page.route('**/__inventory-review', route => route.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import { InventoryPanel } from '/src/InventoryPanel.tsx';
      import { setNativeSession } from '/src/native.ts';
      setNativeSession({scope:{businessId:'synthetic',workspaceId:'synthetic'}});
      const {useState}=React, {createRoot}=ReactDOM, noop=()=>{};
      function Review(){const [token,setToken]=useState(0);return React.createElement(React.Fragment,null,
        React.createElement('button',{onClick:()=>setToken(n=>n+1)},'Simulate checkout refresh'),
        React.createElement(InventoryPanel,{canAdd:true,canCorrect:true,disabled:false,onLocked:noop,onDirtyChange:noop,onBusyChange:noop,onSaved:noop,refreshToken:token}));}
      createRoot(document.getElementById('root')).render(React.createElement(Review));
    </script>` }));
    await page.goto(`${process.argv[2] || 'http://127.0.0.1:1420'}/__inventory-review`);
    const button = name => page.getByRole('button', { name, exact: true });
    const label = name => page.getByLabel(name, { exact: true });
    await label('Item to adjust').selectOption('rice');
    await label('Quantity change').fill('2'); await label('Reason for stock change').fill('One delivery');
    await button('Save stock change').click(); await button('Retry item save').waitFor();
    await button('Simulate checkout refresh').click(); await button('Acknowledge item save').waitFor();
    await button('Acknowledge item save').click();
    assert.equal(await label('Quantity change').inputValue(), '', 'Recovered delivery must not remain ready to submit again');
    assert.equal(await label('Reason for stock change').inputValue(), '');
    assert.equal(await page.evaluate(() => globalThis.review.product.stockMilli), 12000);
    assert.equal(await page.evaluate(() => globalThis.review.writes), 1);
    await button('Save stock change').click();
    assert.equal(await page.evaluate(() => globalThis.review.writes), 1);
    await page.reload();
    await label('Item name').fill('Beans'); await label('Item code (optional)').fill('BEANS');
    await label('Unit price (₹)').fill('12.50'); await label('Opening stock').fill('5');
    await button('Save item on this PC').click(); await button('Retry item save').waitFor();
    await button('Simulate checkout refresh').click(); await button('Acknowledge item save').waitFor();
    await button('Acknowledge item save').click();
    for (const name of ['Item name', 'Item code (optional)', 'Unit price (₹)', 'Opening stock']) assert.equal(await label(name).inputValue(), '');
    await button('Save item on this PC').click();
    assert.equal(await page.evaluate(() => globalThis.review.writes), 1);
    await page.evaluate(() => {
      const s = globalThis.review;
      s.product = { ...s.product, stockMilli: 7000, revision: 2 };
      s.receipt = {
        operationId: 'external-pending',
        command: 'adjust_local_stock',
        request: { operationId: 'external-pending', productId: s.product.id, expectedRevision: 1, deltaMilli: 2000, reason: 'External delivery' },
        product: structuredClone(s.product),
      };
    });
    await label('Item to adjust').selectOption(await page.evaluate(() => globalThis.review.product.id));
    await label('Quantity change').fill('2'); await label('Reason for stock change').fill('Stale window delivery');
    await button('Save stock change').click();
    await page.getByRole('alert').filter({ hasText: 'Another inventory receipt is waiting to be acknowledged.' }).waitFor();
    assert.equal(await button('Retry item save').count(), 0);
    assert.equal(await button('Reload item counts').isDisabled(), false);
    await button('Reload item counts').click();
    await button('Acknowledge item save').waitFor();
    await button('Acknowledge item save').click();
    await page.getByText('Saved item change acknowledged.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => globalThis.review.writes), 1);
    assert.deepEqual(errors, []);
    console.log('Inventory refresh regression passed: committed reply loss, cross-panel receipt recovery, stale-window checkout_active reload recovery, acknowledgement clears old delivery fields, one stock effect. Mocked IPC; no Windows/native claim.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
