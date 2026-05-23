'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading || !claimedBroker) return;

    const load = async () => {
      const token = await getAccessToken();
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
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('reviewsTitle')}</h1>
        <span className="text-sm text-muted-foreground">
          {t('totalCount')}: {reviews.length}
        </span>
      </div>

      <div className="space-y-3">
        {reviews.map((review) => (
          <div key={review.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{review.title}</span>
                <StatusBadge status={review.status} />
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(review.createdAt).toLocaleDateString()}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-yellow-500">
                {'★'.repeat(review.rating)}
                {'☆'.repeat(5 - review.rating)}
              </span>
            </div>

            <div className="mt-2">
              <p
                className={`text-sm text-foreground ${expandedId !== review.id ? 'line-clamp-2' : ''}`}
              >
                {review.body}
              </p>
              {review.body.length > 120 ? (
                <button
                  onClick={() => setExpandedId(expandedId === review.id ? null : review.id)}
                  className="mt-1 text-xs text-muted-foreground underline"
                >
                  {expandedId === review.id ? t('collapse') : t('expand')}
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noReviews')}</p>
        ) : null}
      </div>
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
