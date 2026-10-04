import type { ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padded?: boolean;
};

export function Card({ children, className = '', hover = false, padded = true }: CardProps) {
  const base = 'rounded-2xl border border-slate-200/80 bg-white shadow-card';
  const hoverCls = hover ? 'transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-brand-200' : '';
  const pad = padded ? 'p-5 md:p-6' : '';
  return <div className={`${base} ${hoverCls} ${pad} ${className}`}>{children}</div>;
}

export function CardTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon ? <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</span> : null}
      <h2 className="text-base font-semibold text-slate-900">{children}</h2>
    </div>
  );
}
