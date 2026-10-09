/**
 * Canonical columns for DukaanOS's own CSV exports.
 *
 * Export and import templates share these headers so a file downloaded from
 * DukaanOS can be opened straight back in the matching importer. Import
 * templates may append fields the compact export intentionally omits (for
 * example, a barcode or SKU).
 */
export const PRODUCT_CSV_HEADERS = [
  'Name',
  'Category',
  'Type',
  'Selling price',
  'Cost price',
  'Stock',
  'Reorder level',
  'Status',
] as const;

export const CUSTOMER_CSV_HEADERS = ['Name', 'Phone', 'Email', 'Opening balance', 'Notes', 'Added'] as const;
