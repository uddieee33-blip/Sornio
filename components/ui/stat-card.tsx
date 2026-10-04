import type { LucideIcon } from 'lucide-react';
import { Sparkline } from './Sparkline';

export type StatTone = 'emerald' | 'blue' | 'violet' | 'amber' | 'brand' | 'rose';

const chipTones: Record<StatTone, string> = {
  emerald: 'bg-emerald-100 text-emerald-600',
  blue: 'bg-sky-100 text-sky-600',
  violet: 'bg-violet-100 text-violet-600',
  amber: 'bg-amber-100 text-amber-600',
  brand: 'bg-brand-100 text-brand-600',
  rose: 'bg-rose-100 text-rose-600',
};

const sparkTones: Record<StatTone, string> = {
  emerald: '#059669',
  blue: '#0284c7',
  violet: '#7c3aed',
  amber: '#d97706',
  brand: '#4f46e5',
  rose: '#e11d48',
};

const fillTones: Record<StatTone, string> = {
  emerald: 'rgba(5,150,105,0.10)',
  blue: 'rgba(2,132,199,0.10)',
  violet: 'rgba(124,58,237,0.10)',
  amber: 'rgba(217,119,6,0.10)',
  brand: 'rgba(79,70,229,0.10)',
  rose: 'rgba(225,29,72,0.10)',
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
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.07] blur-xl transition-opacity group-hover:opacity-[0.14]" style={{ backgroundColor: sparkTones[tone] }} />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
        </div>
        {Icon ? (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${chipTones[tone]}`}>
            <Icon size={19} strokeWidth={2.2} />
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex h-9 items-end justify-between gap-3">
        {delta ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${deltaTone === 'up' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
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
