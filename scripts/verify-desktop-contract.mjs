#!/usr/bin/env node
/**
 * The native boundary is a contract between four files that nothing else checks.
 *
 *   Rust commands  <->  generate_handler!  <->  capability permissions  <->  renderer invokes
 *
 * A command that exists in Rust but is missing from `generate_handler!` fails at
 * runtime with "command not found". A command missing from a capability
 * permission file is denied by Tauri's ACL even though the code looks complete.
 * A renderer call with a typo fails only when a cashier presses that button. None
 * of those produce a compiler error, so this script asserts the four lists agree
 * and that the renderer never reaches the network.
 *
 * Static analysis only: this proves wiring, never behaviour.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TAURI = 'apps/desktop/src-tauri';
const RENDERER = 'apps/desktop/src';
const main = readFileSync(join(TAURI, 'src/main.rs'), 'utf8');
let checks = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  checks += 1;
  console.log(`ok   ${label}`);
};

// 1. Every native command is registered exactly once.
const defined = [...main.matchAll(/#\[tauri::command\]\s*\n\s*async fn (\w+)/g)].map(m => m[1]);
const handler = main.match(/generate_handler!\[([\s\S]*?)\]/)?.[1] ?? '';
const registered = handler.split(',').map(name => name.trim()).filter(Boolean);
check(defined.length > 40, `Rust defines ${defined.length} native commands`);
check(new Set(registered).size === registered.length, 'no command is registered twice');
assert.deepEqual([...defined].sort(), [...registered].sort(), 'Rust commands and generate_handler! differ');
check(true, 'every Rust command is registered in generate_handler!');

// 2. The ACL allows exactly those commands and nothing more.
const allowed = new Set();
for (const file of readdirSync(join(TAURI, 'permissions'))) {
  const toml = readFileSync(join(TAURI, 'permissions', file), 'utf8');
  for (const [, list] of toml.matchAll(/commands\.allow\s*=\s*\[([^\]]*)\]/g)) {
    for (const name of list.matchAll(/"([a-z_0-9]+)"/g)) allowed.add(name[1]);
  }
}
assert.deepEqual([...allowed].sort(), [...registered].sort(), 'capability permissions and commands differ');
check(true, `all ${allowed.size} commands are permitted by a capability permission file`);

// 3. The capability is scoped to the bundled window only.
const capability = JSON.parse(readFileSync(join(TAURI, 'capabilities/local-workspace.json'), 'utf8'));
const config = JSON.parse(readFileSync(join(TAURI, 'tauri.conf.json'), 'utf8'));
const labels = config.app.windows.map(window => window.label);
check(capability.local === true, 'capability applies to bundled app code only (local: true)');
check(capability.windows.every(label => labels.includes(label)), 'capability targets an existing window');
check(labels.length === 1 && labels[0] === 'main', `only the main window exists (${labels.join(', ')})`);
check(config.app.windows.every(window => window.devtools === false), 'devtools stay closed in the shipped window');
check(config.bundle?.windows?.nsis?.installMode === 'currentUser', 'installer stays a per-user install');
check(config.bundle?.windows?.webviewInstallMode?.type === 'offlineInstaller', 'WebView2 ships offline, so a shop needs no internet');
check(!/http|remote|origin/i.test(JSON.stringify(config.app.windows[0].url ?? 'index.html')), 'the window loads a bundled URL, not a remote origin');

// 4. Every command the renderer names exists natively.
const rendererFiles = [];
for (const entry of readdirSync(RENDERER, { withFileTypes: true })) {
  if (entry.isFile() && /\.tsx?$/.test(entry.name)) rendererFiles.push(join(RENDERER, entry.name));
}
const named = new Set();
for (const file of rendererFiles) {
  const source = readFileSync(file, 'utf8');
  for (const [, name] of source.matchAll(/invoke(?:<[^>]*>)?\(\s*'([a-z_0-9]+)'/g)) named.add(name);
}
const unknown = [...named].filter(name => !registered.includes(name));
check(unknown.length === 0, `renderer calls only real commands ${unknown.join(',')}`);
check(named.size > 30, `renderer names ${named.size} distinct commands`);

// 5. Session-scoped commands always carry the scope; the exemption list is explicit.
const native = readFileSync(join(RENDERER, 'native.ts'), 'utf8');
const unscoped = new Set(
  [...(native.match(/const unscoped = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '').matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]),
);
assert.deepEqual(
  [...unscoped].sort(),
  ['lock_workspace', 'read_local_session', 'setup_local_access', 'unlock_workspace', 'workspace_access_status'],
  'the sessionless command list changed',
);
check(true, 'only access/status commands may run without a session scope');
check(/unscoped\.has\(command\) \? args : \{ \.\.\.args, scope \}/.test(native), 'every other command is sent with the native scope');
check(/Native Rust owns the session and role/.test(native), 'renderer documents that scope is not authority');

// 6. The offline renderer never touches a network or the local filesystem.
for (const file of rendererFiles) {
  const source = readFileSync(file, 'utf8');
  for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /https?:\/\//, /\blocalhost\b/, /127\.0\.0\.1/]) {
    assert.ok(!pattern.test(source), `${file} must not match ${pattern}`);
  }
}
check(true, 'renderer source contains no network, localhost or remote URL access');
check(!/console\.(log|debug|info|warn|error)/.test(rendererFiles.map(file => readFileSync(file, 'utf8')).join('')), 'renderer never logs business data to the console');

// 7. Raw HTML is only ever produced by the native, escaped statement renderer.
const rawHtml = rendererFiles.filter(file => /dangerouslySetInnerHTML/.test(readFileSync(file, 'utf8')));
check(rawHtml.length === 1 && rawHtml[0].endsWith('CustomerPanel.tsx'), 'only the customer statement renders raw HTML');
check(/render_customer_statement/.test(readFileSync(join(RENDERER, 'CustomerPanel.tsx'), 'utf8')), 'that HTML comes from the native statement command');
const nativeCustomer = readFileSync('packages/local-store/src/customers.rs', 'utf8');
check(/fn escape\(/.test(nativeCustomer) && /'&' => "&amp;"/.test(nativeCustomer), 'native statement text is escaped before it reaches the DOM');

// 8. Money is never formatted through floating point across the renderer.
const billingTypes = readFileSync(join(RENDERER, 'billing-types.ts'), 'utf8');
check(/function money\(paise: number \| string\)[\s\S]*BigInt\(paise\)/.test(billingTypes), 'money() formats cumulative balances with BigInt');
check(/function formatPaiseInput\(paise: number \| string[\s\S]*BigInt\(paise\)/.test(billingTypes), 'formatPaiseInput() formats editable paise amounts with BigInt');
check(!/parseFloat\(|Number\(.*Paise/.test(billingTypes), 'billing display never converts paise with parseFloat/Number');
for (const file of rendererFiles) {
  const source = readFileSync(file, 'utf8');
  assert.ok(!/Paise\s*\/\s*100\b/.test(source), `${file} divides *Paise by 100 in floating point`);
}
check(true, 'no desktop renderer file divides paise balances by 100 in floating point');

// 9. Printing re-checks authority before opening the dialog.
const printing = readFileSync(join(RENDERER, 'receipt-print.ts'), 'utf8');
const printIndex = printing.indexOf('window.print()');
const lastAuthorize = printing.lastIndexOf('await authorize()');
check(printIndex > lastAuthorize && lastAuthorize > 0, 'native authority is re-checked immediately before window.print()');
check(/Returning\/cancelling does not prove that paper was produced/.test(printing), 'printing never claims a document was produced');

// 10. Punjabi receipt translations and counter keyboard safety remain complete.
const savedInvoiceSource = readFileSync(join(RENDERER, 'SavedInvoice.tsx'), 'utf8');
const punjabiCatalog = JSON.parse(readFileSync(join(RENDERER, 'locales/pa.json'), 'utf8'));
const translatedLiterals = [...savedInvoiceSource.matchAll(/translate\(\s*'([^']+)'\s*\)/g)].map(m => m[1]);
const missingPunjabi = translatedLiterals.filter(key => typeof punjabiCatalog[key] !== 'string' || !punjabiCatalog[key].trim());
check(translatedLiterals.length >= 15 && missingPunjabi.length === 0, `all ${translatedLiterals.length} SavedInvoice receipt phrases exist in locales/pa.json`);
const checkoutSource = readFileSync(join(RENDERER, 'CheckoutPanel.tsx'), 'utf8');
for (const key of ['F2', 'F3', 'F4', 'F8', 'Escape']) {
  assert.ok(checkoutSource.includes(`event.key === '${key}'`), `CheckoutPanel missing ${key} shortcut`);
}
check(true, 'CheckoutPanel binds F2, F3, F4, F8 and Escape counter shortcuts');
const customerSource = readFileSync(join(RENDERER, 'CustomerPanel.tsx'), 'utf8');
const retailSource = readFileSync(join(RENDERER, 'RetailPanel.tsx'), 'utf8');
check(customerSource.includes("event.key === 'Escape'") && retailSource.includes("event.key === 'Escape'"), 'CustomerPanel and RetailPanel review prompts support Escape dismissal');
check(retailSource.includes('function requireReason()'), 'RetailPanel surfaces explicit guidance when a required correction/return reason is empty');

// 11. A repeated submit of one logical sale keeps one native operation id; the
// Rust transaction layer stays authoritative behind the busy guard.
check(/if \(submitting\.current \|\| disabled\) return;/.test(checkoutSource), 'confirm() refuses to run while a submission is already in flight');
check(/if \(blocked \|\| !preview \|\| problem/.test(checkoutSource), 'postNew() refuses to start without a valid preview');
check(/const blocked = disabled \|\| busy/.test(checkoutSource), 'checkout inputs and buttons lock while busy, so a second Enter cannot begin a new sale');
check(/if \(!retailRef\.current\) \{/.test(checkoutSource)
  && /prepare_local_retail', \{ r: retailRef\.current \}/.test(checkoutSource)
  && /post_local_retail', \{ r: retailRef\.current \}/.test(checkoutSource),
  'a retail sale is prepared and posted with one persisted operation id that every retry reuses');
check(/void confirm\(pending\)/.test(checkoutSource), 'F8 recovery and the retry button resubmit the same pending operation id, never a new one');
check(/Never create a new ID/.test(checkoutSource), 'the renderer documents that timeout/reply loss must never mint a new operation id');

console.log(`\n${checks} desktop contract checks passed`);
