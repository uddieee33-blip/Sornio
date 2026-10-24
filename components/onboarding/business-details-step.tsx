'use client';

import { Check } from 'lucide-react';
import { businessTemplates } from '@/lib/models/business';
import { portalForTemplate } from '@/lib/portals/registry';
import { portalIcon } from '@/lib/portals/icons';
import { dailyWorkspace } from '@/lib/portals/daily-workspace';

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3 text-sm text-stone-900 placeholder-stone-500 outline-hidden transition focus:border-portal/50 focus:ring-2 focus:ring-focus';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600';

type Props = {
  businessName: string; templateId: string; description: string;
  onBusinessNameChange: (value: string) => void;
  onTemplateChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
};

/** Choosing a business is choosing a workspace, not a colour theme. */
export function BusinessDetailsStep({ businessName, templateId, description, onBusinessNameChange, onTemplateChange, onDescriptionChange }: Props) {
  const selected = templateId ? dailyWorkspace(portalForTemplate(templateId).id) : null;
  return (
    <section aria-labelledby="business-details-title" className="space-y-5">
      <div><h2 id="business-details-title" tabIndex={-1} className="font-display text-lg font-bold text-stone-900">Your business</h2><p className="mt-2 text-sm leading-relaxed text-stone-600">Choose your business type. Your home, daily tasks and navigation will follow it.</p></div>
      <div><label htmlFor="setup-business-name" className={labelClass}>Business name</label><input id="setup-business-name" name="businessName" required maxLength={120} autoComplete="organization" className={inputClass} placeholder="Your shop or business name" value={businessName} onChange={event => onBusinessNameChange(event.target.value)} /></div>
      <fieldset>
        <legend className={labelClass}>What kind of business is it?</legend>
        <div className="setup-business-choices">
          {businessTemplates.map(template => {
            const active = templateId === template.id;
            const blueprint = portalForTemplate(template.id);
            const Icon = portalIcon(blueprint.icon);
            return <button key={template.id} type="button" aria-pressed={active} onClick={() => onTemplateChange(template.id)}><span className="setup-business-icon"><Icon size={20} strokeWidth={1.5} aria-hidden="true" /></span><span><strong>{template.name}</strong><small>{blueprint.tagline}</small></span>{active ? <Check size={16} aria-hidden="true" /> : null}</button>;
          })}
        </div>
      </fieldset>
      {selected ? <aside className="setup-workspace-preview" aria-live="polite"><p>Your workspace</p><h3>{selected.title}</h3><span>{selected.description}</span><ul>{selected.tasks.slice(0, 3).map(task => <li key={task.href}><Check size={13} aria-hidden="true" />{task.label}</li>)}</ul></aside> : null}
      <div><label htmlFor="setup-description" className={labelClass}>Describe your business (optional)</label><textarea id="setup-description" name="description" maxLength={600} className={inputClass + ' min-h-24'} placeholder="What you sell, who your customers are…" value={description} onChange={event => onDescriptionChange(event.target.value)} /></div>
    </section>
  );
}
