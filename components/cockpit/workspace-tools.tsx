'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, LockKeyhole, Search } from 'lucide-react';
import { usePortal } from '@/lib/portals/portal-provider';
import { usePlan } from '@/components/billing/plan-provider';
import { checkPlanAccess } from '@/lib/plans/routes';
import { workspaceAreas, type WorkAreaId } from '@/lib/workspace';

export function WorkspaceTools() {
  const { nav, portal } = usePortal();
  const { entitlement } = usePlan();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<WorkAreaId | 'all'>('all');
  const areas = workspaceAreas(nav, portal.id);
  const needle = query.trim().toLocaleLowerCase();
  const shown = areas.filter(area => category === 'all' || category === area.id).flatMap(area => {
    const links = area.links.filter(link => `${link.label} ${link.keywords} ${area.label}`.toLocaleLowerCase().includes(needle));
    return links.length ? [{ ...area, links }] : [];
  });
  return <section aria-labelledby="workspace-tools-title" className="rounded-2xl border border-stone-200 bg-panel p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="workspace-tools-title" className="text-lg font-semibold text-stone-900">Find a tool</h2><p className="mt-1 text-sm text-stone-600">Every tool for this business, organised by the job it does.</p></div><label className="relative block w-full sm:w-64"><span className="sr-only">Search workspace tools</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Bills, stock, reports…" className="min-h-11 w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm text-stone-900 outline-hidden focus:ring-2 focus:ring-focus" /></label></div>
    <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter tools by work area"><button type="button" onClick={() => setCategory('all')} aria-pressed={category === 'all'} className={`min-h-11 rounded-lg border px-3 text-xs font-medium ${category === 'all' ? 'border-stone-400 bg-stone-100 text-stone-900' : 'border-stone-200 text-stone-600'}`}>All tools</button>{areas.map(area => <button key={area.id} type="button" onClick={() => setCategory(area.id)} aria-pressed={category === area.id} className={`min-h-11 rounded-lg border px-3 text-xs font-medium ${category === area.id ? 'border-stone-400 bg-stone-100 text-stone-900' : 'border-stone-200 text-stone-600'}`}>{area.label}</button>)}</div>
    <div className="mt-6 grid gap-7 md:grid-cols-2 xl:grid-cols-3">{shown.map(area => <div key={area.id}><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">{area.label}</h3><ul>{area.links.map(link => { const open = checkPlanAccess(entitlement, link.href).allowed; return <li key={link.href}><Link href={link.href} prefetch={open} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-stone-700 hover:bg-stone-50"><span>{link.label}</span>{open ? <ArrowRight size={14} className="text-stone-400" aria-hidden="true" /> : <span className="inline-flex items-center gap-1 text-[10px] text-stone-500"><LockKeyhole size={11} aria-hidden="true" />Plan required</span>}</Link></li>;})}</ul></div>)}</div>
    {shown.length === 0 ? <p role="status" className="py-8 text-center text-sm text-stone-600">No matching tools. Try another word or choose All tools.</p> : null}
  </section>;
}
