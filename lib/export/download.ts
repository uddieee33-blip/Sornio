'use client';

/**
 * Data export.
 *
 * An owner's records are theirs, so getting them out must be one click and
 * must be safe. Two rules are enforced here:
 *
 *  1. **Every cell is sanitised** through `csvCell`, so a customer named
 *     `=HYPERLINK(...)` cannot become a live formula in the accountant's
 *     spreadsheet.
 *  2. **Nothing is uploaded.** The file is built in the browser from the local
 *     ledger and handed straight to the download API.
 *
 * A UTF-8 BOM is prepended so Excel renders ₹ and Hindi text correctly instead
 * of mojibake.
 */

import { customerBalance } from '@/lib/accounting';
import { toCsv } from '@/lib/security/sanitize';
import { redact } from '@/lib/security/redact';
import { CUSTOMER_CSV_HEADERS, PRODUCT_CSV_HEADERS } from './headers';
import type { StoreState } from '@/lib/store';

export type ExportKind = 'transactions' | 'customers' | 'products' | 'expenses' | 'everything';

export const EXPORT_LABELS: Record<ExportKind, string> = {
  transactions: 'Ledger (CSV)',
  customers: 'Customers (CSV)',
  products: 'Products (CSV)',
  expenses: 'Expenses (CSV)',
  everything: 'Everything (JSON backup)',
};

export type ExportResult = { ok: true; rows: number; filename: string } | { ok: false; error: string };

const BOM = '\uFEFF';

/** Timestamped, filesystem-safe filename. */
function filenameFor(kind: ExportKind, businessName: string, extension: string): string {
  const slug = (businessName || 'sornio')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug}-${kind}-${stamp}.${extension}`;
}

/** Hand a generated string to the browser's download machinery. */
export function downloadText(filename: string, content: string, mime: string): ExportResult {
  try {
    if (typeof document === 'undefined')
      return {
        ok: false,
        error: 'Downloads are only available in the browser.',
      };
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // Give the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true, rows: 0, filename };
  } catch {
    return { ok: false, error: 'The download could not be created.' };
  }
}

function csv(rows: (string | number | null | undefined)[][]): string {
  return BOM + toCsv(rows);
}

export function buildTransactionsCsv(state: StoreState): string {
  const rows: (string | number | null | undefined)[][] = [
    [
      'Date',
      'Type',
      'Description',
      'Direction',
      'Account',
      'Payment method',
      'Amount',
      'Reference',
      'Customer ID',
      'Invoice',
      'Payment reference',
    ],
  ];
  for (const entry of state.transactions) {
    rows.push([
      entry.date,
      entry.type,
      entry.description,
      entry.direction === 'in' ? 'Money in' : 'Money out',
      entry.account,
      entry.paymentMethod ?? '',
      entry.amount,
      entry.id,
      entry.customerId ?? '',
      entry.invoiceId ?? '',
      entry.paymentReference ?? '',
    ]);
  }
  rows.push([]);
  rows.push(['Exported', new Date().toISOString(), 'Records', state.transactions.length]);
  return csv(rows);
}

export function buildExpensesCsv(state: StoreState): string {
  const rows: (string | number | null | undefined)[][] = [
    ['Date', 'Description', 'Payment method', 'Amount', 'Reference', 'Customer ID', 'Invoice', 'Payment reference'],
  ];
  for (const entry of state.transactions.filter((item) => item.type === 'expense')) {
    rows.push([entry.date, entry.description, entry.paymentMethod ?? '', entry.amount, entry.id]);
  }
  return csv(rows);
}

export function buildProductsCsv(state: StoreState): string {
  const rows: (string | number | null | undefined)[][] = [[...PRODUCT_CSV_HEADERS]];
  for (const product of state.products) {
    rows.push([
      product.name,
      product.category,
      product.itemType === 'service' ? 'Service' : 'Product',
      product.sellingPrice,
      product.cost,
      product.itemType === 'service' ? '' : product.stock,
      product.reorderLevel,
      product.status,
    ]);
  }
  return csv(rows);
}

export function buildCustomersCsv(state: StoreState): string {
  const rows: (string | number | null | undefined)[][] = [[...CUSTOMER_CSV_HEADERS, 'Outstanding balance']];
  for (const customer of state.customers) {
    rows.push([
      customer.name,
      customer.phone ?? '',
      customer.email ?? '',
      customer.openingBalance,
      customer.details ?? '',
      customer.createdAt.slice(0, 10),
      customerBalance(customer, state.transactions),
    ]);
  }
  return csv(rows);
}

export function buildBackupJson(state: StoreState): string {
  return JSON.stringify(
    {
      product: 'DukaanOS',
      kind: 'business-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      warning: 'This file contains your business records in plain text. Store it somewhere private.',
      data: state,
    },
    null,
    2,
  );
}

/** Run an export end to end, reporting a count the UI can confirm. */
export function runExport(state: StoreState, kind: ExportKind): ExportResult {
  const businessName = state.profile.name ?? 'sornio';
  try {
    switch (kind) {
      case 'transactions': {
        const result = downloadText(filenameFor(kind, businessName, 'csv'), buildTransactionsCsv(state), 'text/csv');
        return result.ok
          ? {
              ok: true,
              rows: state.transactions.length,
              filename: result.filename,
            }
          : result;
      }
      case 'expenses': {
        const count = state.transactions.filter((entry) => entry.type === 'expense').length;
        const result = downloadText(filenameFor(kind, businessName, 'csv'), buildExpensesCsv(state), 'text/csv');
        return result.ok ? { ok: true, rows: count, filename: result.filename } : result;
      }
      case 'products': {
        const result = downloadText(filenameFor(kind, businessName, 'csv'), buildProductsCsv(state), 'text/csv');
        return result.ok ? { ok: true, rows: state.products.length, filename: result.filename } : result;
      }
      case 'customers': {
        const result = downloadText(filenameFor(kind, businessName, 'csv'), buildCustomersCsv(state), 'text/csv');
        return result.ok
          ? {
              ok: true,
              rows: state.customers.length,
              filename: result.filename,
            }
          : result;
      }
      case 'everything': {
        const result = downloadText(
          filenameFor(kind, businessName, 'json'),
          buildBackupJson(state),
          'application/json',
        );
        return result.ok
          ? {
              ok: true,
              rows: state.transactions.length + state.customers.length,
              filename: result.filename,
            }
          : result;
      }
      default:
        return { ok: false, error: 'Unknown export type.' };
    }
  } catch {
    // Never surface an internal message to the owner — log a redacted version.
    return {
      ok: false,
      error: `Export failed for ${redact(kind)}. Please try again.`,
    };
  }
}
