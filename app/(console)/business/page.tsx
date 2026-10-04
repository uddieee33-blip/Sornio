'use client';

import { Building2, Check, QrCode, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { businessTemplates, defaultBusinessSettings } from '@/lib/models/business';

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500';

export default function BusinessPage() {
  return (
    <div className="mx-auto max-w-6xl p-6 md:p-8">
      <PageHeader
        eyebrow="Business Setup"
        title="Build your business profile"
        subtitle="DukaanOS adapts to your business type with the right modules, billing logic, customer flow, and receipt system."
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="animate-fade-up h-fit">
          <div className="mb-5"><CardTitle icon={<Building2 size={17} />}>Business details</CardTitle></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><span className={labelClass}>Business name</span><input className={inputClass} placeholder="Cult Fitness" /></div>
            <div><span className={labelClass}>Business type</span>
              <select className={inputClass}>
                {businessTemplates.map((template) => <option key={template.id}>{template.name}</option>)}
              </select>
            </div>
            <div><span className={labelClass}>Currency</span><input defaultValue="INR" className={inputClass} /></div>
            <div><span className={labelClass}>Time zone</span><input defaultValue="Asia/Kolkata" className={inputClass} /></div>
          </div>

          <div className="mt-5 rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-200"><QrCode size={15} /> UPI / payment setup</p>
            <p className="mb-3 text-xs text-zinc-500">Your own collection details — customers with UPI IDs get their own QRs on the Customers page.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <input className={inputClass} placeholder="Business UPI ID" />
              <input className={inputClass} placeholder="Bank name / IFSC" />
            </div>
          </div>

          <div className="mt-5">
            <span className={labelClass}>Business description</span>
            <textarea className="min-h-[110px] w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20" placeholder="Describe your business, customers, and service model." />
          </div>

          <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
            <p className="mb-3 text-sm font-semibold text-zinc-200">Default operating preferences</p>
            <div className="grid gap-2 text-sm text-zinc-400 md:grid-cols-2">
              <p className="flex items-center gap-2"><Check size={14} className="text-emerald-400" /> Receipt mode: <span className="font-semibold capitalize text-zinc-200">{defaultBusinessSettings.receiptMode}</span></p>
              <p className="flex items-center gap-2"><Check size={14} className="text-emerald-400" /> Default tax rate: <span className="font-semibold text-zinc-200">{defaultBusinessSettings.taxRate}%</span></p>
              <p className="flex items-center gap-2"><Check size={14} className="text-emerald-400" /> Auto invoice numbers: <span className="font-semibold text-zinc-200">{defaultBusinessSettings.autoGenerateInvoiceNumber ? 'On' : 'Off'}</span></p>
              <p className="flex items-center gap-2"><Check size={14} className="text-emerald-400" /> Reminders: <span className="font-semibold text-zinc-200">SMS + WhatsApp</span></p>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button><Building2 size={16} /> Create business</Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="animate-fade-up h-fit">
            <div className="mb-5"><CardTitle icon={<Sparkles size={17} />}>Recommended modules</CardTitle></div>
            <div className="space-y-3">
              {businessTemplates.map((template) => (
                <div key={template.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 transition hover:border-brand-400/30 hover:bg-white/[0.05]">
                  <p className="font-semibold text-zinc-200">{template.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">{template.description}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {template.recommendedModules.map((module) => (
                      <span key={module} className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-400 ring-1 ring-inset ring-white/[0.09]">{module}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="animate-fade-up rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-sm text-emerald-300">
            Every business starts with zero financial history and builds real numbers as soon as operation begins.
          </div>
        </div>
      </div>
    </div>
  );
}
