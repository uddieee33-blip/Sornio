#!/usr/bin/env node

/** Static completeness checks for the 22 generated Indian-language catalogues. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CODES = [
  'as', 'bn', 'brx', 'doi', 'gu', 'hi', 'kn', 'kok', 'ks', 'mai', 'ml',
  'mni', 'mr', 'ne', 'or', 'pa', 'sa', 'sat', 'sd', 'ta', 'te', 'ur',
];
const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', 'en.json'), 'utf8'));
const sourceKeys = Object.keys(source);
let failures = 0;

function slots(value) {
  return [...value.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1]).sort().join(',');
}

function fail(message) {
  failures += 1;
  console.error(`  fail  ${message}`);
}

for (const code of CODES) {
  const file = path.join(ROOT, 'public', 'locales', `${code}.json`);
  if (!fs.existsSync(file)) {
    fail(`${code}: locale file is missing`);
    continue;
  }

  let catalogue;
  try {
    catalogue = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${code}: invalid JSON (${error instanceof Error ? error.message : error})`);
    continue;
  }

  const keys = Object.keys(catalogue);
  if (keys.length !== sourceKeys.length) fail(`${code}: has ${keys.length}/${sourceKeys.length} phrases`);
  const missing = sourceKeys.filter((key) => !(key in catalogue));
  const extra = keys.filter((key) => !(key in source));
  if (missing.length) fail(`${code}: ${missing.length} source phrases are missing`);
  if (extra.length) fail(`${code}: ${extra.length} unknown phrases are present`);

  let unchanged = 0;
  let brokenSlots = 0;
  let brokenTokens = 0;
  for (const key of sourceKeys) {
    const value = catalogue[key];
    if (typeof value !== 'string' || !value.trim()) {
      fail(`${code}: empty value for “${key.slice(0, 70)}”`);
      continue;
    }
    if (value.toLocaleLowerCase() === key.toLocaleLowerCase()) unchanged += 1;
    if (slots(value) !== slots(key)) brokenSlots += 1;
    if (/__DUKAANOS_(?:ITEM|SLOT|TERM)_|ZXQJ[ST]\d+JQXZ/i.test(value)) brokenTokens += 1;
  }
  if (unchanged / sourceKeys.length > 0.45) fail(`${code}: ${unchanged} phrases still equal English`);
  if (brokenSlots) fail(`${code}: ${brokenSlots} dynamic phrases lost interpolation slots`);
  if (brokenTokens) fail(`${code}: ${brokenTokens} generator tokens leaked into copy`);

  if (!missing.length && !extra.length && !brokenSlots && !brokenTokens) {
    console.log(`  ok    ${code}: ${keys.length} complete phrases`);
  }
}

if (failures) {
  console.error(`\n${failures} localisation check(s) failed.`);
  process.exit(1);
}
console.log(`\n${CODES.length} locale catalogues cover all ${sourceKeys.length} UI phrases.`);
