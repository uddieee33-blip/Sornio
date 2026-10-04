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
    { label: 'Revenue', score: health.revenueHealth, max: 25, color: '#10b981' },
    { label: 'Profitability', score: health.profitabilityHealth, max: 25, color: '#6366f1' },
    { label: 'Cash flow', score: health.cashFlowHealth, max: 20, color: '#0ea5e9' },
    { label: 'Customers', score: health.customerHealth, max: 15, color: '#f59e0b' },
    { label: 'Membership', score: health.membershipHealth, max: 15, color: '#ec4899' },
  ];

  const TrendIcon = health.growthTrend === 'down' ? TrendingDown : TrendingUp;

  return (
    <div className="relative min-h-screen bg-soft">
      <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
      <div className="relative mx-auto max-w-6xl p-6 md:p-8">
        <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-brand-600"><Brain size={14} /> AI Insights</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Business intelligence</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">Health, insights, and growth tips regenerate from live invoices, subscriptions, and the ledger.</p>
          </div>
          <Badge tone={health.growthTrend === 'down' ? 'red' : 'emerald'} dot>
            <span className="inline-flex items-center gap-1"><TrendIcon size={13} /> {trendLabels[health.growthTrend]}</span>
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <Card className="animate-fade-up relative overflow-hidden">
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-100 blur-2xl" />
              <div className="relative mb-5 flex items-center justify-between">
                <CardTitle icon={<Gauge size={17} />}>Business health</CardTitle>
                <Badge tone="brand">{snapshot.activeMembers} active members</Badge>
              </div>
              <div className="relative flex flex-col items-center gap-6 sm:flex-row">
                <Ring value={health.overallScore} max={100} size={132} strokeWidth={12} color="#4f46e5" track="#eef2ff" label={`${health.overallScore}`} sublabel="/ 100" />
                <div className="w-full space-y-3">
                  {healthBars.map((bar) => (
                    <div key={bar.label}>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                        <span className="font-medium">{bar.label}</span>
                        <span className="tabular-nums">{bar.score}/{bar.max}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min((bar.score / bar.max) * 100, 100)}%`, backgroundColor: bar.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative mt-6 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-medium text-slate-500">Revenue</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatCurrency(snapshot.totalRevenue)}</p>
                  <Sparkline data={trendSeries(snapshot.totalRevenue, 8, 0.2, 5)} width={140} height={30} />
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-medium text-slate-500">Pending payments</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatCurrency(snapshot.pendingPayments)}</p>
                  <Sparkline data={trendSeries(Math.max(snapshot.pendingPayments, 1), 8, 0.3, 6)} width={140} height={30} stroke="#f59e0b" fill="rgba(245,158,11,0.12)" />
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
                  <div key={tip.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition hover:border-brand-200 hover:bg-white hover:shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{tip.title}</p>
                      <div className="flex shrink-0 gap-1.5">
                        <Badge tone="violet">{tip.difficulty}</Badge>
                        <Badge tone="slate">{tip.estimatedTime}</Badge>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{tip.description}</p>
                    <p className="mt-2 text-xs text-slate-500"><span className="font-semibold text-slate-700">How:</span> {tip.implementation}</p>
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Rocket size={13} /> {tip.expectedImpact}</p>
                  </div>
                ))}
                {tips.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No growth opportunities detected right now.</p> : null}
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
                  <div key={insight.id} className="rounded-2xl border border-slate-100 p-4 transition hover:border-brand-200 hover:shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge tone={tone.badge}>{tone.label}</Badge>
                        <p className="font-semibold text-slate-900">{insight.title}</p>
                      </div>
                      <Badge tone={insight.priority === 'high' ? 'red' : insight.priority === 'medium' ? 'amber' : 'slate'} dot>
                        {insight.priority}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{insight.description}</p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                        {insight.metricLabel}:{' '}
                        <strong className="text-slate-900 tabular-nums">
                          {insight.metricLabel.toLowerCase().includes('margin')
                            ? `${insight.metric.toFixed(1)}%`
                            : Number.isInteger(insight.metric)
                              ? insight.metric
                              : formatCurrency(insight.metric)}
                        </strong>
                      </span>
                      {insight.actionable && insight.action ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-700">→ {insight.action}</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {insights.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No insights yet. Record sales and memberships to generate intelligence.</p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
