'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Banknote, Building2, Check, Copy, Download, Landmark, QrCode, Wallet, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { buildUpiDeepLink, isValidUpiId, maskAccountNumber, paymentReference, upiAccentColor } from '@/lib/upi';
import type { Customer } from '@/lib/store';
import { useI18n } from '@/lib/i18n';

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-none transition focus:border-portal/50 focus:ring-2 focus:ring-focus';

export function CustomerDetailModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { locale } = useI18n();
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  const upiId = customer.bank?.upiId;
  const hasUpi = isValidUpiId(upiId);
  const accent = upiAccentColor(upiId);
  const amountValue = Number(amount || 0);

  const deepLink = useMemo(() => {
    if (!hasUpi || !upiId) return '';
    return buildUpiDeepLink({
      payeeVpa: upiId,
      payeeName: customer.bank?.accountHolder || customer.name,
      amount: amountValue > 0 ? amountValue : undefined,
      note: amountValue > 0 ? `Payment to ${customer.name}` : undefined,
      transactionRef: paymentReference(customer.id),
    });
  }, [hasUpi, upiId, customer, amountValue]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handleKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const handleCopy = async () => {
    if (!deepLink) return;
    try {
      await navigator.clipboard.writeText(deepLink);
    } catch {
      const helper = document.createElement('textarea');
      helper.value = deepLink;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleDownload = () => {
    const canvas = qrWrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${customer.name.toLowerCase().replace(/\s+/g, '-')}-upi-qr.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-t-3xl border border-stone-200 bg-panel shadow-2xl animate-fade-up sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5" style={{ background: `linear-gradient(90deg, ${accent}, transparent 70%)` }} />
        <button onClick={onClose} className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition hover:bg-stone-200 hover:text-stone-900" aria-label="Close">
          <X size={17} />
        </button>

        <div className="grid gap-0 md:grid-cols-[1.05fr_0.95fr]">
          {/* Left: QR + payment request */}
          <div className="border-b border-stone-200 p-6 md:border-b-0 md:border-r">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: accent }}>
              <QrCode size={14} /> Customer payment QR
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold text-stone-900">{customer.name}</h2>
            <p className="mt-1 text-sm text-stone-600">Scan in any UPI app — money goes straight to their bank. No middleman.</p>

            {hasUpi ? (
              <>
                <div ref={qrWrapRef} className="mx-auto mt-6 w-fit rounded-2xl bg-white p-4" style={{ boxShadow: `0 0 60px -12px ${accent}66` }}>
                  <QRCodeCanvas value={deepLink} size={480} level="M" fgColor="#0B0D12" bgColor="#ffffff" style={{ width: 200, height: 200 }} />
                </div>
                <p className="mt-3 text-center text-xs font-semibold tracking-wide text-stone-600">{upiId}</p>

                <div className="mt-5">
                  <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-stone-600">Request an amount (optional)</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-stone-600">₹</span>
                    <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0 — payer chooses" className={`${inputClass} pl-8`} />
                  </div>
                  {amountValue > 0 ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><Banknote size={13} /> QR now requests {amountValue.toLocaleString(locale, { style: 'currency', currency: 'INR' })}</p>
                  ) : null}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  <button onClick={handleCopy} className="flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-semibold text-stone-800 transition hover:border-brand-400/40 hover:bg-stone-100">
                    {copied ? <Check size={15} className="text-emerald-700" /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy UPI link'}
                  </button>
                  <button onClick={handleDownload} className="flex items-center justify-center gap-2 rounded-xl bg-brand-gradient px-3 py-2.5 text-sm font-semibold text-white shadow-glow-sm transition hover:brightness-110">
                    <Download size={15} /> Download QR
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center">
                <Wallet size={26} className="mx-auto text-stone-600" />
                <p className="mt-3 text-sm font-semibold text-stone-700">No UPI ID on file</p>
                <p className="mt-1.5 text-xs leading-relaxed text-stone-600">Ask {customer.name.split(' ')[0]} for their UPI ID (like name@bank) and edit their profile — the unique QR appears instantly.</p>
              </div>
            )}
          </div>

          {/* Right: details */}
          <div className="p-6">
            <div className="space-y-5">
              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-600">Contact</h3>
                <div className="mt-3 space-y-2.5 text-sm">
                  <p className="flex justify-between gap-3"><span className="text-stone-600">Phone</span><span className="text-right font-medium text-stone-800">{customer.phone ?? '—'}</span></p>
                  <p className="flex justify-between gap-3"><span className="text-stone-600">Email</span><span className="text-right font-medium text-stone-800">{customer.email ?? '—'}</span></p>
                  {customer.details ? <p className="flex justify-between gap-3"><span className="text-stone-600">Details</span><span className="max-w-[60%] text-right font-medium text-stone-800">{customer.details}</span></p> : null}
                </div>
              </section>

              <section>
                <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-600"><Landmark size={13} /> Bank details</h3>
                <div className="mt-3 space-y-2.5 text-sm">
                  <p className="flex justify-between gap-3"><span className="text-stone-600">UPI ID</span><span className="text-right font-semibold" style={{ color: hasUpi ? accent : undefined }}>{upiId ?? '—'}</span></p>
                  <p className="flex justify-between gap-3"><span className="text-stone-600">Bank</span><span className="text-right font-medium text-stone-800">{customer.bank?.bankName ?? '—'}</span></p>
                  <p className="flex justify-between gap-3"><span className="text-stone-600">Account</span><span className="text-right font-medium text-stone-800 tabular-nums">{maskAccountNumber(customer.bank?.accountNumber) || '—'}</span></p>
                  <p className="flex justify-between gap-3"><span className="text-stone-600">IFSC</span><span className="text-right font-medium text-stone-800 tabular-nums">{customer.bank?.ifsc ?? '—'}</span></p>
                  <p className="flex justify-between gap-3"><span className="text-stone-600">Holder</span><span className="text-right font-medium text-stone-800">{customer.bank?.accountHolder ?? customer.name}</span></p>
                </div>
              </section>

              <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-stone-600"><Building2 size={15} /> Outstanding balance</span>
                  <Badge tone={customer.openingBalance > 0 ? 'amber' : 'emerald'} dot>
                    {customer.openingBalance > 0 ? `${customer.openingBalance.toLocaleString(locale, { style: 'currency', currency: 'INR' })} due` : 'Settled'}
                  </Badge>
                </div>
                {customer.openingBalance > 0 && hasUpi ? (
                  <button onClick={() => setAmount(String(customer.openingBalance))} className="mt-3 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/20">
                    Request the full due amount via QR
                  </button>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
