'use client';

import { Building, MessageSquareText, ShieldAlert, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../hooks/useOpenTradeAuth';
import { fetchAdminActivity, fetchAdminStats } from '../../../lib/api/client';

import type { AdminActivityResponse, AdminStatsResponse } from '../../../lib/api/client';

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
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
      </div>
    );
  }

  const statCards = stats
    ? [
        {
          label: t('totalUsers'),
          value: stats.totalUsers.toLocaleString(),
          icon: <Users size={20} />,
          change: `+${stats.usersGrowth}`,
        },
        {
          label: t('totalReviews'),
          value: stats.totalReviews.toLocaleString(),
          icon: <MessageSquareText size={20} />,
          change: `+${stats.reviewsGrowth}`,
        },
        {
          label: t('pendingApprovals'),
          value: String(stats.pendingApprovals),
          icon: <ShieldAlert size={20} className="text-yellow-400" />,
          change: t('pendingApprovals'),
        },
        {
          label: t('claimedBrokers'),
          value: `${stats.claimedBrokers}`,
          icon: <Building size={20} />,
          change: `/ ${stats.totalBrokers}`,
        },
      ]
    : [];

  return (
    <div className="animate-in fade-in space-y-8 duration-300">
      <h1 className="text-2xl font-bold">{t('dashboardTitle')}</h1>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, i) => (
          <div
            key={`stat-${i}`}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="rounded-xl bg-white/10 p-3 transition-colors group-hover:bg-[#00FF88]/20">
                {stat.icon}
              </div>
              <span className="rounded bg-white/5 px-2 py-1 text-xs font-bold text-white/40">
                {stat.change}
              </span>
            </div>
            <div>
              <div className="mb-1 text-3xl font-black">{stat.value}</div>
              <div className="text-sm text-white/50">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-4 text-lg font-bold">{t('recentActivity')}</h2>
        <div className="space-y-4">
          {activities.map((item, i) => (
            <div
              key={`activity-${i}`}
              className="flex items-center justify-between border-b border-white/5 pb-4 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-4">
                <div className="h-2 w-2 rounded-full bg-[#00FF88]" />
                <div>
                  <div className="text-sm font-medium">{item.description}</div>
                  <div className="text-xs text-white/50">{item.type.replace(/_/g, ' ')}</div>
                </div>
              </div>
              <div className="text-xs text-white/40">
                {new Date(item.timestamp).toLocaleDateString()}
              </div>
            </div>
          ))}
          {activities.length === 0 ? (
            <p className="text-sm text-white/40">{t('noActivity')}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
