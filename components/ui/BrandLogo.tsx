import Image from 'next/image';

type BrandIconProps = {
  className?: string;
  priority?: boolean;
  size?: number;
};

/** Square DukaanOS mark for navigation, console chrome, and compact placements. */
export function BrandIcon({ className, priority = false, size = 40 }: BrandIconProps) {
  return (
    <Image
      src="/brand/dukaanos-app-icon.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      priority={priority}
      unoptimized
      className={className}
    />
  );
}

type BrandWordmarkProps = {
  className?: string;
  priority?: boolean;
  width?: number;
};

/**
 * Full name-and-tagline lockup for sign-in and business setup screens.
 *
 * Drawn inline rather than through `<img src="…wordmark.svg">`. An image is a
 * sealed document: it cannot read the page's CSS variables, so its wordmark
 * stayed the near-black ink it was drawn in, and in a dark paint the name and
 * tagline vanished into the card behind them. Inline, the lettering takes the
 * active paint's ink and the blue mark keeps its own gradient in every paint.
 * The geometry matches `public/brand/dukaanos-wordmark.svg`.
 */
export function BrandWordmark({ className, width = 220 }: BrandWordmarkProps) {
  const height = Math.round((width * 430) / 680);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 680 430"
      width={width}
      height={height}
      role="img"
      aria-label="DukaanOS — Smarter Business. Bigger Dreams."
      className={className}
    >
      <defs>
        <linearGradient id="dukaan-wordmark-blue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#08a8ff" />
          <stop offset="0.48" stopColor="#0874f5" />
          <stop offset="1" stopColor="#073ed1" />
        </linearGradient>
        <linearGradient id="dukaan-wordmark-bars" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#08a9ff" />
          <stop offset="1" stopColor="#1764ec" />
        </linearGradient>
      </defs>

      <g transform="translate(237 27) scale(.8)">
        <path
          fill="url(#dukaan-wordmark-blue)"
          fillRule="evenodd"
          d="M30 30h89c69 0 109 40 109 98s-40 98-109 98H30v-50h88c37 0 58-16 58-48s-21-48-58-48H30V30Zm49 50h40c32 0 57 16 57 48s-25 48-57 48H79V80Z"
        />
        <path
          fill="url(#dukaan-wordmark-bars)"
          d="m84 140 17-9v40c0 4-2 7-6 9l-9 5c-4 2-7 0-7-4v-32c0-4 2-7 5-9Zm29-20 17-10v48c0 4-2 7-6 9l-9 5c-4 2-7 0-7-4v-40c0-4 2-7 5-8Zm29-20 17-10v58c0 4-2 7-6 9l-9 5c-4 2-7 0-7-4v-49c0-4 2-7 5-9Z"
        />
      </g>

      {/* The ink follows the paint: stone-900 is the body text in every paint,
          so the name is dark on Daylight and light on Midnight, by design. */}
      <text
        x="340"
        y="325"
        textAnchor="middle"
        style={{ fill: 'rgb(var(--c-stone-900))' }}
        fontFamily="'Space Grotesk', 'Inter', Arial, sans-serif"
        fontSize="100"
        fontWeight="700"
        letterSpacing="-5"
      >
        DukaanOS
      </text>
      <text
        x="340"
        y="387"
        textAnchor="middle"
        style={{ fill: 'rgb(var(--c-stone-600))' }}
        fontFamily="'Inter', Arial, sans-serif"
        fontSize="25"
        fontWeight="400"
        letterSpacing="8"
      >
        Smarter Business. Bigger Dreams.
      </text>
    </svg>
  );
}
