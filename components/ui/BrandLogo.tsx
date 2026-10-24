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
      preload={priority}
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
 * ribbon is selected from the user's approved artwork rather than redrawn.
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
      <image
        href="/brand/sornio-ribbon.svg"
        x="264" y="0" width="152" height="245"
        aria-hidden="true"
      />
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
