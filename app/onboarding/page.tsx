'use client';

/**
 * Setup — and, for a returning owner, the proof that setup happened.
 *
 * Two rules govern this screen, and both came from the same complaint: "it says
 * welcome back and then asks me for my own phone number".
 *
 *   1. **Nothing is rendered until the records are read.** The vault hydrates
 *      after mount and the account's copy arrives a beat later still, so a form
 *      that seeded its inputs on the first render seeded them from the empty
 *      default profile — blank fields, every single login, on a device that had
 *      every answer on it. The screen now waits, then mirrors the store until
 *      the owner types.
 *   2. **A remembered profile says so out loud.** The heading, the summary of
 *      what was remembered, and the line under the save button all name where
 *      the details live — this owner's account, or this device only — because
 *      "it worked this time" is not the same as "it will work on my phone".
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Banknote, Building2, Check, Cloud, HardDrive, Lock, QrCode, User } from 'lucide-react';
import { BrandWordmark } from '@/components/ui/BrandLogo';
import { LanguagePicker } from '@/components/ui/LanguagePicker';
import { AppearanceMenu } from '@/components/theme/appearance-menu';
import { useDukaanStore } from '@/lib/store';
import { businessTemplates } from '@/lib/models/business';
import { portalIcon } from '@/lib/portals/icons';
import { disabledModules, portalForTemplate, PORTALS } from '@/lib/portals/registry';
import { navSectionsFor } from '@/lib/portals/nav';
import { publishPortal } from '@/lib/portals/sync';
import { isValidGstin, snapshotFromProfile } from '@/lib/sync/profile';
import { isEmail } from '@/lib/security/validation';
import { saveStoredProfile } from '@/lib/sync/profile-sync';
import { currentSyncMode } from '@/lib/supabase/config';
import { buildUpiDeepLink, isValidIfsc, isValidUpiId, maskAccountNumber } from '@/lib/upi';
import { signOutAndLeave } from '@/lib/auth/client';
import { JoinBusiness } from '@/components/team/join-business';
import { OwnerDetailsStep } from '@/components/onboarding/owner-details-step';
import { BankDetailsStep } from '@/components/onboarding/bank-details-step';

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600';

const STEPS = [
  { id: 1, title: 'About you', icon: User },
  { id: 2, title: 'Your business', icon: Building2 },
  { id: 3, title: 'Payments (optional)', icon: QrCode },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { state, actions, hydrated } = useDukaanStore();
  const profile = state.profile;
  /*
   * One definition of "finished", and it is the server's.
   *
   * The loose check this replaced — a template and a business name — called an
   * owner set up while the collection QR was still missing, which is the one gap
   * that costs a shop money. `snapshotFromProfile` derives the answer from the
   * stored fields the same way `readStoredProfile` does for the account, so the
   * door on `/auth`, the redirect from the sign-in endpoint and this screen cannot
   * disagree about whether the steps are worth showing.
   */
  const alreadySetup = useMemo(() => snapshotFromProfile(profile).setupComplete, [profile]);
  /** Whether a save can outlive this device, or is this device's alone. */
  const accountBacked = currentSyncMode() === 'supabase';

  /**
   * What this screen is doing: reminding, or collecting.
   *
   * An owner who has finished setup used to land in the middle of a three-step
   * form with every field already filled in — their own name, their own phone
   * number, their own bank — and no obvious way out of it. The reminder comes
   * first now, and the form is one tap away for anybody who genuinely wants to
   * change something.
   */
  const [view, setView] = useState<'summary' | 'form'>('form');
  /**
   * Set the moment the owner asks for the form, so a profile arriving late from
   * the account cannot march them back out of it mid-edit.
   */
  const pinned = useRef(false);

  const [step, setStep] = useState(1);
  const [ownerName, setOwnerName] = useState(profile.ownerName ?? '');
  const [ownerPhone, setOwnerPhone] = useState(profile.ownerPhone ?? '');
  const [ownerEmail, setOwnerEmail] = useState(profile.ownerEmail ?? '');
  const [businessName, setBusinessName] = useState(profile.name === 'My Business' ? '' : profile.name);
  const [templateId, setTemplateId] = useState(profile.templateId);
  const [description, setDescription] = useState(profile.description);
  const [gstin, setGstin] = useState(profile.gstin ?? '');
  const [upiId, setUpiId] = useState(profile.upiId ?? profile.bank?.upiId ?? '');
  const [accountHolder, setAccountHolder] = useState(profile.bank?.accountHolder ?? '');
  const [bankName, setBankName] = useState(profile.bank?.bankName ?? '');
  const [accountNumber, setAccountNumber] = useState(profile.bank?.accountNumber ?? '');
  const [ifsc, setIfsc] = useState(profile.bank?.ifsc ?? '');
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  /**
   * Set on the save's own outcome, so the button can report where it landed.
   * A flag object rather than a `'account' | 'device'` string, because the
   * extractor reads a bare string literal as product copy — and a state value
   * is not a sentence anybody should be asked to translate.
   */
  const [savedTo, setSavedTo] = useState<{ account: boolean } | null>(null);

  /**
   * One flag for the whole form: has the owner started typing?
   *
   * A ref rather than state, because it only ever gates an effect — rendering
   * never depends on it, and putting it in state would re-run the very effect
   * that reads it.
   */
  const touched = useRef(false);
  const markTouched = () => {
    touched.current = true;
    setSavedTo(null);
  };

  /**
   * Mirror the store into the fields until the owner takes over.
   *
   * This is the fix for the blank form. The profile arrives in two stages —
   * from the encrypted vault when hydration completes, and from the account a
   * moment later if this device had forgotten it — and both land as a new
   * `profile` object. Seeding only in the `useState` initializers caught
   * neither: they ran once, on the first render, against the empty default.
   */
  useEffect(() => {
    if (!hydrated || touched.current) return;
    setOwnerName(profile.ownerName ?? '');
    setOwnerPhone(profile.ownerPhone ?? '');
    setOwnerEmail(profile.ownerEmail ?? '');
    setBusinessName(profile.name === 'My Business' ? '' : profile.name);
    setTemplateId(profile.templateId);
    setDescription(profile.description);
    setGstin(profile.gstin ?? '');
    setUpiId(profile.upiId ?? profile.bank?.upiId ?? '');
    setAccountHolder(profile.bank?.accountHolder ?? '');
    setBankName(profile.bank?.bankName ?? '');
    setAccountNumber(profile.bank?.accountNumber ?? '');
    setIfsc(profile.bank?.ifsc ?? '');
    // The view follows the records, never the other way round: until the vault
    // (and then the account) has answered, this screen does not know whether it
    // is collecting or reminding, and guessing shows a finished owner a form.
    if (!pinned.current) setView(snapshotFromProfile(profile).setupComplete ? 'summary' : 'form');
  }, [hydrated, profile]);

  const leave = () => void signOutAndLeave();

  const upiValid = upiId.trim() !== '' && isValidUpiId(upiId.trim());
  const deepLink = useMemo(
    () => (upiValid ? buildUpiDeepLink({ payeeVpa: upiId.trim(), payeeName: businessName.trim() || ownerName.trim() || 'My Business' }) : ''),
    [upiValid, upiId, businessName, ownerName],
  );

  /**
   * What the records already knew about this owner, for the "nothing to
   * re-enter" panel. Empty until hydration (and, on a device that had forgotten,
   * until the account answers), which is exactly when the panel should not show.
   */
  const remembered = useMemo(
    () =>
      [
        { label: 'Business name', value: profile.name !== 'My Business' ? profile.name : '' },
        { label: 'Business type', value: businessTemplates.find((template) => template.id === profile.templateId)?.name ?? '' },
        { label: 'GSTIN', value: profile.gstin ?? '' },
        { label: 'Your full name', value: profile.ownerName ?? '' },
        { label: 'Phone', value: profile.ownerPhone ?? '' },
        { label: 'Email', value: profile.ownerEmail ?? '' },
        { label: 'Collection UPI ID', value: profile.upiId ?? profile.bank?.upiId ?? '' },
      ].filter((item) => item.value !== ''),
    [profile],
  );

  /**
   * The whole of what is on file, for the screen an owner who has finished setup
   * actually gets.
   *
   * It goes further than `remembered` on purpose: the bank half is the part the
   * complaint was about ("I did the bank"), and a reminder that hides the account
   * number leaves the owner opening the steps to check it. The number is masked
   * by the same helper the QR panel uses, because this screen can be read over a
   * counter.
   */
  const summaryRows = useMemo(() => {
    const bank = profile.bank ?? {};
    const account = String(bank.accountNumber ?? '').replace(/\s/g, '');
    return [
      { label: 'Business name', value: profile.name !== 'My Business' ? profile.name : '' },
      { label: 'Business type', value: businessTemplates.find((template) => template.id === profile.templateId)?.name ?? '' },
      { label: 'Your full name', value: profile.ownerName ?? '' },
      { label: 'Phone', value: profile.ownerPhone ?? '' },
      { label: 'Email', value: profile.ownerEmail ?? '' },
      { label: 'Collection UPI ID', value: profile.upiId ?? bank.upiId ?? '' },
      { label: 'Account holder', value: bank.accountHolder ?? '' },
      { label: 'Bank name', value: bank.bankName ?? '' },
      { label: 'Account number', value: /^\d{6,20}$/.test(account) ? maskAccountNumber(account) : '' },
      { label: 'IFSC code', value: bank.ifsc ?? '' },
    ].filter((item) => item.value !== '');
  }, [profile]);

  /** The owner asked for the steps, so the steps are what they get — and keep. */
  const openReview = () => {
    pinned.current = true;
    setError(null);
    setStep(1);
    setView('form');
  };

  const next = () => {
    setError(null);
    if (step === 1) {
      if (!ownerName.trim()) return setError('Your name is required.');
      if (ownerPhone.replace(/\D/g, '').length < 10) return setError('Enter a valid 10-digit phone number.');
      if (ownerEmail.trim() && !isEmail(ownerEmail.trim())) return setError('Enter a valid email address.');
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!businessName.trim()) return setError('Business name is required.');
      if (!templateId) return setError('Pick the template closest to your business — you can change it anytime.');
      if (gstin.trim() && !isValidGstin(gstin)) return setError('Enter a valid 15-character GSTIN, or leave it blank if unregistered.');
      setStep(3);
    }
  };

  const finish = async () => {
    setError(null);
    if (!ownerName.trim()) { setStep(1); return setError('Your name is required.'); }
    if (ownerPhone.replace(/\D/g, '').length < 10) { setStep(1); return setError('Enter a valid 10-digit phone number.'); }
    if (ownerEmail.trim() && !isEmail(ownerEmail.trim())) { setStep(1); return setError('Enter a valid email address.'); }
    if (!businessName.trim()) { setStep(2); return setError('Business name is required.'); }
    if (!templateId) { setStep(2); return setError('Pick the template closest to your business — you can change it anytime.'); }
    if (gstin.trim() && !isValidGstin(gstin)) return setError('Enter a valid 15-character GSTIN, or leave it blank if unregistered.');
    if (upiId.trim() && !upiValid) return setError('Enter a valid UPI ID, or leave it blank and activate payments later.');
    if (ifsc.trim() && !isValidIfsc(ifsc.trim().toUpperCase())) return setError('That IFSC code does not look right (e.g. HDFC0001234).');
    if (accountNumber.trim() && !/^\d{6,20}$/.test(accountNumber.replace(/\s/g, ''))) return setError('Account numbers have 6–20 digits.');
    if (accountNumber.trim() && !ifsc.trim()) return setError('Enter a valid IFSC code (e.g. HDFC0001234).');

    pinned.current = true;
    setFinishing(true);
    const patch = {
      name: businessName,
      description,
      gstin: gstin.trim().toUpperCase(),
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
    };
    /*
     * A failed cloud write must NOT mark this owner as set up locally.
     * Otherwise the banner says "Welcome back", while the authoritative server
     * still routes /home back to /onboarding. Save remotely before updating the
     * local vault or switching the business template.
     */
    if (accountBacked) {
      const saved = await saveStoredProfile(
        snapshotFromProfile({ ...profile, ...patch, templateId, updatedAt: new Date().toISOString() }),
      );
      if (!saved.ok || saved.mode !== 'supabase') {
        setError(saved.error ?? 'Could not save your profile. Please retry.');
        setFinishing(false);
        return;
      }
    }

    const profileResult = actions.updateProfile(patch);
    if (!profileResult.ok) {
      setError(profileResult.error ?? 'Could not update this device. Your account details may already be saved.');
      setFinishing(false);
      return;
    }
    actions.applyTemplate(templateId);
    // Publish only after a successful account save; do not change console
    // navigation when the business setup has not reached the server.
    void publishPortal(templateId);

    setSavedTo({ account: accountBacked });
    setTimeout(() => router.push('/home'), accountBacked ? 1000 : 600);
  };

  /**
   * Reminding, or collecting? Only a finished profile is worth summarising, and
   * only until the owner asks for the steps — after that this screen is a form
   * again, whatever arrives from the account in the background.
   */
  const showSummary = alreadySetup && view === 'summary';

  /*
   * Before the records are read there is nothing honest to draw. A form here
   * would be a form seeded from the empty default profile — the bug this screen
   * exists to stop — so the owner sees the shape of the screen arriving instead,
   * for the few milliseconds it takes.
   */
  if (!hydrated) {
    return (
      <div className="setup-page relative flex min-h-screen items-center justify-center overflow-hidden p-6">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
        <div className="w-full max-w-3xl">
          <div className="mb-6 flex flex-col items-center">
            <BrandWordmark width={190} priority className="h-auto w-[190px]" />
            <div className="mt-4 h-6 w-64 animate-pulse rounded-full bg-stone-200" />
            <div className="mt-2 h-4 w-80 animate-pulse rounded-full bg-stone-100" />
          </div>
          <div className="h-72 animate-pulse rounded-3xl border border-stone-200 bg-stone-50 shadow-card" />
          <p className="mt-5 text-center text-xs text-stone-500">Reading your records from this device…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-page relative flex min-h-screen items-start justify-center overflow-hidden p-6 md:items-center">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 sm:right-6 sm:top-6"><AppearanceMenu /><LanguagePicker /></div>

      <div className="animate-fade-up relative w-full max-w-3xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandWordmark width={190} priority className="h-auto w-[190px]" />
          <h1 className="mt-2 font-display text-2xl font-bold text-stone-900">
            {alreadySetup ? 'Welcome back' : 'Set up your business in 3 steps'}
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-stone-600">
            {alreadySetup
              ? 'We remembered your details — change anything you need to, or go straight into the console.'
              : 'Tell us about your shop first. You can set up payment collection later.'}
          </p>
          {showSummary ? null : alreadySetup ? (
            <button
              type="button"
              onClick={() => router.push('/home')}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-sm transition hover:brightness-110"
            >
              Open console <ArrowRight size={15} />
            </button>
          ) : null}
        </div>

        {showSummary ? (
          /*
           * The screen a finished owner gets: what is on file, where it is held,
           * and two ways forward. No field to fill in, because there is nothing
           * left to fill in — and the steps are one tap away for anybody who does
           * want to change something.
           */
          <div className="rounded-3xl border border-stone-200 bg-stone-50 p-7 shadow-card">
            <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
              <Check size={12} /> Already on file — nothing to re-enter
            </p>
            <dl className="mt-5 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {summaryRows.map((item) => (
                <div
                  key={item.label}
                  className="flex items-baseline justify-between gap-3 border-b border-stone-200 pb-1.5"
                >
                  <dt className="text-[11px] font-semibold text-stone-600">{item.label}</dt>
                  <dd className="truncate text-xs font-bold text-stone-900">{item.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 flex items-start gap-1.5 text-[11px] leading-relaxed text-stone-600">
              {accountBacked ? <Cloud size={12} className="mt-0.5 shrink-0" /> : <HardDrive size={12} className="mt-0.5 shrink-0" />}
              {accountBacked
                ? 'Held against your DukaanOS account, so signing in on another phone or tablet brings all of it back.'
                : 'Held in this device’s encrypted vault. Connect Supabase credentials and it follows you to any device.'}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => router.push('/home')}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-gradient px-6 py-3 text-sm font-bold text-white shadow-glow-sm transition hover:brightness-110"
              >
                Open console <ArrowRight size={15} />
              </button>
              <button
                type="button"
                onClick={openReview}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                Review or change my details
              </button>
            </div>
          </div>
        ) : (
          <>
          {/* Stepper */}
          <div className="mb-6 grid grid-cols-3 gap-2">
            {STEPS.map((s) => {
              const active = step === s.id;
              const done = step > s.id;
              return (
                <button
                  key={s.id}
                  disabled={finishing || s.id > step}
                  onClick={() => { setError(null); setStep(s.id); }}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                    active ? 'bg-brand-500/15 text-brand-700 ring-1 ring-inset ring-brand-500/30 shadow-card'
                    : done ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/25'
                    : 'bg-stone-50 text-stone-600 ring-1 ring-inset ring-stone-200'
                  }`}
                >
                  {done ? <Check size={13} /> : <s.icon size={13} />} {s.title}
                </button>
              );
            })}
          </div>

          <div className="rounded-3xl border border-stone-200 bg-stone-50 p-7 shadow-card">
            {error ? (
              <div className="mb-5 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-500/20 animate-fade-in">{error}</div>
            ) : null}

            {step === 1 ? (
              <OwnerDetailsStep
                ownerName={ownerName} ownerPhone={ownerPhone} ownerEmail={ownerEmail}
                remembered={remembered} accountBacked={accountBacked}
                onOwnerNameChange={(value) => { markTouched(); setOwnerName(value); }}
                onOwnerPhoneChange={(value) => { markTouched(); setOwnerPhone(value); }}
                onOwnerEmailChange={(value) => { markTouched(); setOwnerEmail(value); }}
              />
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <div><span className={labelClass}>Business name</span><input className={inputClass} placeholder="Cult Fitness" value={businessName} onChange={(e) => { markTouched(); setBusinessName(e.target.value); }} /></div>
                <div><span className={labelClass}>GSTIN (only if GST registered)</span><input className={inputClass} maxLength={15} autoCapitalize="characters" placeholder="15-character GSTIN" value={gstin} onChange={(e) => { markTouched(); setGstin(e.target.value.toUpperCase()); }} /><p className="mt-1 text-xs text-stone-600">Optional. Your GSTIN will appear on printed invoices after you save.</p></div>
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
                          onClick={() => { markTouched(); setTemplateId(template.id); }}
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
                <div><span className={labelClass}>Describe your business (optional)</span><textarea className="min-h-[80px] w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus" placeholder="What you sell, who your customers are…" value={description} onChange={(e) => { markTouched(); setDescription(e.target.value); }} /></div>
              </div>
            ) : null}

            {step === 3 ? (
              <BankDetailsStep
                upiId={upiId} accountHolder={accountHolder} bankName={bankName}
                accountNumber={accountNumber} ifsc={ifsc} ownerName={ownerName}
                businessName={businessName} upiValid={upiValid} deepLink={deepLink}
                onUpiIdChange={(value) => { markTouched(); setUpiId(value); }}
                onAccountHolderChange={(value) => { markTouched(); setAccountHolder(value); }}
                onBankNameChange={(value) => { markTouched(); setBankName(value); }}
                onAccountNumberChange={(value) => { markTouched(); setAccountNumber(value); }}
                onIfscChange={(value) => { markTouched(); setIfsc(value); }}
              />
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
                <button onClick={() => { void finish(); }} disabled={finishing} className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow-sm transition hover:brightness-110 disabled:opacity-60">
                  {finishing ? <><Lock size={15} /> Saving…</> : <>{alreadySetup ? 'Save & open console' : 'Finish business setup'} <ArrowRight size={15} /></>}
                </button>
              )}
            </div>

            {savedTo ? (
              /*
               * Where the save actually landed, said out loud. "Saved" on its own
               * is the claim that was broken: the details were in memory, the
               * owner closed the tab, and the next login asked for everything
               * again. Naming the destination makes the difference visible.
               */
              <p className={`mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold animate-fade-in ${
                savedTo.account ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                {savedTo.account ? <Cloud size={13} /> : <HardDrive size={13} />}
                {savedTo.account
                  ? 'Saved to your account — sign in on any device and it will all be here.'
                  : accountBacked
                    ? 'Saved on this device. Your account could not be reached, so try a sync from Settings before you switch devices.'
                    : 'Saved on this device — this build has no account storage to put it in.'}
              </p>
            ) : null}
          </div>
          </>
        )}

        {/* A teammate who received an invite code must not be marched through
            creating a business they do not own — their door is the code. (The
            component hides itself when this deployment cannot redeem one.) */}
        {!alreadySetup ? (
          <div className="mt-4">
            <JoinBusiness compact />
          </div>
        ) : null}

        <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-stone-600">
          <Banknote size={13} className="text-emerald-500" /> No payment gateway · money lands straight in your bank · customer data stays on your device
        </p>
      </div>
    </div>
  );
}


