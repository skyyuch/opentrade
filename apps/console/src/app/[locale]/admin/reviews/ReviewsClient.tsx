'use client';

import { ExternalLink, Search, ShieldAlert, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { fetchAdminReviews } from '../../../../lib/api/client';

import type { AdminReviewItem } from '../../../../lib/api/client';

const STATUSES = ['', 'PENDING', 'PUBLISHED', 'REJECTED'] as const;

export function ReviewsClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const [reviews, setReviews] = useState<AdminReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadReviews = useCallback(async () => {
    setLoading(true);
    const token = await getAccessToken();
    if (!token) return;
    try {
      const params: { search?: string; status?: string } = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await fetchAdminReviews(params, { accessToken: token });
      setReviews(res.reviews);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, search, statusFilter]);

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
                  <th className="px-4 py-3">{t('thRating')}</th>
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
                      <td className="px-4 py-3">{r.broker.displayName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-blue-400">
                        {r.author.displayName ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-[#00FF88]">
                          <Star size={14} fill="currentColor" />
                          {r.rating}
                        </span>
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
