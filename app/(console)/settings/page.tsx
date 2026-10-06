'use client';

import { useState } from 'react';
import { Check, Cloud, CloudOff, Database, History, Lock, RefreshCw, RotateCcw, Save, ShieldCheck, SlidersHorizontal, ToggleLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { useDukaanStore } from '@/lib/store';
import { usePortal } from '@/lib/portals/portal-provider';
import { CaptureReadinessCard } from '@/components/scanning/capture-readiness';
import { disabledModules } from '@/lib/portals/registry';
import { PORTAL_ICONS } from '@/lib/portals/icons';

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';

const auditTones: Record<string, BadgeTone> = {
  sale: 'emerald', expense: 'red', product: 'brand', customer: 'sky', membership: 'violet', invoice: 'amber', marketing: 'violet', settings: 'slate', system: 'slate',
};

function formatAuditDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type ToggleKey = 'sendSmsReminders' | 'sendWhatsappReminders' | 'autoGenerateInvoiceNumber' | 'allowDigitalReceipts' | 'allowPhysicalReceipts';

const toggleMeta: Record<ToggleKey, { label: string; description: string }> = {
  sendSmsReminders: { label: 'SMS reminders', description: 'Renewal and payment reminders over SMS.' },
  sendWhatsappReminders: { label: 'WhatsApp reminders', description: 'Renewal and payment reminders over WhatsApp.' },
  autoGenerateInvoiceNumber: { label: 'Auto invoice numbers', description: 'Sequential invoice numbers on every bill.' },
  allowDigitalReceipts: { label: 'Digital receipts', description: 'Share receipts over SMS or WhatsApp.' },
  allowPhysicalReceipts: { label: 'Physical receipts', description: 'Print paper receipts at checkout.' },
};

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-brand-500' : 'bg-stone-100'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function SettingsPage() {
  const { state, actions, syncStatus } = useDukaanStore();
  const { portal, nav } = usePortal();
  const settings = state.settings;
  const PortalMark = PORTAL_ICONS[portal.icon] ?? PORTAL_ICONS.general;
  const notCarried = disabledModules(portal.id);

  const [receiptMode, setReceiptMode] = useState(settings.receiptMode);
  const [taxRate, setTaxRate] = useState(String(settings.taxRate));
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const flash = (tone: 'ok' | 'error', text: string) => {
    setMessage({ tone, text });
    setTimeout(() => setMessage(null), 2600);
  };

  const flipToggle = (key: ToggleKey) => {
    const result = actions.updateSettings({ [key]: !settings[key] } as Partial<typeof settings>);
    if (result.ok) flash('ok', `${toggleMeta[key].label} ${settings[key] ? 'disabled' : 'enabled'}.`);
    else flash('error', result.error ?? 'Could not update setting.');
  };

  const saveBillingDefaults = () => {
    const parsed = Number(taxRate);
    const result = actions.updateSettings({ receiptMode, taxRate: parsed });
    if (result.ok) flash('ok', `Billing defaults saved — ${receiptMode} receipts, ${parsed}% tax.`);
    else flash('error', result.error ?? 'Could not save billing defaults.');
  };

  const toggles: ToggleKey[] = ['sendSmsReminders', 'sendWhatsappReminders', 'autoGenerateInvoiceNumber', 'allowDigitalReceipts', 'allowPhysicalReceipts'];

  const securityPosture = [
    { label: 'Content-Security-Policy', detail: 'Every response is locked to this origin — no foreign scripts or frames.', icon: ShieldCheck },
    { label: 'HSTS + nosniff + DENY framing', detail: 'Forced HTTPS, no MIME sniffing, no clickjacking.', icon: Lock },
    { label: 'Zero fund custody', detail: 'UPI QR payments settle directly into bank accounts. DukaanOS never touches money.', icon: Check },
    { label: 'Local-first data', detail: 'Your ledger lives in this browser. Nothing leaves your device in demo mode.', icon: Lock },
    { label: 'Masked account numbers', detail: 'Bank accounts are stored once, displayed masked (•••• last 4).', icon: ShieldCheck },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        subtitle="Every control below is live — changes apply instantly and persist across sessions."
        actions={<Badge tone="emerald" dot>Interactive</Badge>}
      />

      {message ? (
        <div className={`mb-6 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm ring-1 ring-inset animate-fade-in ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' : 'bg-red-500/10 text-red-700 ring-red-500/20'}`}>
          {message.tone === 'ok' ? <Check size={15} /> : <RotateCcw size={15} />} {message.text}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          {/* Data persistence & sync */}
          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<Database size={17} />}>Data persistence &amp; sync</CardTitle>
              {syncStatus === 'local' ? (
                <Badge tone="amber" dot>Local demo mode</Badge>
              ) : syncStatus === 'synced' ? (
                <Badge tone="emerald" dot>Synced</Badge>
              ) : syncStatus === 'syncing' ? (
                <Badge tone="brand" dot>Syncing…</Badge>
              ) : syncStatus === 'error' ? (
                <Badge tone="red" dot>Sync error</Badge>
              ) : (
                <Badge tone="slate" dot>Awaiting sign-in</Badge>
              )}
            </div>

            {syncStatus === 'local' ? (
              <div className="rounded-xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
                <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-stone-800">
                  <CloudOff size={16} className="text-amber-700" /> Running on this device
                </div>
                <p className="text-sm leading-relaxed text-stone-600">
                  Your business data is stored locally in this browser. To persist it to the
                  Supabase database, set <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[12px] text-stone-700">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
                  <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[12px] text-stone-700">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>, then sign in at{' '}
                  <span className="text-stone-700">/auth</span>.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200">
                <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-stone-800">
                  <Cloud size={16} className="text-emerald-700" /> Connected to Supabase
                </div>
                <p className="text-sm leading-relaxed text-stone-600">
                  Products, ledger entries, customers, and settings sync to your Supabase project
                  automatically. Use the button below to force an immediate sync.
                </p>
                <div className="mt-4">
                  <Button variant="secondary" onClick={() => void actions.syncNow()} disabled={syncStatus === 'syncing'}>
                    <RefreshCw size={15} className={syncStatus === 'syncing' ? 'animate-spin' : ''} /> Sync now
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Billing defaults — editable */}
          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<SlidersHorizontal size={17} />}>Billing defaults</CardTitle>
              <Button variant="secondary" onClick={saveBillingDefaults}><Save size={15} /> Save</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600">Receipt mode</span>
                <select value={receiptMode} onChange={(e) => setReceiptMode(e.target.value as typeof receiptMode)} className={inputClass}>
                  <option value="digital">Digital</option>
                  <option value="physical">Physical</option>
                  <option value="both">Both</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600">Default tax rate (%)</span>
                <input type="number" min={0} max={100} step={0.5} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className={inputClass} />
              </label>
            </div>
            <p className="mt-3 text-xs text-stone-600">Current: <span className="font-semibold text-stone-700 capitalize">{settings.receiptMode}</span> receipts · <span className="font-semibold text-stone-700">{settings.taxRate}%</span> tax · last updated {new Date(settings.updatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
          </Card>

          {/* Reminders & receipts — live toggles */}
          <Card className="animate-fade-up">
            <div className="mb-5"><CardTitle icon={<ToggleLeft size={17} />}>Reminders & receipts</CardTitle></div>
            <div className="space-y-3">
              {toggles.map((key) => (
                <div key={key} className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 p-3.5 transition hover:border-brand-400/25 hover:bg-stone-100">
                  <div>
                    <p className="text-sm font-semibold text-stone-800">{toggleMeta[key].label}</p>
                    <p className="text-xs text-stone-600">{toggleMeta[key].description}</p>
                  </div>
                  <Toggle on={Boolean(settings[key])} onClick={() => flipToggle(key)} />
                </div>
              ))}
            </div>
          </Card>

          {/* What this device can actually do for this trade. */}
          <CaptureReadinessCard />

          {/* Console shape — one source of truth, no contradicting switches */}
          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between gap-3">
              <CardTitle icon={<SlidersHorizontal size={17} />}>Console shape</CardTitle>
              <Badge tone="brand" dot>{portal.name}</Badge>
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

            <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-stone-500">Carried · {nav.flatMap((section) => section.links).length} modules</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {nav.flatMap((section) => section.links).map((link) => (
                <span key={link.href} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 ring-1 ring-inset ring-stone-200">
                  <link.icon size={11} /> {link.label}
                </span>
              ))}
            </div>

            {notCarried.length > 0 ? (
              <>
                <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-stone-500">Not carried — on purpose</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {notCarried.map((item) => (
                    <span key={item.module} className="rounded-full bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-400 ring-1 ring-inset ring-stone-200 line-through">
                      {item.label}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-stone-600">{portal.excluded}</p>
              </>
            ) : null}

            <p className="mt-3 text-xs leading-relaxed text-stone-600">
              There is no second switchboard here on purpose: one definition decides the whole console, so the navigation can never
              promise a module the app does not carry.{' '}
              <Link href="/business" className="font-semibold text-stone-700 underline underline-offset-4">
                Change business type in Business Setup
              </Link>
              .
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {['Owner', 'Manager', 'Cashier', 'Auditor'].map((role) => (
                <span key={role} className="rounded-full bg-brand-500/10 px-3.5 py-1.5 text-xs font-semibold text-brand-600 ring-1 ring-inset ring-brand-500/25">{role}</span>
              ))}
            </div>
          </Card>

          {/* Security & privacy */}
          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<Lock size={17} />}>Security & privacy</CardTitle>
              <Badge tone="emerald" dot>Active</Badge>
            </div>
            <div className="space-y-3">
              {securityPosture.map((item) => (
                <div key={item.label} className="flex items-start gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] p-3.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700"><item.icon size={14} /></span>
                  <div>
                    <p className="text-sm font-semibold text-stone-800">{item.label}</p>
                    <p className="text-xs leading-relaxed text-stone-600">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Demo data */}
          <Card className="animate-fade-up border-red-500/20">
            <div className="mb-2"><CardTitle icon={<RotateCcw size={17} />}>Demo data</CardTitle></div>
            <p className="text-sm text-stone-600">All recorded activity lives in your browser. Reset returns the business to its seeded demo state.</p>
            {resetMessage ? <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-500/20">{resetMessage}</p> : null}
            <div className="mt-4 flex items-center gap-3">
              {!confirmReset ? (
                <Button variant="danger" onClick={() => setConfirmReset(true)}><RotateCcw size={15} /> Reset demo data</Button>
              ) : (
                <>
                  <span className="text-sm font-semibold text-red-700">Are you sure?</span>
                  <Button
                    variant="danger"
                    onClick={() => {
                      actions.resetDemo();
                      setReceiptMode('both');
                      setTaxRate('18');
                      setConfirmReset(false);
                      setResetMessage('Demo data restored to the seeded business.');
                      setTimeout(() => setResetMessage(null), 3000);
                    }}
                  >
                    Yes, reset everything
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirmReset(false)}>Cancel</Button>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Audit trail — real entries written as actions happen */}
        <Card className="animate-fade-up h-fit">
          <div className="mb-1 flex items-center justify-between">
            <CardTitle icon={<History size={17} />}>Audit history</CardTitle>
            <Badge tone="brand" dot>{state.audit.length}</Badge>
          </div>
          <p className="mb-4 text-sm text-stone-600">Every important change is recorded as it happens.</p>
          <div className="space-y-3">
            {state.audit.slice(0, 10).map((event) => (
              <div key={event.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5 transition hover:border-brand-400/25 hover:bg-stone-100">
                <div className="flex items-center justify-between">
                  <Badge tone={auditTones[event.type] ?? 'slate'}>{event.type}</Badge>
                  <span className="text-xs text-stone-600">{formatAuditDate(event.createdAt)}</span>
                </div>
                <p className="mt-2.5 text-sm text-stone-700">{event.summary}</p>
                <p className="mt-1 text-xs text-stone-600">by {event.actor}</p>
              </div>
            ))}
            {state.audit.length === 0 ? (
              <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">No activity recorded yet — the trail starts with your first sale, expense, or catalog change.</p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
