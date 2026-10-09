/**
 * Customer import — bring the khata book across from another app.
 *
 * The same migration story as products, one screen over: names, phone
 * numbers, and — the part that actually matters to a shopkeeper — the
 * opening balance each customer owes. A phone number that already belongs
 * to a saved customer marks the row as a duplicate: importing must never
 * create a second record for the same person.
 *
 * Validation mirrors the Add Customer form: a name is required, a phone is
 * kept as typed (the shop's own dialling rules apply, not ours), and the
 * opening balance is a plain number — negative means the shop owes the
 * customer, which is a real thing in a neighbourhood store.
 */

import { toCsv } from '../security/sanitize';
import { CUSTOMER_CSV_HEADERS } from '../export/headers';
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, mapColumns, parseDelimited, parseNumberCell } from './csv';

export type CustomerImportInput = {
  name: string;
  phone?: string;
  email?: string;
  details?: string;
  openingBalance: number;
};

export type CustomerImportRow = {
  /** 1-based record number in the file (the header is record 0). */
  row: number;
  /** The name cell as it appeared — shown in the preview even when the row failed. */
  name: string;
  input: CustomerImportInput;
  status: 'ready' | 'duplicate' | 'error';
  note?: string;
};

export type CustomerImportPreview =
  | {
      ok: true;
      rows: CustomerImportRow[];
      ready: number;
      duplicates: number;
      errors: number;
      /** Headers the parser recognised, in the owner's spelling. */
      columns: string[];
    }
  | { ok: false; error: string };

/** Headers this importer understands, normalised (lowercase, alphanumerics only). */
const CUSTOMER_ALIASES = {
  name: ['name', 'customername', 'customer', 'client', 'clientname', 'party', 'partyname', 'contactname', 'person'],
  phone: ['phone', 'phonenumber', 'phoneno', 'phone1', 'mobilenumber', 'mobileno', 'mobile', 'cell', 'cellnumber', 'contact', 'contactnumber', 'whatsapp', 'whatsappnumber'],
  email: ['email', 'emailaddress', 'emailid', 'mail', 'mailid'],
  openingBalance: ['openingbalance', 'openingbalancevalue', 'balance', 'currentbalance', 'due', 'dues', 'amountdue', 'currentdue', 'outstanding', 'outstandingbalance', 'openingdue', 'balanceamount', 'receivable', 'receivables', 'khata', 'khataamount', 'udhaar', 'udhaaramount'],
  details: ['notes', 'note', 'details', 'detail', 'remarks', 'remark', 'address', 'comments'],
  // The export's own "Added" column is informational; it maps to nothing on import.
  added: ['added', 'addedon', 'createdat', 'dateadded', 'created'],
} as const;

export const CUSTOMER_TEMPLATE_HEADERS = CUSTOMER_CSV_HEADERS;

const CUSTOMER_TEMPLATE_EXAMPLE = ['Ramesh Kumar', '9876543210', 'ramesh@example.com', '450', 'Owes for last month’s groceries', '2026-01-15'] as const;

/** A CSV template the owner can fill in any spreadsheet app. */
export function buildCustomersTemplateCsv(): string {
  return '\uFEFF' + toCsv([[...CUSTOMER_TEMPLATE_HEADERS], [...CUSTOMER_TEMPLATE_EXAMPLE]]);
}

type ExistingCustomer = { name: string; phone?: string };

function cell(row: string[], index: number | undefined): string {
  if (index === undefined) return '';
  return (row[index] ?? '').trim();
}

/** Normalise a phone for comparison: digits only, so `98765 43210` matches `9876543210`. */
function phoneKey(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Parse and validate a customers CSV against the live customer list.
 *
 * `existing` is only used to mark duplicates — the store re-validates again
 * at commit time, so this preview can never be the last line of defence.
 */
export function parseCustomersCsv(text: string, existing: ExistingCustomer[]): CustomerImportPreview {
  if (new TextEncoder().encode(text).length > IMPORT_MAX_BYTES) {
    return { ok: false, error: `The file is too large — the import limit is ${Math.round(IMPORT_MAX_BYTES / 1024 / 1024)} MB.` };
  }
  const parsed = parseDelimited(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { table } = parsed;
  const { fields, unmapped } = mapColumns(table.headers, CUSTOMER_ALIASES);
  if (fields.name === undefined) {
    return { ok: false, error: 'The file needs a “Name” column — the first row should hold the column names.' };
  }

  const columns = (Object.keys(fields) as (keyof typeof CUSTOMER_ALIASES)[])
    .map((field) => (fields[field] !== undefined && field !== 'added' ? table.headers[fields[field]!] : undefined))
    .filter((header): header is string => Boolean(header));

  const claimedPhones = new Map<string, string>();
  for (const customer of existing) {
    const key = phoneKey(customer.phone ?? '');
    if (key) claimedPhones.set(key, customer.name);
  }

  const rows: CustomerImportRow[] = [];
  let ready = 0;
  let duplicates = 0;
  let errors = 0;

  table.rows.forEach((record, index) => {
    const rowNumber = index + 1;
    const name = cell(record, fields.name);

    if (!name) {
      errors += 1;
      rows.push({ row: rowNumber, name, input: { name: '', openingBalance: 0 }, status: 'error', note: 'Customer name is required.' });
      return;
    }

    const rawBalance = cell(record, fields.openingBalance);
    let openingBalance = 0;
    if (rawBalance !== '') {
      const value = parseNumberCell(rawBalance);
      if (value === null) {
        errors += 1;
        rows.push({ row: rowNumber, name, input: { name: '', openingBalance: 0 }, status: 'error', note: 'Opening balance is not a valid number.' });
        return;
      }
      openingBalance = value;
    }

    const phone = cell(record, fields.phone);
    const email = cell(record, fields.email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors += 1;
      rows.push({ row: rowNumber, name, input: { name: '', openingBalance: 0 }, status: 'error', note: 'Enter a valid email address.' });
      return;
    }

    // A phone another customer already carries is a duplicate, never a second record.
    const key = phoneKey(phone);
    if (key) {
      const clash = claimedPhones.get(key);
      if (clash) {
        duplicates += 1;
        rows.push({
          row: rowNumber,
          name,
          input: { name, phone: phone || undefined, email: email || undefined, openingBalance },
          status: 'duplicate',
          note: `Phone ${phone} already belongs to “${clash}” — this row will be skipped.`,
        });
        return;
      }
      claimedPhones.set(key, name);
    }

    ready += 1;
    rows.push({
      row: rowNumber,
      name,
      input: {
        name,
        phone: phone || undefined,
        email: email || undefined,
        details: cell(record, fields.details) || undefined,
        openingBalance,
      },
      status: 'ready',
    });
  });

  if (rows.length === 0) return { ok: false, error: 'No rows found in the file.' };
  if (rows.length > IMPORT_MAX_ROWS) {
    return { ok: false, error: `The file has too many rows — the import limit is ${IMPORT_MAX_ROWS}.` };
  }

  return { ok: true, rows, ready, duplicates, errors, columns: [...columns, ...unmapped] };
}
