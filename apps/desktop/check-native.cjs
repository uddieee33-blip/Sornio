/* eslint-disable @typescript-eslint/no-require-imports */
// Native Windows acceptance: attach only to this review process's loopback CDP.
// No mock IPC, cloud account, production data or hosted app is used.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const exe = path.resolve('apps/desktop/src-tauri/target/release/sornio-desktop.exe');
const output = path.resolve('dist/native-review');
let child;
let browser;

async function launch() {
  child = spawn(exe, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222 --remote-debugging-address=127.0.0.1' }, stdio: 'inherit' });
  child.on('error', (error) => { process.stderr.write(`${error.message}\n`); });
  for (let attempt = 0; attempt < 90; attempt++) {
    if (child.exitCode !== null) throw new Error(`Native process exited: ${child.exitCode}`);
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 1000)); }
  }
  assert(browser, 'Native WebView did not expose its isolated review endpoint');
  const context = browser.contexts()[0];
  // Applies to the actual native renderer, including its following reload.
  await context.setOffline(true);
  let page;
  for (let attempt = 0; attempt < 30; attempt++) {
    page = context.pages().find((p) => /tauri\.localhost|tauri:\/\/localhost/.test(p.url()));
    if (page) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(page, 'Expected embedded app origin, never a hosted website');
  const external = [];
  page.on('request', (request) => { if (/^https?:/.test(request.url()) && !/\/\/(tauri|ipc)\.localhost\//.test(request.url())) external.push(request.url()); });
  await page.reload();
  await page.getByRole('heading', { name: 'Keep a local draft.' }).waitFor();
  await page.getByLabel('Business name', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.getElementById('business-name').disabled && !document.getElementById('business-name').closest('fieldset').disabled);
  assert.deepEqual(external, [], 'Bundled startup must not fetch the public site');
  return page;
}

async function stop() {
  if (browser) { await browser.close(); browser = null; }
  if (child && child.exitCode === null) {
    await new Promise((resolve) => { const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']); killer.on('exit', resolve); killer.on('error', resolve); });
  }
  child = null;
}

(async () => {
  await mkdir(output, { recursive: true });
  let page = await launch();
  await page.getByLabel('Business name', { exact: true }).fill('Sample local store');
  await page.getByLabel('Workspace note').fill('Saved in the native app. Reopen without the website.');
  await page.getByRole('button', { name: 'Save local draft' }).click();
  await page.getByText('Saved to this PC. You can close and reopen Sornio.', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'windows-local-saved.png'), fullPage: true });
  await stop();
  page = await launch();
  assert.equal(await page.getByLabel('Business name', { exact: true }).inputValue(), 'Sample local store');
  assert.equal(await page.getByLabel('Workspace note').inputValue(), 'Saved in the native app. Reopen without the website.');
  await page.screenshot({ path: path.join(output, 'windows-local-reopened.png'), fullPage: true });
  console.log('Native Windows: bundled offline reload, save, process termination and reopen passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(stop);
