import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-12 text-center animate-fade-up">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300 ring-1 ring-inset ring-brand-500/20">
        <Icon size={22} />
      </span>
      <h3 className="mt-4 font-display text-lg font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-zinc-500">{description}</p>
      {children ? <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{children}</div> : null}
    </div>
  );
}
