'use client';

import { useMemo } from 'react';
import { formatCurrency } from '@/lib/business-data';
import { toBusinessSnapshot } from '@/lib/models/business';
import { AiInsightsEngine } from '@/lib/services/ai-insights';
import { useDukaanStore, useFinancialSnapshot } from '@/lib/store';

const insightTypeStyles: Record<string, string> = {
  trend: 'bg-blue-50 text-blue-700',
  warning: 'bg-red-50 text-red-700',
  opportunity: 'bg-amber-50 text-amber-700',
  growth: 'bg-emerald-50 text-emerald-700',
};

const priorityStyles: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

const trendLabels: Record<string, string> = {
  up: 'Trending up',
  down: 'Trending down',
  stable: 'Stable',
};

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
    { label: 'Revenue', score: health.revenueHealth, max: 25 },
    { label: 'Profitability', score: health.profitabilityHealth, max: 25 },
    { label: 'Cash flow', score: health.cashFlowHealth, max: 20 },
    { label: 'Customers', score: health.customerHealth, max: 15 },
    { label: 'Membership', score: health.membershipHealth, max: 15 },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">ai insights</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Business intelligence</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Health, insights, and growth tips regenerate from live invoices, subscriptions, and the transaction ledger.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Business health</h2>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  {trendLabels[health.growthTrend]}
                </span>
              </div>

              <div className="mt-5 flex items-center gap-5">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-8 border-emerald-100 bg-white">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-900">{health.overallScore}</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">/ 100</p>
                  </div>
                </div>
                <div className="w-full space-y-3">
                  {healthBars.map((bar) => (
                    <div key={bar.label}>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                        <span>{bar.label}</span>
                        <span>{bar.score}/{bar.max}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.min((bar.score / bar.max) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Revenue</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatCurrency(snapshot.totalRevenue)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Pending payments</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatCurrency(snapshot.pendingPayments)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Growth tips</h2>
              <div className="mt-4 space-y-3">
                {tips.map((tip) => (
                  <div key={tip.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-800">{tip.title}</p>
                      <div className="flex shrink-0 gap-1.5 text-[10px] font-medium">
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 capitalize text-violet-700">{tip.difficulty}</span>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600">{tip.estimatedTime}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{tip.description}</p>
                    <p className="mt-2 text-xs text-slate-500"><span className="font-medium text-slate-700">How:</span> {tip.implementation}</p>
                    <p className="mt-1 text-xs text-emerald-700">{tip.expectedImpact}</p>
                  </div>
                ))}
                {tips.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                    No growth opportunities detected right now.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Live insights</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{insights.length} active</span>
            </div>
            <div className="mt-4 space-y-4">
              {insights.map((insight) => (
                <div key={insight.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${insightTypeStyles[insight.type]}`}>
                        {insight.type}
                      </span>
                      <p className="font-medium text-slate-900">{insight.title}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${priorityStyles[insight.priority]}`}>
                      {insight.priority} priority
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{insight.description}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="rounded-lg bg-slate-50 px-2 py-1 text-slate-600 ring-1 ring-slate-200">
                      {insight.metricLabel}:{' '}
                      <strong className="text-slate-900">
                        {insight.metricLabel.toLowerCase().includes('margin')
                          ? `${insight.metric.toFixed(1)}%`
                          : Number.isInteger(insight.metric)
                            ? insight.metric
                            : formatCurrency(insight.metric)}
                      </strong>
                    </span>
                    {insight.actionable && insight.action ? (
                      <span className="rounded-lg bg-emerald-50 px-2 py-1 font-medium text-emerald-700">→ {insight.action}</span>
                    ) : null}
                  </div>
                </div>
              ))}
              {insights.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  No insights yet. Record sales and memberships to generate intelligence.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
