import { parseFixedDecimal } from '../../../packages/business-domain/src/fixed-decimal.ts';

export type CsvImportRow = {
  lineNumber: number;
  name: string;
  sku: string;
  unit: string;
  unitPricePaise: number;
  openingStockMilli: number;
};

export type CsvImportError = {
  lineNumber: number;
  message: string;
};

export type CsvImportParseResult = {
  rows: CsvImportRow[];
  errors: CsvImportError[];
};

const VALID_UNITS = new Set(['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'dozen', 'metre']);

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse shop catalog CSV with columns:
 *   name,sku,unit,price_rupees,opening_stock
 * Uses exact integer fixed-decimal parsing (never floating-point division or
 * multiplication) so paise and milli-units remain exact.
 */
export function parseProductCatalogCsv(text: string): CsvImportParseResult {
  const rows: CsvImportRow[] = [];
  const errors: CsvImportError[] = [];
  const rawLines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const seenSkus = new Set<string>();

  let headerProcessed = false;
  for (let idx = 0; idx < rawLines.length; idx += 1) {
    const lineNumber = idx + 1;
    const raw = rawLines[idx].trim();
    if (!raw) continue;
    const cols = splitCsvLine(raw);

    if (!headerProcessed && cols[0].toLowerCase() === 'name') {
      headerProcessed = true;
      continue;
    }
    headerProcessed = true;

    if (cols.length < 5) {
      errors.push({ lineNumber, message: 'Expected 5 columns: name, sku, unit, price_rupees, opening_stock.' });
      continue;
    }
    const [name, sku, rawUnit, rawPrice, rawStock] = cols;
    const unit = rawUnit.toLowerCase() || 'pcs';
    if (!name || name.length > 120) {
      errors.push({ lineNumber, message: 'Product name must be 1 to 120 characters.' });
      continue;
    }
    if (sku.length > 64) {
      errors.push({ lineNumber, message: 'SKU / barcode must be 64 characters or fewer.' });
      continue;
    }
    if (sku) {
      const normalized = sku.toLowerCase();
      if (seenSkus.has(normalized)) {
        errors.push({ lineNumber, message: `Duplicate SKU "${sku}" within this CSV file.` });
        continue;
      }
      seenSkus.add(normalized);
    }
    if (!VALID_UNITS.has(unit)) {
      errors.push({ lineNumber, message: `Unsupported unit "${rawUnit}". Use pcs, kg, g, litre, ml, box, pack, dozen, or metre.` });
      continue;
    }
    const unitPricePaise = parseFixedDecimal(rawPrice, 2);
    if (unitPricePaise === null || unitPricePaise <= 0) {
      errors.push({ lineNumber, message: `Invalid price "${rawPrice}". Enter a positive amount with up to 2 decimals.` });
      continue;
    }
    const openingStockMilli = parseFixedDecimal(rawStock, 3);
    if (openingStockMilli === null || openingStockMilli < 0) {
      errors.push({ lineNumber, message: `Invalid opening stock "${rawStock}". Enter zero or a positive quantity with up to 3 decimals.` });
      continue;
    }
    rows.push({ lineNumber, name, sku, unit, unitPricePaise, openingStockMilli });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ lineNumber: 1, message: 'Paste or load at least one product row (name,sku,unit,price_rupees,opening_stock).' });
  }

  return { rows, errors };
}
