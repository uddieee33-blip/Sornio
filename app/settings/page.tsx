import { defaultBusinessSettings, sampleAuditEvents } from '@/lib/models/business';

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

const auditTypeStyles: Record<string, string> = {
  invoice: 'bg-blue-50 text-blue-700',
  payment: 'bg-emerald-50 text-emerald-700',
  inventory: 'bg-violet-50 text-violet-700',
  member: 'bg-amber-50 text-amber-700',
  security: 'bg-red-50 text-red-700',
  system: 'bg-slate-100 text-slate-600',
};

function formatAuditDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function SettingsPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">settings</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Business preferences</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Receipt behavior, reminder channels, tax defaults, module availability, and the audit trail.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Billing defaults</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <span className="mb-2 block font-medium">Receipt mode</span>
                  <select defaultValue={settings.receiptMode} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900">
                    <option value="digital">Digital</option>
                    <option value="physical">Physical</option>
                    <option value="both">Both</option>
                  </select>
                </label>
                <label className="text-sm text-slate-700">
                  <span className="mb-2 block font-medium">Default tax rate (%)</span>
                  <input type="number" defaultValue={settings.taxRate} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900" />
                </label>
              </div>

              <div className="mt-5 space-y-3">
                {toggles.map((toggle) => (
                  <div key={toggle.label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{toggle.label}</p>
                      <p className="text-xs text-slate-500">{toggle.description}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${toggle.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                      {toggle.enabled ? 'On' : 'Off'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Modules</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {modules.map((module) => (
                  <div key={module.label} className={`rounded-xl border p-3 ${module.enabled ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                    <p className="text-sm font-medium text-slate-800">{module.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{module.description}</p>
                    <p className={`mt-2 text-xs font-medium ${module.enabled ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {module.enabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Team roles</h2>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {['Owner', 'Manager', 'Accountant', 'Staff', 'Viewer'].map((role) => (
                  <span key={role} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">{role}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="text-lg font-semibold text-slate-900">Audit history</h2>
            <p className="mt-1 text-sm text-slate-500">Every business action is traceable.</p>
            <div className="mt-4 space-y-3">
              {sampleAuditEvents.map((event) => (
                <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-medium capitalize ${auditTypeStyles[event.type]}`}>{event.type}</span>
                    <span className="text-slate-500">{formatAuditDate(event.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{event.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">by {event.actor}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
