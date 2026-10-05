import type { LucideIcon } from 'lucide-react';
import { Sparkline } from './Sparkline';

export type StatTone = 'emerald' | 'blue' | 'violet' | 'amber' | 'brand' | 'rose';

const chipTones: Record<StatTone, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
  blue: 'bg-sky-500/10 text-sky-400 ring-sky-500/20',
  violet: 'bg-violet-500/10 text-violet-400 ring-violet-500/20',
  amber: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
  brand: 'bg-brand-500/10 text-brand-300 ring-brand-500/20',
  rose: 'bg-rose-500/10 text-rose-400 ring-rose-500/20',
};

const sparkTones: Record<StatTone, string> = {
  emerald: '#287347',
  blue: '#27728c',
  violet: '#7457a6',
  amber: '#a16c1c',
  brand: '#28623b',
  rose: '#b84c58',
};

const fillTones: Record<StatTone, string> = {
  emerald: 'rgba(40,115,71,0.12)',
  blue: 'rgba(39,114,140,0.12)',
  violet: 'rgba(116,87,166,0.12)',
  amber: 'rgba(161,108,28,0.12)',
  brand: 'rgba(40,98,59,0.14)',
  rose: 'rgba(184,76,88,0.12)',
};

type StatCardProps = {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: StatTone;
  delta?: string;
  deltaTone?: 'up' | 'down';
  spark?: number[];
};

export function StatCard({ label, value, icon: Icon, tone = 'brand', delta, deltaTone = 'up', spark }: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/[0.07] shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:ring-brand-400/30 hover:shadow-card-hover">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-[0.10] blur-2xl transition-opacity group-hover:opacity-[0.2]" style={{ backgroundColor: sparkTones[tone] }} />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-zinc-400">{label}</p>
          <p className="mt-2 truncate font-display text-2xl font-bold tracking-tight text-white tabular-nums">{value}</p>
        </div>
        {Icon ? (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${chipTones[tone]}`}>
            <Icon size={19} strokeWidth={2.2} />
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex h-9 items-end justify-between gap-3">
        {delta ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${deltaTone === 'up' ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' : 'bg-red-500/10 text-red-400 ring-red-500/20'}`}>
            {deltaTone === 'up' ? '▲' : '▼'} {delta}
          </span>
        ) : (
          <span />
        )}
        {spark && spark.length > 1 ? (
          <Sparkline data={spark} width={104} height={34} stroke={sparkTones[tone]} fill={fillTones[tone]} />
        ) : null}
      </div>
    </div>
  );
}
