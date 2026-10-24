#!/usr/bin/env node

/**
 * Verify the two rendering rules that a hydration mismatch breaks.
 *
 * A hydration mismatch is not a crash. The page paints, the console fills with
 * React's warning, the subtree is thrown away and rebuilt on the client — so
 * the screen the owner sees is usually *almost* right and the only evidence is
 * an error nobody reads. Both failures below shipped once, were visible on
 * real screens, and were found only by driving a browser through the console:
 *
 *   1. **Browser state is not read during render.** The Trust Centre scored
 *      four checks — `isSecureContext`, `crossOriginIsolated`, WebAuthn
 *      support and `document.cookie` — straight out of `window` while
 *      rendering, so the server's HTML said 37 and the client's first frame
 *      said 58. The ring changed colour under React's error.
 *   2. **Text the server rendered is not rewritten unless it is translated.**
 *      The i18n walker looked a phrase up by its normalised form and, on a
 *      miss, wrote the normalised form back into the DOM. Every newline in
 *      every string the app had not translated — the `<pre>` env template on
 *      Settings among them — collapsed into a single space, and the page
 *      disagreed with the HTML that produced it.
 *
 * Neither can be caught by types: both are perfectly valid TypeScript. They are
 * caught by reading the source back and refusing to be polite about it.
 *
 * Run: npm run verify:render
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

const posture = read('lib', 'security', 'posture.ts');
const scoreCard = read('components', 'security', 'security-score.tsx');
const i18n = read('lib', 'i18n.tsx');
const authForm = read('components', 'auth', 'auth-form.tsx');

/** Comments explain the rules; they are not the rules. Strip before counting. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const passed = [];
const failures = [];

function check(label, condition, detail) {
  if (condition) passed.push(label);
  else failures.push(`${label} — ${detail}`);
}

/** The body of one function, by brace matching. Text after it is not its business. */
function functionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

/* ------------------------------------- 1. browser facts arrive after mount */

const factsReader = functionBody(posture, 'export function readBrowserFacts');
check(
  'the browser facts are read in exactly one function',
  factsReader !== null && /window\.isSecureContext/.test(factsReader) && /document\.cookie/.test(factsReader),
  'lib/security/posture.ts no longer reads isSecureContext/document.cookie in readBrowserFacts. The Trust Centre scores what this browser reports; if that read moves, the score is guesswork.',
);

check(
  'the posture builder takes the facts as an argument',
  /export function buildPostureReport\(\s*input: PostureInput,\s*facts: BrowserFacts \| null = null,?\s*\)/.test(posture),
  'buildPostureReport no longer accepts `facts`. Reaching for `window` inside the builder is what put 37 in the HTML and 58 on screen: the server cannot answer those checks, and the first client render must not answer them either.',
);

check(
  'a server render answers no browser check',
  /const secure = facts \? facts\.secure : undefined;/.test(posture) &&
    /state: facts === null \? 'unknown' : facts\.authorityCookiesHidden \? 'pass' : 'fail',/.test(posture),
  'a browser-dependent check no longer falls back to `unknown` when `facts` is null. That fallback is what keeps the client’s first render identical to the server’s HTML.',
);

check(
  'the trust centre starts with no browser facts',
  /useState<BrowserFacts \| null>\(null\)/.test(scoreCard),
  'components/security/security-score.tsx no longer starts its browser facts at null. The first client render has to be the state the server rendered, or React discards the tree it was given.',
);

const factsEffect = /useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[refreshedAt\]\)/.exec(scoreCard)?.[1] ?? null;
check(
  'the browser facts are collected in an effect, not during render',
  factsEffect !== null && /setBrowserFacts\(readBrowserFacts\(\)\)/.test(factsEffect),
  'the browser facts are no longer collected inside the effect keyed on `refreshedAt`. Read during render they are exactly the mismatch this file exists to prevent; the effect is also what lets "Check again" re-ask the browser.',
);

const reportMemo = /const report = useMemo\(([\s\S]*?)\n  \);/.exec(scoreCard)?.[1] ?? null;
check(
  'the report is not built from a browser read',
  reportMemo !== null && !/readBrowserFacts\(|document\.|window\./.test(reportMemo),
  'the posture report is being built from a browser read inside the `report` useMemo. That is the 37-versus-58 bug exactly: the server cannot answer those checks, so the memo has to be handed facts that were collected after mount.',
);

check(
  'the score card hands the facts to the builder',
  /buildPostureReport\(\s*\{[\s\S]*?\},\s*browserFacts,\s*\)/.test(scoreCard),
  'buildPostureReport is called without `browserFacts`. The Trust Centre would score every browser check as unknown forever — honest, but useless.',
);

/* Pending evidence is unknown, and configuration is not verification. */
const compiledPosture = ts.transpileModule(posture, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { buildPostureReport } = await import(`data:text/javascript;base64,${Buffer.from(compiledPosture).toString('base64')}`);
const input = {
  vaultEncrypted: true, lockEnabled: true, autoLockMinutes: 5, chainIntact: true,
  unchainedEntries: 0, syncConfigured: true, syncVerified: true,
  privacyScreen: true, revealAll: false, passkeyEnrolled: true,
};
const facts = { secure: true, isolated: true, webauthn: true, localhost: false, authorityCookiesHidden: true };
const pendingReport = buildPostureReport({ ...input, vaultEncrypted: null, chainIntact: null }, facts);
for (const id of ['vault', 'audit-chain']) {
  const pendingCheck = pendingReport.checks.find((item) => item.id === id);
  check(`${id} stays unknown until evidence arrives`, pendingCheck.state === 'unknown' && !pendingCheck.action,
    'An unfinished check must neither pass nor accuse the owner of a failure.');
}
check('unknown device checks are excluded from the score', pendingReport.score === 100 && pendingReport.unknowns === 2,
  'Pending evidence must not be awarded pass credit or failure weight.');
const fallback = buildPostureReport({ ...input, vaultEncrypted: false, chainIntact: false, syncVerified: false }, facts);
check('plaintext persistence is never advertised as encrypted', fallback.checks.find((item) => item.id === 'vault').state === 'warn',
  'WebCrypto support alone cannot verify that the latest records were encrypted.');
check('a broken audit chain still fails after verification', fallback.checks.find((item) => item.id === 'audit-chain').state === 'fail',
  'Pending and failed verification must remain distinguishable.');
check('cloud configuration alone cannot earn a backup pass', fallback.checks.find((item) => item.id === 'backup').state === 'unknown',
  'A URL does not prove that any records reached the server.');
check('a completed sync verifies an off-device copy', buildPostureReport(input, facts).checks.find((item) => item.id === 'backup').state === 'pass',
  'Successful sync should replace the unverified state.');

/* --------------------------------- 2. untranslated text keeps its bytes */

check(
  'a <pre> and a <textarea> are content, not copy',
  /const PREFORMATTED_SELECTOR = 'pre, textarea'/.test(i18n),
  'lib/i18n.tsx no longer names preformatted elements. In a <pre> the line breaks are the content — a translated or renormalised env template is a wrong env template — and a <textarea>\'s child text is its value.',
);

check(
  'the walker skips preformatted subtrees, not just bare text nodes',
  /closest\(PREFORMATTED_SELECTOR\)/.test(i18n),
  'shouldSkip no longer consults PREFORMATTED_SELECTOR, so a <span> or <a> inside a <pre> would have its text rewritten by the walker.',
);

const translateValue = functionBody(i18n, 'function translateValue');
check(
  'a phrase with no translation is returned untouched',
  translateValue !== null && /return source;\s*$/.test(translateValue.trim()),
  'translateValue returns the normalised lookup key when no catalogue has the phrase. The walker writes that return value into the DOM, so every newline in untranslated copy collapses to a space and the page disagrees with the HTML it was served.',
);

/* --------------------- 3. a browser is allowed to annotate a credential field */

const authCode = stripComments(authForm);
const tolerances = (authCode.match(/suppressHydrationWarning/g) ?? []).length;
check(
  'the sign-in fields tolerate a browser’s autofill annotation',
  tolerances >= 3,
  'components/auth/auth-form.tsx no longer tolerates an autofill annotation on the credential fields. Chrome paints `__gcruniqueid` onto a form and the fields it can fill *before* React hydrates, so the sign-in page — the first page every owner sees — reported a hydration attribute mismatch on a page that was completely correct. The attribute never appears in the HTML the server sends.',
);

/* ------------------------------------------------------------------ output */

console.log('\nVerifying that rendering rules the browser can see\n');
for (const label of passed) console.log(`  ok    ${label}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(`\n${passed.length} invariants hold.\n`);

