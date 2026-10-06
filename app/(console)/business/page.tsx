'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Check, Fingerprint, QrCode, Save, ScanBarcode, Sparkles } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useDukaanStore } from '@/lib/store';
import { businessTemplates } from '@/lib/models/business';
import { portalIcon } from '@/lib/portals/icons';
import { disabledModules, portalForTemplate } from '@/lib/portals/registry';
import { usePortal } from '@/lib/portals/portal-provider';
import { buildUpiDeepLink, isValidUpiId } from '@/lib/upi';

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';

/** The words an owner uses for each capture channel, not the API's words. */
const CHANNEL_LABELS: Record<'barcode' | 'qr' | 'keypad' | 'fingerprint', string> = {
  barcode: 'Barcode scanner',
  qr: 'QR / job tags',
  keypad: 'Typed entry',
  fingerprint: 'Fingerprint pad',
};
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600';

export default function BusinessPage() {
  const { state, actions } = useDukaanStore();
  const { portal, nav } = usePortal();
  const profile = state.profile;

  const [name, setName] = useState(profile.name);
  const [description, setDescription] = useState(profile.description);
  const [currency, setCurrency] = useState(profile.currency);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [upiId, setUpiId] = useState(profile.upiId ?? '');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [templateFlash, setTemplateFlash] = useState<string | null>(null);

  const flash = (tone: 'ok' | 'error', text: string) => {
    setMessage({ tone, text });
    setTimeout(() => setMessage(null), 2600);
  };

  const saveProfile = () => {
    const result = actions.updateProfile({ name, description, currency, timezone, upiId: upiId.trim() || undefined });
    flash(result.ok ? 'ok' : 'error', result.ok ? 'Business profile saved — receipts and reminders now use it.' : result.error ?? 'Could not save.');
  };

  const applyTemplate = (templateId: string) => {
    const result = actions.applyTemplate(templateId);
    if (result.ok) {
      const template = businessTemplates.find((t) => t.id === templateId);
      setTemplateFlash(`"${template?.name}" applied — modules and defaults are now configured for this business type.`);
      setTimeout(() => setTemplateFlash(null), 3200);
    }
  };

  const upiValid = upiId.trim() !== '' && isValidUpiId(upiId.trim());

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="Business Setup"
        title="Build your business profile"
        subtitle="DukaanOS adapts to your business type with the right modules, billing logic, customer flow, and receipt system."
        actions={profile.templateId ? <Badge tone="violet" dot>{businessTemplates.find((t) => t.id === profile.templateId)?.name ?? 'Custom'}</Badge> : undefined}
      />

      {message ? (
        <div className={`mb-6 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm ring-1 ring-inset animate-fade-in ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' : 'bg-red-500/10 text-red-700 ring-red-500/20'}`}>
          <Check size={15} /> {message.text}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="animate-fade-up h-fit">
          <div className="mb-5 flex items-center justify-between">
            <CardTitle icon={<Building2 size={17} />}>Business details</CardTitle>
            <Button variant="secondary" onClick={saveProfile}><Save size={15} /> Save</Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><span className={labelClass}>Business name</span><input className={inputClass} placeholder="Cult Fitness" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div>
              <span className={labelClass}>Business type</span>
              <select className={inputClass} value={profile.templateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">Select a template…</option>
                {businessTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </div>
            <div><span className={labelClass}>Currency</span><input className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)} /></div>
            <div><span className={labelClass}>Time zone</span><input className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)} /></div>
          </div>

          <div className="mt-5 rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-700"><QrCode size={15} /> Your collection UPI ID</p>
            <p className="mb-3 text-xs text-stone-600">Your own bank&apos;s UPI ID — payments land directly in your account, no middleman. The QR below is generated from it.</p>
            <div className="grid items-start gap-4 md:grid-cols-[1fr_auto]">
              <input className={inputClass} placeholder="businessname@okhdfcbank" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
              {upiValid ? (
                <div className="flex flex-col items-center gap-1.5">
                  <div className="rounded-xl bg-white p-2 shadow-card">
                    <QRCodeCanvas
                      value={buildUpiDeepLink({ payeeVpa: upiId.trim(), payeeName: name.trim() || 'My Business' })}
                      size={220}
                      level="M"
                      fgColor="#0B0D12"
                      bgColor="#ffffff"
                      style={{ width: 92, height: 92 }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-600">Your QR</span>
                </div>
              ) : (
                <div className="flex h-[108px] w-[108px] items-center justify-center rounded-xl border border-dashed border-stone-300 text-center text-[10px] leading-tight text-stone-600">QR appears when you enter a valid UPI ID</div>
              )}
            </div>
          </div>

          <div className="mt-5">
            <span className={labelClass}>Business description</span>
            <textarea className="min-h-[110px] w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20" placeholder="Describe your business, customers, and service model." value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </Card>

        <div className="space-y-6">
          {templateFlash ? (
            <div className="rounded-xl bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-500/20 animate-fade-in">
              <Check size={14} className="mr-1.5 inline" /> {templateFlash}
            </div>
          ) : null}

          {/* Which console does this business run? Not a label — the shape
              of the whole app, and the reason a gym never sees a stock shelf. */}
          <Card className="animate-fade-up h-fit">
            <div className="mb-5 flex items-center justify-between gap-3">
              <CardTitle icon={<Sparkles size={17} />}>Business type &amp; console</CardTitle>
              <Badge tone="brand" dot>{portal.name}</Badge>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-stone-600">
              One engine, every business. Your type decides which modules exist, what they are called, and what each screen asks for — a
              gym is never shown a stock shelf, a kirana is never asked to chase memberships. Switching reshapes the console instantly and
              keeps every record exactly where it is.
            </p>

            <div className="mb-5 rounded-2xl bg-portal/[0.07] p-4 ring-1 ring-inset ring-portal/20">
              <p className="text-[11px] font-bold uppercase tracking-wide text-portal">This console carries</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {nav.flatMap((section) => section.links).map((link) => (
                  <span key={link.href} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-stone-700 ring-1 ring-inset ring-stone-200">
                    {link.label}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-stone-600">{portal.excluded}</p>

              {/* How this desk captures a code or a finger. Decided by the
                  blueprint, so the omission is stated rather than discovered. */}
              <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-inset ring-stone-200">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-600">
                  {portal.capture.channels.includes('fingerprint') ? <Fingerprint size={12} /> : <ScanBarcode size={12} />}
                  {portal.capture.label}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-stone-600">{portal.capture.what}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {portal.capture.channels.map((channel) => (
                    <span key={channel} className="rounded-full bg-portal/[0.08] px-2 py-0.5 text-[10px] font-semibold text-portal ring-1 ring-inset ring-portal/20">
                      {CHANNEL_LABELS[channel]}
                    </span>
                  ))}
                </div>
                {portal.capture.symbologies.length > 0 ? (
                  <p className="mt-2 font-mono text-[10px] leading-relaxed text-stone-500">{portal.capture.symbologies.join(' · ')}</p>
                ) : null}
                <p className="mt-2 text-[11px] leading-relaxed text-stone-500">{portal.capture.note}</p>
              </div>
            </div>

            <div className="space-y-3">
              {businessTemplates.map((template) => {
                const active = profile.templateId === template.id;
                const blueprint = portalForTemplate(template.id);
                const TemplateIcon = portalIcon(blueprint.icon);
                const leftOut = disabledModules(blueprint.id);
                return (
                  <button
                    key={template.id}
                    onClick={() => applyTemplate(template.id)}
                    aria-pressed={active}
                    className={`w-full rounded-2xl p-4 text-left ring-1 ring-inset transition ${
                      active ? 'bg-portal/[0.10] ring-portal/35' : 'bg-stone-50 ring-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-bold text-stone-900">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? 'bg-portal-gradient text-white' : 'bg-stone-100 text-stone-600'}`}>
                          <TemplateIcon size={15} strokeWidth={2.2} />
                        </span>
                        {template.name}
                      </span>
                      {active ? <Badge tone="brand" dot>Active</Badge> : null}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-stone-600">{template.promise}</p>
                    <p className="mt-2 text-[11px] leading-relaxed text-stone-500">{template.excluded}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {blueprint.capture.channels.map((channel) => (
                        <span key={channel} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-stone-600 ring-1 ring-inset ring-stone-200">
                          {CHANNEL_LABELS[channel]}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {template.recommendedModules.slice(0, 6).map((module) => (
                        <span key={module} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600 ring-1 ring-inset ring-stone-200">
                          {module}
                        </span>
                      ))}
                      {leftOut.slice(0, 3).map((item) => (
                        <span key={item.module} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-stone-400 ring-1 ring-inset ring-stone-200 line-through">
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-stone-500">
              Your chosen type is also enforced at the edge: a link to a module this console does not carry never renders, it routes back
              here with an explanation. <Link href="/security" className="font-semibold text-stone-600 underline underline-offset-4">More in the Trust Centre</Link>.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
