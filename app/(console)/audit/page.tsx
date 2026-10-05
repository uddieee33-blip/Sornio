'use client';

import { useMemo, useState } from 'react';
import { History, ScrollText } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDukaanStore } from '@/lib/store';

const typeTones: Record<string, BadgeTone> = {
  sale: 'emerald', expense: 'red', product: 'brand', customer: 'sky', membership: 'violet', invoice: 'amber', marketing: 'violet', settings: 'slate', system: 'slate',
};

function formatStamp(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AuditPage() {
  const { state } = useDukaanStore();
  const [filter, setFilter] = useState('all');

  const types = useMemo(() => Array.from(new Set(state.audit.map((entry) => entry.type))), [state.audit]);
  const visible = state.audit.filter((entry) => filter === 'all' || entry.type === filter);

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8">
      <PageHeader
        eyebrow="Analysis"
        title="Audit History"
        subtitle="Every important financial and business change, timestamped and traceable — written as it happens."
        actions={<Badge tone="brand" dot>{state.audit.length} records</Badge>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 animate-fade-up">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${filter === 'all' ? 'bg-brand-500/15 text-brand-600 ring-brand-400/30' : 'text-stone-600 ring-stone-200 hover:bg-stone-50 hover:text-stone-700'}`}
        >
          All
        </button>
        {types.map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize ring-1 ring-inset transition ${filter === type ? 'bg-brand-500/15 text-brand-600 ring-brand-400/30' : 'text-stone-600 ring-stone-200 hover:bg-stone-50 hover:text-stone-700'}`}
          >
            {type}
          </button>
        ))}
      </div>

      {state.audit.length === 0 ? (
        <EmptyState icon={History} title="No audit records yet" description="Sales, payments, expenses, stock changes, catalog edits, and membership actions are recorded here automatically with timestamps and references." />
      ) : (
        <Card className="animate-fade-up">
          <div className="space-y-3">
            {visible.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3.5 rounded-2xl border border-stone-200 bg-stone-50 p-4 transition hover:border-brand-400/25 hover:bg-stone-100">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-600">
                  <ScrollText size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={typeTones[entry.type] ?? 'slate'}>{entry.type}</Badge>
                    <span className="text-xs text-stone-600">{formatStamp(entry.createdAt)}</span>
                    {entry.reference ? <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600">{entry.reference}</span> : null}
                  </div>
                  <p className="mt-1.5 text-sm text-stone-700">{entry.summary}</p>
                  <p className="mt-0.5 text-xs text-stone-600">by {entry.actor}</p>
                </div>
              </div>
            ))}
            {visible.length === 0 ? <p className="rounded-2xl bg-stone-50 p-6 text-sm text-stone-600">No records of this type yet.</p> : null}
          </div>
        </Card>
      )}
    </div>
  );
}
