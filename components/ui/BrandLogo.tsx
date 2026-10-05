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

/** Full name-and-tagline lockup for sign-in and business setup screens. */
export function BrandWordmark({ className, priority = false, width = 220 }: BrandWordmarkProps) {
  const height = Math.round((width * 430) / 680);

  return (
    <Image
      src="/brand/dukaanos-wordmark.svg"
      alt="DukaanOS — Smarter Business. Bigger Dreams."
      width={width}
      height={height}
      priority={priority}
      unoptimized
      className={className}
    />
  );
}
