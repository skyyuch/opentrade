/**
 * Admin Dashboard — platform KPI overview.
 */

'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../hooks/useOpenTradeAuth';
import { fetchAdminStats, fetchAdminActivity } from '../../../lib/api/client';

import type { AdminStatsResponse, AdminActivityResponse } from '../../../lib/api/client';

export function AdminDashboardClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const [stats, setStats] = useState<AdminStatsResponse['stats'] | null>(null);
  const [activities, setActivities] = useState<AdminActivityResponse['activities']>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const [s, a] = await Promise.all([
          fetchAdminStats({ accessToken: token }),
          fetchAdminActivity({ accessToken: token }),
        ]);
        setStats(s.stats);
        setActivities(a.activities);
      } catch {
        // Graceful fallback
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getAccessToken]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('dashboardTitle')}</h1>

      {stats ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('totalUsers')} value={stats.totalUsers} growth={stats.usersGrowth} />
          <StatCard
            label={t('totalReviews')}
            value={stats.totalReviews}
            growth={stats.reviewsGrowth}
          />
          <StatCard label={t('pendingApprovals')} value={stats.pendingApprovals} />
          <StatCard
            label={t('claimedBrokers')}
            value={`${stats.claimedBrokers} / ${stats.totalBrokers}`}
          />
        </div>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t('recentActivity')}
        </h2>
        <div className="space-y-2">
          {activities.map((item, i) => (
            <div
              key={`activity-${i}`}
              className="flex items-center justify-between rounded-md border border-border px-4 py-2 text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {item.type.replace('_', ' ')}
                </span>
                <span>{item.description}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(item.timestamp).toLocaleDateString()}
              </span>
            </div>
          ))}
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noActivity')}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  growth,
}: {
  label: string;
  value: string | number;
  growth?: number;
}): React.ReactNode {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {growth !== undefined ? (
        <p className="mt-1 text-xs text-muted-foreground">+{growth} this week</p>
      ) : null}
    </div>
  );
}
