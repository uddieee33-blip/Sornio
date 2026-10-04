import type { ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padded?: boolean;
};

export function Card({ children, className = '', hover = false, padded = true }: CardProps) {
  const base = 'rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.07] shadow-card backdrop-blur-sm';
  const hoverCls = hover ? 'transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.05] hover:ring-brand-400/30 hover:shadow-card-hover' : '';
  const pad = padded ? 'p-5 md:p-6' : '';
  return <div className={`${base} ${hoverCls} ${pad} ${className}`}>{children}</div>;
}

export function CardTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon ? <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/20">{icon}</span> : null}
      <h2 className="font-display text-base font-semibold text-white">{children}</h2>
    </div>
  );
}
