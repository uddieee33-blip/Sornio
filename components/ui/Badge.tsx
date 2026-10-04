import type { ReactNode } from 'react';

export type BadgeTone = 'emerald' | 'amber' | 'red' | 'sky' | 'violet' | 'slate' | 'brand';

const tones: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-400 ring-amber-500/25',
  red: 'bg-red-500/10 text-red-400 ring-red-500/25',
  sky: 'bg-sky-500/10 text-sky-400 ring-sky-500/25',
  violet: 'bg-violet-500/10 text-violet-400 ring-violet-500/25',
  slate: 'bg-white/5 text-zinc-400 ring-white/10',
  brand: 'bg-brand-500/10 text-brand-300 ring-brand-500/25',
};

const dots: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
  slate: 'bg-zinc-500',
  brand: 'bg-brand-400',
};

export function Badge({ children, tone = 'slate', dot = false }: { children: ReactNode; tone?: BadgeTone; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {dot ? <span className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} /> : null}
      {children}
    </span>
  );
}
