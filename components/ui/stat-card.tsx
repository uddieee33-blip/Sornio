type StatCardProps = {
  label: string;
  value: string;
  tone?: 'emerald' | 'blue' | 'violet' | 'amber';
};

const tones = {
  emerald: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-700',
  violet: 'bg-violet-50 text-violet-700',
  amber: 'bg-amber-50 text-amber-700',
};

export function StatCard({ label, value, tone = 'emerald' }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tones[tone]}`}>{label}</div>
      <p className="mt-4 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
