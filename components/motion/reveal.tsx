'use client';

/**
 * Reveal-on-scroll, and the rule that makes it safe.
 *
 * Content is never hidden by CSS that only JavaScript knows how to un-hide.
 * The hidden state in `globals.css` is scoped to `html[data-reveal='on']`, an
 * attribute `AppearanceProvider` sets *after* mount — so with JavaScript
 * disabled, before hydration, or if an observer never fires, every one of
 * these elements is simply visible. A ledger that animates is nice; a ledger
 * that is invisible because an IntersectionObserver threw is a disaster.
 *
 * One observer is shared by every element on the page rather than one per
 * component. On a reports screen with sixty rows that is the difference
 * between sixty observers ticking and one.
 */

import { useEffect, useRef, type ElementType, type ReactNode } from 'react';
import { staggerStyle } from '@/lib/motion/tokens';

type Registry = {
  observer: IntersectionObserver;
  count: number;
};

let registry: Registry | null = null;

function acquire(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!registry) {
    registry = {
      count: 0,
      observer: new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const node = entry.target as HTMLElement;
            node.dataset.shown = 'true';
            // Reveal is one-way. Re-hiding something on scroll-up makes a long
            // page feel like it is fighting the reader.
            registry?.observer.unobserve(node);
          }
        },
        // A small negative bottom margin means an element starts moving just
        // before it is fully on screen, so it has finished by the time the eye
        // arrives — rather than beginning after the reader is already looking.
        { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
      ),
    };
  }
  registry.count += 1;
  return registry.observer;
}

function release() {
  if (!registry) return;
  registry.count -= 1;
  if (registry.count <= 0) {
    registry.observer.disconnect();
    registry = null;
  }
}

export function Reveal({
  children,
  as: Tag = 'div',
  index = 0,
  className = '',
  ...rest
}: {
  children: ReactNode;
  /** The element to render. Defaults to a div. */
  as?: ElementType;
  /** Position in a list, for the stagger. Capped so long lists do not crawl. */
  index?: number;
  className?: string;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = acquire();
    if (!observer) {
      // No observer in this browser: show it, immediately and permanently.
      node.dataset.shown = 'true';
      return;
    }
    observer.observe(node);
    return () => {
      observer.unobserve(node);
      release();
    };
  }, []);

  return (
    <Tag
      ref={ref}
      data-reveal-item=""
      style={staggerStyle(index)}
      className={className}
      {...rest}
    >
      {children}
    </Tag>
  );
}
