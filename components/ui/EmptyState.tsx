import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="ui-empty-state flex flex-col items-center rounded-2xl border border-stone-200 bg-stone-50 px-6 py-12 text-center">
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-stone-600 ring-1 ring-inset ring-stone-200">
        <Icon size={22} />
      </span>
      <h3 className="mt-4 font-display text-lg font-semibold text-stone-900">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-stone-600">{description}</p>
      {children ? <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{children}</div> : null}
    </div>
  );
}
