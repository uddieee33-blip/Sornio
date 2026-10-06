'use client';

import { useState } from 'react';
import { Megaphone, Plus, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/business-data';
import { useDukaanStore, type MarketingCampaign } from '@/lib/store';

const inputClass = 'w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 placeholder-stone-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';
const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-600';

const CHANNELS: MarketingCampaign['channel'][] = ['Social Media', 'Google Ads', 'Print', 'Radio', 'Events', 'Referrals', 'Other'];

export default function MarketingPage() {
  const { state, actions } = useDukaanStore();
  const [form, setForm] = useState({ name: '', channel: 'Social Media' as MarketingCampaign['channel'], spend: '', notes: '' });
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const totalSpend = state.campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
  const marketingExpenses = state.transactions
    .filter((tx) => tx.type === 'expense' && tx.direction === 'out' && /marketing/i.test(tx.description))
    .reduce((sum, tx) => sum + tx.amount, 0);

  const handleSubmit = () => {
    const result = actions.addCampaign({ name: form.name, channel: form.channel, spend: Number(form.spend || 0), notes: form.notes });
    if (result.ok) {
      setMessage({ tone: 'ok', text: Number(form.spend || 0) > 0 ? `Campaign recorded — the spend was also booked as a real marketing expense.` : `Campaign recorded (no spend yet).` });
      setForm({ name: '', channel: 'Social Media', spend: '', notes: '' });
    } else {
      setMessage({ tone: 'error', text: result.error ?? 'Could not add campaign.' });
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <PageHeader
        eyebrow="Growth"
        title="Marketing"
        subtitle="Track campaigns and their spend — spend is booked as a real expense, never a guess."
        actions={<Badge tone="violet" dot>{state.campaigns.length} campaigns</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-2 animate-fade-up">
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700"><Megaphone size={18} /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Campaign spend (tracked here)</p>
              <p className="font-display text-xl font-bold text-stone-900 tabular-nums">{formatCurrency(totalSpend)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600"><TrendingUp size={18} /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Marketing expense in ledger</p>
              <p className="font-display text-xl font-bold text-stone-900 tabular-nums">{formatCurrency(marketingExpenses)}</p>
            </div>
          </div>
          <p className="mt-2.5 text-xs text-stone-600">Includes marketing-category expenses recorded on the Expenses page.</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="animate-fade-up h-fit">
          <div className="mb-5"><CardTitle icon={<Plus size={17} />}>Add campaign</CardTitle></div>
          <div className="space-y-4">
            <div><span className={labelClass}>Campaign name *</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. Diwali Offers" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><span className={labelClass}>Channel</span>
                <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as MarketingCampaign['channel'] })} className={inputClass}>
                  {CHANNELS.map((channel) => <option key={channel}>{channel}</option>)}
                </select>
              </div>
              <div><span className={labelClass}>Spend (₹)</span>
                <input type="number" min={0} value={form.spend} onChange={(e) => setForm({ ...form, spend: e.target.value })} className={inputClass} placeholder="0" />
              </div>
            </div>
            <div><span className={labelClass}>Notes</span>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} placeholder="What did you run?" />
            </div>
          </div>
          {message ? (
            <p className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20' : 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20'}`}>{message.text}</p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button onClick={handleSubmit}><Plus size={16} /> Record campaign</Button>
          </div>
        </Card>

        <Card className="animate-fade-up">
          <div className="mb-5 flex items-center justify-between">
            <CardTitle icon={<Megaphone size={17} />}>Campaigns</CardTitle>
          </div>
          {state.campaigns.length === 0 ? (
            <EmptyState icon={Megaphone} title="No campaigns yet" description="Record your first marketing activity. Any spend you enter is automatically booked as a real marketing expense in the ledger." />
          ) : (
            <div className="space-y-3">
              {state.campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4 transition hover:border-violet-400/30">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-stone-900">{campaign.name}</p>
                      <p className="text-xs text-stone-600">{campaign.channel} · started {campaign.startDate}</p>
                    </div>
                    <Badge tone="violet">{formatCurrency(campaign.spend)}</Badge>
                  </div>
                  {campaign.notes ? <p className="mt-2 text-sm text-stone-600">{campaign.notes}</p> : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
