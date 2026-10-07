import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-gradient text-white shadow-glow hover:brightness-110 hover:shadow-card-hover active:brightness-95',
  secondary: 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 hover:border-stone-300',
  ghost: 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
  danger: 'border border-red-200 bg-red-500/10 text-red-700 hover:bg-red-500/15',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

/**
 * The console's button.
 *
 * The press feedback is not here — it is a global rule in `globals.css` that
 * scales *every* enabled button by 0.97 on `:active`. That is deliberate: the
 * cue has to fire on the browser's own `:active` state, before React hears
 * about the tap, because a counter runs on cheap screens with 150ms of touch
 * latency and an owner who gets no feedback taps again. A component-level
 * handler would be a frame or two too late and would miss every button in the
 * codebase that is a plain `<button>`.
 *
 * What is here is the hover lift, which only applies where a pointer exists,
 * and durations that divide by the owner's motion dial.
 */
export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`touch-manipulation inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-base ease-settle disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
