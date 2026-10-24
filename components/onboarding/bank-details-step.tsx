'use client';

import { useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { maskAccountNumber } from '@/lib/upi';

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600';

type BankDetailsStepProps = {
  upiId: string;
  accountHolder: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  ownerName: string;
  businessName: string;
  upiValid: boolean;
  deepLink: string;
  onUpiIdChange: (value: string) => void;
  onAccountHolderChange: (value: string) => void;
  onBankNameChange: (value: string) => void;
  onAccountNumberChange: (value: string) => void;
  onIfscChange: (value: string) => void;
};

/**
 * Collection details are optional. A syntactically valid UPI ID creates a QR
 * preview; a bank account number alone must never be used as a UPI destination.
 * The account field is masked by default even while editing on a shared tablet.
 */
export function BankDetailsStep({
  upiId, accountHolder, bankName, accountNumber, ifsc, ownerName, businessName, upiValid, deepLink,
  onUpiIdChange, onAccountHolderChange, onBankNameChange, onAccountNumberChange, onIfscChange,
}: BankDetailsStepProps) {
  const [showAccountNumber, setShowAccountNumber] = useState(false);

  return (
    <section aria-labelledby="bank-details-title" className="space-y-4">
      <h2 id="bank-details-title" className="font-display text-lg font-bold text-stone-900">Bank details</h2>
      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <div>
            <label htmlFor="setup-upi-id" className={labelClass}>UPI ID (optional — add later)</label>
            <input id="setup-upi-id" name="upiId" className={inputClass} type="text" autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={60}
              placeholder="businessname@okhdfcbank" value={upiId} onChange={(event) => onUpiIdChange(event.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="setup-bank-holder" className={labelClass}>Account holder</label>
              <input id="setup-bank-holder" name="accountHolder" className={inputClass} type="text" autoComplete="name" maxLength={120}
                placeholder={ownerName || 'Account holder name'} value={accountHolder} onChange={(event) => onAccountHolderChange(event.target.value)} />
            </div>
            <div>
              <label htmlFor="setup-bank-name" className={labelClass}>Bank name</label>
              <input id="setup-bank-name" name="bankName" className={inputClass} type="text" autoComplete="off" maxLength={80}
                placeholder="HDFC Bank" value={bankName} onChange={(event) => onBankNameChange(event.target.value)} />
            </div>
            <div>
              <label htmlFor="setup-bank-account" className={labelClass}>Account number</label>
              <div className="relative">
                <input id="setup-bank-account" name="accountNumber" className={inputClass + ' pr-20'} type={showAccountNumber ? 'text' : 'password'} inputMode="numeric" autoComplete="off" maxLength={24}
                  placeholder="XXXXXXXXXXXX" value={accountNumber} onChange={(event) => onAccountNumberChange(event.target.value)} />
                <button type="button" aria-controls="setup-bank-account" aria-pressed={showAccountNumber}
                  onClick={() => setShowAccountNumber((current) => !current)}
                  className="absolute inset-y-0 right-2 flex items-center gap-1 px-2 text-xs font-semibold text-stone-600 hover:text-stone-900">
                  {showAccountNumber ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                  {showAccountNumber ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="setup-bank-ifsc" className={labelClass}>IFSC code</label>
              <input id="setup-bank-ifsc" name="ifsc" className={inputClass} type="text" autoCapitalize="characters" autoComplete="off" maxLength={11}
                placeholder="HDFC0001234" value={ifsc} onChange={(event) => onIfscChange(event.target.value.toUpperCase())} />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-stone-600">Bank accounts are stored once, displayed masked (•••• last 4).</p>
          <div className="rounded-xl bg-emerald-500/[0.07] px-3.5 py-3 text-xs leading-relaxed text-emerald-700/90 ring-1 ring-inset ring-emerald-500/20">
            <ShieldCheck size={13} className="mr-1.5 inline" />
            Payment collection stays inactive until you add a valid UPI ID. When activated, money goes <strong>directly into your bank account</strong> — DukaanOS never touches your money.
            We will <strong>never</strong> ask for your UPI PIN, OTP, card PIN, or passwords.
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-2">
          {upiValid && deepLink ? (
            <>
              <div className="rounded-2xl bg-white p-3 shadow-card">
                <QRCodeCanvas value={deepLink} size={360} level="M" fgColor="#0B0D12" bgColor="#ffffff" style={{ width: 150, height: 150 }} />
              </div>
              <p className="max-w-[160px] text-center text-[11px] leading-snug text-stone-600">
                Your collection QR — customers scan it in any UPI app and pay <span className="text-stone-700">{businessName.trim() || 'your business'}</span> directly.
              </p>
              {accountNumber.trim() ? <p className="text-[11px] text-stone-600">A/c {maskAccountNumber(accountNumber)}</p> : null}
            </>
          ) : (
            <div className="flex h-[174px] w-[174px] items-center justify-center rounded-2xl border border-dashed border-stone-300 p-4 text-center text-xs leading-snug text-stone-600">
              Payments not connected yet. Add a UPI ID anytime to enable your QR code.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
