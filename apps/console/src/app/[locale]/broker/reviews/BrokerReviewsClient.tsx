'use client';

import { ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { SentimentBadge } from '@opentrade/ui';

import { useCurrentUser } from '../../../../hooks/useCurrentUser';
import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { fetchBrokerReviews } from '../../../../lib/api/client';

import type { ReviewItem } from '../../../../lib/api/client';

export function BrokerReviewsClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const { claimedBroker, isLoading: userLoading } = useCurrentUser();
  const t = useTranslations('broker');

  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userLoading || !claimedBroker) return;

    const load = async () => {
      const token = getAccessToken();
      if (!token) return;
      try {
        const res = await fetchBrokerReviews(claimedBroker.slug, { accessToken: token });
        setReviews(res.reviews);
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

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <h1 className="text-2xl font-bold">{t('reviewsTitle')}</h1>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
        {reviews.map((review) => (
          <div key={review.id} className="p-6 hover:bg-white/5 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-lg">{review.title}</span>
                  <StatusBadge status={review.status} />
                </div>
                <div className="text-xs text-white/50 font-mono">
                  {new Date(review.createdAt).toLocaleDateString()}
                </div>
              </div>
              <SentimentChip sentiment={review.sentiment} rating={review.rating} t={t} />
            </div>

            <div className="text-sm text-white/80 leading-relaxed bg-black/20 p-4 rounded-xl border border-white/5">
              {review.body}
            </div>
          </div>
        ))}
        {reviews.length === 0 ? (
          <div className="p-6">
            <p className="text-sm text-white/40">{t('noReviews')}</p>
          </div>
        ) : null}
      </div>

      <div className="text-xs text-red-500/80 font-bold flex items-center justify-end gap-1">
        <ShieldAlert size={14} />
        {t('reviewsDisclaimer')}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactNode {
  const styles: Record<string, string> = {
    CONFIRMED: 'bg-blue-500/20 text-blue-400',
    PENDING: 'bg-yellow-500/20 text-yellow-400',
    FAILED: 'bg-red-500/20 text-red-400',
  };
  return (
    <span
      className={`px-2 py-0.5 text-xs rounded font-bold ${styles[status] ?? 'bg-white/10 text-white/50'}`}
    >
      {status}
    </span>
  );
}

/**
 * Per ADR-0028 D7: merchant-facing sentiment chip with a legacy caption
 * fallback for null-sentiment rows. Delegates the chip render to the
 * shared `SentimentBadge` primitive (M6.2a) so the merchant sees the
 * exact same axis here as散戶 do on `/brokers/[slug]`.
 */
function SentimentChip({
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
      className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/40"
      title={t('legacyRatingCaptionTooltip')}
    >
      {t('legacyRatingCaption', { rating })}
    </span>
  );
}
