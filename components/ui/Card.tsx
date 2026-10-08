import type { ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padded?: boolean;
  /**
   * Blur everything inside while the privacy screen is on. For cards whose
   * whole content is a figure — takings, balances, the udhaar khata.
   */
  sensitive?: boolean;
};

export function Card({ children, className = '', hover = false, padded = true, sensitive = false }: CardProps) {
  const base = 'min-w-0 rounded-2xl bg-white ring-1 ring-stone-200 shadow-card backdrop-blur-xs';
  // The lift is `transform`, not `margin` or `top`: it stays on the compositor,
  // so hovering a grid of twenty cards costs no layout. The shadow grows with
  // it, because a surface that rises without its shadow following reads as a
  // glitch rather than as depth.
  const hoverCls = hover
    ? 'transition-all duration-slow ease-settle hover:-translate-y-0.5 hover:bg-stone-50 hover:ring-brand-400/30 hover:shadow-card-hover'
    : '';
  const pad = padded ? 'p-5 md:p-6' : '';
  return (
    <div className={`${base} ${hoverCls} ${pad} ${className}`} {...(sensitive ? { 'data-sensitive': '' } : {})}>
      {children}
    </div>
  );
}

export function CardTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon ? (
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-200">
          {icon}
        </span>
      ) : null}
      <h2 className="font-display text-base font-semibold text-stone-900">{children}</h2>
    </div>
  );
}
