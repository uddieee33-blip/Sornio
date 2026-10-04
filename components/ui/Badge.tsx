import type { ReactNode } from 'react';

export type BadgeTone = 'emerald' | 'amber' | 'red' | 'sky' | 'violet' | 'slate' | 'brand';

const tones: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
};

const dots: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-400',
  brand: 'bg-brand-500',
};

export function Badge({ children, tone = 'slate', dot = false }: { children: ReactNode; tone?: BadgeTone; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {dot ? <span className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} /> : null}
      {children}
    </span>
  );
}
