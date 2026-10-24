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
  const base = 'surface-card min-w-0 rounded-2xl bg-white ring-1 ring-stone-200 shadow-card';
  // Quiet feedback keeps dense operational pages stable under the pointer.
  const hoverCls = hover
    ? 'transition-colors duration-base hover:bg-stone-50 hover:ring-stone-300'
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
    <div className="ui-card-heading flex items-center gap-2.5">
      {icon ? (
        <span aria-hidden="true" className="ui-card-mark flex h-8 w-8 items-center justify-center rounded-lg bg-stone-50 text-stone-600 ring-1 ring-inset ring-stone-200">
          {icon}
        </span>
      ) : null}
      <h2 className="font-display text-base font-semibold text-stone-900">{children}</h2>
    </div>
  );
}

