'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { QRCodeCanvas } from 'qrcode.react';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
  Check,
  Copy,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  Landmark,
  QrCode,
  ShieldCheck,
  Smartphone,
  User,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/business-data';
import type { Invoice, PaymentMethod } from '@/lib/models/billing';
import { buildUpiDeepLink, isValidUpiId, maskAccountNumber, paymentReference } from '@/lib/upi';
import { useDukaanStore } from '@/lib/store';
import { useI18n } from '@/lib/i18n';

const DESK_METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer'];

const METHOD_META: Record<PaymentMethod, { icon: typeof Banknote; hint: string; active: string }> = {
  Credit: {
    icon: Banknote,
    hint: 'Owed by the customer — collect later',
    active: 'border-amber-500/50 bg-amber-500/[0.10] shadow-glow-sm',
  },
  Cash: {
    icon: Banknote,
    hint: 'Count it, confirm it',
    active: 'border-emerald-500/50 bg-emerald-500/[0.10] shadow-glow-sm',
  },
  UPI: {
    icon: Smartphone,
    hint: 'Show the QR',
    active: 'border-brand-500/50 bg-brand-500/[0.10] shadow-glow-sm',
  },
  Card: {
    icon: CreditCard,
    hint: 'Note payer details',
    active: 'border-violet-500/50 bg-violet-500/[0.10] shadow-glow-sm',
  },
  'Bank Transfer': {
    icon: Landmark,
    hint: 'Share bank details',
    active: 'border-sky-500/50 bg-sky-500/[0.10] shadow-glow-sm',
  },
  Other: {
    icon: Banknote,
    hint: 'Manual entry',
    active: 'border-stone-400/50 bg-stone-500/[0.10] shadow-glow-sm',
  },
};

const inputClass =
  'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';
const labelClass = 'mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-stone-600';

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const helper = document.createElement('textarea');
    helper.value = value;
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void copyText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition active:scale-95 ${
        copied
          ? 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30'
          : 'bg-stone-100 text-stone-700 ring-stone-200 hover:bg-stone-200'
      }`}
      title={`Copy ${label}`}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function SetupNudge({ what }: { what: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/[0.07] p-5 text-center">
      <Building2 size={24} className="mx-auto text-amber-700" />
      <p className="mt-3 text-sm font-semibold text-stone-800">{what} isn&apos;t set up yet</p>
      <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-stone-600">
        Add it once in Business Setup — the desk will show it here automatically on every bill.
      </p>
      <Link
        href="/business"
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110 active:scale-[0.98]"
      >
        Open Business Setup <ArrowRight size={14} />
      </Link>
    </div>
  );
}

/**
 * The front-desk collection flow.
 *
 * The desk picks WHO is paying (the invoice) and HOW the money arrives (the
 * method) — and the panel below adapts: UPI shows the shop's QR, Card asks for
 * the payer's reconcilable details, Bank Transfer shares the shop's account,
 * Cash counts tendered vs change. Confirming settles the invoice through the
 * same ledger path as every other payment.
 */
export function CollectPaymentPanel({
  invoice,
  onDone,
}: {
  invoice: Invoice;
  onDone?: () => void;
}) {
  const { locale } = useI18n();
  const { state, actions } = useDukaanStore();
  const [method, setMethod] = useState<PaymentMethod>(
    DESK_METHODS.includes(invoice.paymentMethod) ? invoice.paymentMethod : 'UPI',
  );
  const [tendered, setTendered] = useState(String(invoice.totalAmount));
  const [card, setCard] = useState({ name: invoice.customerName, phone: invoice.customerPhone ?? '', network: 'RuPay', last4: '', reference: '' });
  const [upiRef, setUpiRef] = useState('');
  const [utr, setUtr] = useState('');
  const [showAccount, setShowAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  const profile = state.profile;
  const shopUpi = profile.upiId || profile.bank?.upiId;
  const upiReady = isValidUpiId(shopUpi);
  const bank = profile.bank;
  const bankReady = Boolean(bank?.accountNumber && bank?.ifsc && bank?.bankName);

  const due = invoice.totalAmount;

  const upiLink = useMemo(() => {
    if (!upiReady || !shopUpi) return '';
    return buildUpiDeepLink({
      payeeVpa: shopUpi,
      payeeName: bank?.accountHolder || profile.name,
      amount: due,
      note: `Invoice ${invoice.id}`,
      transactionRef: paymentReference(invoice.id),
    });
  }, [upiReady, shopUpi, bank?.accountHolder, profile.name, due, invoice.id]);

  const tenderedValue = Number(tendered || 0);
  const changeDue = tenderedValue - due;
  const quickTender = useMemo(() => {
    const steps = [100, 500, 1000, 2000];
    const next = steps.map((step) => Math.ceil(due / step) * step).filter((value) => value >= due);
    return Array.from(new Set([due, ...next])).slice(0, 4);
  }, [due]);

  const downloadQr = () => {
    const canvas = qrWrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${invoice.id.toLowerCase()}-upi-qr.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const confirm = () => {
    setError(null);
    setErrorCode(null);
    if (method === 'Cash') {
      if (!Number.isFinite(tenderedValue) || tenderedValue < due) {
        setError(`Cash in hand (₹${tenderedValue.toLocaleString(locale)}) is less than the ₹${due.toLocaleString(locale)} due.`);
        return;
      }
    }
    if (method === 'Card') {
      if (!/^\d{4}$/.test(card.last4.trim())) {
        setError('Enter the last 4 digits of the card — just enough to match the settlement, never the full number.');
        return;
      }
      if (card.reference.trim().length < 4) {
        setError('Enter the auth code / RRN from the PoS slip so this payment can be traced later.');
        return;
      }
    }
    if (method === 'Bank Transfer') {
      if (utr.trim().length < 6) {
        setError('Enter the UTR / transaction reference the customer shows you — that is your proof the transfer left their bank.');
        return;
      }
    }
    const result = actions.markInvoicePaid(invoice.id, method);
    if (result.ok) {
      setSettled(true);
    } else {
      setError(result.error ?? 'Could not settle this invoice.');
      setErrorCode(result.code ?? null);
    }
  };

  if (settled) {
    return (
      <div className="animate-collect-pop rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-8 text-center">
        <span className="animate-collect-success mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-glow">
          <BadgeCheck size={28} />
        </span>
        <h3 className="mt-4 font-display text-xl font-bold text-stone-900">Payment collected</h3>
        <p className="mt-1.5 text-sm text-stone-600">
          {formatCurrency(due)} from <strong className="text-stone-800">{invoice.customerName}</strong> via {method} — invoice{' '}
          {invoice.id} is settled and the ledger is updated.
        </p>
        <div className="mx-auto mt-5 grid max-w-xs gap-2 text-left">
          <div className="flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5 text-sm ring-1 ring-inset ring-stone-200">
            <span className="text-stone-600">Method</span>
            <span className="font-semibold text-stone-900">{method}</span>
          </div>
          {method === 'Card' && card.last4 ? (
            <div className="flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5 text-sm ring-1 ring-inset ring-stone-200">
              <span className="text-stone-600">Card</span>
              <span className="font-semibold text-stone-900 tabular-nums">{card.network} •••• {card.last4}</span>
            </div>
          ) : null}
          {method === 'Bank Transfer' && utr ? (
            <div className="flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5 text-sm ring-1 ring-inset ring-stone-200">
              <span className="text-stone-600">UTR ref</span>
              <span className="font-mono text-xs font-semibold text-stone-900">{utr.trim().toUpperCase()}</span>
            </div>
          ) : null}
          {method === 'Cash' && changeDue > 0 ? (
            <div className="flex items-center justify-between rounded-xl bg-white px-3.5 py-2.5 text-sm ring-1 ring-inset ring-stone-200">
              <span className="text-stone-600">Change given</span>
              <span className="font-semibold text-stone-900 tabular-nums">{formatCurrency(changeDue)}</span>
            </div>
          ) : null}
        </div>
        {onDone ? (
          <Button onClick={onDone} className="mt-6">
            Done <ArrowRight size={15} />
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {/* Who is paying */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white shadow-glow-sm">
            {invoice.customerName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-stone-900">{invoice.customerName}</p>
            <p className="truncate text-xs text-stone-600">
              {invoice.id} · {invoice.customerPhone ?? 'no phone'} · {invoice.items.length} item(s)
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-600">Amount due</p>
          <p className="font-display text-2xl font-bold text-stone-900 tabular-nums">{formatCurrency(due)}</p>
        </div>
      </div>

      {/* How the money arrives */}
      <p className="mb-2.5 mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-600">
        How is the money arriving?
      </p>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" role="tablist" aria-label="Payment method">
        {DESK_METHODS.map((option, index) => {
          const meta = METHOD_META[option];
          const Icon = meta.icon;
          const isActive = method === option;
          return (
            <button
              key={option}
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setMethod(option);
                setError(null);
                setErrorCode(null);
              }}
              style={{ animationDelay: `${index * 60}ms` }}
              className={`animate-collect-rise group rounded-2xl border p-3.5 text-left transition-all duration-200 active:scale-[0.97] ${
                isActive
                  ? meta.active
                  : 'border-stone-200 bg-white hover:-translate-y-0.5 hover:border-brand-400/30 hover:shadow-card-hover'
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                  isActive ? 'bg-brand-gradient text-white shadow-glow-sm' : 'bg-stone-100 text-stone-600 group-hover:bg-brand-500/10 group-hover:text-brand-600'
                }`}
              >
                <Icon size={17} />
              </span>
              <span className="mt-2.5 block text-sm font-bold text-stone-900">{option}</span>
              <span className="mt-0.5 block text-xs text-stone-600">{meta.hint}</span>
            </button>
          );
        })}
      </div>

      {/* The method-specific desk panel */}
      <div key={method} className="animate-collect-panel mt-4">
        {method === 'UPI' ? (
          <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.05] p-5">
            {upiReady ? (
              <div className="grid items-start gap-5 md:grid-cols-[auto_1fr]">
                <div className="mx-auto text-center md:mx-0">
                  <div ref={qrWrapRef} className="qr-pulse w-fit rounded-2xl bg-white p-3.5">
                    <QRCodeCanvas
                      value={upiLink}
                      size={440}
                      level="M"
                      fgColor="#0B0D12"
                      bgColor="#ffffff"
                      style={{ width: 168, height: 168 }}
                    />
                  </div>
                  <p className="mt-2.5 font-mono text-xs font-semibold text-stone-800">{shopUpi}</p>
                  <p className="mt-0.5 text-[11px] text-stone-600">Scan in GPay · PhonePe · Paytm · BHIM</p>
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-bold text-stone-900">
                    <QrCode size={16} className="text-brand-600" /> Show this QR to {invoice.customerName.split(' ')[0]}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
                    The QR already carries the exact amount ({formatCurrency(due)}) and the bill reference ({invoice.id}).
                    Money lands directly in your bank — DukaanOS never touches it.
                  </p>
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    <CopyButton value={shopUpi ?? ''} label="Copy UPI ID" />
                    <CopyButton value={upiLink} label="Copy UPI link" />
                    <button
                      onClick={downloadQr}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-700 active:scale-95"
                    >
                      <Download size={13} /> Save QR
                    </button>
                  </div>
                  <div className="mt-4">
                    <span className={labelClass}>UPI transaction ref (optional)</span>
                    <input
                      value={upiRef}
                      onChange={(e) => setUpiRef(e.target.value)}
                      placeholder="12-digit UPI ref from the customer's app"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <SetupNudge what="Your collection UPI ID" />
            )}
          </div>
        ) : null}

        {method === 'Card' ? (
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-stone-900">
              <User size={16} className="text-violet-600" /> Payer & card details
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
              Swipe or tap on your PoS machine first, then note just enough here to match the settlement later.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <span className={labelClass}>Payer name</span>
                <input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <span className={labelClass}>Payer phone</span>
                <input value={card.phone} onChange={(e) => setCard({ ...card, phone: e.target.value })} placeholder="+91 …" className={inputClass} />
              </div>
              <div>
                <span className={labelClass}>Card network</span>
                <select value={card.network} onChange={(e) => setCard({ ...card, network: e.target.value })} className={inputClass}>
                  {['RuPay', 'Visa', 'Mastercard', 'Amex', 'Other'].map((network) => (
                    <option key={network} value={network}>{network}</option>
                  ))}
                </select>
              </div>
              <div>
                <span className={labelClass}>Last 4 digits *</span>
                <input
                  value={card.last4}
                  onChange={(e) => setCard({ ...card, last4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  placeholder="••••  ••••  ••••  1234"
                  inputMode="numeric"
                  className={`${inputClass} font-mono tracking-[0.2em]`}
                />
              </div>
            </div>
            <div className="mt-3">
              <span className={labelClass}>Auth code / RRN from the PoS slip *</span>
              <input
                value={card.reference}
                onChange={(e) => setCard({ ...card, reference: e.target.value.toUpperCase() })}
                placeholder="e.g. 123456 or RRN 402118…"
                className={`${inputClass} font-mono`}
              />
            </div>
            <p className="mt-3.5 flex items-start gap-2 rounded-xl border border-violet-500/20 bg-white/70 p-3 text-xs leading-relaxed text-violet-900">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" />
              <span>Never type the full card number, expiry, or CVV here — cards settle through your PoS machine, and DukaanOS only keeps the traceable reference.</span>
            </p>
          </div>
        ) : null}

        {method === 'Bank Transfer' ? (
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.05] p-5">
            {bankReady ? (
              <>
                <p className="flex items-center gap-2 text-sm font-bold text-stone-900">
                  <Landmark size={16} className="text-sky-700" /> Share these account details
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
                  The customer transfers {formatCurrency(due)} with the note <strong>{invoice.id}</strong> — best for large bills. Confirm only after the UTR reference checks out.
                </p>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-xl bg-white p-3 ring-1 ring-inset ring-stone-200">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Account holder</p>
                    <p className="mt-1 truncate text-sm font-semibold text-stone-900">{bank?.accountHolder || profile.name}</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 ring-1 ring-inset ring-stone-200">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Bank</p>
                    <p className="mt-1 truncate text-sm font-semibold text-stone-900">{bank?.bankName}</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 ring-1 ring-inset ring-stone-200">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Account number</p>
                      <button
                        onClick={() => setShowAccount((current) => !current)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline"
                      >
                        {showAccount ? <EyeOff size={12} /> : <Eye size={12} />} {showAccount ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <p className="mt-1 font-mono text-sm font-semibold text-stone-900">
                      {showAccount ? bank?.accountNumber : maskAccountNumber(bank?.accountNumber)}
                    </p>
                    <div className="mt-2">
                      <CopyButton value={bank?.accountNumber ?? ''} label="Copy number" />
                    </div>
                  </div>
                  <div className="rounded-xl bg-white p-3 ring-1 ring-inset ring-stone-200">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">IFSC</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-stone-900">{bank?.ifsc}</p>
                    <div className="mt-2">
                      <CopyButton value={bank?.ifsc ?? ''} label="Copy IFSC" />
                    </div>
                  </div>
                </div>
                <div className="mt-3.5">
                  <span className={labelClass}>UTR / transaction reference *</span>
                  <input
                    value={utr}
                    onChange={(e) => setUtr(e.target.value.toUpperCase())}
                    placeholder="Paste the 12–22 character UTR the customer shows you"
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </>
            ) : (
              <SetupNudge what="Your bank account details" />
            )}
          </div>
        ) : null}

        {method === 'Cash' ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-stone-900">
              <Banknote size={16} className="text-emerald-700" /> Count the cash
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <span className={labelClass}>Cash received</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-stone-600">₹</span>
                  <input
                    type="number"
                    min={0}
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value)}
                    className={`${inputClass} pl-8 font-semibold tabular-nums`}
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {quickTender.map((value) => (
                    <button
                      key={value}
                      onClick={() => setTendered(String(value))}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition active:scale-95 ${
                        tenderedValue === value
                          ? 'bg-emerald-500/20 text-emerald-800 ring-emerald-500/40'
                          : 'bg-white text-stone-700 ring-stone-200 hover:ring-emerald-500/30'
                      }`}
                    >
                      {value === due ? 'Exact' : `₹${value.toLocaleString(locale)}`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col justify-center rounded-2xl bg-white p-4 ring-1 ring-inset ring-stone-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-600">Bill</span>
                  <span className="font-semibold text-stone-900 tabular-nums">{formatCurrency(due)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-stone-600">Received</span>
                  <span className="font-semibold text-stone-900 tabular-nums">{formatCurrency(Math.max(tenderedValue, 0))}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-dashed border-stone-200 pt-2">
                  <span className="text-sm font-semibold text-stone-800">Change to return</span>
                  <span className={`font-display text-xl font-bold tabular-nums ${changeDue >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatCurrency(Math.max(changeDue, 0))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="animate-collect-panel mt-4 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-500/20">
          <p>{error}</p>
          {errorCode === 'collection-limit' && method !== 'Cash' ? (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setMethod('Cash');
                  setTendered(String(invoice.totalAmount));
                  setError(null);
                  setErrorCode(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110 active:scale-95"
              >
                <Banknote size={13} /> Switch to Cash & collect now
              </button>
              <Link
                href="/subscription"
                className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-bold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-white"
              >
                Remove the limit <ArrowRight size={12} />
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Badge tone="slate" dot>
          {method === 'UPI' && 'No gateway fee · settles in minutes'}
          {method === 'Cash' && 'Zero fees · sweep excess to bank'}
          {method === 'Card' && 'Expect ~1–2% MDR · 1–2 day settlement'}
          {method === 'Bank Transfer' && 'NEFT / IMPS · keep the UTR'}
        </Badge>
        <Button onClick={confirm} className="min-w-52">
          <Check size={16} /> Confirm {formatCurrency(due)} received
        </Button>
      </div>
    </div>
  );
}

/** The same desk flow inside a modal — used from the billing screen. */
export function CollectPaymentModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 p-0 backdrop-blur-xs sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Collect payment for ${invoice.id}`}
    >
      <div
        className="animate-collect-pop relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-stone-200 bg-panel p-5 shadow-2xl sm:rounded-3xl md:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-brand-gradient" />
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition hover:bg-stone-200 hover:text-stone-900 active:scale-95"
        >
          <X size={17} />
        </button>
        <div className="mb-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">Desk collection</p>
          <h2 className="mt-1.5 font-display text-xl font-bold text-stone-900">Collect {formatCurrency(invoice.totalAmount)}</h2>
        </div>
        <CollectPaymentPanel invoice={invoice} onDone={onClose} />
      </div>
    </div>
  );
}
