'use client';

import { Check, Cloud, HardDrive } from 'lucide-react';

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600';

type OwnerDetailsStepProps = {
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  remembered: ReadonlyArray<{ label: string; value: string }>;
  accountBacked: boolean;
  onOwnerNameChange: (value: string) => void;
  onOwnerPhoneChange: (value: string) => void;
  onOwnerEmailChange: (value: string) => void;
};

/** The first, independently maintained screen in the owner signup journey. */
export function OwnerDetailsStep({
  ownerName, ownerPhone, ownerEmail, remembered, accountBacked,
  onOwnerNameChange, onOwnerPhoneChange, onOwnerEmailChange,
}: OwnerDetailsStepProps) {
  return (
    <section aria-labelledby="owner-details-title" className="space-y-5">
      <h2 id="owner-details-title" className="font-display text-lg font-bold text-stone-900">About you</h2>
      <div>
        <label htmlFor="setup-owner-name" className={labelClass}>Your full name</label>
        <input id="setup-owner-name" name="ownerName" className={inputClass} type="text" autoComplete="name" maxLength={120} required
          placeholder="Rohit Kapoor" value={ownerName} onChange={(event) => onOwnerNameChange(event.target.value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="setup-owner-phone" className={labelClass}>Phone number</label>
          <input id="setup-owner-phone" name="ownerPhone" className={inputClass} type="tel" inputMode="tel" autoComplete="tel" maxLength={32} required
            placeholder="+91 98xxx xxxxx" value={ownerPhone} onChange={(event) => onOwnerPhoneChange(event.target.value)} />
        </div>
        <div>
          <label htmlFor="setup-owner-email" className={labelClass}>Email (optional)</label>
          <input id="setup-owner-email" name="ownerEmail" className={inputClass} type="email" autoComplete="email" maxLength={254}
            placeholder="you@business.com" value={ownerEmail} onChange={(event) => onOwnerEmailChange(event.target.value)} />
        </div>
      </div>
      {remembered.length > 0 ? (
        <div className="rounded-2xl bg-emerald-500/[0.07] px-4 py-3.5 ring-1 ring-inset ring-emerald-500/20">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
            <Check size={12} /> Already on file — nothing to re-enter
          </p>
          <dl className="mt-2.5 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {remembered.map((item) => (
              <div key={item.label} className="flex items-baseline justify-between gap-3 border-b border-emerald-500/10 pb-1">
                <dt className="text-[11px] font-semibold text-stone-600">{item.label}</dt>
                <dd className="truncate text-xs font-bold text-stone-900">{item.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-stone-600">
            {accountBacked ? <Cloud size={12} className="mt-0.5 shrink-0" /> : <HardDrive size={12} className="mt-0.5 shrink-0" />}
            {accountBacked
              ? 'Held against your Sornio account, so signing in on another phone or tablet brings all of it back.'
              : 'Held in this device’s encrypted vault. Connect Supabase credentials and it follows you to any device.'}
          </p>
        </div>
      ) : null}
    </section>
  );
}
