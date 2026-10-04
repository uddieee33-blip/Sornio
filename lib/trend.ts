/**
 * Build a visually pleasing deterministic trend series that ends at `current`.
 * Used purely for sparkline decoration — the real numbers live in the ledger.
 */
export function trendSeries(current: number, points = 8, volatility = 0.18, seed = 1): number[] {
  if (current <= 0) {
    return Array.from({ length: points }, (_, i) => Math.max(1, Math.round((i + 1) * 2)));
  }
  const series: number[] = [];
  let value = current * (1 - volatility * 1.6);
  for (let i = 0; i < points - 1; i += 1) {
    const wobble = Math.sin((i + seed) * 1.7) * volatility * 0.5;
    const progress = i / (points - 2);
    value = Math.max(current * (1 - volatility * 2), value * (1 + wobble) + (current - value) * progress * 0.35);
    series.push(Math.max(1, Math.round(value)));
  }
  series.push(Math.round(current));
  return series;
}
