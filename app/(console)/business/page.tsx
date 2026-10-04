'use client';

import { useState } from 'react';
import { Building2, Check, QrCode, Save, Sparkles } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useDukaanStore } from '@/lib/store';
import { businessTemplates } from '@/lib/models/business';
import { buildUpiDeepLink, isValidUpiId } from '@/lib/upi';

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500';

export default function BusinessPage() {
  const { state, actions } = useDukaanStore();
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
    <div className="mx-auto max-w-6xl p-6 md:p-8">
      <PageHeader
        eyebrow="Business Setup"
        title="Build your business profile"
        subtitle="DukaanOS adapts to your business type with the right modules, billing logic, customer flow, and receipt system."
        actions={profile.templateId ? <Badge tone="violet" dot>{businessTemplates.find((t) => t.id === profile.templateId)?.name ?? 'Custom'}</Badge> : undefined}
      />

      {message ? (
        <div className={`mb-6 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm ring-1 ring-inset animate-fade-in ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' : 'bg-red-500/10 text-red-400 ring-red-500/20'}`}>
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
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-200"><QrCode size={15} /> Your collection UPI ID</p>
            <p className="mb-3 text-xs text-zinc-500">Your own bank&apos;s UPI ID — payments land directly in your account, no middleman. The QR below is generated from it.</p>
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
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Your QR</span>
                </div>
              ) : (
                <div className="flex h-[108px] w-[108px] items-center justify-center rounded-xl border border-dashed border-white/15 text-center text-[10px] leading-tight text-zinc-600">QR appears when you enter a valid UPI ID</div>
              )}
            </div>
          </div>

          <div className="mt-5">
            <span className={labelClass}>Business description</span>
            <textarea className="min-h-[110px] w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20" placeholder="Describe your business, customers, and service model." value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </Card>

        <div className="space-y-6">
          {templateFlash ? (
            <div className="rounded-xl bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-400 ring-1 ring-inset ring-emerald-500/20 animate-fade-in">
              <Check size={14} className="mr-1.5 inline" /> {templateFlash}
            </div>
          ) : null}

          <Card className="animate-fade-up h-fit">
            <div className="mb-5"><CardTitle icon={<Sparkles size={17} />}>Business templates</CardTitle></div>
            <p className="mb-4 text-xs leading-relaxed text-zinc-500">
              One engine, every business. Pick your type and DukaanOS configures memberships, inventory,
              appointments, receipts, and reminders to match how you operate.
            </p>
            <div className="space-y-3">
              {businessTemplates.map((template) => {
                const active = profile.templateId === template.id;
                return (
                  <button
                    key={template.id}
                    onClick={() => applyTemplate(template.id)}
                    className={`w-full rounded-2xl p-4 text-left ring-1 ring-inset transition ${active ? 'bg-brand-500/[0.12] ring-brand-400/40' : 'bg-white/[0.03] ring-white/[0.07] hover:bg-white/[0.06]'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white">{template.name}</span>
                      {active ? <Badge tone="brand" dot>Active</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">{template.description}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {template.recommendedModules.map((module) => (
                        <span key={module} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-zinc-400 ring-1 ring-inset ring-white/[0.07]">{module}</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
