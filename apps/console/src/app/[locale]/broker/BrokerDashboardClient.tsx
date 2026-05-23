'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { useOpenTradeAuth } from '../../../hooks/useOpenTradeAuth';
import { fetchBrokerOwnerStats, fetchBrokerReviews } from '../../../lib/api/client';

import type { BrokerOwnerStatsResponse, ReviewItem } from '../../../lib/api/client';

export function BrokerDashboardClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const { claimedBroker, isLoading: userLoading } = useCurrentUser();
  const t = useTranslations('broker');
  const [stats, setStats] = useState<BrokerOwnerStatsResponse['stats'] | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userLoading || !claimedBroker) return;

    const load = async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const [s, r] = await Promise.all([
          fetchBrokerOwnerStats(claimedBroker.slug, { accessToken: token }),
          fetchBrokerReviews(claimedBroker.slug, { accessToken: token }),
        ]);
        setStats(s.stats);
        setReviews(r.reviews.slice(0, 5));
      } catch {
        // Graceful fallback
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getAccessToken, claimedBroker, userLoading]);

  if (userLoading || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!claimedBroker) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">{t('noBrokerClaimed')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('dashboardTitle')}</h1>

      {stats ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('totalReviews')} value={stats.totalReviews} />
          <StatCard label={t('avgRating')} value={stats.avgRating?.toFixed(1) ?? '—'} />
          <StatCard
            label={t('positiveRate')}
            value={stats.positiveRate != null ? `${Math.round(stats.positiveRate * 100)}%` : '—'}
          />
          <StatCard label={t('monthReviews')} value={stats.monthReviews} />
        </div>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t('recentReviews')}
        </h2>
        <div className="space-y-2">
          {reviews.map((review) => (
            <div key={review.id} className="rounded-md border border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{review.title}</span>
                <StatusBadge status={review.status} />
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {'★'.repeat(review.rating)}
                  {'☆'.repeat(5 - review.rating)}
                </span>
                <span>{new Date(review.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noReviews')}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }): React.ReactNode {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactNode {
  const colors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    APPROVED: 'bg-green-100 text-green-800',
    CONFIRMED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800',
    FAILED: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-muted text-muted-foreground'}`}
    >
      {status}
    </span>
  );
}
