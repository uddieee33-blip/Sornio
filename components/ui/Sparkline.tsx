'use client';

/**
 * Sparkline.
 *
 * Two changes from the static version, both for the same reason: a trend line
 * that is simply *there* reads as a decoration, while a line that draws itself
 * left to right reads as time passing — which is exactly what it encodes.
 *
 *   1. **It draws.** `stroke-dasharray` equal to the path length, animated to
 *      zero offset. One compositor-friendly property, no layout, no
 *      per-frame JavaScript. The fill fades in behind it.
 *   2. **It respects the motion setting.** `--motion-scale` is the single
 *      multiplier the owner controls in Appearance; at Off it is `0`, the
 *      duration collapses to nothing, and the line is simply drawn. No media
 *      query duplicated here, no second code path to keep in sync.
 *
 * Colours default to CSS variables rather than hex, so a sparkline on a dark
 * paint is the dark paint's green, not a light theme's green sitting on a dark
 * card looking like a bruise.
 */

import { useEffect, useRef } from 'react';

type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  /** Draw the line in on mount. Off for dense tables where 40 lines would strobe. */
  animate?: boolean;
};

export function Sparkline({
  data,
  width = 120,
  height = 36,
  stroke = 'rgb(var(--c-brand-600) / 1)',
  fill = 'rgb(var(--c-brand-500) / 0.14)',
  animate = true,
}: SparklineProps) {
  const lineRef = useRef<SVGPathElement | null>(null);

  // Measured rather than estimated: `getTotalLength()` is the only way to get
  // a dash array that exactly covers the path, and an approximation shows up
  // as a line that finishes early or never quite closes.
  useEffect(() => {
    const path = lineRef.current;
    if (!path || !animate) return;
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    // Force the style to land before the transition is attached, otherwise the
    // browser coalesces both writes and nothing animates.
    void path.getBoundingClientRect();
    path.style.transition = 'stroke-dashoffset calc(700ms * var(--motion-scale, 1)) cubic-bezier(0.22, 1, 0.36, 1)';
    path.style.strokeDashoffset = '0';
  }, [animate, data]);

  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pad = 3;

  const points = data.map((value, index) => {
    const x = index * step;
    const y = pad + (1 - (value - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      <path
        d={area}
        fill={fill}
        stroke="none"
        className={animate ? 'spark-fill' : undefined}
      />
      <path
        ref={lineRef}
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The head of the line arrives last, after the stroke has reached it. */}
      <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} className={animate ? 'spark-head' : undefined} />
    </svg>
  );
}
