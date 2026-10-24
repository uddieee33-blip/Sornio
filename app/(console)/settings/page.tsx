'use client';

import { BackupRecovery } from '@/components/settings/backup-recovery';

import { useLocaleRefresh } from '@/lib/i18n';

import { getActiveFormattingLocale } from '@/lib/locale';

import { useState } from 'react';
import { Check, ChevronDown, Cloud, CloudOff, Database, History, KeyRound, Lock, RefreshCw, RotateCcw, Save, ServerCog, ShieldCheck, SlidersHorizontal, ToggleLeft, TriangleAlert, UserRound,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { useDukaanStore } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';
import { CaptureReadinessCard } from '@/components/scanning/capture-readiness';
import { EverythingSwitch } from '@/components/portals/everything-switch';
import { EnvSetup } from '@/components/settings/env-setup';
import { OwnerPinModal, ROLE_META, useOwnerGate } from '@/components/settings/owner-gate';
import { useCounterLock } from '@/components/security/counter-lock';
import { disabledModules } from '@/lib/portals/registry';
import { PORTAL_ICONS } from '@/lib/portals/icons';
import type { StaffRole } from '@/lib/models/business';

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';

const auditTones: Record<string, BadgeTone> = {
  sale: 'emerald', expense: 'red', product: 'brand', customer: 'sky', membership: 'violet', invoice: 'amber', marketing: 'violet', settings: 'slate', system: 'slate',
};

const ROLE_RANK: Record<StaffRole, number> = { desk: 0, manager: 1, owner: 2 };
const ROLE_TONE: Record<StaffRole, BadgeTone> = { owner: 'brand', manager: 'sky', desk: 'slate',
};

function formatAuditDate(iso: string) {
  return new Date(iso).toLocaleString(getActiveFormattingLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

type ToggleKey =
  | 'sendSmsReminders' | 'sendWhatsappReminders' | 'autoGenerateInvoiceNumber' | 'allowDigitalReceipts' | 'allowPhysicalReceipts';

const toggleMeta: Record<ToggleKey, { label: string; description: string }> = {
  sendSmsReminders: { label: 'SMS reminders', description: 'Renewal and payment reminders over SMS.',
  },
  sendWhatsappReminders: {
    label: 'WhatsApp reminders',
    description: 'Renewal and payment reminders over WhatsApp.',
  },
  autoGenerateInvoiceNumber: {
    label: 'Auto invoice numbers',
    description: 'Unique invoice references on every bill.',
  },
  allowDigitalReceipts: {
    label: 'Digital receipts',
    description: 'Share receipts over SMS or WhatsApp.',
  },
  allowPhysicalReceipts: {
    label: 'Physical receipts',
    description: 'Print paper receipts at checkout.',
  },
};

function Toggle({ on, onClick, locked }: { on: boolean; onClick: () => void; locked: boolean }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      title={locked ? 'Needs the owner password' : undefined}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-brand-500' : 'bg-stone-100'}`}
    >
      <span
        className={`absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
      >
        {locked ? <Lock size={9} className="text-stone-500" /> : null}
      </span>
    </button>
  );
}

export default function SettingsPage() {
  useLocaleRefresh();
  const { state, actions, syncStatus, syncError } = useDukaanStore();
  const { portal, nav } = usePortal();
  const { role, modal: gateModal, requestOwner } = useOwnerGate();
  const lock = useCounterLock();
  const settings = state.settings;
  const PortalMark = PORTAL_ICONS[portal.icon] ?? PORTAL_ICONS.general;
  const notCarried = disabledModules(portal.id);

  const [receiptMode, setReceiptMode] = useState(settings.receiptMode);
  const [taxRate, setTaxRate] = useState(String(settings.taxRate));
  const [message, setMessage] = useState<{
    tone: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [roleUpgrade, setRoleUpgrade] = useState<StaffRole | null>(null);

  const flash = (tone: 'ok' | 'error', text: string) => {
    setMessage({ tone, text });
    setTimeout(() => setMessage(null), 2600);
  };

  const switchRole = (next: StaffRole) => {
    if (next === role) return;
    // Handing the console *down* is instant (the owner walking away).
    // Taking it *up* proves ownership with the password.
    if (ROLE_RANK[next] > ROLE_RANK[role]) {
      setRoleUpgrade(next);
      return;
    }
    const result = actions.setActiveRole(next);
    flash(
      result.ok ? 'ok' : 'error',
      result.ok ? `Console handed to the ${ROLE_META[next].label}.` : (result.error ?? 'Could not switch role.'),
    );
  };

  const confirmRoleUpgrade = (next: StaffRole) => {
    const result = actions.setActiveRole(next);
    setRoleUpgrade(null);
    flash(
      result.ok ? 'ok' : 'error',
      result.ok ? `Welcome back, ${ROLE_META[next].label}.` : (result.error ?? 'Could not switch role.'),
    );
  };

  const flipToggle = (key: ToggleKey) => {
    requestOwner(
      `Turning ${toggleMeta[key].label} ${settings[key] ? 'off' : 'on'} changes how the shop runs — the owner password confirms it.`,
      () => {
        const result = actions.updateSettings({
          [key]: !settings[key],
        } as Partial<typeof settings>);
        if (result.ok) flash('ok', `${toggleMeta[key].label} ${settings[key] ? 'disabled' : 'enabled'}.`);
        else flash('error', result.error ?? 'Could not update setting.');
      },
    );
  };

  const saveBillingDefaults = () => {
    requestOwner('Billing defaults print on every bill — the owner password confirms the change.', () => {
      const parsed = Number(taxRate);
      const result = actions.updateSettings({ receiptMode, taxRate: parsed });
      if (result.ok) flash('ok', `Billing defaults saved — ${receiptMode} receipts, ${parsed}% tax.`);
      else flash('error', result.error ?? 'Could not save billing defaults.');
    });
  };

  const doReset = () => {
    requestOwner('Resetting wipes everything recorded on this device — only the owner password can allow that.', () => {
      actions.resetDemo();
      setReceiptMode('both');
      setTaxRate('18');
      setConfirmReset(false);
      setResetMessage('Demo data restored to the seeded business.');
      setTimeout(() => setResetMessage(null), 3000);
    });
  };

  const toggles: ToggleKey[] = [
    'sendSmsReminders',
    'sendWhatsappReminders',
    'autoGenerateInvoiceNumber',
    'allowDigitalReceipts',
    'allowPhysicalReceipts',
  ];
  const gated = role !== 'owner';

  const securityPosture = [
    {
      label: 'Content-Security-Policy',
      detail: 'Every response is locked to this origin — no foreign scripts or frames.',
      icon: ShieldCheck,
    },
    {
      label: 'HSTS + nosniff + DENY framing',
      detail: 'Forced HTTPS, no MIME sniffing, no clickjacking.',
      icon: Lock,
    },
    {
      label: 'Zero fund custody',
      detail: 'UPI QR payments settle directly into bank accounts. Sornio never touches money.',
      icon: Check,
    },
    {
      label: 'Local-first data',
      detail: 'Your ledger lives in this browser. Nothing leaves your device in demo mode.',
      icon: Lock,
    },
    {
      label: 'Masked account numbers',
      detail: 'Bank accounts are stored once, displayed masked (•••• last 4).',
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">
      {syncError ? (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {syncError}
        </p>
      ) : null}
      <BackupRecovery />
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        subtitle={
          gated
            ? `Signed in as ${ROLE_META[role].label} — changes ask for the owner password.`
            : 'Every control below is live — changes apply instantly and persist across sessions.'
        }
        actions={
          <Badge tone={ROLE_TONE[role]} dot>
            {ROLE_META[role].label} mode
          </Badge>
        }
      />

      {message ? (
        <div
          className={`mb-6 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm ring-1 ring-inset animate-fade-in ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' : 'bg-red-500/10 text-red-700 ring-red-500/20'}`}
        >
          {message.tone === 'ok' ? <Check size={15} /> : <RotateCcw size={15} />} {message.text}
        </div>
      ) : null}

      {gated && !lock.enabled ? (
        <div className="animate-fade-in mb-6 flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-sm text-amber-900">
          <TriangleAlert size={17} className="mt-0.5 shrink-0" />
          <p>
            <strong>No owner password is set</strong> — anyone at this console can change the settings below. The owner
            should{' '}
            <Link href="/security" className="font-semibold underline underline-offset-4">
              set the 6-digit password on the Security page
            </Link>{' '}
            first.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          {/* Who is using this app? */}
          <Card className="animate-fade-up">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <CardTitle icon={<UserRound size={17} />}>Who is using this app?</CardTitle>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${lock.enabled ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25' : 'bg-amber-500/10 text-amber-700 ring-amber-500/25'}`}
              >
                <KeyRound size={12} /> Owner password {lock.enabled ? 'set' : 'not set'}
              </span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {(Object.keys(ROLE_META) as StaffRole[]).map((option) => {
                const meta = ROLE_META[option];
                const Icon = meta.icon;
                const isActive = role === option;
                return (
                  <button
                    key={option}
                    onClick={() => switchRole(option)}
                    aria-pressed={isActive}
                    className={`rounded-2xl border p-4 text-left transition-all duration-200 active:scale-[0.98] ${
                      isActive
                        ? 'border-brand-500/50 bg-brand-500/[0.08] shadow-glow-sm'
                        : 'border-stone-200 bg-stone-50 hover:-translate-y-0.5 hover:border-brand-400/30 hover:shadow-card-hover'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${isActive ? 'bg-brand-gradient text-white shadow-glow-sm' : 'bg-stone-100 text-stone-600'}`}
                    >
                      <Icon size={17} />
                    </span>
                    <span className="mt-2.5 flex items-center gap-1.5 text-sm font-bold text-stone-900">
                      {meta.label}
                      {isActive ? <Check size={14} className="text-brand-600" /> : null}
                      {!isActive && ROLE_RANK[option] > ROLE_RANK[role] ? (
                        <Lock size={12} className="text-stone-500" />
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold text-brand-700">{meta.tagline}</span>
                    <span className="mt-1.5 block text-xs leading-relaxed text-stone-600">{meta.detail}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 rounded-2xl bg-stone-50 p-3.5 text-xs leading-relaxed text-stone-600 ring-1 ring-inset ring-stone-200">
              Handing the console <strong>down</strong> (owner → desk at closing time) is instant. Taking it back{' '}
              <strong>up</strong> asks for the owner password — the same 6-digit PIN that locks the counter, set on the{' '}
              <Link href="/security" className="font-semibold text-stone-700 underline underline-offset-4">
                Security page
              </Link>
              .
            </p>
          </Card>

          {/* Billing defaults — editable, owner-approved */}
          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<SlidersHorizontal size={17} />}>Billing defaults</CardTitle>
              <Button variant="secondary" onClick={saveBillingDefaults}>
                {gated ? <Lock size={15} /> : <Save size={15} />} Save
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600">
                  Receipt mode
                </span>
                <select
                  value={receiptMode}
                  onChange={(e) => setReceiptMode(e.target.value as typeof receiptMode)}
                  className={inputClass}
                >
                  <option value="digital">Digital</option>
                  <option value="physical">Physical</option>
                  <option value="both">Both</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600">
                  Default tax rate (%)
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
            <p className="mt-3 text-xs text-stone-600">
              Current: <span className="font-semibold text-stone-700 capitalize">{settings.receiptMode}</span> receipts
              · <span className="font-semibold text-stone-700">{settings.taxRate}%</span> tax · last updated{' '}
              {new Date(settings.updatedAt).toLocaleString(getActiveFormattingLocale(), {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </Card>

          {/* Reminders & receipts — live toggles, owner-approved */}
          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<ToggleLeft size={17} />}>Reminders & receipts</CardTitle>
              {gated ? (
                <Badge tone="amber" dot>
                  Owner password on change
                </Badge>
              ) : null}
            </div>
            <div className="space-y-3">
              {toggles.map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3.5 transition hover:border-brand-400/25 hover:bg-stone-100"
                >
                  <div>
                    <p className="text-sm font-semibold text-stone-800">{toggleMeta[key].label}</p>
                    <p className="text-xs text-stone-600">{toggleMeta[key].description}</p>
                  </div>
                  <Toggle on={Boolean(settings[key])} locked={gated} onClick={() => flipToggle(key)} />
                </div>
              ))}
            </div>
          </Card>

          {/* What this device can actually do for this trade. */}
          <CaptureReadinessCard />

          {/* The one switch that widens the console the portal narrowed. */}
          <div id="everything" className="scroll-mt-24">
            <EverythingSwitch />
          </div>

          {/* Console shape — one source of truth, no contradicting switches */}
          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between gap-3">
              <CardTitle icon={<SlidersHorizontal size={17} />}>Console shape</CardTitle>
              <Badge tone="brand" dot>
                {portal.name}
              </Badge>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-portal/[0.07] p-4 ring-1 ring-inset ring-portal/20">
              <span className="bg-portal-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-glow-sm">
                <PortalMark size={18} strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-900">{portal.tagline}</p>
                <p className="mt-1 text-xs leading-relaxed text-stone-600">{portal.promise}</p>
              </div>
            </div>

            <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-stone-500">
              Carried · {nav.flatMap((section) => section.links).length} modules
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {nav
                .flatMap((section) => section.links)
                .map((link) => (
                  <span
                    key={link.href}
                    className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 ring-1 ring-inset ring-stone-200"
                  >
                    <link.icon size={11} /> {link.label}
                  </span>
                ))}
            </div>

            {notCarried.length > 0 ? (
              <>
                <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-stone-500">
                  Not carried — on purpose
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {notCarried.map((item) => (
                    <span
                      key={item.module}
                      className="rounded-full bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-400 ring-1 ring-inset ring-stone-200 line-through"
                    >
                      {item.label}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-stone-600">{portal.excluded}</p>
              </>
            ) : null}

            <p className="mt-3 text-xs leading-relaxed text-stone-600">
              There is no second switchboard here on purpose: one definition decides the whole console, so the
              navigation can never promise a module the app does not carry.{' '}
              <Link href="/business" className="font-semibold text-stone-700 underline underline-offset-4">
                Change business type in Business Setup
              </Link>
              .
            </p>
          </Card>

          {/* Security & privacy */}
          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<Lock size={17} />}>Security & privacy</CardTitle>
              <Badge tone="emerald" dot>
                Active
              </Badge>
            </div>
            <div className="space-y-3">
              {securityPosture.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] p-3.5"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700">
                    <item.icon size={14} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-stone-800">{item.label}</p>
                    <p className="text-xs leading-relaxed text-stone-600">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Demo data — the front desk never sees the self-destruct button. */}
          {role === 'desk' ? (
            <Card className="animate-fade-up">
              <div className="mb-2">
                <CardTitle icon={<RotateCcw size={17} />}>Demo data</CardTitle>
              </div>
              <p className="flex items-start gap-2 text-sm leading-relaxed text-stone-600">
                <Lock size={15} className="mt-0.5 shrink-0 text-stone-500" />
                Resetting the business data is an owner-and-manager action. Ask the owner — it takes ten seconds in this
                same card.
              </p>
            </Card>
          ) : (
            <Card className="animate-fade-up border-red-500/20">
              <div className="mb-2">
                <CardTitle icon={<RotateCcw size={17} />}>Demo data</CardTitle>
              </div>
              <p className="text-sm text-stone-600">
                All recorded activity lives in your browser. Reset returns the business to its seeded demo state.
              </p>
              {resetMessage ? (
                <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-500/20">
                  {resetMessage}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {!confirmReset ? (
                  <Button variant="danger" onClick={() => setConfirmReset(true)}>
                    <RotateCcw size={15} /> Reset demo data
                  </Button>
                ) : (
                  <>
                    <span className="text-sm font-semibold text-red-700">Are you sure?</span>
                    <Button variant="danger" onClick={doReset}>
                      {gated ? <Lock size={15} /> : null} Yes, reset everything
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirmReset(false)}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </Card>
          )}

          {/* Data persistence & sync */}
          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<Database size={17} />}>Data persistence &amp; sync</CardTitle>
              {syncStatus === 'local' ? (
                <Badge tone="amber" dot>
                  Local demo mode
                </Badge>
              ) : syncStatus === 'synced' ? (
                <Badge tone="emerald" dot>
                  Synced
                </Badge>
              ) : syncStatus === 'syncing' ? (
                <Badge tone="brand" dot>
                  Syncing…
                </Badge>
              ) : syncStatus === 'error' ? (
                <Badge tone="red" dot>
                  Sync error
                </Badge>
              ) : (
                <Badge tone="slate" dot>
                  Awaiting sign-in
                </Badge>
              )}
            </div>

            {syncStatus === 'local' ? (
              <div className="rounded-xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
                <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-stone-800">
                  <CloudOff size={16} className="text-amber-700" /> Running on this device
                </div>
                <p className="text-sm leading-relaxed text-stone-600">
                  Your business data is stored safely in this browser. Cloud sync switches on automatically once the
                  person who installed the app connects the database (see Advanced below) and you sign in.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
                <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-stone-800">
                  <Cloud size={16} className="text-emerald-700" /> Connected to Supabase
                </div>
                <p className="text-sm leading-relaxed text-stone-600">
                  Products, ledger entries, customers, and settings sync to your Supabase project automatically. Use the
                  button below to force an immediate sync.
                </p>
                <div className="mt-4">
                  <Button
                    variant="secondary"
                    onClick={() => void actions.syncNow()}
                    disabled={syncStatus === 'syncing'}
                  >
                    <RefreshCw size={15} className={syncStatus === 'syncing' ? 'animate-spin' : ''} /> Sync now
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Server setup lives here, but folded away: it is for the person who
              installed the app, not for the person running the shop — and the
              front desk does not see it at all. */}
          {role === 'desk' ? null : (
            <details className="disclosure group rounded-2xl bg-white ring-1 ring-stone-200 shadow-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 transition hover:bg-stone-50 md:p-6 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-500 ring-1 ring-inset ring-brand-200">
                    <ServerCog size={17} />
                  </span>
                  <span>
                    <span className="block font-display text-base font-semibold text-stone-900">
                      Advanced — server setup
                    </span>
                    <span className="block text-xs text-stone-600">
                      For the person who installed Sornio. The shop runs fine without touching this.
                    </span>
                  </span>
                </span>
                <ChevronDown
                  size={18}
                  className="shrink-0 text-stone-500 transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="disclosure-body space-y-5 px-5 pb-5 md:px-6 md:pb-6">
                <EnvSetup />
              </div>
            </details>
          )}
        </div>

        {/* Audit trail — real entries written as actions happen */}
        <Card className="animate-fade-up h-fit">
          <div className="mb-1 flex items-center justify-between">
            <CardTitle icon={<History size={17} />}>Audit history</CardTitle>
            <Badge tone="brand" dot>
              {state.audit.length}
            </Badge>
          </div>
          <p className="mb-4 text-sm text-stone-600">Every important change is recorded as it happens.</p>
          <div className="space-y-3">
            {state.audit.slice(0, 10).map((event) => (
              <div
                key={event.id}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5 transition hover:border-brand-400/25 hover:bg-stone-100"
              >
                <div className="flex items-center justify-between">
                  <Badge tone={auditTones[event.type] ?? 'slate'}>{event.type}</Badge>
                  <span className="text-xs text-stone-600">{formatAuditDate(event.createdAt)}</span>
                </div>
                <p className="mt-2.5 text-sm text-stone-700">{event.summary}</p>
                <p className="mt-1 text-xs text-stone-600\">by {event.actor}</p>
              </div>
            ))}
            {state.audit.length === 0 ? (
              <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">
                No activity recorded yet — the trail starts with your first sale, expense, or catalog change.
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      {gateModal}
      {roleUpgrade ? (
        <OwnerPinModal
          reason={`Switching to ${ROLE_META[roleUpgrade].label} lifts the counter's limits — the owner password confirms it is really you.`}
          onClose={() => setRoleUpgrade(null)}
          onVerified={() => confirmRoleUpgrade(roleUpgrade)}
        />
      ) : null}
    </div>
  );
}
