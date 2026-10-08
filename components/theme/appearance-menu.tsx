'use client';

/**
 * Appearance — the paint shop, in the menu.
 *
 * The console used to keep its appearance controls on one screen inside
 * Settings, which meant the most common appearance action — the sun went down
 * and the owner cannot read the takings — was four taps away from where it
 * happened. This component is the correction: the same four dials, opened from
 * wherever the owner is standing.
 *
 * It is one component with two shapes, because the same controls belong in two
 * different places:
 *
 *   • `bar` — the top bar. The left half flips between the owner's last light
 *     paint and their last dark one (one tap, no menu), the right half opens
 *     the full panel.
 *   • `row` — the sidebar footer and the mobile drawer, where there is room for
 *     a label and the name of the paint currently on screen.
 *
 * Three details that are easy to get wrong and are load-bearing here:
 *
 *   1. **The panel is portalled to `document.body`.** The top bar is
 *      `sticky` + `backdrop-blur`, and `backdrop-filter` makes an element a
 *      containing block for fixed-position descendants — so a panel rendered
 *      inside it would be positioned against the header rather than the
 *      viewport, and would be trapped in the header's stacking context. The
 *      portal sidesteps both.
 *   2. **It is placed with `position: fixed` and clamped to the viewport**
 *      rather than with `absolute`, so it cannot be clipped by a scrolling
 *      ancestor or hang off the edge of a small screen. It flips above the
 *      trigger when there is no room below, which is the case in the sidebar
 *      footer on a short laptop.
 *   3. **It is a real dialog, not a decorative div.** Escape closes it, focus
 *      moves into it and is trapped while it is open, focus returns to the
 *      trigger on close, and an outside pointer dismisses it — a popover that
 *      traps a keyboard user on a shop counter is worse than no popover.
 *
 * Every change applies the instant it is tapped: the provider writes the choice
 * to this device and to the server's cookie, so the next cold load opens in the
 * same paint with no flash of the old one. There is no Save button because
 * there is nothing to validate and nothing that could fail.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  Contrast,
  Eye,
  EyeOff,
  Gauge,
  Monitor,
  Moon,
  Paintbrush,
  RotateCcw,
  Sun,
  Type,
  Waves,
} from 'lucide-react';
import { PaintPreview } from './paint-preview';
import { useAppearance } from '@/lib/theme/appearance-provider';
import {
  DARK_PAINTS,
  LIGHT_PAINTS,
  SYSTEM_PAINT,
  type Density,
  type MotionLevel,
  type Paint,
  type TextScale,
} from '@/lib/theme/palettes';

/* ------------------------------------------------------------------ geometry */

const PANEL_WIDTH = 368;
const PANEL_MAX_HEIGHT = 560;
const VIEWPORT_GUTTER = 12;
const TRIGGER_GAP = 8;

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The panel's own last light and last dark paint.
 *
 * The flip is the most-used control in the console at dusk, and an owner who
 * chose Saffron for the day and Night Market for the evening should get both
 * back when they flip — not Saffron and whatever dark paint happens to be
 * first in the list.
 */
const LAST_LIGHT_KEY = 'dukaanos.paint.lastLight';
const LAST_DARK_KEY = 'dukaanos.paint.lastDark';

function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* appearance is never worth an error */
  }
}

function recall(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Where the panel goes.
 *
 * Measured in a layout effect so it is corrected before the browser paints,
 * and re-measured while open on the two things that can move the trigger out
 * from under it: a window resize and a scroll anywhere in the document (the
 * top bar is sticky, so the page scrolling underneath does move it).
 */
function usePanelPosition(
  open: boolean,
  wrapRef: React.RefObject<HTMLElement | null>,
  preferred: 'above' | 'below',
): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    // Left stale on close on purpose: the panel is not rendered while it is
    // closed, and resetting state in an effect body would cost a render. It is
    // recomputed here — before paint — on the next open, so a trigger that
    // moved while the panel was shut is never drawn in the wrong place.
    if (!open) return;

    const place = () => {
      const anchor = wrapRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2);
      const height = Math.min(PANEL_MAX_HEIGHT, window.innerHeight - VIEWPORT_GUTTER * 2);
      const left = Math.max(
        VIEWPORT_GUTTER,
        Math.min(window.innerWidth - width - VIEWPORT_GUTTER, preferred === 'above' ? rect.left : rect.right - width),
      );

      const below = rect.bottom + TRIGGER_GAP;
      const above = rect.top - TRIGGER_GAP - height;
      const fits = (top: number) => top >= VIEWPORT_GUTTER && top + height <= window.innerHeight - VIEWPORT_GUTTER;
      const wanted = preferred === 'above' ? above : below;
      const flipped = preferred === 'above' ? below : above;

      const top = fits(wanted)
        ? wanted
        : fits(flipped)
          ? flipped
          : Math.max(VIEWPORT_GUTTER, (window.innerHeight - height) / 2);

      // Only publish when the geometry really changed. A scroll that leaves the
      // trigger where it was must not re-render the whole panel.
      setStyle((previous) =>
        previous &&
        previous.top === top &&
        previous.left === left &&
        previous.width === width &&
        previous.maxHeight === height
          ? previous
          : { position: 'fixed', top, left, width, maxHeight: height },
      );
    };

    // One measurement per frame, however many scroll events the browser fires.
    // A scroll of the page can produce dozens of events in a single frame, and
    // measuring on each one is what made the console feel sticky while the
    // panel was open.
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    };

    // A scroll inside the panel itself (the dials list) does not move the
    // trigger, so it is ignored rather than measured.
    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-appearance-panel]')) return;
      schedule();
    };

    place();
    window.addEventListener('resize', schedule);
    // Capture phase: the scroll that moves the trigger may be on any ancestor.
    window.addEventListener('scroll', onScroll, true);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, preferred, wrapRef]);

  return style;
}

/* ------------------------------------------------------------- the panel body */

function Choice<T extends string>({
  value,
  current,
  onSelect,
  children,
}: {
  value: T;
  current: T;
  onSelect: (value: T) => void;
  children: ReactNode;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className={`touch-manipulation inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-all duration-quick ease-settle ${
        active
          ? 'bg-portal-gradient text-white shadow-glow-sm'
          : 'bg-stone-50 text-stone-700 ring-1 ring-inset ring-stone-200 hover:bg-stone-100 hover:text-stone-900'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One dial: a heading, its choices, and why anyone would move it.
 *
 * The heading arrives as `title` rather than `label` on purpose. The i18n
 * extractor collects string literals written into `title=` attributes, and the
 * runtime translates rendered text by looking it up in the catalogue — so this
 * is what keeps "Density" translatable in 22 languages instead of shipping as
 * the only English word on a Punjabi console.
 */
function Dial({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0" title={hint}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-600">
        <span className="text-stone-500">{icon}</span>
        {title}
      </p>
      <div role="group" aria-label={title} className="mt-1.5 flex items-stretch gap-1">
        {children}
      </div>
    </div>
  );
}

/** One paint, as a compact labelled swatch. */
function PaintRow({
  paint,
  selected,
  onSelect,
}: {
  paint: Paint;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors duration-quick ${
        selected ? 'bg-portal/10 text-stone-900' : 'text-stone-700 hover:bg-stone-100'
      }`}
    >
      {/* The swatch is painted by the paint itself — `themes.css` scopes every
          paint to a plain [data-theme] attribute, so nesting it here makes this
          dot genuinely that paint rather than a hex we typed twice. */}
      <span
        data-theme={paint.id}
        aria-hidden
        className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink ring-1 ring-inset ring-stone-300"
      >
        <span className="h-2 w-2 rounded-full bg-portal-gradient" />
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold">{paint.name}</span>
      {selected ? <Check size={11} className="shrink-0 text-portal" /> : null}
    </button>
  );
}

function AppearanceControls() {
  const { appearance, resolved, prefersDark, setTheme, setDensity, setMotion, setText, setPrivacy, reset } =
    useAppearance();

  const systemSelected = appearance.theme === SYSTEM_PAINT;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ------------------------------------------------------------ header */}
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-3.5 py-2.5">
        <p className="flex items-center gap-2 text-sm font-bold text-stone-900">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-portal/[0.10] text-portal">
            <Paintbrush size={13} />
          </span>
          Appearance
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-stone-50 px-2.5 py-1.5 text-[11px] font-bold text-stone-700 ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100 hover:text-stone-900"
        >
          <RotateCcw size={11} /> Reset to defaults
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-2.5 [-webkit-overflow-scrolling:touch]">
        {/* ----------------------------------------------------- match device */}
        <button
          type="button"
          onClick={() => setTheme(SYSTEM_PAINT)}
          aria-pressed={systemSelected}
          data-press="soft"
          className={`flex w-full touch-manipulation items-center gap-2.5 rounded-xl p-2.5 text-left transition-all duration-base ease-settle ${
            systemSelected
              ? 'bg-portal/[0.07] ring-2 ring-portal'
              : 'bg-stone-50 ring-1 ring-inset ring-stone-200 hover:bg-stone-100'
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-stone-700 ring-1 ring-inset ring-stone-200">
            <Monitor size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-stone-900">
              Match my device
              {systemSelected ? <Check size={13} className="text-portal" /> : null}
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-stone-600">
              Warm Daylight by day, Midnight when the phone or the PC switches over.{' '}
              <span className="font-semibold text-stone-700">
                Right now your device is asking for {prefersDark ? 'dark' : 'light'}.
              </span>
            </span>
          </span>
        </button>

        {/* ------------------------------------------ what is on screen now */}
        <div className="mt-2.5 flex items-center gap-3 rounded-xl bg-stone-50 p-2 ring-1 ring-inset ring-stone-200">
          <PaintPreview paint={resolved} className="h-[46px] w-[78px] shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold text-stone-900">{resolved.name}</p>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-stone-600">{resolved.tagline}</p>
          </div>
        </div>

        {/* -------------------------------------------------------- the paints */}
        <p className="mt-3.5 flex items-center gap-1.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-600">
          <Sun size={11} /> Daylight paints
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-0.5">
          {LIGHT_PAINTS.map((paint) => (
            <PaintRow
              key={paint.id}
              paint={paint}
              selected={appearance.theme === paint.id}
              onSelect={() => setTheme(paint.id)}
            />
          ))}
        </div>

        <p className="mt-3 flex items-center gap-1.5 px-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-600">
          <Moon size={11} /> After the shutter comes down
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-0.5">
          {DARK_PAINTS.map((paint) => (
            <PaintRow
              key={paint.id}
              paint={paint}
              selected={appearance.theme === paint.id}
              onSelect={() => setTheme(paint.id)}
            />
          ))}
        </div>

        {/* --------------------------------------------------------- the dials */}
        <div className="mt-3.5 grid grid-cols-1 gap-3">
          <Dial
            icon={<Gauge size={11} />}
            title="Density"
            hint="Compact tightens the padding so a 13-inch till shows twenty rows of a bill instead of twelve. Tap targets stay the same size — a smaller button on a touch screen is a mis-tap, not a saving."
          >
            <Choice<Density> value="comfortable" current={appearance.density} onSelect={setDensity}>
              Comfortable
            </Choice>
            <Choice<Density> value="compact" current={appearance.density} onSelect={setDensity}>
              Compact
            </Choice>
          </Dial>

          <Dial
            icon={<Waves size={11} />}
            title="Motion"
            hint="One multiplier that every animation in the console divides by. Calm halves it; Off means off, not faster. If your device already asks for reduced motion, that is honoured unless you pick Full here on purpose."
          >
            <Choice<MotionLevel> value="full" current={appearance.motion} onSelect={setMotion}>
              Full
            </Choice>
            <Choice<MotionLevel> value="calm" current={appearance.motion} onSelect={setMotion}>
              Calm
            </Choice>
            <Choice<MotionLevel> value="off" current={appearance.motion} onSelect={setMotion}>
              Off
            </Choice>
          </Dial>
        </div>

        <div className="mt-3">
          <Dial
            icon={<Type size={11} />}
            title="Text size"
            hint="Scales the root font size, so every measurement in the console follows it and the frame stays where it is. Browser zoom scales the layout too, which is what breaks a fixed sidebar on a small screen."
          >
            {(['90', '100', '110', '125'] as TextScale[]).map((size) => (
              <Choice<TextScale> key={size} value={size} current={appearance.text} onSelect={setText}>
                {size}%
              </Choice>
            ))}
          </Dial>
        </div>

        <div className="mt-3">
          <Dial
            icon={<Contrast size={11} />}
            title="Privacy screen"
            hint="Blurs every figure on screen until you hover or tap it, and re-blurs the instant this window loses focus. A shop counter is a public place. It is a screen, not encryption — the real lock is the PIN in Settings."
          >
            <Choice<'off' | 'on'>
              value="off"
              current={appearance.privacy ? 'on' : 'off'}
              onSelect={() => setPrivacy(false)}
            >
              <Eye size={12} /> Off
            </Choice>
            <Choice<'off' | 'on'>
              value="on"
              current={appearance.privacy ? 'on' : 'off'}
              onSelect={() => setPrivacy(true)}
            >
              <EyeOff size={12} /> Blur figures
            </Choice>
          </Dial>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the trigger */

export function AppearanceMenu({
  variant = 'bar',
  placement = 'below',
  className = '',
}: {
  /** `bar` for the top bar, `row` for the sidebar footer and the mobile drawer. */
  variant?: 'bar' | 'row';
  /** Which side of the trigger the panel prefers. It flips when there is no room. */
  placement?: 'above' | 'below';
  className?: string;
}) {
  const { appearance, resolved, setTheme } = useAppearance();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const style = usePanelPosition(open, wrapRef, placement);

  const close = useCallback(() => setOpen(false), []);

  // Keep the two halves of the owner's choice alive across flips.
  useEffect(() => {
    if (appearance.theme === SYSTEM_PAINT) return;
    remember(resolved.mode === 'dark' ? LAST_DARK_KEY : LAST_LIGHT_KEY, resolved.id);
  }, [appearance.theme, resolved.id, resolved.mode]);

  /**
   * Escape, outside pointer, and focus handling.
   *
   * Focus is moved into the panel on open and trapped there, because a panel
   * rendered at the end of `<body>` is a Tab stop sequence away from its own
   * trigger — without the trap, tabbing walks off into the page behind it and
   * the dialog is left open over content the user cannot see they are in.
   */
  useEffect(() => {
    if (!open) return;

    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !wrapRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Focus the first control on open, and hand focus back to the trigger on
  // close so the owner's place in the page is not lost.
  const openedFrom = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    openedFrom.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      const previous = openedFrom.current;
      openedFrom.current = null;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  const flip = useCallback(() => {
    const goingDark = resolved.mode === 'light';
    setTheme(recall(goingDark ? LAST_DARK_KEY : LAST_LIGHT_KEY, goingDark ? 'midnight' : 'daylight'));
  }, [resolved.mode, setTheme]);

  const panel =
    open && style
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Appearance"
            data-appearance-panel=""
            style={style}
            className="animate-pop-in z-[70] flex min-h-0 flex-col overflow-hidden rounded-2xl bg-panel shadow-float ring-1 ring-stone-200"
          >
            <AppearanceControls />
          </div>,
          document.body,
        )
      : null;

  if (variant === 'row') {
    return (
      <div ref={wrapRef} className={`relative ${className}`}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`flex w-full touch-manipulation items-center gap-3 rounded-xl bg-stone-50 p-3 text-left ring-1 ring-inset ring-stone-200 transition hover:bg-stone-100 ${
            open ? 'ring-stone-300' : ''
          }`}
        >
          <span className="bg-portal-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white">
            <Paintbrush size={14} strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-stone-900">Appearance</span>
            <span className="block truncate text-[11px] text-stone-600">{resolved.name}</span>
          </span>
          <ChevronDown
            size={14}
            className={`shrink-0 text-stone-600 transition-transform duration-base ease-settle ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {panel}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="flex items-center rounded-xl bg-stone-50 ring-1 ring-inset ring-stone-200">
        <button
          type="button"
          onClick={flip}
          title={`Switch to ${resolved.mode === 'light' ? 'a dark paint' : 'a light paint'}`}
          aria-label={`Switch to ${resolved.mode === 'light' ? 'a dark paint' : 'a light paint'}`}
          className="touch-manipulation flex h-11 w-9 items-center justify-center rounded-l-xl text-stone-700 transition hover:bg-stone-100 hover:text-stone-900 md:h-8"
        >
          {resolved.mode === 'light' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Appearance"
          aria-label="Appearance"
          className="touch-manipulation flex h-11 w-6 items-center justify-center rounded-r-xl border-l border-stone-200 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 md:h-8"
        >
          <ChevronDown
            size={12}
            className={`transition-transform duration-base ease-settle ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      {panel}
    </div>
  );
}
