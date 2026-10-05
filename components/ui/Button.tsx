import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-gradient text-white shadow-glow hover:brightness-110 active:brightness-95',
  secondary: 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 hover:border-stone-300',
  ghost: 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
  danger: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
