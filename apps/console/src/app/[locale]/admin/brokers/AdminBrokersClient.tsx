'use client';

import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { fetchAllBrokers } from '../../../../lib/api/client';

import type { BrokerListItem } from '../../../../lib/api/client';

function formatLicenseType(raw: string): string {
  const match = raw.match(/HK_SFC_TYPE_(\d+)/);
  return match ? `SFC ${match[1]}` : raw;
}

export function AdminBrokersClient(): React.ReactNode {
  const { getAccessToken } = useOpenTradeAuth();
  const t = useTranslations('admin');
  const locale = useLocale();
  const router = useRouter();
  const [brokers, setBrokers] = useState<BrokerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [claimFilter, setClaimFilter] = useState<'all' | 'claimed' | 'unclaimed'>('all');
  const [licenseFilter, setLicenseFilter] = useState<Set<string>>(new Set());
  const [showLicenseDropdown, setShowLicenseDropdown] = useState(false);

  useEffect(() => {
    const load = async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const all = await fetchAllBrokers({ accessToken: token });
        setBrokers(all);
      } catch {
        setBrokers([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [getAccessToken]);

  const allLicenseTypes = useMemo(() => {
    const set = new Set<string>();
    brokers.forEach((b) => b.licenseTypes.forEach((lt) => set.add(lt)));
    return Array.from(set).sort();
  }, [brokers]);

  const toggleLicenseFilter = (lt: string) => {
    setLicenseFilter((prev) => {
      const next = new Set(prev);
      if (next.has(lt)) next.delete(lt);
      else next.add(lt);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let list = brokers;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.displayName.toLowerCase().includes(q) ||
          b.legalName.toLowerCase().includes(q) ||
          b.slug.toLowerCase().includes(q),
      );
    }
    if (claimFilter === 'claimed') list = list.filter((b) => b.isClaimed);
    if (claimFilter === 'unclaimed') list = list.filter((b) => !b.isClaimed);
    if (licenseFilter.size > 0) {
      list = list.filter((b) => b.licenseTypes.some((lt) => licenseFilter.has(lt)));
    }
    return list;
  }, [brokers, search, claimFilter, licenseFilter]);

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{t('brokersTitle')}</h1>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchBrokerPlaceholder')}
              className="rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm focus:border-[#00FF88]/50 focus:outline-none"
            />
          </div>
          <select
            value={claimFilter}
            onChange={(e) => setClaimFilter(e.target.value as 'all' | 'claimed' | 'unclaimed')}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm focus:outline-none"
          >
            <option value="all">{t('filterAll')}</option>
            <option value="claimed">{t('statusClaimed')}</option>
            <option value="unclaimed">{t('statusUnclaimed')}</option>
          </select>

          {/* License type multi-select */}
          <div className="relative">
            <button
              onClick={() => setShowLicenseDropdown((v) => !v)}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm focus:outline-none"
            >
              {licenseFilter.size === 0
                ? t('filterLicenseAll')
                : `${t('thLicenseType')} (${licenseFilter.size})`}
            </button>
            {showLicenseDropdown && (
              <div className="absolute right-0 top-full z-50 mt-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-white/10 bg-[#0a0a0a] p-2 shadow-xl">
                {allLicenseTypes.map((lt) => (
                  <label
                    key={lt}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={licenseFilter.has(lt)}
                      onChange={() => toggleLicenseFilter(lt)}
                      className="accent-[#00FF88]"
                    />
                    <span className="text-white/80">{formatLicenseType(lt)}</span>
                  </label>
                ))}
                {licenseFilter.size > 0 && (
                  <button
                    onClick={() => setLicenseFilter(new Set())}
                    className="mt-1 w-full rounded px-2 py-1 text-xs text-[#00FF88] hover:bg-white/5"
                  >
                    {t('clearFilter')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-black/40 text-left text-xs uppercase tracking-wider text-white/50">
                <th className="px-4 py-3">{t('thBrokerName')}</th>
                <th className="px-4 py-3">{t('thCeNumber')}</th>
                <th className="px-4 py-3">{t('thLicenseType')}</th>
                <th className="whitespace-nowrap px-4 py-3">{t('thClaimStatus')}</th>
                <th className="px-4 py-3 text-right">{t('thReviewCount')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-white/40">
                    {t('noResults')}
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr
                    key={`broker-${b.id}`}
                    className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.04]"
                    onClick={() => router.push(`/${locale}/admin/brokers/${b.slug}`)}
                  >
                    <td className="px-4 py-3 font-bold">{b.displayName}</td>
                    <td className="px-4 py-3 font-mono text-xs">{b.slug}</td>
                    <td className="px-4 py-3 text-white/80">
                      {b.licenseTypes.length > 0
                        ? b.licenseTypes.map(formatLicenseType).join(', ')
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
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
