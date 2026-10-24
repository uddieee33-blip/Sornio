import Image from 'next/image';

type BrandIconProps = {
  className?: string;
  priority?: boolean;
  size?: number;
};

/** The single Sornio icon used by the navigation, desktop shell and browser. */
export function BrandIcon({ className, priority = false, size = 40 }: BrandIconProps) {
  return (
    <Image
      src="/brand/sornio-app-icon.svg"
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
 * Inline lettering inherits the selected light/dark theme; the restrained
 * silver-slate S retains its shape and subtle depth in every paint.
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
      aria-label="Sornio — Business Management"
      className={className}
    >
      <defs>
        <linearGradient id="sornio-wordmark-silver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#DDE5EA" />
          <stop offset=".5" stopColor="#9BABBB" />
          <stop offset="1" stopColor="#586F83" />
        </linearGradient>
      </defs>
      <g transform="translate(122 -60) scale(.83)">
        <path
          d="M337 145 C291 123 248 128 219 150 C188 172 188 205 225 229 L301 277 C349 307 343 355 298 381 C263 400 219 396 175 375 L191 331 C222 348 250 353 275 340 C292 331 295 316 274 303 L194 253 C139 219 147 161 195 127 C241 95 298 96 353 123 Z"
          transform="translate(2 4)"
          fill="#142231"
          opacity=".32"
        />
        <path
          d="M337 145 C291 123 248 128 219 150 C188 172 188 205 225 229 L301 277 C349 307 343 355 298 381 C263 400 219 396 175 375 L191 331 C222 348 250 353 275 340 C292 331 295 316 274 303 L194 253 C139 219 147 161 195 127 C241 95 298 96 353 123 Z"
          fill="url(#sornio-wordmark-silver)"
        />
      </g>
      <text
        x="340" y="326" textAnchor="middle"
        style={{ fill: 'rgb(var(--c-stone-900))' }}
        fontFamily="'Inter Variable', 'Inter', Arial, sans-serif"
        fontSize="99" fontWeight="700" letterSpacing="-4"
      >
        Sornio
      </text>
      <text
        x="340" y="383" textAnchor="middle"
        style={{ fill: 'rgb(var(--c-stone-600))' }}
        fontFamily="'Inter Variable', 'Inter', Arial, sans-serif"
        fontSize="23" fontWeight="500" letterSpacing="7"
      >
        BUSINESS MANAGEMENT
      </text>
    </svg>
  );
}
