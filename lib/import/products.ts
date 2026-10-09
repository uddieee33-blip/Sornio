/**
 * Product import — bring a catalogue across from another app.
 *
 * The owner's old app exports a CSV; DukaanOS reads it on the device and
 * turns every row into a catalogue item, so the counter never has to see a
 * barcode scanned twice. Three rules keep the migration honest:
 *
 *   1. **Column names are guessed, not demanded.** `MRP`, `Selling Price`,
 *      `EAN` and `Qty` are what other apps actually print, so the header row
 *      is matched through an alias table — and DukaanOS's own export format
 *      round-trips, because its headers are aliases too.
 *   2. **Every row is validated like the single-item form.** The same rules
 *      the Add Item path enforces — name required, no negative prices, a
 *      check-digit-valid retail barcode — apply here, row by row, and the
 *      owner sees the verdict per row *before* anything is saved.
 *   3. **Nothing is written until the owner confirms.** Parsing produces a
 *      preview; only the confirmed rows reach the store, and a code that
 *      another item already carries is skipped, never overwritten.
 */

import { isInternalCode, isValidGtin, looksLikeCode } from '../scanning';
import { toCsv } from '../security/sanitize';
import { PRODUCT_CSV_HEADERS } from '../export/headers';
import type { Product } from '../business-data';
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, mapColumns, parseDelimited, parseNumberCell } from './csv';

export type ProductImportRow = {
  /** 1-based record number in the file (the header is record 0). */
  row: number;
  /** The name cell as it appeared — shown in the preview even when the row failed. */
  name: string;
  input: Omit<Product, 'id'>;
  status: 'ready' | 'duplicate' | 'error';
  note?: string;
};

export type ProductImportPreview =
  | {
      ok: true;
      rows: ProductImportRow[];
      ready: number;
      duplicates: number;
      errors: number;
      /** Headers the parser recognised, in the owner's spelling. */
      columns: string[];
    }
  | { ok: false; error: string };

/** Headers this importer understands, normalised (lowercase, alphanumerics only). */
const PRODUCT_ALIASES = {
  name: ['name', 'itemname', 'productname', 'product', 'item', 'title', 'itemtitle', 'producttitle'],
  category: ['category', 'categoryname', 'itemcategory', 'productcategory', 'group', 'groupname', 'department'],
  type: ['type', 'itemtype', 'kind', 'producttype'],
  sellingPrice: ['sellingprice', 'saleprice', 'salesprice', 'salesrate', 'sellingrate', 'retailprice', 'mrp', 'mrpprice', 'price', 'priceincltax', 'rate', 'unitprice', 'defaultprice'],
  cost: ['cost', 'costprice', 'purchaseprice', 'purchaserate', 'purchasecost', 'buyingprice', 'buyprice', 'wholesaleprice', 'wholesalerate', 'cp'],
  stock: ['stock', 'stockquantity', 'quantity', 'qty', 'openingstock', 'stockqty', 'instock', 'stockonhand', 'stockinhand', 'quantityinstock', 'unitsinstock', 'currentstock', 'availableqty', 'availablequantity'],
  reorderLevel: ['reorderlevel', 'reorderpoint', 'reorderqty', 'minstock', 'minimumstock', 'minstocklevel', 'minstocktomaintain', 'reorderthreshold'],
  status: ['status', 'itemstatus', 'productstatus', 'activestatus', 'state', 'availability'],
  sku: ['sku', 'skucode', 'itemcode', 'itemsku', 'productcode', 'productsku', 'internalcode', 'shopcode', 'storecode', 'code'],
  barcode: ['barcode', 'barcodenumber', 'barcodeno', 'barcodevalue', 'ean', 'eancode', 'ean13', 'ean8', 'upc', 'upca', 'upccode', 'gtin', 'gtin13', 'productbarcode', 'itembarcode', 'retailbarcode', 'eanbarcode'],
  unit: ['unit', 'unitname', 'unitofmeasure', 'uom', 'measure', 'unittype', 'sellingunit'],
  taxRate: ['tax', 'taxrate', 'taxpercent', 'taxpercentage', 'gst', 'gstrate', 'gstpercent', 'gstpercentage', 'vat', 'vatpercent', 'vatrate'],
  supplier: ['supplier', 'suppliername', 'vendor', 'vendorname', 'brand', 'brandname', 'manufacturer'],
  description: ['description', 'desc', 'itemdescription', 'productdescription', 'details', 'detail', 'notes', 'note', 'remarks'],
  looseMode: ['loosemode', 'soldloose', 'looseitem', 'loose'],
} as const;

type ProductField = keyof typeof PRODUCT_ALIASES;

const LOOSE_WEIGHT = 'weight' as const;
const LOOSE_PRICE = 'price' as const;
const LOOSE_NONE = 'none' as const;

const ACTIVE_WORDS = new Set(['active', 'enabled', 'yes', 'true', 'live', 'y', '1']);
const INACTIVE_WORDS = new Set(['inactive', 'archived', 'disabled', 'no', 'false', 'n', '0', 'discontinued', 'inactivearchived']);

/**
 * The columns the import template offers — a superset of the export format,
 * so a migration file can carry barcodes (the export omits them; the import
 * exists precisely to bring them across).
 */
export const PRODUCT_TEMPLATE_HEADERS = [
  ...PRODUCT_CSV_HEADERS,
  'Barcode',
  'SKU',
  'Unit',
  'Tax %',
  'Supplier',
  'Description',
] as const;

const PRODUCT_TEMPLATE_EXAMPLE = [
  'Handmade Soap',
  'Personal Care',
  'Product',
  '120',
  '80',
  '50',
  '10',
  'Active',
  '8901234567890',
  'SOAP-001',
  'pcs',
  '5',
  'Urban Goods Co.',
  'Cold-processed, 100 g',
] as const;

/** A CSV template the owner can fill in any spreadsheet app. */
export function buildProductsTemplateCsv(): string {
  return '\uFEFF' + toCsv([[...PRODUCT_TEMPLATE_HEADERS], [...PRODUCT_TEMPLATE_EXAMPLE]]);
}

type ExistingCode = Pick<Product, 'name' | 'barcode' | 'internalCode' | 'sku'>;

function cell(row: string[], index: number | undefined): string {
  if (index === undefined) return '';
  return (row[index] ?? '').trim();
}

function parseStatus(raw: string): Product['status'] {
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (INACTIVE_WORDS.has(key)) return 'Inactive';
  if (ACTIVE_WORDS.has(key)) return 'Active';
  return 'Active';
}

function parseType(raw: string): Product['itemType'] {
  return /serv/i.test(raw) ? 'service' : 'product';
}

function parseLooseMode(raw: string): typeof LOOSE_NONE | typeof LOOSE_WEIGHT | typeof LOOSE_PRICE {
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (key.startsWith('weight') || key === 'wt' || key === 'weighing') return LOOSE_WEIGHT;
  if (key.startsWith('price')) return LOOSE_PRICE;
  return LOOSE_NONE;
}

/**
 * Parse and validate a products CSV against the live catalogue.
 *
 * `existing` is only used to mark duplicates — the store re-validates again
 * at commit time, so this preview can never be the last line of defence.
 */
export function parseProductsCsv(text: string, existing: ExistingCode[]): ProductImportPreview {
  if (new TextEncoder().encode(text).length > IMPORT_MAX_BYTES) {
    return { ok: false, error: `The file is too large — the import limit is ${Math.round(IMPORT_MAX_BYTES / 1024 / 1024)} MB.` };
  }
  const parsed = parseDelimited(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { table } = parsed;
  const { fields, unmapped } = mapColumns(table.headers, PRODUCT_ALIASES);
  if (fields.name === undefined) {
    return { ok: false, error: 'The file needs a “Name” column — the first row should hold the column names.' };
  }

  const columns = (Object.keys(fields) as ProductField[])
    .map((field) => table.headers[fields[field]!])
    .filter(Boolean);

  // Barcode/internal code collisions use one namespace (the same rule as
  // the counter); SKUs are their own namespace because a shop can deliberately
  // use the same printable text in a barcode and an internal stock code.
  const claimedCodes = new Map<string, string>();
  const claimedSkus = new Map<string, string>();
  for (const product of existing) {
    for (const code of [product.barcode, product.internalCode]) {
      if (code) claimedCodes.set(code.trim().toUpperCase(), product.name);
    }
    if (product.sku) claimedSkus.set(product.sku.trim().toUpperCase(), product.name);
  }

  const rows: ProductImportRow[] = [];
  let ready = 0;
  let duplicates = 0;
  let errors = 0;

  table.rows.forEach((record, index) => {
    const rowNumber = index + 1;
    const name = cell(record, fields.name);

    // Required field, exactly as the Add Item form enforces it.
    if (!name) {
      errors += 1;
      rows.push({ row: rowNumber, name, input: emptyProductInput(), status: 'error', note: 'Item name is required.' });
      return;
    }

    // Numbers: empty means zero (a migration file may omit cost), garbage is an error.
    const numbers: Partial<Record<'sellingPrice' | 'cost' | 'stock' | 'reorderLevel' | 'taxRate', number | 'invalid'>> = {};
    for (const field of ['sellingPrice', 'cost', 'stock', 'reorderLevel', 'taxRate'] as const) {
      const raw = cell(record, fields[field]);
      if (raw === '') {
        numbers[field] = 0;
        continue;
      }
      const value = parseNumberCell(raw);
      if (value === null || value < 0) {
        errors += 1;
        rows.push({
          row: rowNumber,
          name,
          input: emptyProductInput(),
          status: 'error',
          note: invalidProductNumbers(),
        });
        return;
      }
      numbers[field] = value;
    }

    const itemType = parseType(cell(record, fields.type));

    // A code is validated before it is stored, exactly as the counter would
    // validate it — the same two checks the Add Item form runs.
    const rawCode = cell(record, fields.barcode);
    let barcode: string | undefined;
    let internalCode: string | undefined;
    if (rawCode) {
      if (!looksLikeCode(rawCode)) {
        errors += 1;
        rows.push({ row: rowNumber, name, input: emptyProductInput(), status: 'error', note: 'That barcode does not look right — it should be at least three printable characters.' });
        return;
      }
      const gtinShaped = [8, 12, 13, 14].includes(rawCode.length) && /^\d+$/.test(rawCode);
      if (gtinShaped && !isValidGtin(rawCode)) {
        errors += 1;
        rows.push({ row: rowNumber, name, input: emptyProductInput(), status: 'error', note: 'That retail barcode’s check digit does not match — scan the packet again, or type the digits printed under the bars.' });
        return;
      }
      if (isInternalCode(rawCode)) internalCode = rawCode.trim().toUpperCase();
      else barcode = rawCode;
    }

    // A code or SKU another item already carries is a duplicate, never an
    // overwrite. Check both first, then claim both only if the entire row is
    // accepted — a row rejected for its SKU must not reserve its barcode.
    const code = (barcode ?? internalCode ?? '').trim().toUpperCase();
    const sku = cell(record, fields.sku).toUpperCase();
    const codeClash = code ? claimedCodes.get(code) : undefined;
    const skuClash = sku ? claimedSkus.get(sku) : undefined;
    if (codeClash || skuClash) {
      duplicates += 1;
      const duplicateCode = codeClash ? code : sku;
      const duplicateName = codeClash ?? skuClash ?? '';
      rows.push({
        row: rowNumber,
        name,
        input: emptyProductInput(),
        status: 'duplicate',
        // Reuse the same localized message the scan station uses for a code
        // already attached to a product.
        note: `${duplicateName} already carries ${duplicateCode}. Two items can never share a code — clear it there first.`,
      });
      return;
    }
    if (code) claimedCodes.set(code, name);
    if (sku) claimedSkus.set(sku, name);

    const isProduct = itemType === 'product';
    const looseMode = isProduct ? parseLooseMode(cell(record, fields.looseMode)) : 'none';
    const input: Omit<Product, 'id'> = {
      name,
      category: cell(record, fields.category) || 'General',
      itemType,
      sellingPrice: numbers.sellingPrice as number,
      cost: numbers.cost as number,
      stock: isProduct ? (numbers.stock as number) : 0,
      reorderLevel: isProduct ? (numbers.reorderLevel as number) : 0,
      status: parseStatus(cell(record, fields.status)),
      supplier: cell(record, fields.supplier) || undefined,
      description: cell(record, fields.description) || undefined,
      taxRate: numbers.taxRate as number,
      sku: sku || undefined,
      unit: cell(record, fields.unit) || undefined,
      ...(barcode ? { barcode } : {}),
      ...(internalCode ? { internalCode } : {}),
      ...(isProduct && looseMode !== 'none' ? { looseMode } : {}),
    };
    ready += 1;
    rows.push({ row: rowNumber, name, input, status: 'ready' });
  });

  if (rows.length === 0) return { ok: false, error: 'No rows found in the file.' };
  if (rows.length > IMPORT_MAX_ROWS) {
    return { ok: false, error: `The file has too many rows — the import limit is ${IMPORT_MAX_ROWS}.` };
  }

  return { ok: true, rows, ready, duplicates, errors, columns: [...columns, ...unmapped] };
}

/** One actionable, localizable note for any malformed numeric cell. */
function invalidProductNumbers(): string {
  return 'One of the price, cost, stock, reorder or tax cells is not a valid number.';
}

/** A blank input, used for rows that fail before a full record exists. */
function emptyProductInput(): Omit<Product, 'id'> {
  return {
    name: '',
    category: 'General',
    itemType: 'product',
    sellingPrice: 0,
    cost: 0,
    stock: 0,
    reorderLevel: 0,
    status: 'Active',
  };
}
