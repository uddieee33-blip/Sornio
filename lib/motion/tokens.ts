/**
 * Motion tokens.
 *
 * One vocabulary for everything that moves, named for what it *feels* like
 * rather than for its control points, so a reviewer can tell whether a choice
 * was right without reading a bezier curve.
 *
 * The rule behind the numbers: a counter is used with a finger, on a cheap
 * screen, by someone who is mid-conversation with a customer. Motion there is
 * not decoration — it is the only cue that a tap was received and that the
 * thing which just appeared came from somewhere. So:
 *
 *   • Feedback the finger caused is **instant** (90ms). Any slower and the
 *     screen feels broken, and the owner taps again.
 *   • Things entering take **base** (220ms) — long enough to be tracked by the
 *     eye, short enough that nobody waits for it.
 *   • Things leaving are **quick** (150ms) and ease *out of* the screen. An
 *     exit the user is waiting on is a bug; an exit they already stopped
 *     caring about is free.
 *   • Nothing animates a property that forces layout. Transform and opacity
 *     only, so the whole console animates on the compositor and a ₹6,000 PC
 *     is not asked to re-layout at 60fps.
 *
 * Every duration here is also exposed to CSS through `--motion-scale`, the
 * single multiplier the owner controls in Appearance (Full / Calm / Off). This
 * module is for the handful of places that animate in JavaScript and therefore
 * cannot read a CSS variable.
 */

export const DURATION = {
  /** Feedback the finger caused. Must beat the next frame the eye expects. */
  instant: 90,
  /** Something leaving, or a small state flip. */
  quick: 150,
  /** The default for something arriving. */
  base: 220,
  /** A panel, a sheet, a modal — bigger things need longer to be read. */
  slow: 360,
  /** A full-page or first-load reveal. */
  lazy: 560,
} as const;

export const EASE = {
  /** Decelerate hard, no overshoot. The workhorse. */
  settle: 'cubic-bezier(0.22, 1, 0.36, 1)',
  /** A small overshoot, for things that should feel physical (a tick, a pop). */
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  /** Symmetric. For colour and opacity, where direction carries no meaning. */
  swift: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Accelerate away. Only for exits. */
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;

/**
 * Stagger between siblings in a list.
 *
 * 45ms is deliberate: fast enough that eight cards finish inside 600ms, slow
 * enough that the eye reads them as a sequence rather than a flicker. Capped,
 * because a hundred-row ledger staggered at 45ms would take four and a half
 * seconds to finish arriving — which is not an animation, it is a wait.
 */
export const STAGGER_STEP = 45;
export const STAGGER_MAX_ITEMS = 12;

export function staggerDelay(index: number, step = STAGGER_STEP): number {
  return Math.min(index, STAGGER_MAX_ITEMS) * step;
}

/** The inline style a staggered child needs. Pairs with `[data-reveal-item]`. */
export function staggerStyle(index: number, step = STAGGER_STEP): React.CSSProperties {
  return { ['--reveal-delay' as string]: `${staggerDelay(index, step)}ms` };
}

/**
 * Keyframes for the Web Animations API, for the two or three places that
 * genuinely need JS (a route transition that has to know the direction, a
 * number that counts). Everything else belongs in CSS.
 */
export const ENTER_UP: Keyframe[] = [
  { opacity: 0, transform: 'translateY(8px)' },
  { opacity: 1, transform: 'translateY(0)' },
];

export const ENTER_DOWN: Keyframe[] = [
  { opacity: 0, transform: 'translateY(-8px)' },
  { opacity: 1, transform: 'translateY(0)' },
];

export const ENTER_FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
