import type { Config } from 'tailwindcss';

/**
 * Every colour in DukaanOS is a variable.
 *
 * Not a convention — a mechanism. `text-stone-600`, `bg-white`,
 * `ring-brand-500/20` and `bg-emerald-500/10` are already written across 163
 * files; rather than rewrite them for a dark mode, the *scales themselves*
 * resolve to CSS custom properties that `app/themes.css` defines once per
 * paint. Flipping `data-theme` on <html> therefore repaints screens nobody
 * remembered to visit, and a new paint is a data change in
 * `lib/theme/palettes.json` rather than a second stylesheet to keep in sync.
 *
 * `<alpha-value>` is the part that makes it work: Tailwind substitutes the
 * opacity modifier into the `rgb()` call, so `/10` tints and `/20` rings keep
 * behaving exactly as they did with literal hex.
 *
 * Two deliberate exceptions:
 *  - `white` is the *card surface*, so it goes dark in a dark paint. Text that
 *    must stay white on a filled accent reads `--c-onaccent`, wired to the
 *    handful of `text-white` utilities in `app/globals.css`.
 *  - semantic hues (emerald/amber/red/…) keep their meaning in every paint —
 *    red is red — but their ramps flip in dark mode so coloured *text* lightens
 *    while coloured *fills* that carry white labels stay dark enough to read.
 */

const ramp = (name: string) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [
      step,
      `rgb(var(--c-${name}-${step}) / <alpha-value>)`,
    ]),
  ) as Record<string, string>;

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /** The page behind everything, and the card on top of it. */
        ink: 'rgb(var(--c-page) / <alpha-value>)',
        panel: 'rgb(var(--c-white) / <alpha-value>)',
        /** One step above a card — menus, popovers, the raised row. */
        lift: 'rgb(var(--c-lift) / <alpha-value>)',
        /** The card surface. Dark in a dark paint; see the note above. */
        white: 'rgb(var(--c-white) / <alpha-value>)',
        black: 'rgb(var(--c-black) / <alpha-value>)',
        /** Foreground that sits on a filled accent and must never invert. */
        onaccent: 'rgb(var(--c-onaccent) / <alpha-value>)',

        /**
         * Portal accent — the colour of the business type currently loaded,
         * layered on top of whichever paint is active. A gym console can be
         * teal, a cafe amber and a kirana blue, in Midnight or in Daylight,
         * without shipping a stylesheet for each combination.
         */
        portal: {
          DEFAULT: 'rgb(var(--portal-accent, 40 98 59) / <alpha-value>)',
          deep: 'rgb(var(--portal-accent-deep, 17 50 31) / <alpha-value>)',
        },

        stone: ramp('stone'),
        // The console only ever used `zinc` for two marks; alias it to the
        // neutral ramp so there is one neutral, not two that drift apart.
        zinc: ramp('stone'),
        brand: ramp('brand'),
        emerald: ramp('emerald'),
        amber: ramp('amber'),
        red: ramp('red'),
        rose: ramp('rose'),
        sky: ramp('sky'),
        violet: ramp('violet'),
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk Variable"', '"Inter Variable"', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        // Depth is a paint decision too: a light paint casts warm ink downwards
        // and catches a white highlight on the top edge; a dark paint has
        // nothing darker to cast, so it deepens and rim-lights instead. Both
        // read as "this surface is above that one" without being restyled.
        card: '0 1px 0 0 var(--c-highlight) inset, 0 8px 24px -16px rgb(var(--c-shadow) / var(--shadow-strength))',
        'card-hover':
          '0 1px 0 0 var(--c-highlight) inset, 0 16px 40px -16px rgb(var(--portal-accent) / calc(var(--shadow-strength) * 0.9))',
        glow: '0 10px 26px -12px rgb(var(--c-brand-500) / calc(var(--shadow-strength) * 1.5))',
        'glow-sm': '0 5px 14px -7px rgb(var(--c-brand-500) / calc(var(--shadow-strength) * 1.3))',
        float:
          '0 24px 64px -24px rgb(var(--c-shadow) / calc(var(--shadow-strength) * 1.1)), 0 2px 8px -2px rgb(var(--c-shadow) / calc(var(--shadow-strength) * 0.6))',
        'inner-top': '0 1px 0 0 var(--c-highlight) inset',
        /** The lift a card takes on press — tight, close to the surface. */
        press: '0 1px 2px 0 rgb(var(--c-shadow) / calc(var(--shadow-strength) * 0.5))',
      },
      backgroundImage: {
        'brand-gradient': 'var(--c-brand-gradient)',
        'page-glow':
          'radial-gradient(1000px 600px at 82% -10%, var(--c-glow-a), transparent 62%), radial-gradient(900px 520px at 0% 110%, var(--c-glow-b), transparent 62%)',
        shimmer:
          'linear-gradient(90deg, rgb(var(--c-stone-500) / 0.04) 0%, rgb(var(--c-stone-500) / 0.11) 50%, rgb(var(--c-stone-500) / 0.04) 100%)',
      },
      transitionTimingFunction: {
        // One vocabulary of easing, named for what it feels like rather than
        // for its control points. `spring` overshoots; `settle` does not.
        settle: 'cubic-bezier(0.22, 1, 0.36, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        swift: 'cubic-bezier(0.4, 0, 0.2, 1)',
        exit: 'cubic-bezier(0.4, 0, 1, 1)',
      },
      transitionDuration: {
        // Every duration is multiplied by `--motion-scale`, which the owner
        // controls in Appearance (Full / Calm / Off) and which collapses to 0
        // for `prefers-reduced-motion`. One knob, the whole console obeys.
        instant: 'calc(90ms * var(--motion-scale, 1))',
        quick: 'calc(150ms * var(--motion-scale, 1))',
        base: 'calc(220ms * var(--motion-scale, 1))',
        slow: 'calc(360ms * var(--motion-scale, 1))',
        lazy: 'calc(560ms * var(--motion-scale, 1))',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-0.75rem)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(0.75rem)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        // Exits. A sheet that leaves the way it arrived tells the eye where it
        // went; one that is simply deleted reads as a dropped frame. They
        // travel slightly further than their entrances and accelerate rather
        // than decelerate, because nobody is waiting on an exit.
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'slide-out-left': {
          '0%': { opacity: '1', transform: 'translateX(0)' },
          '100%': { opacity: '0', transform: 'translateX(-1rem)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.94) translateY(8px)' },
          '60%': { opacity: '1', transform: 'scale(1.006) translateY(0)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'sheet-up': {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.995)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'ring-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--portal-accent) / 0.35)' },
          '70%': { boxShadow: '0 0 0 10px rgb(var(--portal-accent) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--portal-accent) / 0)' },
        },
        'sweep-right': {
          '0%': { transform: 'translateX(-110%)' },
          '100%': { transform: 'translateX(210%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up calc(450ms * var(--motion-scale, 1)) cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in calc(400ms * var(--motion-scale, 1)) ease-out both',
        shimmer: 'shimmer calc(1600ms * var(--motion-scale, 1)) linear infinite',
        'slide-in-left': 'slide-in-left calc(240ms * var(--motion-scale, 1)) cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-right': 'slide-in-right calc(240ms * var(--motion-scale, 1)) cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-out': 'fade-out calc(180ms * var(--motion-scale, 1)) cubic-bezier(0.4, 0, 1, 1) both',
        'slide-out-left': 'slide-out-left calc(180ms * var(--motion-scale, 1)) cubic-bezier(0.4, 0, 1, 1) both',
        'pop-in': 'pop-in calc(380ms * var(--motion-scale, 1)) cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in calc(200ms * var(--motion-scale, 1)) cubic-bezier(0.22, 1, 0.36, 1) both',
        'sheet-up': 'sheet-up calc(320ms * var(--motion-scale, 1)) cubic-bezier(0.22, 1, 0.36, 1) both',
        breathe: 'breathe calc(2200ms * var(--motion-scale, 1)) ease-in-out infinite',
        'ring-pulse': 'ring-pulse calc(2000ms * var(--motion-scale, 1)) ease-out infinite',
        'sweep-right': 'sweep-right calc(1400ms * var(--motion-scale, 1)) cubic-bezier(0.4, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
