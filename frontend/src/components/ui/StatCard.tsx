import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number;
  delta: number;
  icon: LucideIcon;
}

export default function StatCard({ label, value, delta, icon: Icon }: StatCardProps) {
  const positive = delta >= 0;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-neutral-500">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft">
          <Icon size={17} className="text-accent-dark" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">
        {new Intl.NumberFormat('en-US').format(value)}
      </p>
      <p className={`mt-1 text-xs ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
        {positive ? '+' : ''}
        {delta}% vs last month
      </p>
    </div>
  );
}
