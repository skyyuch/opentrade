'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { fetchBrokers } from '../../../../lib/api/client';

import type { BrokerListItem } from '../../../../lib/api/client';

export function AdminBrokersClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const locale = useLocale();
  const router = useRouter();
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
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <h1 className="text-2xl font-bold">{t('brokersTitle')}</h1>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-black/40 text-left text-xs uppercase tracking-wider text-white/50">
                <th className="px-4 py-3">{t('thBrokerName')}</th>
                <th className="px-4 py-3">{t('thCeNumber')}</th>
                <th className="px-4 py-3">{t('thLicenseType')}</th>
                <th className="px-4 py-3">{t('thClaimStatus')}</th>
                <th className="px-4 py-3 text-right">{t('thReviewCount')}</th>
              </tr>
            </thead>
            <tbody>
              {brokers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-white/40">
                    {t('noResults')}
                  </td>
                </tr>
              ) : (
                brokers.map((b) => (
                  <tr
                    key={`broker-${b.id}`}
                    className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.04]"
                    onClick={() => router.push(`/${locale}/admin/brokers/${b.slug}`)}
                  >
                    <td className="px-4 py-3 font-bold">{b.displayName}</td>
                    <td className="px-4 py-3 font-mono text-xs">{b.slug}</td>
                    <td className="px-4 py-3 text-white/80">
                      {(b as Record<string, unknown>)['licenseType']
                        ? String((b as Record<string, unknown>)['licenseType'])
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {b.isClaimed ? (
                        <span className="rounded-full bg-blue-500/20 px-2.5 py-1 text-xs font-bold text-blue-400">
                          {t('statusClaimed')}
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white/50">
                          {t('statusUnclaimed')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{b.reviewCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
