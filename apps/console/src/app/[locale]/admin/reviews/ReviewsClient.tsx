'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { fetchAdminReviews } from '../../../../lib/api/client';

import type { AdminReviewItem } from '../../../../lib/api/client';

const STATUSES = ['', 'PENDING', 'PUBLISHED', 'REJECTED'] as const;

export function ReviewsClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
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

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('reviews')}</h1>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Broker</th>
                <th className="px-3 py-2">Author</th>
                <th className="px-3 py-2">Rating</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Tx Hash</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="max-w-[200px] truncate px-3 py-2" title={r.title}>
                    {r.title}
                  </td>
                  <td className="px-3 py-2">{r.broker.displayName}</td>
                  <td className="px-3 py-2">{r.author.displayName ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Stars rating={r.rating} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.txHash ? (
                      <a
                        href={`https://basescan.org/tx/${r.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        {r.txHash.slice(0, 8)}...
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stars({ rating }: { rating: number }): React.ReactNode {
  return (
    <span className="text-yellow-500">
      {'★'.repeat(rating)}
      {'☆'.repeat(5 - rating)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactNode {
  const colors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    PUBLISHED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-muted text-muted-foreground'}`}
    >
      {status}
    </span>
  );
}
