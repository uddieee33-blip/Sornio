/**
 * Delimited-file parsing for bulk import.
 *
 * The migration path: an owner has been running another app for years, that
 * app can export a CSV, and nobody will re-scan a thousand barcodes by hand.
 * So DukaanOS reads the file **on the owner's own device** — the same rule as
 * export: nothing is uploaded anywhere.
 *
 * The parser is deliberately forgiving, because real-world exports are not
 * RFC-clean:
 *
 *   - a UTF-8 BOM (Excel writes one) is stripped;
 *   - the delimiter is sniffed per file (`,` `;` tab `|`), because European
 *     and Indian spreadsheets disagree on the list separator;
 *   - quoted cells, `""` escapes and newlines inside quotes are handled;
 *   - ragged rows are padded, and fully blank lines are skipped.
 *
 * It is deliberately strict about size: a file is capped before parsing, so a
 * mis-selected 400 MB log cannot freeze the counter's browser tab.
 */

export type DelimitedTable = {
  headers: string[];
  /** Data rows only — the header row is not included. */
  rows: string[][];
};

export type DelimitedResult = { ok: true; table: DelimitedTable } | { ok: false; error: string };

/** Hard caps, shared by the UI (before reading) and the parser (while reading). */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;

const BOM = '\uFEFF';

const CANDIDATE_DELIMITERS = [',', '\t', ';', '|'];

/** Lowercase and strip everything that is not a letter or digit. */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sniffDelimiter(sample: string): string {
  let best = ',';
  let bestCount = 0;
  for (const candidate of CANDIDATE_DELIMITERS) {
    let count = 0;
    let quoted = false;
    for (const char of sample) {
      if (char === '"') quoted = !quoted;
      else if (!quoted && char === candidate) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parse CSV/TSV text into a header row and data rows.
 *
 * Tolerant by design (see the file header); the one thing it refuses is a
 * file that yields no usable rows at all — the caller turns that into a
 * file-level error shown to the owner.
 */
export function parseDelimited(text: string): DelimitedResult {
  if (typeof text !== 'string') return { ok: false, error: 'The file could not be read.' };
  const withoutBom = text.startsWith(BOM) ? text.slice(1) : text;
  if (withoutBom.trim() === '') return { ok: false, error: 'The file is empty.' };

  const delimiter = sniffDelimiter(withoutBom.slice(0, 8192));

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let fieldWasQuoted = false;
  let inQuotes = false;

  const pushField = () => {
    row.push(fieldWasQuoted ? field : field.trim());
    field = '';
    fieldWasQuoted = false;
  };
  const pushRow = () => {
    pushField();
    // A line where every cell is empty carries no record — skip it.
    if (row.some((cell) => cell !== '')) rows.push(row);
    row = [];
  };

  for (let index = 0; index < withoutBom.length; index += 1) {
    const char = withoutBom[index];
    if (inQuotes) {
      if (char === '"') {
        if (withoutBom[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === '') {
      inQuotes = true;
      fieldWasQuoted = true;
      continue;
    }
    if (char === delimiter) {
      pushField();
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && withoutBom[index + 1] === '\n') index += 1;
      pushRow();
      continue;
    }
    field += char;
    if (rows.length > IMPORT_MAX_ROWS + 1) {
      return { ok: false, error: `The file has too many rows — the import limit is ${IMPORT_MAX_ROWS}.` };
    }
  }
  // A final line without a trailing newline still counts. Refuse an open
  // quote instead of silently merging the rest of the file into one cell.
  if (inQuotes) return { ok: false, error: 'The file could not be read.' };
  if (field !== '' || row.length > 0) pushRow();

  if (rows.length === 0) return { ok: false, error: 'No rows found in the file.' };
  if (rows.length - 1 > IMPORT_MAX_ROWS) {
    return { ok: false, error: `The file has too many rows — the import limit is ${IMPORT_MAX_ROWS}.` };
  }

  const headers = rows[0].map((header) => header.trim());
  if (headers.every((header) => header === '')) {
    return { ok: false, error: 'The first row of the file is empty — it should hold the column names.' };
  }
  const width = headers.length;
  const dataRows = rows.slice(1).map((cells) => {
    const padded = cells.slice(0, width);
    while (padded.length < width) padded.push('');
    return padded;
  });

  return { ok: true, table: { headers, rows: dataRows } };
}

/**
 * Parse a number the way a shopkeeper types it: `₹1,299`, `1299.00`,
 * `1 299` (French/Swiss grouping), `12%` all become numbers. Returns `null`
 * when the cell is empty or not a number at all.
 */
export function parseNumberCell(raw: string): number | null {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  const cleaned = text
    .replace(/₹/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/^(?:rs|inr)\.?/i, '')
    .replace(/%$/, '')
    .replace(/^\((.*)\)$/, '-$1');
  if (cleaned === '' || cleaned === '-') return null;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Map a delimited table onto named fields using an alias table. */
export function mapColumns<T extends string>(
  headers: string[],
  aliases: Record<T, readonly string[]>,
): { fields: Partial<Record<T, number>>; unmapped: string[] } {
  const fields: Partial<Record<T, number>> = {};
  const unmapped: string[] = [];
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (!key) return;
    const match = (Object.keys(aliases) as T[]).find((field) => aliases[field].includes(key));
    if (match && fields[match] === undefined) {
      fields[match] = index;
    } else if (!match) {
      unmapped.push(header);
    }
  });
  return { fields, unmapped };
}
