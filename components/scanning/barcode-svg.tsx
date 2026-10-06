'use client';

/**
 * A barcode drawn as SVG.
 *
 * No font, no image, no network: the module array from `lib/scanning/encoder`
 * becomes rectangles, so a label prints at whatever size the printer offers and
 * stays crisp. Guard bars are drawn taller than the data bars for the retail
 * symbologies — that is what lets a scanner find the symbol's edges — and the
 * human-readable digits sit underneath, because on the seventh hour of a shift
 * the label gets read by eye at least as often as by laser.
 */

import { useMemo } from 'react';
import { encodeForLabel, moduleWidthFor, type EncodedSymbol } from '@/lib/scanning/encoder';

/** Guard-bar positions inside the 95-module EAN-13 body. */
function guardModules(symbol: EncodedSymbol): Set<number> {
  const guards = new Set<number>();
  if (symbol.symbology !== 'EAN-13' && symbol.symbology !== 'EAN-8' && symbol.symbology !== 'UPC-A') return guards;
  const body = symbol.barEnd - symbol.barStart;
  const add = (from: number, count: number) => {
    for (let index = from; index < from + count; index += 1) guards.add(index);
  };
  add(0, 3);
  if (body === 95) {
    add(45, 5);
    add(92, 3);
  } else {
    add(31, 5);
    add(64, 3);
  }
  return guards;
}

export function BarcodeSvg({
  value,
  height = 52,
  moduleWidth,
  className = '',
  showText = true,
}: {
  value: string;
  /** Bar height in px. Guards extend to about 1.12× this. */
  height?: number;
  /** Bar width in px. Defaults to a width that fits roughly 320px. */
  moduleWidth?: number;
  className?: string;
  showText?: boolean;
}) {
  const symbol = useMemo(() => {
    try {
      return encodeForLabel(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!symbol) {
    return (
      <p className={`rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 ${className}`}>
        This value cannot be printed as a barcode.
      </p>
    );
  }

  const unit = moduleWidth ?? moduleWidthFor(symbol, 340);
  const guards = guardModules(symbol);
  const guardHeight = Math.round(height * 1.12);
  const captionHeight = showText ? Math.max(14, Math.round(height * 0.34)) : 0;
  const totalWidth = symbol.widthModules * unit;

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${guardHeight + captionHeight + 6}`}
      width={totalWidth}
      height={guardHeight + captionHeight + 6}
      role="img"
      aria-label={`Barcode ${symbol.value}`}
      className={className}
      shapeRendering="crispEdges"
    >
      <rect width="100%" height="100%" fill="#ffffff" />
      {symbol.modules.map((module, index) => {
        if (module !== 1) return null;
        const isGuard = guards.has(index - symbol.barStart);
        return (
          <rect
            key={index}
            x={index * unit}
            y={0}
            width={unit}
            height={isGuard ? guardHeight : height}
            fill="#000000"
          />
        );
      })}
      {showText
        ? symbol.captions.map((caption, index) => (
            <text
              key={`${caption.text}-${index}`}
              x={caption.x * unit}
              y={guardHeight + captionHeight - 2}
              textAnchor="middle"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize={Math.max(9, Math.round(captionHeight * 0.78))}
              letterSpacing={symbol.symbology === 'CODE128' ? 0.5 : 1.5}
              fill="#111111"
            >
              {caption.text}
            </text>
          ))
        : null}
    </svg>
  );
}

/** Symbology label used next to a code in tables and drawers. */
export function symbologyName(value: string): string {
  try {
    return encodeForLabel(value).symbology;
  } catch {
    return 'unprintable';
  }
}
