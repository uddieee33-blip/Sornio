/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node/Playwright acceptance runner. */
/** Local isolated acceptance only. Never signs a session for a hosted service. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const origin = process.env.SORNIO_TEST_ORIGIN || 'http://127.0.0.1:3000';
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Tests require an isolated local server');
const secret = process.env.DUKAANOS_SESSION_SECRET;
assert(secret?.length >= 32, 'Supply the same local test secret to server and test runner');
const out = process.env.SORNIO_SCREENSHOTS || '/tmp/sornio-screenshots';
fs.mkdirSync(out, { recursive: true });
const now = Math.floor(Date.now() / 1000);
const payload = Buffer.from(JSON.stringify({ tenantId: 'local_theme_review', userId: 'local_theme_review', role: 'owner', displayName: 'Theme review', iat: now, exp: now + 3600, sid: crypto.randomUUID(), v: 1 })).toString('base64url');
const token = `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  async function contextFor(theme, portal, width) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addCookies([
      { name: 'dukaan.session', value: token, url: origin, httpOnly: true },
      { name: 'dukaan.portal', value: portal, url: origin },
      { name: 'dukaan.look', value: encodeURIComponent(`${theme}|comfortable|off|100|0`), url: origin },
    ]);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    return { context, page };
  }
  async function inspect(page, route, name) {
    await page.goto(origin + route, { waitUntil: 'networkidle' });
    await page.locator('.console-workspace').waitFor();
    assert(new URL(page.url()).pathname === route, `Unexpected redirect from ${route}: ${page.url()}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 1, `${name}: page overflows by ${overflow}px`);
    await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  }
  try {
    for (const portal of ['gym', 'cafe', 'kirana', 'salon', 'electronics', 'boutique', 'service', 'general']) {
      for (const [theme, width] of [['monsoon', 1440], ['graphite', 390]]) {
        const { context, page } = await contextFor(theme, portal, width);
        await inspect(page, '/home', `${portal}-${theme}-${width}`);
        assert.equal(await page.locator('.console-workspace').getAttribute('data-portal'), portal);
        await context.close();
      }
    }
    for (const width of [320, 390, 768, 1440]) {
      const { context, page } = await contextFor('monsoon', 'general', width);
      for (const route of ['/customers', '/products', '/billing/new']) {
        await inspect(page, route, `${route.replaceAll('/', '-')}-${width}`);
      }
      await page.goto(origin + '/products', { waitUntil: 'networkidle' });
      const trigger = page.getByRole('button', { name: 'Import CSV', exact: true }).first();
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Import CSV', exact: true });
      await dialog.waitFor();
      assert(await dialog.evaluate(node => node.matches(':modal')), 'Import uses real native modality');
      for (let index = 0; index < 15; index++) {
        await page.keyboard.press('Tab');
        assert(await dialog.evaluate(node => node.contains(document.activeElement)), 'Tab stays inside dialog');
      }
      await page.screenshot({ path: path.join(out, `import-${width}.png`), fullPage: true });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert(await trigger.evaluate(node => node === document.activeElement), 'Focus returns to import trigger');
      await context.close();
    }
    const { context, page } = await contextFor('graphite', 'general', 390);
    await page.goto(origin + '/customers', { waitUntil: 'networkidle' });
    await page.getByPlaceholder('e.g. Kiran Malhotra').fill('Theme Review Customer');
    await page.getByRole('button', { name: 'Save customer', exact: true }).click();
    await page.getByText('Theme Review Customer', { exact: true }).click();
    const customerDialog = page.getByRole('dialog', { name: 'Theme Review Customer', exact: true });
    await customerDialog.waitFor();
    assert(await customerDialog.evaluate(node => node.matches(':modal')));
    await page.screenshot({ path: path.join(out, 'customer-dark-mobile.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await customerDialog.waitFor({ state: 'detached' });
    await context.close();
    assert.deepEqual(errors, [], 'No uncaught browser exceptions');
    console.log('Workspace browser acceptance passed: eight portals, responsive pages, native dialogs and focus restoration.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
