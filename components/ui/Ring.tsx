type RingProps = {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  track?: string;
  label?: string;
  sublabel?: string;
};

export function Ring({ value, max = 100, size = 112, strokeWidth = 10, color = '#4f46e5', track = '#e2e8f0', label, sublabel }: RingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(value / max, 1));
  const offset = circumference * (1 - pct);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-bold text-slate-900">{label ?? Math.round(value)}</p>
        {sublabel ? <p className="text-[10px] uppercase tracking-wide text-slate-500">{sublabel}</p> : null}
      </div>
    </div>
  );
}
