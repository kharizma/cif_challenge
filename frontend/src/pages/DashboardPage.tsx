import type { LucideIcon } from 'lucide-react';
import { Archive, Clock3, FileCheck2, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { fetchStats } from '../services/api';
import type { RecentItem, StatsResponse } from '../types';

const STAT_ICONS: Record<string, LucideIcon> = {
  total: Users,
  active: FileCheck2,
  pending: Clock3,
  closed: Archive,
};

const STATUS_STYLES: Record<RecentItem['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-accent-soft text-accent-dark',
  closed: 'bg-neutral-100 text-neutral-600',
};

export default function DashboardPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchStats());
    } catch {
      setError('Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your CIF registrations and activity."
      />

      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && data && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.stats.map((stat) => (
              <StatCard
                key={stat.id}
                label={stat.label}
                value={stat.value}
                delta={stat.delta}
                icon={STAT_ICONS[stat.id] ?? Users}
              />
            ))}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-neutral-900">Recent activity</h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                Latest CIF records updated by your team.
              </p>
            </div>

            {data.recent.length === 0 ? (
              <EmptyState title="No activity yet" description="New CIF records will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-5 py-2.5 font-medium">Reference</th>
                      <th className="px-5 py-2.5 font-medium">Owner</th>
                      <th className="px-5 py-2.5 font-medium">Status</th>
                      <th className="px-5 py-2.5 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {data.recent.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-neutral-50">
                        <td className="px-5 py-3 font-medium text-neutral-900">{item.reference}</td>
                        <td className="px-5 py-3 text-neutral-600">{item.owner}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[item.status]}`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-neutral-500">{item.updatedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
