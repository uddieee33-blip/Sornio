'use client';

import { useMemo } from 'react';
import { Brain, Gauge, Lightbulb, Rocket, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Ring } from '@/components/ui/Ring';
import { Sparkline } from '@/components/ui/Sparkline';
import { formatCurrency } from '@/lib/business-data';
import { toBusinessSnapshot } from '@/lib/models/business';
import { AiInsightsEngine } from '@/lib/services/ai-insights';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';
import { trendSeries } from '@/lib/trend';

const insightTones: Record<string, { badge: 'sky' | 'red' | 'amber' | 'emerald'; label: string }> = {
  trend: { badge: 'sky', label: 'Trend' },
  warning: { badge: 'red', label: 'Warning' },
  opportunity: { badge: 'amber', label: 'Opportunity' },
  growth: { badge: 'emerald', label: 'Growth' },
};

const trendLabels: Record<string, string> = { up: 'Trending up', down: 'Trending down', stable: 'Stable' };

export default function InsightsPage() {
  const { state } = useDukaanStore();
  const financial = useFinancialSnapshot();

  const { health, insights, tips, snapshot } = useMemo(() => {
    const pendingPayments = state.invoices
      .filter((invoice) => invoice.paymentStatus === 'pending' || invoice.paymentStatus === 'partial')
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const activeMembers = state.subscriptions.filter(
      (subscription) => subscription.status === 'active' || subscription.status === 'expiring_soon',
    ).length;
    const universalSnapshot = toBusinessSnapshot(financial, { activeMembers, pendingPayments });
    return {
      snapshot: universalSnapshot,
      health: AiInsightsEngine.calculateBusinessHealth(universalSnapshot, state.invoices, state.subscriptions),
      insights: AiInsightsEngine.generateInsights(universalSnapshot, state.invoices, state.subscriptions),
      tips: AiInsightsEngine.generateTips(universalSnapshot, state.invoices, state.subscriptions),
    };
  }, [financial, state.invoices, state.subscriptions]);

  const healthBars = [
    { label: 'Revenue', score: health.revenueHealth, max: 25, color: '#34d399' },
    { label: 'Profitability', score: health.profitabilityHealth, max: 25, color: '#818cf8' },
    { label: 'Cash flow', score: health.cashFlowHealth, max: 20, color: '#38bdf8' },
    { label: 'Customers', score: health.customerHealth, max: 15, color: '#fbbf24' },
    { label: 'Membership', score: health.membershipHealth, max: 15, color: '#f472b6' },
  ];

  const TrendIcon = health.growthTrend === 'down' ? TrendingDown : TrendingUp;

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-8">
      <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-brand-300"><Brain size={14} /> AI Insights</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white md:text-3xl">Business intelligence</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Health, insights, and growth tips regenerate from live invoices, subscriptions, and the ledger.</p>
        </div>
        <Badge tone={health.growthTrend === 'down' ? 'red' : 'emerald'} dot>
          <span className="inline-flex items-center gap-1"><TrendIcon size={13} /> {trendLabels[health.growthTrend]}</span>
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <Card className="animate-fade-up relative overflow-hidden">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-brand-500/15 blur-3xl" />
            <div className="relative mb-5 flex items-center justify-between">
              <CardTitle icon={<Gauge size={17} />}>Business health</CardTitle>
              <Badge tone="brand">{snapshot.activeMembers} active members</Badge>
            </div>
            <div className="relative flex flex-col items-center gap-6 sm:flex-row">
              <Ring value={health.overallScore} max={100} size={132} strokeWidth={12} label={`${health.overallScore}`} sublabel="/ 100" />
              <div className="w-full space-y-3">
                {healthBars.map((bar) => (
                  <div key={bar.label}>
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
                      <span className="font-medium">{bar.label}</span>
                      <span className="tabular-nums">{bar.score}/{bar.max}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min((bar.score / bar.max) * 100, 100)}%`, backgroundColor: bar.color, boxShadow: `0 0 12px ${bar.color}66` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.06]">
                <p className="text-xs font-medium text-zinc-500">Revenue</p>
                <p className="mt-1 font-display text-lg font-bold text-white tabular-nums">{formatCurrency(snapshot.totalRevenue)}</p>
                <Sparkline data={trendSeries(snapshot.totalRevenue, 8, 0.2, 5)} width={140} height={30} stroke="#34d399" fill="rgba(52,211,153,0.12)" />
              </div>
              <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.06]">
                <p className="text-xs font-medium text-zinc-500">Pending payments</p>
                <p className="mt-1 font-display text-lg font-bold text-white tabular-nums">{formatCurrency(snapshot.pendingPayments)}</p>
                <Sparkline data={trendSeries(Math.max(snapshot.pendingPayments, 1), 8, 0.3, 6)} width={140} height={30} stroke="#fbbf24" fill="rgba(251,191,36,0.12)" />
              </div>
            </div>
          </Card>

          <Card className="animate-fade-up">
            <div className="mb-5 flex items-center justify-between">
              <CardTitle icon={<Lightbulb size={17} />}>Growth tips</CardTitle>
              <Badge tone="violet">{tips.length} ideas</Badge>
            </div>
            <div className="space-y-3">
              {tips.map((tip) => (
                <div key={tip.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 transition hover:border-brand-400/30 hover:shadow-card-hover">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-white">{tip.title}</p>
                    <div className="flex shrink-0 gap-1.5">
                      <Badge tone="violet">{tip.difficulty}</Badge>
                      <Badge tone="slate">{tip.estimatedTime}</Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">{tip.description}</p>
                  <p className="mt-2 text-xs text-zinc-500"><span className="font-semibold text-zinc-300">How:</span> {tip.implementation}</p>
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400"><Rocket size={13} /> {tip.expectedImpact}</p>
                </div>
              ))}
              {tips.length === 0 ? <p className="rounded-2xl bg-white/[0.03] p-4 text-sm text-zinc-500">No growth opportunities detected right now.</p> : null}
            </div>
          </Card>
        </div>

        <Card className="animate-fade-up h-fit">
          <div className="mb-5 flex items-center justify-between">
            <CardTitle icon={<Zap size={17} />}>Live insights</CardTitle>
            <Badge tone="brand" dot>{insights.length} active</Badge>
          </div>
          <div className="space-y-4">
            {insights.map((insight) => {
              const tone = insightTones[insight.type] ?? { badge: 'slate' as const, label: insight.type };
              return (
                <div key={insight.id} className="rounded-2xl border border-white/[0.07] p-4 transition hover:border-brand-400/30 hover:shadow-card-hover">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={tone.badge}>{tone.label}</Badge>
                      <p className="font-semibold text-white">{insight.title}</p>
                    </div>
                    <Badge tone={insight.priority === 'high' ? 'red' : insight.priority === 'medium' ? 'amber' : 'slate'} dot>
                      {insight.priority}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">{insight.description}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="rounded-lg bg-white/[0.04] px-2.5 py-1.5 font-medium text-zinc-400 ring-1 ring-inset ring-white/[0.07]">
                      {insight.metricLabel}:{' '}
                      <strong className="text-white tabular-nums">
                        {insight.metricLabel.toLowerCase().includes('margin')
                          ? `${insight.metric.toFixed(1)}%`
                          : Number.isInteger(insight.metric)
                            ? insight.metric
                            : formatCurrency(insight.metric)}
                      </strong>
                    </span>
                    {insight.actionable && insight.action ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">→ {insight.action}</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {insights.length === 0 ? (
              <p className="rounded-2xl bg-white/[0.03] p-4 text-sm text-zinc-500">No insights yet. Record sales and memberships to generate intelligence.</p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
