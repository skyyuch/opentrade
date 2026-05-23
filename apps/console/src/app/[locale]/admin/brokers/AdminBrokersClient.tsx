'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { fetchBrokers } from '../../../../lib/api/client';

import type { BrokerListItem } from '../../../../lib/api/client';

export function AdminBrokersClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const [brokers, setBrokers] = useState<BrokerListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const res = await fetchBrokers({ accessToken: token });
        setBrokers(res.brokers);
      } catch {
        setBrokers([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getAccessToken]);

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('brokers')}</h1>

      {brokers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No brokers found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2">Claimed</th>
                <th className="px-3 py-2">Reviews</th>
              </tr>
            </thead>
            <tbody>
              {brokers.map((b) => (
                <tr key={b.id} className="border-b border-border">
                  <td className="px-3 py-2 font-medium">{b.displayName}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{b.slug}</td>
                  <td className="px-3 py-2">
                    {b.isClaimed ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Claimed
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Unclaimed
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{b.reviewCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
