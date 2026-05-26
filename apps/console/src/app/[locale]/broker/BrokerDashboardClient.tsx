'use client';

import { AlertTriangle, Bell, MessageSquareText, Star, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { SentimentBadge } from '@opentrade/ui';

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
      const token = getAccessToken();
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
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-blue-400" />
      </div>
    );
  }

  if (!claimedBroker) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-white/50">{t('noBrokerClaimed')}</p>
      </div>
    );
  }

  const statCards = stats
    ? [
        {
          label: t('totalReviews'),
          value: String(stats.totalReviews),
          icon: <MessageSquareText size={20} />,
        },
        {
          label: t('avgRating'),
          value: stats.avgRating?.toFixed(1) ?? '-',
          icon: <Star size={20} className="fill-blue-400 text-blue-400" />,
        },
        {
          label: t('positiveRate'),
          value: stats.positiveRate != null ? `${Math.round(stats.positiveRate * 100)}%` : '-',
          icon: <TrendingUp size={20} />,
        },
        { label: t('monthReviews'), value: `+${stats.monthReviews}`, icon: <Bell size={20} /> },
        {
          label: t('totalComplaints'),
          value: String(stats.totalComplaints),
          icon: <AlertTriangle size={20} />,
        },
        {
          label: t('openComplaints'),
          value: String(stats.openComplaints),
          icon: <AlertTriangle size={20} className="text-orange-400" />,
        },
        {
          label: t('respondedComplaints'),
          value: String(stats.respondedComplaints),
          icon: <AlertTriangle size={20} className="text-green-400" />,
        },
      ]
    : [];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <h1 className="text-2xl font-bold">{t('dashboardTitle')}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => (
          <div
            key={`stat-${i}`}
            className="bg-white/5 border border-white/10 rounded-2xl p-6 relative overflow-hidden group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-white/10 rounded-xl group-hover:bg-blue-500/20 transition-colors">
                {stat.icon}
              </div>
            </div>
            <div>
              <div className="text-3xl font-black mb-1">{stat.value}</div>
              <div className="text-sm text-white/50">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h2 className="text-lg font-bold mb-4">{t('recentReviews')}</h2>
        <div className="space-y-4">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="flex items-center justify-between pb-4 border-b border-white/5 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-4">
                <DashboardSentimentChip sentiment={review.sentiment} rating={review.rating} t={t} />
                <div>
                  <div className="text-sm font-bold">{review.title}</div>
                  <div className="text-xs text-white/50">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {reviews.length === 0 ? <p className="text-sm text-white/40">{t('noReviews')}</p> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Per ADR-0028 D7: compact sentiment chip used in the merchant dashboard
 * "recent reviews" mini-list. Delegates the sentiment chip render to the
 * shared `SentimentBadge` primitive (M6.2a) and keeps a surface-local
 * legacy fallback for the pre-backfill window. The blue-star + raw-digit
 * legacy chip is intentionally divergent from the other consoleSurfaces;
 * D7 only mandates "no five-star widget for null rows", which a single
 * star-with-digit satisfies.
 *
 * Note for reviewers: the shape changed from `rounded` + `py-1` to
 * `rounded-full` + `py-0.5` as a deliberate consequence of the M6.2a
 * consolidation — see the M6.2a commit body. Visual delta is intentional
 * and accepted as a consistency win across the five surfaces.
 */
function DashboardSentimentChip({
  sentiment,
  rating,
  t,
}: {
  sentiment: ReviewItem['sentiment'];
  rating: number;
  t: ReturnType<typeof useTranslations>;
}): React.ReactNode {
  if (sentiment === 'POSITIVE') {
    return <SentimentBadge sentiment="POSITIVE" label={t('sentimentPositive')} theme="neon" />;
  }
  if (sentiment === 'NEGATIVE') {
    return <SentimentBadge sentiment="NEGATIVE" label={t('sentimentNegative')} theme="neon" />;
  }
  if (sentiment === 'NEUTRAL') {
    return <SentimentBadge sentiment="NEUTRAL" label={t('sentimentNeutral')} theme="neon" />;
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-1 text-xs font-bold text-blue-400"
      title={t('legacyRatingCaptionTooltip')}
    >
      <Star size={12} className="fill-blue-400" />
      {rating}
    </span>
  );
}
