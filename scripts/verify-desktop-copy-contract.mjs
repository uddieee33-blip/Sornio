#!/usr/bin/env node
/**
 * Copy-drift gate for the desktop UI acceptance scripts.
 *
 * Two acceptance failures in Phase 19E had the same root cause: the product
 * changed a visible string and the automation that asserted the old string
 * was never updated, so a *stale assertion* was reported as a product failure.
 *
 *   * apps/desktop/check-ui.cjs      waited for "Make this PC yours." while the
 *     access screen has said "Make this device yours." since cf87c14.
 *   * apps/desktop/check-native.py  waited for "Enter a customer reference for
 *     credit" while the checkout has required a resolved credit customer and
 *     said so since 499b9f7.
 *
 * Neither string exists anywhere in the product any more, so those assertions
 * were unreachable by construction: they could only ever fail, and they fail
 * as a mystery 30-second locator timeout that says nothing about the cause.
 *
 * This gate extracts every literal the acceptance scripts expect to see and
 * checks that the product can still produce it. It is a *drift* detector, not
 * a behaviour test: it proves the expected copy still exists in a source of
 * truth, so unreachable assertions fail here — in a fast job, with a precise
 * message — instead of failing later on a Windows runner as a timeout.
 *
 * Static analysis only. It never claims a screen renders or a button works.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/** Every place a user-visible string can legitimately come from. */
const SOURCE_ROOTS = [
  'apps/desktop/src',
  'apps/desktop/src-tauri/src',
  'packages/local-store/src',
  'packages/business-domain/src',
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let info;
    try {
      info = statSync(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** file path -> source text. */
const corpus = new Map();
for (const root of SOURCE_ROOTS) {
  for (const file of walk(join(ROOT, root))) {
    if (!/\.(ts|tsx|rs|json)$/.test(file)) continue;
    corpus.set(relative(ROOT, file), readFileSync(file, 'utf8'));
  }
}
// The Punjabi catalogue translates product copy, so it counts as a source of
// truth for strings the renderer passes through translate().
for (const file of walk(join(ROOT, 'apps/desktop/src/locales'))) {
  corpus.set(relative(ROOT, file), readFileSync(file, 'utf8'));
}

/* ------------------------------------------------------------------ */
/* Extract the literals the acceptance scripts expect to see.          */
/* ------------------------------------------------------------------ */

const ACCEPTANCE = [
  'apps/desktop/check-ui.cjs',
  'apps/desktop/check-focus.cjs',
  'apps/desktop/check-checkout.cjs',
  'apps/desktop/check-credentials.cjs',
  'apps/desktop/check-authorization.cjs',
  'apps/desktop/check-backup.cjs',
  'apps/desktop/check-customers.cjs',
  'apps/desktop/check-inventory-refresh.cjs',
  'apps/desktop/check-inventory-recovery.cjs',
  'apps/desktop/check-receipts.cjs',
  'apps/desktop/check-retail.cjs',
  'apps/desktop/check-statement-print.cjs',
  'apps/desktop/check-native.py',
];

const expectations = [];

function expect(literal, source, kind) {
  if (!literal || literal.length < 4) return;
  if (literal.includes('${')) return;
  expectations.push({ literal, source, kind });
}

const JS_PATTERNS = [
  // getByRole('heading',{name:'...',exact:true}) and the same for button, link,
  // textbox, combobox, checkbox, option.
  [/getByRole\(\s*'(?:heading|button|link|textbox|combobox|checkbox|option)'\s*,\s*\{\s*name:\s*'((?:[^'\\]|\\.)*)'/g, 'role-name'],
  // getByRole('button').filter({hasText:'...'}) / alert().filter({hasText:'...'})
  [/\.filter\(\{\s*hasText:\s*'((?:[^'\\]|\\.)*)'/g, 'has-text'],
  // getByLabel('...',{exact:true})
  [/getByLabel\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*\{\s*exact:\s*true\s*\}/g, 'label'],
  // getByText('...',{exact:true})
  [/getByText\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*\{\s*exact:\s*true\s*\}/g, 'text'],
  // getByPlaceholder('...')
  [/getByPlaceholder\(\s*'((?:[^'\\]|\\.)*)'/g, 'placeholder'],
  // getByRole('dialog',{name:'...',exact:true})
  [/getByRole\(\s*'dialog'\s*,\s*\{\s*name:\s*'((?:[^'\\]|\\.)*)'/g, 'dialog-name'],
];

const PY_PATTERNS = [
  // fill("Label", ...) / activate("Button") / focus_control("Label", "Type")
  // / message_visible("...") / assert_review_blocked("...")
  [/\b(?:fill|activate|focus_control|message_visible|assert_review_blocked)\(\s*"((?:[^"\\]|\\.)*)"/g, 'uia-label'],
];

function unescape(value) {
  return value.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

for (const relativePath of ACCEPTANCE) {
  let source;
  try {
    source = readFileSync(join(ROOT, relativePath), 'utf8');
  } catch {
    continue;
  }
  const patterns = relativePath.endsWith('.py') ? PY_PATTERNS : JS_PATTERNS;
  for (const [pattern, kind] of patterns) {
    for (const match of source.matchAll(pattern)) {
      expect(unescape(match[1]), relativePath, kind);
    }
  }
}

// Helper indirection: `const button = name => page.getByRole('button',{name,exact:true})`
// then `button('Set up local access')`. Those literals are expectations too.
for (const relativePath of ACCEPTANCE.filter(p => p.endsWith('.cjs'))) {
  const source = readFileSync(join(ROOT, relativePath), 'utf8');
  for (const [, args] of source.matchAll(/const\s+(?:button|label|password|alert)\s*=\s*\(([^)]*)\)\s*=>/g)) {
    const param = args.split(',')[0].trim();
    if (!param) continue;
    const pattern = new RegExp(`\\b${param}\\(\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'g');
    for (const match of source.matchAll(pattern)) {
      expect(unescape(match[1]), relativePath, `${param}-helper`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* What the product can render.                                         */
/* ------------------------------------------------------------------ */

function normalise(value) {
  return value
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Templates are the product's own wording with holes in it.
 *
 * Two shapes matter:
 *   * a JS template literal — `Cash recorded: ${money(balances.cashPaise)}`
 *   * a JSX text run — `Split {label} amount (₹)`
 *
 * Each template is kept with the file it came from, because that file's
 * vocabulary is what decides whether a substituted value is something the
 * product itself would write ("cash", "UPI") or something only the test
 * fixture knows ("Sample native rice").
 */
const templates = [];
for (const [file, source] of corpus) {
  for (const match of source.matchAll(/`([^`\\]*(?:\\.[^`\\]*)*)`/g)) {
    const body = match[1];
    if (body.includes('${')) templates.push({ file, body });
  }
  // JSX text runs: text between tags, with or without holes.
  for (const match of source.matchAll(/>([^<>]+)</g)) {
    const body = match[1];
    if (!body.trim()) continue;
    templates.push({ file, body });
  }
  // Plain string literals are templates with no holes at all.
  for (const match of source.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
    const body = match[1];
    if (body.length >= 4 && !body.includes('\\n')) templates.push({ file, body });
  }
  for (const match of source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
    const body = match[1];
    if (body.length >= 4 && !body.includes('\\n')) templates.push({ file, body });
  }
}

/** Words of length 3 or more, which are the ones that carry meaning. */
function words(text) {
  return text.match(/[A-Za-z][A-Za-z'’-]{2,}/g) ?? [];
}

/** The vocabulary the product itself uses in one file. */
const fileVocabulary = new Map();
for (const [file, source] of corpus) {
  fileVocabulary.set(file, new Set(words(source)));
}

/**
 * Can this template produce the expectation?
 *
 * The template's own wording must appear in the expectation, and every word
 * that came out of a hole must be a word the same file already uses. That is
 * what makes the check sound: "Make this PC yours." cannot be produced by any
 * template, because no template says "Make this {something} yours." — the
 * access screen says "Make this device yours." and nothing else.
 */
function templateProduces(template, needle) {
  const body = template.body;
  // Split the template into literal text and holes. A hole is either a
  // `${...}` interpolation or a `{...}` JSX expression; the `$` of an
  // interpolation belongs to the hole, not to the template's wording.
  const pieces = [];
  let cursor = 0;
  const hole = /\$\{[^}]*\}|\{[^{}]*\}/g;
  let hit;
  while ((hit = hole.exec(body)) !== null) {
    pieces.push({ hole: false, text: body.slice(cursor, hit.index) });
    pieces.push({ hole: true, text: hit[0] });
    cursor = hit.index + hit[0].length;
  }
  pieces.push({ hole: false, text: body.slice(cursor) });

  const literalText = pieces.filter(p => !p.hole).map(p => p.text).join('');
  if (!literalText.trim()) return false;

  const source = pieces
    .map(p => (p.hole ? '((?:.|\\n)*?)' : p.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  let matched;
  try {
    matched = new RegExp(`^${source}$`, 'd').exec(needle);
  } catch {
    return false;
  }
  if (!matched || !matched.indices) return false;

  const spans = matched.indices.slice(1).filter(span => span && span[0] !== span[1]);

  // The template's own wording must survive in the expectation.
  const literalWords = words(literalText).map(w => w.toLowerCase());
  const needleWords = words(needle).map(w => w.toLowerCase());
  for (const word of literalWords) {
    if (!needleWords.includes(word)) return false;
  }

  // Every word that came out of a hole must be a word this file already uses.
  const vocabulary = fileVocabulary.get(template.file) ?? new Set();
  for (const [start, end] of spans) {
    for (const word of words(needle.slice(start, end))) {
      if (!vocabulary.has(word)) return false;
    }
  }
  return true;
}

/**
 * Expectations that are not product copy, with the reason for each.
 *
 * These fall into two groups:
 *
 *   1. Strings the *harness itself* throws from its own mocked native layer.
 *      The product never renders them, so they can never be found in the
 *      product sources — but they are exactly what the assertion is testing
 *      (that the renderer surfaces the mocked error), so they are correct.
 *
 *   2. Labels the product builds by interpolating the harness's own fixture
 *      data (a product named "Phase 5 acceptance ghee", a staff account named
 *      "native-cashier"). The wording comes from the product; only the value
 *      in the hole comes from the fixture.
 *
 * Each entry says which, so the list stays a reviewed artefact rather than a
 * place to hide real drift. A new entry must name its group.
 */
const FIXTURE_DERIVED = new Map([
  // Group 1 — the harness's own mocked native error text.
  ['Could not lock this workspace.', 'harness mock: check-ui.cjs throws this from its mock'],
  ['Another inventory receipt is waiting to be acknowledged.', 'harness mock: check-inventory-refresh.cjs throws this from its mock'],
  ['acknowledgement reply lost', 'harness mock: check-inventory-recovery.cjs throws this from its mock'],

  // Group 2 — product wording around the harness's own fixture data.
  ['Role for native-cashier', 'product label with the fixture staff account name'],
  ['Save role for native-cashier', 'product label with the fixture staff account name'],
  ['Disable native-cashier', 'product label with the fixture staff account name'],
  ['Add Phase 5 acceptance ghee to sale', 'product label with the fixture product name'],
  ['Quantity for Sample native rice (pcs)', 'product label with the fixture product name'],
  ['Add Sample native rice to sale', 'product label with the fixture product name'],
  ['Quantity for Phase 5 acceptance ghee (pcs)', 'product label with the fixture product name'],
  ['Return quantity for line 1: Sample native rice (pcs)', 'product label with the fixture product name'],
  ['Use customer native-cashier-1', 'product label with the fixture customer name'],
  ['Use customer native-customer-1', 'product label with the fixture customer name'],
  ['Use customer native-customer-2', 'product label with the fixture customer name'],
  ['Open customer native-customer-1', 'product label with the fixture customer name'],
  ['Asha <shop>', 'fixture customer and shop name'],
  ['Asha <shop> ਪੰਜਾਬੀ', 'fixture customer and shop name'],
  ['Immutable original shop', 'fixture shop name'],
  ['Renamed draft after sale', 'fixture draft name'],
  ['synthetic.sorniobackup', 'fixture file name'],

  // Group 3 — values the product formats at runtime from the fixture's data.
  ['Revision 1 · Current draft', 'runtime revision number'],
  ['Revision 2 · Current draft', 'runtime revision number'],
  ['4 kg', 'runtime quantity'],
  ['3 kg', 'runtime quantity'],
  ['2 pcs', 'runtime quantity'],
  ['1.25 pcs', 'runtime quantity'],
  ['4 pcs', 'runtime quantity'],
  ['8.75 kg', 'runtime quantity'],
  ['1.875 pcs', 'runtime quantity'],
]);

const missing = [];
const normalisedHaystack = normalise([...corpus.values()].join('\n'));
for (const { literal, source, kind } of expectations) {
  const needle = normalise(literal);
  if (!needle) continue;
  if (FIXTURE_DERIVED.has(needle)) continue;
  // Fast path: the product still contains this text verbatim.
  if (normalisedHaystack.includes(needle)) continue;
  const producible = templates.some(template => templateProduces(template, needle));
  if (producible) continue;
  missing.push({ literal, source, kind });
}

if (missing.length) {
  console.error(`\n${missing.length} desktop UI expectation(s) no longer exist in the product:\n`);
  for (const { literal, source, kind } of missing) {
    console.error(`  ${source}  [${kind}]`);
    console.error(`      "${literal}"`);
  }
  console.error('\nEach one is an unreachable assertion: the acceptance script waits for copy');
  console.error('that the product can no longer render, so the check fails as a mystery timeout');
  console.error('instead of naming the drift. Update the automation to the copy the product');
  console.error('actually shows, or restore the copy if the product is wrong.');
  process.exit(1);
}

console.log(`ok   ${expectations.length} desktop UI expectations can still be produced by the product`);
console.log(`ok   ${corpus.size} product source files scanned for copy`);
console.log(`ok   ${templates.length} product templates checked`);
