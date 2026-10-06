#!/usr/bin/env node

/**
 * Extract every user-facing English phrase from the application.
 *
 * DukaanOS intentionally keeps product copy close to the screens and business
 * blueprints that use it. This extractor lets that remain true: it walks the
 * TypeScript/TSX syntax tree, collects rendered JSX, accessibility attributes,
 * copy-bearing object properties, dynamic templates, errors, and toast text,
 * then writes one canonical English catalogue. Other locale files are generated
 * from this catalogue by `scripts/translate-catalog.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['app', 'components', 'lib'];
const OUTPUT = path.join(ROOT, 'locales', 'en.json');

const ATTRIBUTE_NAMES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'placeholder',
  'title',
]);

const COPY_PROPERTIES = new Set([
  'a',
  'badge',
  'blurb',
  'body',
  'caption',
  'cta',
  'desc',
  'description',
  'detail',
  'empty',
  'error',
  'eyebrow',
  'headline',
  'help',
  'hint',
  'label',
  'message',
  'money',
  'name',
  'note',
  'promise',
  'q',
  'reason',
  'sub',
  'subtitle',
  'tagline',
  'text',
  'title',
  'what',
]);

const COPY_CALLS = new Set([
  'alert',
  'confirm',
  'flash',
  'requestOwner',
  'setError',
  'setMessage',
  'setResetMessage',
  'showToast',
  'toast',
  'track',
]);

const SINGLE_WORD_UI = new Set([
  'active', 'add', 'all', 'amount', 'back', 'both', 'cancel', 'cash', 'category',
  'close', 'completed', 'continue', 'customer', 'daily', 'delete', 'desk',
  'digital', 'disabled', 'done', 'download', 'edit', 'enabled', 'encrypted',
  'error', 'exact', 'expense', 'expenses', 'export', 'free', 'growth', 'help',
  'home', 'inventory', 'invoice', 'invoices', 'loading', 'lock', 'manager',
  'monthly', 'name', 'next', 'no', 'none', 'offline', 'open', 'owner', 'paid',
  'payment', 'payments', 'pending', 'physical', 'previous', 'price', 'print',
  'product', 'products', 'ready', 'receipt', 'record', 'remove', 'renew', 'report',
  'reports', 'reset', 'retry', 'role', 'sale', 'sales', 'save', 'scale', 'search',
  'security', 'select', 'service', 'settings', 'settled', 'starter', 'stock',
  'submit', 'success', 'supplier', 'suppliers', 'syncing', 'synced', 'team',
  'today', 'total', 'transaction', 'transactions', 'trial', 'unlimited', 'update',
  'upgrade', 'yearly', 'yes',
]);

const TECHNICAL_VALUE_PROPERTIES = new Set([
  'account', 'action', 'categoryId', 'code', 'color', 'currency', 'dateStyle',
  'direction', 'format', 'href', 'icon', 'id', 'interval', 'key', 'kind', 'locale',
  'method', 'metric', 'mode', 'module', 'planId', 'role', 'route', 'source',
  'status', 'templateId', 'timeStyle', 'tone', 'type', 'unit', 'value', 'variant',
]);

const CORE_MESSAGES = [
  'Sign in',
  'Open console',
  'Charts',
  'UPI QR',
  'Modules',
  'Security',
  'Pricing',
  'One operating system for every business — gyms, cafés, salons, shops & more',
  'Your business. Your money.',
  'Straight to your bank.',
  'DukaanOS runs your billing, inventory, memberships, and reports on one live ledger. Your collection QR comes from your own bank account — customers pay you directly. No gateway. No middleman. No liability.',
  'Start your business — free',
  'Peek at the live console',
  'Sample data only — never real or fabricated business numbers',
  'Every new business starts at zero. Every rupee on your dashboard appears only when you record a real sale or expense.',
  'Why pay',
  'Compare',
  'Questions',
  'Free plan forever · 3-day full trial · Growth ₹499/month · No card, no auto-debit',
  'Why owners pay for this',
  'Not for a dashboard. For the money the dashboard finds.',
  'Free forever, or paid and automated',
  'The same console either way. What changes is how much it chases for you.',
  'Straight answers',
  'Prices are per business — not per bill, not per counter, and never a cut of what you collect.',
  'Choose language',
  '23 languages: English and all 22 scheduled Indian languages',
];

function sourceFiles() {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        files.push(full);
      }
    }
  };

  for (const root of SOURCE_ROOTS) walk(path.join(ROOT, root));
  return files.sort();
}

function decodeJsxEntities(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&apos;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function normalise(value) {
  return decodeJsxEntities(value)
    .replace(/\s+/g, ' ')
    .trim();
}

function propertyName(node) {
  const name = node?.name;
  if (!name) return '';
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return '';
}

function callName(node) {
  const expression = node.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return '';
}

function jsxContext(node) {
  let current = node.parent;
  while (current) {
    // Expressions used by className, style, id, href, value, and other
    // structural props are implementation details, not rendered copy.
    if (ts.isJsxAttribute(current)) {
      const attribute = propertyName(current);
      return ATTRIBUTE_NAMES.has(attribute) ? 'attribute' : 'structural-attribute';
    }
    // Reaching an element/fragment before an attribute means this expression is
    // a rendered child (for example, {'Save'} or a conditional label).
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isJsxFragment(current)) return 'child';
    if (ts.isStatement(current) || ts.isSourceFile(current)) return 'none';
    current = current.parent;
  }
  return 'none';
}

function isCoreEnglishDictionaryValue(node) {
  const parent = node.parent;
  if (!ts.isPropertyAssignment(parent)) return false;
  let current = parent.parent;
  while (current && !ts.isVariableDeclaration(current)) current = current.parent;
  return Boolean(current && ts.isIdentifier(current.name) && current.name.text === 'en');
}

function hasHumanLanguage(value, strongContext = false) {
  if (!value || value.length > 900 || !/[A-Za-z]/.test(value)) return false;
  if (/^[A-Za-z]$/.test(value)) return false;
  if (/^(?:https?:|mailto:|tel:|data:)/i.test(value)) return false;
  if (/^(?:\.{0,2}\/|@\/|\/)[A-Za-z0-9_./?=&:#${}-]*$/.test(value)) return false;
  if (/^[A-Za-z0-9_.-]+\.(?:ts|tsx|js|jsx|json|css|svg|png|jpe?g|webp|csv|pdf|mjs|sql)$/i.test(value)) return false;
  if (/^(?:#[0-9a-f]{3,8}|rgb\(|hsl\()/i.test(value)) return false;
  if (/^[a-z]+\/[a-z0-9.+-]+$/i.test(value)) return false;
  if (/\b(?:bg|text|border|ring|shadow|rounded|grid|flex|items|justify|hover|focus|sm|md|lg|xl|px|py|mt|mb|ml|mr|gap|w|h|min|max|translate|animate|overflow|tracking|leading|font|inset|absolute|relative|fixed|sticky|z)-[\[\]a-z0-9/.:%_-]+/i.test(value)) return false;
  if (/^(?:[a-z][A-Za-z0-9]*)(?:\.[a-z][A-Za-z0-9]*)+$/.test(value)) return false;
  if (/^[A-Z0-9_]+$/.test(value) && value.length > 3) return false;

  const words = value.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) ?? [];
  if (words.length >= 2) return true;
  if (/[.!?…:;,—–&]/.test(value) && words.length >= 1) return true;
  if (strongContext && words.length === 1) return true;
  return words.length === 1 && (SINGLE_WORD_UI.has(words[0].toLowerCase()) || /^[A-Z][a-z]+$/.test(words[0]));
}

function templateText(node) {
  let value = node.head.text;
  node.templateSpans.forEach((span, index) => {
    value += `{{${index}}}${span.literal.text}`;
  });
  return value;
}

const phrases = new Map();
function add(raw, file, kind, strongContext = false) {
  const value = normalise(raw);
  if (!hasHumanLanguage(value, strongContext)) return;
  if (!phrases.has(value)) phrases.set(value, []);
  const origin = `${path.relative(ROOT, file)}:${kind}`;
  const origins = phrases.get(value);
  if (origins.length < 4 && !origins.includes(origin)) origins.push(origin);
}

for (const phrase of CORE_MESSAGES) add(phrase, path.join(ROOT, 'lib', 'i18n.tsx'), 'core', true);

for (const file of sourceFiles()) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      add(node.text, file, 'jsx', true);
    } else if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) {
      const parent = node.parent;
      let strongContext = false;
      let include = false;

      if (ts.isJsxAttribute(parent)) {
        const attribute = propertyName(parent);
        include = ATTRIBUTE_NAMES.has(attribute);
        strongContext = include;
      } else if (ts.isPropertyAssignment(parent)) {
        const property = propertyName(parent);
        include = COPY_PROPERTIES.has(property) || isCoreEnglishDictionaryValue(node);
        strongContext = include;
        if (TECHNICAL_VALUE_PROPERTIES.has(property)) include = false;
      } else if (ts.isCallExpression(parent)) {
        include = COPY_CALLS.has(callName(parent));
        strongContext = include;
      } else if (jsxContext(node) === 'child') {
        include = true;
        strongContext = true;
      } else if (ts.isReturnStatement(parent) || ts.isThrowStatement(parent)) {
        include = true;
      }

      if (include) add(node.text, file, 'literal', strongContext);
    } else if (ts.isTemplateExpression(node)) {
      const parent = node.parent;
      const property = ts.isPropertyAssignment(parent) ? propertyName(parent) : '';
      const include =
        jsxContext(node) === 'child' ||
        COPY_PROPERTIES.has(property) ||
        (ts.isCallExpression(parent) && COPY_CALLS.has(callName(parent))) ||
        ts.isReturnStatement(parent);
      if (include) add(templateText(node), file, 'template', true);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

const sorted = [...phrases.keys()].sort((a, b) => a.localeCompare(b, 'en'));
const catalogue = Object.fromEntries(sorted.map((phrase) => [phrase, phrase]));
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(catalogue, null, 2)}\n`);

const templates = sorted.filter((phrase) => phrase.includes('{{')).length;
console.log(`Extracted ${sorted.length} English UI phrases (${templates} dynamic templates) to ${path.relative(ROOT, OUTPUT)}.`);
