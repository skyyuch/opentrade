'use client';

import { Building2, ChevronRight, Loader2, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { env } from '../../env';

type BrokerListItem = {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  isClaimed: boolean;
  reviewCount: number;
};

type BrokersApiResponse = {
  brokers: BrokerListItem[];
  nextCursor: string | null;
};

type Props = {
  initialBrokers: BrokerListItem[];
  initialCursor: string | null;
};

function resolveBrokerName(
  broker: BrokerListItem,
  locale: string,
): { primary: string; secondary: string | null } {
  const isChineseLocale = locale.startsWith('zh');
  const hasChinese = broker.displayName !== broker.legalName;

  if (isChineseLocale) {
    return {
      primary: broker.displayName,
      secondary: hasChinese ? broker.legalName : null,
    };
  }
  return {
    primary: broker.legalName,
    secondary: hasChinese ? broker.displayName : null,
  };
}

export const BrokerDirectory = ({ initialBrokers, initialCursor }: Props) => {
  const t = useTranslations('brokers');
  const locale = useLocale();

  const [query, setQuery] = useState('');
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

  return (
    <div className="flex flex-col gap-6">
      {/* Search bar */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="h-12 w-full rounded-xl border border-border bg-card pl-11 pr-12 text-sm text-foreground placeholder:text-muted-foreground/40 transition-all duration-200 focus:border-ring/50 focus:outline-none focus:ring-1 focus:ring-ring/30 focus:shadow-[0_0_24px_-6px_hsl(var(--ring)/0.4)]"
          aria-label={t('searchPlaceholder')}
        />
        {isSearching ? (
          <Loader2
            className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary"
            aria-hidden
          />
        ) : (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {brokers.length}
          </span>
        )}
      </div>

      {/* Results */}
      {brokers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20">
          <div className="flex size-14 items-center justify-center rounded-xl border border-border bg-muted/50">
            <Building2 className="size-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {brokers.map((broker) => (
              <BrokerCard key={broker.id} broker={broker} locale={locale} />
            ))}
          </div>

          {cursor ? (
            <div className="flex justify-center pt-6">
              <button
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={isLoadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:text-primary hover:shadow-[0_0_16px_-4px_hsl(var(--ring)/0.25)] disabled:opacity-50"
              >
                {isLoadingMore ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {t('loadMore')}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

const BrokerCard = ({ broker, locale }: { broker: BrokerListItem; locale: string }) => {
  const t = useTranslations('brokers');
  const { primary, secondary } = resolveBrokerName(broker, locale);

  return (
    <Link
      href={`/${locale}/brokers/${broker.slug}`}
      className="group flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 transition-all duration-150 hover:border-primary/30 hover:bg-card/80 hover:shadow-[0_0_16px_-4px_hsl(var(--ring)/0.2)]"
    >
      {/* Avatar */}
      <div className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
        <span className="text-xs font-bold text-primary">{primary.charAt(0).toUpperCase()}</span>
        {broker.isClaimed ? (
          <div className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full border-2 border-card bg-success">
            <ShieldCheck className="size-2 text-success-foreground" aria-hidden />
          </div>
        ) : null}
      </div>

      {/* Name + meta */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{primary}</span>
        {secondary ? (
          <span className="truncate text-[11px] text-muted-foreground">{secondary}</span>
        ) : null}
        {broker.reviewCount > 0 ? (
          <span className="mt-0.5 text-[10px] text-primary/70">
            {t('reviewCount', { count: broker.reviewCount })}
          </span>
        ) : null}
      </div>

      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground/60"
        aria-hidden
      />
    </Link>
  );
};
