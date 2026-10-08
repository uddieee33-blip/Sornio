'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Banknote, Building2, Check, Lock, QrCode, ShieldCheck, User } from 'lucide-react';
import { BrandWordmark } from '@/components/ui/BrandLogo';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { QRCodeCanvas } from 'qrcode.react';
import { useDukaanStore } from '@/lib/store';
import { businessTemplates } from '@/lib/models/business';
import { portalIcon } from '@/lib/portals/icons';
import { disabledModules, portalForTemplate, PORTALS } from '@/lib/portals/registry';
import { navSectionsFor } from '@/lib/portals/nav';
import { publishPortal } from '@/lib/portals/sync';
import { buildUpiDeepLink, isValidIfsc, isValidUpiId, maskAccountNumber } from '@/lib/upi';
import { signOutAndLeave } from '@/lib/auth/client';

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600';

const STEPS = [
  { id: 1, title: 'About you', icon: User },
  { id: 2, title: 'Your business', icon: Building2 },
  { id: 3, title: 'Bank & QR', icon: QrCode },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { state, actions } = useDukaanStore();
  const profile = state.profile;
  const alreadySetup = profile.templateId !== '' && profile.name !== 'My Business';

  const [step, setStep] = useState(1);
  const [ownerName, setOwnerName] = useState(profile.ownerName ?? '');
  const [ownerPhone, setOwnerPhone] = useState(profile.ownerPhone ?? '');
  const [ownerEmail, setOwnerEmail] = useState(profile.ownerEmail ?? '');
  const [businessName, setBusinessName] = useState(profile.name === 'My Business' ? '' : profile.name);
  const [templateId, setTemplateId] = useState(profile.templateId);
  const [description, setDescription] = useState(profile.description);
  const [upiId, setUpiId] = useState(profile.upiId ?? profile.bank?.upiId ?? '');
  const [accountHolder, setAccountHolder] = useState(profile.bank?.accountHolder ?? '');
  const [bankName, setBankName] = useState(profile.bank?.bankName ?? '');
  const [accountNumber, setAccountNumber] = useState(profile.bank?.accountNumber ?? '');
  const [ifsc, setIfsc] = useState(profile.bank?.ifsc ?? '');
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const leave = () => void signOutAndLeave();

  const upiValid = upiId.trim() !== '' && isValidUpiId(upiId.trim());
  const deepLink = useMemo(
    () => (upiValid ? buildUpiDeepLink({ payeeVpa: upiId.trim(), payeeName: businessName.trim() || ownerName.trim() || 'My Business' }) : ''),
    [upiValid, upiId, businessName, ownerName],
  );

  const next = () => {
    setError(null);
    if (step === 1) {
      if (!ownerName.trim()) return setError('Your name is required.');
      if (ownerPhone.replace(/\D/g, '').length < 10) return setError('Enter a valid 10-digit phone number.');
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!businessName.trim()) return setError('Business name is required.');
      if (!templateId) return setError('Pick the template closest to your business — you can change it anytime.');
      setStep(3);
    }
  };

  const finish = () => {
    setError(null);
    if (!upiValid) return setError('A valid UPI ID is required to generate your collection QR (e.g. businessname@okhdfcbank).');
    if (ifsc.trim() && !isValidIfsc(ifsc.trim().toUpperCase())) return setError('That IFSC code does not look right (e.g. HDFC0001234).');
    if (accountNumber.trim() && !/^\d{6,20}$/.test(accountNumber.replace(/\s/g, ''))) return setError('Account numbers have 6–20 digits.');

    setFinishing(true);
    const profileResult = actions.updateProfile({
      name: businessName,
      description,
      ownerName: ownerName.trim(),
      ownerPhone: ownerPhone.trim(),
      ownerEmail: ownerEmail.trim() || undefined,
      upiId: upiId.trim(),
      bank: {
        upiId: upiId.trim(),
        accountHolder: accountHolder.trim() || ownerName.trim(),
        bankName: bankName.trim() || undefined,
        accountNumber: accountNumber.replace(/\s/g, '') || undefined,
        ifsc: ifsc.trim().toUpperCase() || undefined,
      },
    });
    if (!profileResult.ok) {
      setError(profileResult.error ?? 'Could not save your profile.');
      setFinishing(false);
      return;
    }
    actions.applyTemplate(templateId);
    // Publish the choice before navigating: the console's first server render
    // then already paints the right navigation, with no flicker. If the call
    // fails the in-app gate still holds, and the provider retries on mount.
    void publishPortal(templateId);
    setTimeout(() => router.push('/home'), 600);
  };

  return (
    <div className="relative flex min-h-screen items-start justify-center overflow-hidden p-6 md:items-center">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6"><LanguagePicker /></div>

      <div className="animate-fade-up relative w-full max-w-3xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandWordmark width={190} priority className="h-auto w-[190px]" />
          <h1 className="mt-2 font-display text-2xl font-bold text-stone-900">
            {alreadySetup ? 'Review your business profile' : 'Set up your business in 3 steps'}
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-stone-600">
            {alreadySetup
              ? 'Everything below stays on your device — update anything, then jump into the console.'
              : 'Direct payments to your own bank, your customers’ data on your own device. No gateway, no middleman.'}
          </p>
        </div>

        {/* Stepper */}
        <div className="mb-6 grid grid-cols-3 gap-2">
          {STEPS.map((s) => {
            const active = step === s.id;
            const done = step > s.id;
            return (
              <button
                key={s.id}
                onClick={() => { setError(null); setStep(s.id); }}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                  active ? 'bg-brand-500/20 text-brand-200 ring-1 ring-inset ring-brand-400/40'
                  : done ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/25'
                  : 'bg-stone-50 text-stone-600 ring-1 ring-inset ring-stone-200'
                }`}
              >
                {done ? <Check size={13} /> : <s.icon size={13} />} {s.title}
              </button>
            );
          })}
        </div>

        <div className="rounded-3xl border border-stone-200 bg-stone-50 p-7 shadow-card backdrop-blur">
          {error ? (
            <div className="mb-5 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-500/20 animate-fade-in">{error}</div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div><span className={labelClass}>Your full name</span><input className={inputClass} placeholder="Rohit Kapoor" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} /></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><span className={labelClass}>Phone number</span><input className={inputClass} placeholder="+91 98xxx xxxxx" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} /></div>
                <div><span className={labelClass}>Email (optional)</span><input className={inputClass} placeholder="you@business.com" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} /></div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div><span className={labelClass}>Business name</span><input className={inputClass} placeholder="Cult Fitness" value={businessName} onChange={(e) => setBusinessName(e.target.value)} /></div>
              <div>
                <span className={labelClass}>What kind of business is it?</span>
                <p className="mb-3 text-xs leading-relaxed text-stone-600">
                  Pick honestly — this is not a label on a report. It decides which modules exist, what they are called, and what your first
                  screen asks you. You can change it later without losing a single record.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {businessTemplates.map((template) => {
                    const active = templateId === template.id;
                    const blueprint = portalForTemplate(template.id);
                    const TemplateIcon = portalIcon(blueprint.icon);
                    const leftOut = disabledModules(blueprint.id);
                    return (
                      <button
                        key={template.id}
                        onClick={() => setTemplateId(template.id)}
                        aria-pressed={active}
                        className={`rounded-2xl p-3.5 text-left ring-1 ring-inset transition ${
                          active ? 'bg-portal/[0.10] ring-portal/40' : 'bg-stone-50 ring-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm font-bold text-stone-900">
                            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? 'bg-portal-gradient text-white' : 'bg-stone-100 text-stone-600'}`}>
                              <TemplateIcon size={15} strokeWidth={2.2} />
                            </span>
                            {template.name}
                          </span>
                          {active ? <Check size={14} className="text-portal" /> : null}
                        </span>
                        <span className="mt-2 block text-xs leading-relaxed text-stone-600">{template.promise}</span>
                        <span className="mt-2 block text-[11px] leading-relaxed text-stone-500">{template.excluded}</span>
                        {leftOut.length > 0 ? (
                          <span className="mt-2 flex flex-wrap gap-1">
                            {leftOut.slice(0, 4).map((item) => (
                              <span key={item.module} className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-stone-500 ring-1 ring-inset ring-stone-200">
                                no {item.label.toLowerCase()}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {templateId ? (
                  <div className="mt-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Your console will open with these sections</p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {navSectionsFor(templateId).map((section) => (
                        <span key={section.title} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 ring-1 ring-inset ring-stone-200">
                          {section.title}
                          <span className="text-stone-400">· {section.links.length}</span>
                        </span>
                      ))}
                    </div>
                    <p className="mt-2.5 text-[11px] leading-relaxed text-stone-500">
                      {PORTALS.find((portal) => portal.templateId === templateId)?.tagline} — every screen inside uses your trade&apos;s words.
                    </p>
                  </div>
                ) : null}
              </div>
              <div><span className={labelClass}>Describe your business (optional)</span><textarea className="min-h-[80px] w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus" placeholder="What you sell, who your customers are…" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-6 md:grid-cols-[1fr_auto]">
              <div className="space-y-4">
                <div>
                  <span className={labelClass}>Your UPI ID — this powers your QR</span>
                  <input className={inputClass} placeholder="businessname@okhdfcbank" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><span className={labelClass}>Account holder</span><input className={inputClass} placeholder={ownerName || 'Account holder name'} value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} /></div>
                  <div><span className={labelClass}>Bank name</span><input className={inputClass} placeholder="HDFC Bank" value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
                  <div><span className={labelClass}>Account number</span><input className={inputClass} placeholder="XXXXXXXXXXXX" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></div>
                  <div><span className={labelClass}>IFSC code</span><input className={inputClass} placeholder="HDFC0001234" value={ifsc} onChange={(e) => setIfsc(e.target.value)} /></div>
                </div>
                <div className="rounded-xl bg-emerald-500/[0.07] px-3.5 py-3 text-xs leading-relaxed text-emerald-700/90 ring-1 ring-inset ring-emerald-500/20">
                  <ShieldCheck size={13} className="mr-1.5 inline" />
                  Payments go <strong>directly into your bank account</strong> — DukaanOS never touches your money.
                  We will <strong>never</strong> ask for your UPI PIN, OTP, card PIN, or passwords.
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-2">
                {upiValid ? (
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
                    Enter your UPI ID to see your QR code
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-7 flex items-center justify-between">
            {step > 1 ? (
              <button onClick={() => { setError(null); setStep(step - 1); }} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 transition hover:text-stone-900">
                <ArrowLeft size={15} /> Back
              </button>
            ) : (
              /* It says Sign out, so it has to mean it: the step back to `/auth` is
                 where an owner hands the device over, and a link that only changed
                 the URL would leave the session — and every record behind it — open
                 on the counter for whoever taps next. */
              <button
                type="button"
                onClick={leave}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-600 transition hover:text-stone-900"
              >
                <ArrowLeft size={15} /> Sign out
              </button>
            )}

            {step < 3 ? (
              <button onClick={next} className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-sm transition hover:brightness-110">
                Continue <ArrowRight size={15} />
              </button>
            ) : (
              <button onClick={finish} disabled={finishing} className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60">
                {finishing ? <><Lock size={15} /> Saving…</> : <>{alreadySetup ? 'Save & open console' : 'Finish setup'} <ArrowRight size={15} /></>}
              </button>
            )}
          </div>
        </div>

        <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-stone-600">
          <Banknote size={13} className="text-emerald-500" /> No payment gateway · money lands straight in your bank · customer data stays on your device
        </p>
      </div>
    </div>
  );
}
