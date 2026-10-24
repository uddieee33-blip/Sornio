import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-stone-900 text-white hover:opacity-90',
  secondary: 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 hover:border-stone-300',
  ghost: 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
  danger: 'border border-red-200 bg-red-500/10 text-red-700 hover:bg-red-500/15',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

/** Shared operational control. Form submit behavior is preserved for callers. */
export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      data-variant={variant}
      className={`ui-button touch-manipulation inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-base ease-settle disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

