/**
 * UPI direct-collection utilities.
 *
 * DukaanOS never touches the money: every customer gets a unique QR code
 * built from THEIR OWN UPI ID (Virtual Payment Address). Scanning the QR in
 * any UPI app (GPay, PhonePe, Paytm, BHIM…) opens a payment addressed
 * directly to the customer's bank account — the store is not a middleman.
 *
 * QR payload follows the NPCI UPI deep-link spec:
 *   upi://pay?pa=<vpa>&pn=<payee name>&am=<amount>&tn=<note>&tr=<ref>&cu=INR
 */

export type BankDetails = {
  /** UPI Virtual Payment Address, e.g. name@okhdfcbank */
  upiId?: string;
  /** Bank display name, e.g. HDFC Bank */
  bankName?: string;
  /** Account number (stored locally, masked in the UI) */
  accountNumber?: string;
  /** IFSC code, e.g. HDFC0001234 */
  ifsc?: string;
  /** Account holder name if different from customer name */
  accountHolder?: string;
};

export type UpiRequest = {
  /** Payee VPA — required for a valid QR */
  payeeVpa: string;
  /** Payee display name shown in the payer's UPI app */
  payeeName: string;
  /** Optional amount in INR. Omit to let the payer choose. */
  amount?: number;
  /** Optional note / bill reference shown to the payer */
  note?: string;
  /** Optional merchant transaction reference */
  transactionRef?: string;
};

/** Rough NPCI VPA shape: handle@psp (handle 2-256 chars of [a-z0-9._-]). */
const UPI_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

/** IFSC: 4 letters, a zero, then 6 alphanumerics — e.g. HDFC0001234. */
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function isValidUpiId(value: string | undefined): boolean {
  return typeof value === 'string' && UPI_ID_REGEX.test(value.trim());
}

export function isValidIfsc(value: string | undefined): boolean {
  return typeof value === 'string' && IFSC_REGEX.test(value.trim().toUpperCase());
}

export function normalizeUpiId(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Mask an account number for display: keep last 4 digits. */
export function maskAccountNumber(accountNumber: string | undefined): string {
  const digits = (accountNumber ?? '').replace(/\D/g, '');
  if (digits.length <= 4) return accountNumber ?? '';
  return `•••• ${digits.slice(-4)}`;
}

/**
 * Build the UPI deep link that a QR code encodes. Any NPCI-compliant UPI app
 * can resolve this into a payment addressed straight to the payee's bank.
 */
export function buildUpiDeepLink(request: UpiRequest): string {
  const params = new URLSearchParams();
  params.set('pa', normalizeUpiId(request.payeeVpa));
  params.set('pn', request.payeeName.slice(0, 99));
  if (typeof request.amount === 'number' && request.amount > 0) {
    // UPI spec: amounts with up to 2 decimals, no thousands separators.
    params.set('am', request.amount.toFixed(2));
  }
  if (request.note) params.set('tn', request.note.slice(0, 80));
  if (request.transactionRef) params.set('tr', request.transactionRef.slice(0, 35));
  params.set('cu', 'INR');
  return `upi://pay?${params.toString()}`;
}

/**
 * A human-readable unique reference for a payment request,
 * derived from the customer id + current time.
 */
export function paymentReference(customerId: string): string {
  const stamp = Date.now().toString(36).toUpperCase();
  return `${customerId.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}-${stamp}`.slice(0, 30);
}

/**
 * Derive the deterministic accent color for a customer's QR card from their
 * UPI ID — same input always renders the same brand color.
 */
export function upiAccentColor(upiId: string | undefined): string {
  const source = normalizeUpiId(upiId) || 'dukaanos';
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  const palette = ['#818cf8', '#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c'];
  return palette[hash % palette.length];
}
