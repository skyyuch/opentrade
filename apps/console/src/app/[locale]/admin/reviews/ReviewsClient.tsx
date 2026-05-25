'use client';

import { ExternalLink, Search, ShieldAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { localizedBrokerName } from '@opentrade/shared';
import { SentimentBadge } from '@opentrade/ui';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { fetchAdminReviews } from '../../../../lib/api/client';

import type { AdminReviewItem } from '../../../../lib/api/client';

const STATUSES = ['', 'PENDING', 'PUBLISHED', 'REJECTED'] as const;
// Per ADR-0028 D7: console operators can filter the global reviews view
// by sentiment. Empty string == "all sentiments" so the dropdown can use
// the same idiom as the status filter.
const SENTIMENTS = ['', 'POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const;
type SentimentFilter = (typeof SENTIMENTS)[number];

export function ReviewsClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [reviews, setReviews] = useState<AdminReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('');

  const loadReviews = useCallback(async () => {
    setLoading(true);
    const token = getAccessToken();
    if (!token) return;
    try {
      const params: {
        search?: string;
        status?: string;
        sentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
      } = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (sentimentFilter) params.sentiment = sentimentFilter;
      const res = await fetchAdminReviews(params, { accessToken: token });
      setReviews(res.reviews);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, search, statusFilter, sentimentFilter]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const statusLabel = (status: string): string => {
    const map: Record<string, string> = {
      PENDING: tc('pending'),
      PUBLISHED: tc('confirmed'),
      REJECTED: tc('rejected'),
    };
    return map[status] ?? status;
  };

  const sentimentLabel = (s: SentimentFilter): string => {
    if (s === 'POSITIVE') return t('sentimentPositive');
    if (s === 'NEUTRAL') return t('sentimentNeutral');
    if (s === 'NEGATIVE') return t('sentimentNegative');
    return t('allSentiments');
  };

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">{t('reviewsTitle')}</h1>
        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder={t('searchReviews')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm focus:border-[#00FF88]/50 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm focus:outline-none"
          >
            <option value="">{t('allStatuses')}</option>
            {STATUSES.filter(Boolean).map((s) => (
              <option key={`status-${s}`} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          <select
            value={sentimentFilter}
            onChange={(e) => setSentimentFilter(e.target.value as SentimentFilter)}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm focus:outline-none"
            aria-label={t('thSentiment')}
          >
            <option value="">{t('allSentiments')}</option>
            {SENTIMENTS.filter(Boolean).map((s) => (
              <option key={`sentiment-${s}`} value={s}>
                {sentimentLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-black/40 text-left text-xs uppercase tracking-wider text-white/50">
                  <th className="px-4 py-3">{t('thTitle')}</th>
                  <th className="px-4 py-3">{t('thBroker')}</th>
                  <th className="px-4 py-3">{t('thAuthor')}</th>
                  <th className="px-4 py-3">{t('thSentiment')}</th>
                  <th className="px-4 py-3">{t('thStatus')}</th>
                  <th className="px-4 py-3">{t('thTxHash')}</th>
                  <th className="px-4 py-3">{t('thDate')}</th>
                </tr>
              </thead>
              <tbody>
                {reviews.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-white/40">
                      {t('noResults')}
                    </td>
                  </tr>
                ) : (
                  reviews.map((r) => (
                    <tr
                      key={`review-${r.id}`}
                      className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="max-w-[200px] truncate px-4 py-3 font-bold" title={r.title}>
                        {r.title}
                      </td>
                      <td className="px-4 py-3">
                        {/* Per cursor rule 51: localised broker name. */}
                        {localizedBrokerName(r.broker, locale)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-blue-400">
                        {r.author.displayName ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <SentimentCell sentiment={r.sentiment} rating={r.rating} t={t} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} label={statusLabel(r.status)} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {r.txHash ? (
                          <a
                            href={`https://basescan.org/tx/${r.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                          >
                            {r.txHash.slice(0, 8)}...
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-white/10 px-4 py-3">
            <p className="inline-flex items-center gap-2 text-xs font-bold text-red-500/80">
              <ShieldAlert size={14} />
              {t('reviewsDisclaimer')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }): React.ReactNode {
  const colors: Record<string, string> = {
    PENDING: 'bg-yellow-500/20 text-yellow-400',
    PUBLISHED: 'bg-[#00FF88]/20 text-[#00FF88]',
    REJECTED: 'bg-red-500/20 text-red-400',
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors[status] ?? 'bg-white/10 text-white/50'}`}
    >
      {label}
    </span>
  );
}

/**
 * Renders a `SentimentBadge` (POSITIVE / NEUTRAL / NEGATIVE) or, for
 * legacy rows where the M3.2 backfill could not classify the row, the
 * legacy five-star caption (per ADR-0028 D7). The star widget itself is
 * NEVER re-rendered — every reader should be pulled toward the canonical
 * sentiment axis. Chip render is delegated to the shared primitive
 * (M6.2a) to keep the admin table aligned with散戶 + merchant surfaces.
 */
function SentimentCell({
  sentiment,
  rating,
  t,
}: {
  sentiment: AdminReviewItem['sentiment'];
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
