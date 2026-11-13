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
  const browser = await chromium.launch({ headless: true, ...(process.env.SORNIO_CHROMIUM_EXECUTABLE ? {
    executablePath: process.env.SORNIO_CHROMIUM_EXECUTABLE,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote'],
  } : {}) });
  const errors = [];
  const throttled = [];
  async function contextFor(theme, portal, width) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addCookies([
      { name: 'dukaan.session', value: token, url: origin, httpOnly: true },
      { name: 'dukaan.portal', value: portal, url: origin },
      { name: 'dukaan.look', value: encodeURIComponent(`${theme}|comfortable|off|100|0`), url: origin },
    ]);
    // Disposable local fixture using the supported legacy snapshot shape. No
    // production auth/storage path is changed for the acceptance harness.
    await context.addInitScript(({ portal }) => {
      if (!['http:', 'https:'].includes(location.protocol)) return;
      const slot = 'dukaanos.vault.dukaanos-store-v5.local_theme_review.local_theme_review';
      if (!localStorage.getItem(slot)) localStorage.setItem(slot, JSON.stringify({
        encrypted: false,
        plain: { products: [], transactions: [], profile: {
          name: 'Theme review', templateId: `template-${portal === 'kirana' ? 'grocery' : portal}`,
          description: '', currency: 'INR', timezone: 'Asia/Kolkata',
        } },
      }));
    }, { portal });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      // The console throttles its own clients. A throttled run sees missing
      // data and stale screens, so it cannot prove anything about the screens
      // it was meant to review. Record it instead of letting the run pass.
      if (response.status() === 429) throttled.push(`${response.status()} ${response.url()}`);
    });
    return { context, page };
  }
  /**
   * Navigate and wait for the console to actually be ready.
   *
   * The console polls its own identity and sync endpoints on a timer, so
   * "networkidle" depends on where that poll happens to fall: it can sit
   * waiting for the next poll, and it says nothing at all about whether the
   * screen the reviewer is meant to see has rendered. Readiness is instead
   * two observable application states — the route's own heading is on screen,
   * and the console's loading placeholder has gone.
   */
  async function openWorkspace(page, route) {
    await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('main#main h1').first().waitFor({ state: 'visible', timeout: 60000 });
    // The console shows "Loading business…" in the navigation and the page
    // body while it hydrates. Wait for every one of them to clear.
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading business…'),
      undefined,
      { timeout: 60000 },
    );
    await page.locator('.console-workspace').waitFor({ state: 'visible', timeout: 60000 });
  }
  async function inspect(page, route, name) {
    await openWorkspace(page, route);
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
        assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
        await context.close();
      }
    }
    for (const width of [320, 390, 768, 1440]) {
      const { context, page } = await contextFor('monsoon', 'general', width);
      for (const route of ['/customers', '/products', '/billing/new']) {
        await inspect(page, route, `${route.replaceAll('/', '-')}-${width}`);
      }
      await openWorkspace(page, '/products');
      const trigger = page.getByRole('button', { name: 'Import CSV', exact: true }).first();
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Import CSV', exact: true });
      await dialog.waitFor();
      assert(await dialog.evaluate(node => node.matches(':modal')), 'Import uses real native modality');
      for (let index = 0; index < 15; index++) {
        await page.keyboard.press('Tab');
        assert(await dialog.evaluate(node => node.contains(document.activeElement)), 'Tab stays inside dialog');
      }
      for (let index = 0; index < 15; index++) {
        await page.keyboard.press('Shift+Tab');
        assert(await dialog.evaluate(node => node.contains(document.activeElement)), 'Reverse Tab stays inside dialog');
      }
      await page.screenshot({ path: path.join(out, `import-${width}.png`), fullPage: true });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert(await trigger.evaluate(node => node === document.activeElement), 'Focus returns to import trigger');
      await context.close();
    }
    const { context, page } = await contextFor('graphite', 'general', 390);
    await openWorkspace(page, '/customers');
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

    // Signed fixtures are accepted only by this isolated local server. These
    // checks use the real plan API, CSRF boundary and provider, never a mock
    // payment or a hosted account.
    const billing = await contextFor('monsoon', 'general', 390);
    const paidEnd = now + 30 * 86400;
    const wire = Buffer.from(JSON.stringify({ p: 'growth', s: now, r: paidEnd, t: 0, b: 'activation-code', f: 'local-review' })).toString('base64url');
    await billing.context.addCookies([{ name: 'dukaan.plan', value: `${wire}.${crypto.createHmac('sha256', secret).update(wire).digest('base64url')}`, url: origin, httpOnly: true }]);
    // The subscription page states its own readiness with the plan heading,
    // so the navigation only has to get the document there.
    await billing.page.goto(origin + '/subscription?plan=growth&interval=year', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await billing.page.getByRole('heading', { name: 'You are on Growth', exact: true }).waitFor();
    assert.equal(await billing.page.getByRole('button', { name: 'Growth year', exact: true }).getAttribute('aria-pressed'), 'true');
    const paidDate = await billing.page.getByText('Paid access ends', { exact: false }).textContent();
    const graceDate = await billing.page.getByText('Grace access ends', { exact: false }).textContent();
    assert(paidDate && graceDate && paidDate.replace('Paid access ends', '').trim() !== graceDate.replace('Grace access ends', '').trim(), 'Paid and grace dates are distinct');
    await billing.page.screenshot({ path: path.join(out, 'subscription-paid-mobile.png'), fullPage: true });
    const before = await billing.context.request.get(origin + '/api/subscription');
    assert.equal((await before.json()).record.planId, 'growth');
    await billing.page.getByRole('button', { name: 'Move to the free plan', exact: true }).first().click();
    const review = billing.page.getByRole('dialog', { name: 'Move to Starter', exact: true });
    await review.waitFor();
    await billing.page.screenshot({ path: path.join(out, 'subscription-review-mobile.png') });
    await review.getByRole('button', { name: 'Keep current plan', exact: true }).click();
    await review.waitFor({ state: 'detached' });
    const kept = await billing.context.request.get(origin + '/api/subscription');
    assert.equal((await kept.json()).record.planId, 'growth', 'Review cancellation preserves paid plan');
    await billing.page.getByRole('button', { name: 'Move to the free plan', exact: true }).first().click();
    await review.getByRole('button', { name: 'Confirm move to Starter', exact: true }).click();
    await review.waitFor({ state: 'detached' });
    await billing.page.getByRole('heading', { name: 'You are on Starter', exact: true }).waitFor();
    await billing.page.getByRole('button', { name: 'Continue with Growth', exact: true }).click();
    await billing.page.locator('#checkout').waitFor();
    const previewPlan = await billing.context.request.get(origin + '/api/subscription');
    assert.equal((await previewPlan.json()).record.planId, 'starter', 'Checkout preview cannot activate paid access');
    await billing.page.getByRole('textbox', { name: 'Activation key', exact: true }).fill('invalid-test-key');
    const keyResponse = billing.page.waitForResponse(response => new URL(response.url()).pathname === '/api/subscription' && response.request().method() === 'POST');
    await billing.page.getByRole('button', { name: 'Activate key', exact: true }).click();
    assert((await keyResponse).status() >= 400, 'Invalid key is refused by the server');
    await billing.page.getByRole('heading', { name: 'You are on Starter', exact: true }).waitFor();
    const rejectedKey = await billing.context.request.get(origin + '/api/subscription');
    assert.equal((await rejectedKey.json()).record.planId, 'starter', 'Invalid keys cannot grant access');
    await billing.page.screenshot({ path: path.join(out, 'subscription-mobile.png'), fullPage: true });
    await billing.context.close();
    for (const [theme, width] of [['monsoon', 1440], ['graphite', 390]]) {
      const visitor = await contextFor(theme, 'general', width);
      for (const route of ['/', '/install']) {
        // Public pages are outside the console, so the document itself is the
        // readiness signal; the pathname assertion below proves the marketing
        // surface stayed separate from the workspace.
        await visitor.page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await visitor.page.waitForLoadState('load', { timeout: 60000 });
        assert.equal(new URL(visitor.page.url()).pathname, route, 'Marketing and download pages stay separate from the workspace');
        assert(await visitor.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Public pages fit the viewport');
        await visitor.page.screenshot({ path: path.join(out, `public-${route === '/' ? 'landing' : 'install'}-${width}.png`), fullPage: true });
      }
      assert.equal(await visitor.page.getByRole('link', { name: 'Download Windows setup', exact: true }).count(), 0, 'No download link before a real release URL is configured');
      await visitor.context.close();
    }
    assert.deepEqual(errors, [], 'No uncaught browser exceptions');
    assert.deepEqual(throttled, [], `The run was rate limited by the console's own throttle (${throttled.length} responses). A throttled run cannot prove the screens work.`);
    console.log('Workspace browser acceptance passed: eight portals, responsive pages, bidirectional modal focus and subscription API transitions.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
