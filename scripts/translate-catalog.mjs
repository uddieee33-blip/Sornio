#!/usr/bin/env node

/**
 * Generate static DukaanOS locale catalogues from locales/en.json.
 *
 * This is a maintainer tool, never runtime application code. It uses Google's
 * batched web translation RPC so each phrase remains an independent unit,
 * validates every dynamic slot, overlays the human-reviewed phrases in
 * curated.json, and writes deterministic JSON consumed from /public/locales.
 *
 * The run is incremental by default. A release that adds twelve phrases to one
 * screen should cost twelve translations, not 2,000 — reusing what is already
 * on disk keeps every reviewed line stable, keeps the diff readable, and makes
 * "the catalogue drifted again" a one-minute fix instead of an afternoon. A
 * phrase is sent to the service only when it is new and has no curated entry;
 * pass I18N_FORCE=1 to retranslate a locale from scratch.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { batchTranslate } = require('google-translate-api-x');

const ROOT = process.cwd();
const SOURCE_FILE = path.join(ROOT, 'locales', 'en.json');
const CURATED_FILE = path.join(ROOT, 'locales', 'curated.json');
const OUTPUT_DIRECTORY = path.join(ROOT, 'public', 'locales');
const BATCH_SIZE = Number(process.env.I18N_BATCH_SIZE || 160);
const CONCURRENCY = Number(process.env.I18N_CONCURRENCY || 1);
const FORCE = process.env.I18N_FORCE === '1';
const GOOGLE_TLDS = ['com', 'co.in', 'co.uk', 'ca'];

// Google currently carries 20 of the 22 scheduled languages. Bodo and
// Kashmiri are generated with AI4Bharat IndicTrans2 by the companion tool.
const TARGETS = {
  as: 'as',
  bn: 'bn',
  doi: 'doi',
  gu: 'gu',
  hi: 'hi',
  kn: 'kn',
  kok: 'gom',
  mai: 'mai',
  ml: 'ml',
  mni: 'mni-Mtei',
  mr: 'mr',
  ne: 'ne',
  or: 'or',
  pa: 'pa',
  sa: 'sa',
  sat: 'sat',
  sd: 'sd',
  ta: 'ta',
  te: 'te',
  ur: 'ur',
};

// Product names, payment rails, standards, and template slots are data, not
// prose. Stable tokens stop the translation service from transliterating them.
const PROTECTED_TERMS = [
  'DukaanOS',
  'WhatsApp',
  'Supabase',
  'WebAuthn',
  'PBKDF2',
  'Content-Security-Policy',
  'UPI',
  'IFSC',
  'HSTS',
  'MIME',
  'CSV',
  'PDF',
  'GST',
  'SKU',
  'EAN-13',
  'EAN-8',
  'Code 128',
  'QR',
  'SMS',
  'PIN',
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function protect(source) {
  // Deliberately meaningless consonant runs survive transliteration models.
  // Human-looking markers such as DUKAANOS_SLOT are transliterated by Assamese
  // and a few other low-resource models, even when wrapped in underscores.
  // Google treats ICU-style brace placeholders as non-linguistic markup and
  // keeps them in place (including when it reorders the surrounding sentence).
  // Keeping {{0}} intact is more reliable than an opaque token, which a model
  // may decide to omit together with a parenthetical phrase.
  let value = source;
  const terms = [];

  for (const term of PROTECTED_TERMS) {
    if (!value.includes(term)) continue;
    const token = `ZXQJT${terms.length}JQXZ`;
    value = value.replaceAll(term, token);
    terms.push(term);
  }

  return { value, terms };
}

function restore(translated, protectedPhrase) {
  let value = translated;
  const omittedTerms = [];
  protectedPhrase.terms.forEach((term, index) => {
    const token = new RegExp(`ZXQJT${index}JQXZ`, 'gi');
    if (token.test(value)) value = value.replace(token, term);
    else omittedTerms.push(term);
  });
  value = value.replace(/\s+/g, ' ').trim();
  return omittedTerms.length ? `${value} · ${omittedTerms.join(' · ')}` : value;
}

function slotList(value) {
  return [...value.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1]);
}

function dynamicSlots(value) {
  return slotList(value).sort().join(',');
}

/**
 * Some models simplify semantically repetitive source copy and can omit a
 * value placeholder with it (for example, a plan name next to "membership").
 * A live value must never disappear. Remove accidental duplicate/unknown slots
 * and retain any omitted values in a neutral suffix that works in every script.
 */
function repairDynamicSlots(source, translated) {
  const expected = slotList(source);
  const expectedSet = new Set(expected);
  const seen = new Set();
  let value = translated.replace(/\{\{(\d+)\}\}/g, (slot, index) => {
    if (!expectedSet.has(index) || seen.has(index)) return '';
    seen.add(index);
    return slot;
  });
  const omitted = expected.filter((index) => !seen.has(index));
  value = value.replace(/\s+/g, ' ').trim();
  return omitted.length ? `${value} · ${omitted.map((index) => `{{${index}}}`).join(' · ')}` : value;
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function translateBatch(batch, target) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const tld = GOOGLE_TLDS[attempt % GOOGLE_TLDS.length];
    try {
      const results = await batchTranslate(
        batch.map((entry) => entry.protected.value),
        {
          from: 'en',
          to: target,
          forceFrom: true,
          forceTo: true,
          rejectOnPartialFail: true,
          tld,
        },
      );
      if (!Array.isArray(results) || results.length !== batch.length) {
        throw new Error(`Translation RPC returned ${results?.length ?? 0}/${batch.length} results`);
      }
      const empty = results.filter((result) => !result?.text).length;
      if (empty) console.warn(`[${target}] ${empty}/${batch.length} technical fragments were returned unchanged`);
      return results.map((result, index) => result?.text || batch[index].protected.value);
    } catch (error) {
      lastError = error;
      const delay = Math.min(30_000, 1_500 * 2 ** attempt) + Math.round(Math.random() * 500);
      console.warn(`[${target}] batch retry ${attempt + 1}/8 via google.${tld}: ${error instanceof Error ? error.message : error}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function parallelMap(items, limit, operation) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await operation(items[index], index);
      // Be polite to a free web endpoint and avoid shared-runner rate limits.
      await sleep(500);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Translations already published for this locale, reused unless forced. */
async function readExisting(code) {
  if (FORCE) return {};
  try {
    const existing = JSON.parse(await fs.readFile(path.join(OUTPUT_DIRECTORY, `${code}.json`), 'utf8'));
    return existing && typeof existing === 'object' ? existing : {};
  } catch {
    return {};
  }
}

async function generateLocale(code, target, sources, curated) {
  const existing = await readExisting(code);
  const settled = new Map();

  for (const source of sources) {
    // A reviewed phrase always wins, even over a translation already on disk.
    const curatedValue = curated?.[source];
    if (typeof curatedValue === 'string' && curatedValue.trim()) {
      settled.set(source, curatedValue);
      continue;
    }
    const previous = existing[source];
    // Reuse only what is intact: a value that lost a slot gets another go.
    if (typeof previous === 'string' && previous.trim() && dynamicSlots(previous) === dynamicSlots(source)) {
      settled.set(source, previous);
    }
  }

  const live = new Set(sources);
  const pending = sources.filter((source) => !settled.has(source));
  const reused = sources.length - pending.length;
  const stale = Object.keys(existing).filter((source) => !live.has(source)).length;

  if (!pending.length) {
    console.log(`[${code}] nothing new to translate (${reused} phrases reused)`);
  } else {
    console.log(`[${code}] ${pending.length} new phrase${pending.length === 1 ? '' : 's'} to translate, ${reused} reused`);
  }

  const entries = pending.map((source, index) => ({ index, source, protected: protect(source) }));
  const batches = chunk(entries, BATCH_SIZE);
  let complete = 0;

  const translatedBatches = await parallelMap(batches, CONCURRENCY, async (batch) => {
    const result = await translateBatch(batch, target);
    complete += 1;
    if (complete % 5 === 0 || complete === batches.length) {
      console.log(`[${code}] ${complete}/${batches.length} batches`);
    }
    return result;
  });

  const raw = translatedBatches.flat();
  for (const entry of entries) {
    const translated = repairDynamicSlots(
      entry.source,
      restore(raw[entry.index] ?? '', entry.protected),
    );
    if (!translated) throw new Error(`[${code}] Empty translation for: ${entry.source}`);
    if (dynamicSlots(translated) !== dynamicSlots(entry.source)) {
      throw new Error(`[${code}] Dynamic slots changed for: ${entry.source}\nReceived: ${translated}`);
    }
    settled.set(entry.source, translated);
  }

  // Written in source order so the file is a readable diff, and so phrases
  // retired from the product leave the catalogue instead of lingering.
  const catalogue = {};
  for (const source of sources) catalogue[source] = settled.get(source);

  const changed = sources.filter((source) => catalogue[source].toLocaleLowerCase() !== source.toLocaleLowerCase()).length;
  if (changed / sources.length < 0.55) {
    throw new Error(`[${code}] Only ${changed}/${sources.length} phrases changed; refusing an incomplete locale.`);
  }
  if (stale) console.log(`[${code}] dropped ${stale} phrase${stale === 1 ? '' : 's'} no longer in the product`);

  await fs.writeFile(
    path.join(OUTPUT_DIRECTORY, `${code}.json`),
    `${JSON.stringify(catalogue, null, 2)}\n`,
  );
  console.log(`[${code}] wrote ${sources.length} phrases (${changed} translated)`);
}

const sourceCatalogue = JSON.parse(await fs.readFile(SOURCE_FILE, 'utf8'));
const curated = JSON.parse(await fs.readFile(CURATED_FILE, 'utf8'));
const sources = Object.keys(sourceCatalogue).sort((a, b) => a.localeCompare(b, 'en'));
const requested = (process.env.I18N_TARGETS || Object.keys(TARGETS).join(','))
  .split(',')
  .map((code) => code.trim())
  .filter(Boolean);

for (const code of requested) {
  if (!TARGETS[code]) throw new Error(`Unknown locale: ${code}`);
}

await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
// Locales run sequentially; phrases inside each locale use bounded concurrency.
for (const code of requested) {
  await generateLocale(code, TARGETS[code], sources, curated[code]);
}
