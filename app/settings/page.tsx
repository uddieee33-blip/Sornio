'use client';

import { useState } from 'react';
import { History, RotateCcw, ShieldCheck, SlidersHorizontal, ToggleLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { defaultBusinessSettings, sampleAuditEvents } from '@/lib/models/business';
import { useDukaanStore } from '@/lib/store';

const settings = defaultBusinessSettings;

const toggles = [
  { label: 'SMS reminders', description: 'Send renewal and payment reminders via SMS.', enabled: settings.sendSmsReminders },
  { label: 'WhatsApp reminders', description: 'Send renewal and payment reminders via WhatsApp.', enabled: settings.sendWhatsappReminders },
  { label: 'Auto invoice numbers', description: 'Generate sequential invoice numbers automatically.', enabled: settings.autoGenerateInvoiceNumber },
  { label: 'Digital receipts', description: 'Share receipts over SMS or WhatsApp.', enabled: settings.allowDigitalReceipts },
  { label: 'Physical receipts', description: 'Print paper receipts at checkout.', enabled: settings.allowPhysicalReceipts },
];

const modules = [
  { label: 'Memberships', description: 'Plans, subscriptions, and renewal automation.', enabled: settings.allowMemberships },
  { label: 'Inventory', description: 'Stock levels, valuation, and reorder alerts.', enabled: settings.allowInventory },
  { label: 'Appointments', description: 'Bookings and service scheduling.', enabled: settings.allowAppointments },
];

const auditTones: Record<string, BadgeTone> = {
  invoice: 'sky', payment: 'emerald', inventory: 'violet', member: 'amber', security: 'red', system: 'slate',
};

function formatAuditDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function SettingsPage() {
  const { actions } = useDukaanStore();
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  return (
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative mx-auto max-w-6xl p-6 md:p-8">
        <PageHeader eyebrow="Analysis" title="Business preferences" subtitle="Receipt behavior, reminder channels, tax defaults, module availability, and the audit trail." />

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Card className="animate-fade-up">
              <div className="mb-5"><CardTitle icon={<SlidersHorizontal size={17} />}>Billing defaults</CardTitle></div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Receipt mode</span>
                  <select defaultValue={settings.receiptMode} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
                    <option value="digital">Digital</option><option value="physical">Physical</option><option value="both">Both</option>
                  </select>
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Default tax rate (%)</span>
                  <input type="number" defaultValue={settings.taxRate} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
                </label>
              </div>

              <div className="mt-5 space-y-3">
                {toggles.map((toggle) => (
                  <div key={toggle.label} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 transition hover:border-brand-200 hover:bg-white hover:shadow-card">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{toggle.label}</p>
                      <p className="text-xs text-slate-500">{toggle.description}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${toggle.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                      <ToggleLeft size={13} /> {toggle.enabled ? 'On' : 'Off'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="animate-fade-up">
              <div className="mb-5"><CardTitle icon={<ShieldCheck size={17} />}>Modules & roles</CardTitle></div>
              <div className="grid gap-3 md:grid-cols-3">
                {modules.map((module) => (
                  <div key={module.label} className={`rounded-2xl border p-4 transition ${module.enabled ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-100 bg-slate-50'}`}>
                    <p className="text-sm font-semibold text-slate-800">{module.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{module.description}</p>
                    <p className={`mt-2.5 text-xs font-semibold ${module.enabled ? 'text-emerald-700' : 'text-slate-400'}`}>{module.enabled ? '● Enabled' : '○ Disabled'}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {['Owner', 'Manager', 'Accountant', 'Staff', 'Viewer'].map((role) => (
                  <span key={role} className="rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">{role}</span>
                ))}
              </div>
            </Card>

            <Card className="animate-fade-up border-red-100">
              <div className="mb-2"><CardTitle icon={<RotateCcw size={17} />}>Demo data</CardTitle></div>
              <p className="text-sm text-slate-500">All recorded activity lives in your browser. Reset returns the business to its seeded demo state.</p>
              {resetMessage ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{resetMessage}</p> : null}
              <div className="mt-4">
                <Button
                  variant="danger"
                  onClick={() => { actions.resetDemo(); setResetMessage('Demo data restored to the seeded business.'); }}
                >
                  <RotateCcw size={15} /> Reset demo data
                </Button>
              </div>
            </Card>
          </div>

          <Card className="animate-fade-up h-fit">
            <div className="mb-1 flex items-center justify-between">
              <CardTitle icon={<History size={17} />}>Audit history</CardTitle>
              <Badge tone="brand" dot>{sampleAuditEvents.length}</Badge>
            </div>
            <p className="mb-4 text-sm text-slate-500">Every business action is traceable.</p>
            <div className="space-y-3">
              {sampleAuditEvents.map((event) => (
                <div key={event.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 transition hover:border-brand-200 hover:bg-white hover:shadow-card">
                  <div className="flex items-center justify-between">
                    <Badge tone={auditTones[event.type] ?? 'slate'}>{event.type}</Badge>
                    <span className="text-xs text-slate-500">{formatAuditDate(event.createdAt)}</span>
                  </div>
                  <p className="mt-2.5 text-sm text-slate-700">{event.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">by {event.actor}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
