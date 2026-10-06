#!/usr/bin/env node

/**
 * Generate static DukaanOS locale catalogues from locales/en.json.
 *
 * This is a maintainer tool, never runtime application code. It batches copy
 * through Google Translate's public web endpoint, validates every dynamic slot,
 * overlays the small set of human-reviewed phrases in curated.json, and writes
 * deterministic JSON files consumed from /public/locales by the app.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_FILE = path.join(ROOT, 'locales', 'en.json');
const CURATED_FILE = path.join(ROOT, 'locales', 'curated.json');
const OUTPUT_DIRECTORY = path.join(ROOT, 'public', 'locales');
const MAX_ENCODED_BATCH = 6_200;
const CONCURRENCY = Number(process.env.I18N_CONCURRENCY || 3);

const TARGETS = {
  as: 'as',
  bn: 'bn',
  brx: 'brx',
  doi: 'doi',
  gu: 'gu',
  hi: 'hi',
  kn: 'kn',
  kok: 'gom',
  ks: 'ks',
  mai: 'mai',
  ml: 'ml',
  mni: 'mni',
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

function marker(index) {
  return `__DUKAANOS_ITEM_${String(index).padStart(4, '0')}__`;
}

function protect(source) {
  let value = source.replace(/\{\{(\d+)\}\}/g, (_, index) => `__DUKAANOS_SLOT_${index}__`);
  const terms = [];

  for (const term of PROTECTED_TERMS) {
    if (!value.includes(term)) continue;
    const token = `__DUKAANOS_TERM_${terms.length}__`;
    value = value.replaceAll(term, token);
    terms.push(term);
  }

  return { value, terms };
}

function restore(translated, protectedPhrase) {
  let value = translated;
  protectedPhrase.terms.forEach((term, index) => {
    value = value.replace(new RegExp(`__DUKAANOS_TERM_${index}__`, 'gi'), term);
  });
  value = value.replace(/__DUKAANOS_SLOT_(\d+)__/gi, '{{$1}}');
  return value.replace(/\s+/g, ' ').trim();
}

function dynamicSlots(value) {
  return [...value.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1]).sort().join(',');
}

function translatedText(payload) {
  if (!Array.isArray(payload?.[0])) throw new Error('Unexpected translation response');
  return payload[0].map((segment) => segment?.[0] ?? '').join('');
}

async function requestTranslation(text, target, attempt = 0) {
  const query = new URLSearchParams({ client: 'gtx', sl: 'en', tl: target, dt: 't', q: text });
  const url = `https://translate.googleapis.com/translate_a/single?${query}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DukaanOS locale catalogue generator',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return translatedText(await response.json());
  } catch (error) {
    if (attempt >= 5) throw error;
    const delay = 600 * 2 ** attempt + Math.round(Math.random() * 300);
    await sleep(delay);
    return requestTranslation(text, target, attempt + 1);
  }
}

function makeBatches(entries) {
  const batches = [];
  let current = [];
  let encodedLength = 0;

  for (const entry of entries) {
    const addition = encodeURIComponent(`${marker(entry.index)}\n${entry.protected.value}\n`).length;
    if (current.length > 0 && encodedLength + addition > MAX_ENCODED_BATCH) {
      batches.push(current);
      current = [];
      encodedLength = 0;
    }
    current.push(entry);
    encodedLength += addition;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

function splitBatchResult(result, batch) {
  const markerPattern = /__DUKAANOS_ITEM_(\d{4})__/gi;
  const found = [...result.matchAll(markerPattern)];
  if (found.length !== batch.length) return null;

  const output = new Map();
  for (let index = 0; index < found.length; index += 1) {
    const start = (found[index].index ?? 0) + found[index][0].length;
    const end = found[index + 1]?.index ?? result.length;
    output.set(Number(found[index][1]), result.slice(start, end).trim());
  }
  return output;
}

async function translateBatch(batch, target) {
  const text = batch.map((entry) => `${marker(entry.index)}\n${entry.protected.value}`).join('\n');
  const result = await requestTranslation(text, target);
  const split = splitBatchResult(result, batch);
  if (split) return split;

  // A translation engine may occasionally alter a delimiter. Bisecting keeps
  // the run deterministic without throwing away all the successful batches.
  if (batch.length > 1) {
    const middle = Math.ceil(batch.length / 2);
    const [left, right] = await Promise.all([
      translateBatch(batch.slice(0, middle), target),
      translateBatch(batch.slice(middle), target),
    ]);
    return new Map([...left, ...right]);
  }

  const one = await requestTranslation(batch[0].protected.value, target);
  return new Map([[batch[0].index, one]]);
}

async function parallelMap(items, limit, operation) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await operation(items[index], index);
      await sleep(120);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function generateLocale(code, target, sources, curated) {
  const entries = sources.map((source, index) => ({ index, source, protected: protect(source) }));
  const batches = makeBatches(entries);
  let complete = 0;

  const translatedBatches = await parallelMap(batches, CONCURRENCY, async (batch) => {
    const result = await translateBatch(batch, target);
    complete += 1;
    if (complete % 10 === 0 || complete === batches.length) {
      console.log(`[${code}] ${complete}/${batches.length} batches`);
    }
    return result;
  });

  const raw = new Map(translatedBatches.flatMap((batch) => [...batch]));
  const catalogue = {};
  for (const entry of entries) {
    const translated = restore(raw.get(entry.index) ?? '', entry.protected);
    if (!translated) throw new Error(`[${code}] Empty translation for: ${entry.source}`);
    if (dynamicSlots(translated) !== dynamicSlots(entry.source)) {
      throw new Error(`[${code}] Dynamic slots changed for: ${entry.source}\nReceived: ${translated}`);
    }
    catalogue[entry.source] = curated?.[entry.source] ?? translated;
  }

  const changed = sources.filter((source) => catalogue[source].toLocaleLowerCase() !== source.toLocaleLowerCase()).length;
  if (changed / sources.length < 0.55) {
    throw new Error(`[${code}] Only ${changed}/${sources.length} phrases changed; refusing an incomplete locale.`);
  }

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
// Translate locales sequentially to avoid rate limiting. Phrases within each
// locale are still processed concurrently in small, validated batches.
for (const code of requested) {
  await generateLocale(code, TARGETS[code], sources, curated[code]);
}
