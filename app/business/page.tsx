'use client';

import { Building2, Check, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { businessTemplates, defaultBusinessSettings } from '@/lib/models/business';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500';

export default function BusinessPage() {
  return (
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative mx-auto max-w-6xl p-6 md:p-8">
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

            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">UPI / payment setup</p>
              <div className="grid gap-3 md:grid-cols-2">
                <input className={inputClass} placeholder="Business UPI ID" />
                <input className={inputClass} placeholder="Bank name / IFSC" />
              </div>
            </div>

            <div className="mt-5">
              <span className={labelClass}>Business description</span>
              <textarea className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100" placeholder="Describe your business, customers, and service model." />
            </div>

            <div className="mt-5 rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Default operating preferences</p>
              <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                <p className="flex items-center gap-2"><Check size={14} className="text-emerald-600" /> Receipt mode: <span className="font-semibold capitalize text-slate-800">{defaultBusinessSettings.receiptMode}</span></p>
                <p className="flex items-center gap-2"><Check size={14} className="text-emerald-600" /> Default tax rate: <span className="font-semibold text-slate-800">{defaultBusinessSettings.taxRate}%</span></p>
                <p className="flex items-center gap-2"><Check size={14} className="text-emerald-600" /> Auto invoice numbers: <span className="font-semibold text-slate-800">{defaultBusinessSettings.autoGenerateInvoiceNumber ? 'On' : 'Off'}</span></p>
                <p className="flex items-center gap-2"><Check size={14} className="text-emerald-600" /> Reminders: <span className="font-semibold text-slate-800">SMS + WhatsApp</span></p>
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
                  <div key={template.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition hover:border-brand-200 hover:bg-white hover:shadow-card">
                    <p className="font-semibold text-slate-800">{template.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{template.description}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {template.recommendedModules.map((module) => (
                        <span key={module} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">{module}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="animate-fade-up rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-card">
              Every business starts with zero financial history and can add real data as soon as operation begins.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
