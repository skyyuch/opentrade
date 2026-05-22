'use client';

import { ChevronRight, Filter, Loader2, Search, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { env } from '../../env';
import { Link } from '../../i18n/navigation';

type BrokerListItem = {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  isClaimed: boolean;
  reviewCount: number;
  positiveRate: number | null;
  licenseTypes: string[];
};

type BrokersApiResponse = {
  brokers: BrokerListItem[];
  nextCursor: string | null;
};

type Props = {
  initialBrokers: BrokerListItem[];
  initialCursor: string | null;
};

const SFC_LICENSE_FILTERS = [
  { key: 'all', types: [] },
  { key: 'type1', types: ['HK_SFC_TYPE_1'] },
  { key: 'type2', types: ['HK_SFC_TYPE_2'] },
  { key: 'type4', types: ['HK_SFC_TYPE_4'] },
  { key: 'type7', types: ['HK_SFC_TYPE_7'] },
  { key: 'type9', types: ['HK_SFC_TYPE_9'] },
] as const;

function getInitials(name: string): string {
  const words = name.split(/[\s()（）]+/).filter(Boolean);
  if (words.length >= 2) {
    const first = words[0]?.charAt(0) ?? '';
    const second = words[1]?.charAt(0) ?? '';
    return (first + second).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatLicenseTypes(types: string[]): string {
  const nums = types
    .map((t) => {
      const match = /TYPE_(\d+)/.exec(t);
      return match ? match[1] : null;
    })
    .filter(Boolean);
  return nums.length > 0 ? `SFC Type ${nums.join(', ')}` : 'SFC Licensed';
}

function resolveBrokerName(
  broker: BrokerListItem,
  locale: string,
): { primary: string; secondary: string | null } {
  const isChineseLocale = locale.startsWith('zh');
  const hasChinese = broker.displayName !== broker.legalName;

  if (isChineseLocale) {
    return { primary: broker.displayName, secondary: hasChinese ? broker.legalName : null };
  }
  return { primary: broker.legalName, secondary: hasChinese ? broker.displayName : null };
}

export const BrokerDirectory = ({ initialBrokers, initialCursor }: Props) => {
  const t = useTranslations('brokers');
  const locale = useLocale();

  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [brokers, setBrokers] = useState<BrokerListItem[]>(initialBrokers);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [isSearching, startSearchTransition] = useTransition();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFromApi = useCallback(
    async (search: string, afterCursor?: string): Promise<BrokersApiResponse> => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (afterCursor) params.set('cursor', afterCursor);
      params.set('limit', '30');
      const qs = params.toString();
      const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/v1/brokers${qs ? `?${qs}` : ''}`);
      return (await res.json()) as BrokersApiResponse;
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      startSearchTransition(async () => {
        const data = await fetchFromApi(query);
        setBrokers(data.brokers);
        setCursor(data.nextCursor);
      });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchFromApi]);

  const handleLoadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const data = await fetchFromApi(query, cursor);
      setBrokers((prev) => [...prev, ...data.brokers]);
      setCursor(data.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, isLoadingMore, query, fetchFromApi]);

  const activeFilterDef = SFC_LICENSE_FILTERS.find((f) => f.key === activeFilter);
  const filteredBrokers =
    activeFilter === 'all' || !activeFilterDef
      ? brokers
      : brokers.filter((b) => activeFilterDef.types.some((t) => b.licenseTypes.includes(t)));

  return (
    <div className="flex flex-col gap-6">
      {/* Search + Filter */}
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-white/40">
            <Search size={20} />
          </div>
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-zinc-900/50 py-3.5 pl-11 pr-4 text-sm text-white placeholder-white/30 backdrop-blur-sm transition-all focus:border-[#00FF88]/50 focus:outline-none focus:ring-1 focus:ring-[#00FF88]/50"
          />
          {isSearching && (
            <Loader2 className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-[#00FF88]" />
          )}
        </div>
        <button
          type="button"
          className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm text-white transition-colors hover:bg-white/10"
        >
          <Filter size={18} />
          <span>{t('advancedFilter')}</span>
        </button>
      </div>

      {/* Category pills — SFC license types */}
      <div className="flex flex-wrap gap-2 pt-2">
        {SFC_LICENSE_FILTERS.map(({ key }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveFilter(key)}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === key
                ? 'border-[#00FF88]/50 bg-[#00FF88]/20 text-[#00FF88]'
                : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            {t(`filter_${key}`)}
          </button>
        ))}
      </div>

      {/* Results count + sort */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4 text-sm text-white/40">
        <span>{t('showingCount', { count: filteredBrokers.length })}</span>
        <div className="flex items-center gap-2">
          <span>{t('sortLabel')}</span>
          <select className="cursor-pointer border-none bg-transparent text-white outline-none focus:ring-0">
            <option className="bg-zinc-900 text-white">{t('sortConsensus')}</option>
            <option className="bg-zinc-900 text-white">{t('sortReviews')}</option>
            <option className="bg-zinc-900 text-white">{t('sortName')}</option>
          </select>
        </div>
      </div>

      {/* Broker grid */}
      {filteredBrokers.length === 0 ? (
        <div className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 py-20 text-center">
          <Search size={40} className="mb-4 text-white/20" />
          <h3 className="mb-2 text-lg font-bold text-white">{t('empty')}</h3>
          <p className="max-w-sm text-sm text-white/40">{t('emptyHint')}</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setActiveFilter('all');
            }}
            className="mt-6 rounded-lg bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
          >
            {t('clearFilters')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredBrokers.map((broker) => (
              <BrokerCard key={broker.id} broker={broker} locale={locale} />
            ))}
          </div>

          {cursor && (
            <div className="flex justify-center pt-6">
              <button
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={isLoadingMore}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                {isLoadingMore && <Loader2 className="size-3.5 animate-spin" />}
                {t('loadMore')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const BrokerCard = ({ broker, locale }: { broker: BrokerListItem; locale: string }) => {
  const t = useTranslations('brokers');
  const { primary, secondary } = resolveBrokerName(broker, locale);
  const initials = getInitials(primary);

  return (
    <Link
      href={`/brokers/${broker.slug}`}
      className="group flex h-full cursor-pointer flex-col rounded-2xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur-xl transition-all hover:border-[#00FF88]/30 hover:bg-zinc-900/60"
    >
      {/* Top: avatar + name */}
      <div className="mb-4 flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-zinc-800 to-zinc-950 text-xl font-bold text-white shadow-inner transition-colors group-hover:border-[#00FF88]/30">
          {initials}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-white transition-colors group-hover:text-[#00FF88]">
            {primary}
          </h3>
          {secondary && <span className="text-xs text-white/50">{secondary}</span>}
        </div>
      </div>

      {/* License badge */}
      {broker.licenseTypes.length > 0 && (
        <div className="mb-4 inline-flex w-fit items-center gap-1.5 rounded border border-white/5 bg-white/5 px-2.5 py-1">
          <ShieldCheck size={14} className="text-[#00FF88]" />
          <span className="text-[10px] font-medium tracking-wide text-white/70">
            {formatLicenseTypes(broker.licenseTypes)}
          </span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom: positive rate / reviews */}
      <div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-white/40">
            {t('positiveRateLabel')}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-[#00FF88]">
              {broker.positiveRate !== null ? `${broker.positiveRate}%` : '—'}
            </span>
            {broker.reviewCount > 0 && (
              <span className="text-xs text-white/40">
                / {t('reviewCount', { count: broker.reviewCount })}
              </span>
            )}
          </div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 transition-all group-hover:bg-[#00FF88] group-hover:text-[#050608]">
          <ChevronRight size={16} />
        </div>
      </div>
    </Link>
  );
};
