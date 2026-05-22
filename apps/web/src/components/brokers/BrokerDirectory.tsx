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
    <div className="flex flex-col gap-8">
      {/* Search bar — Web3 styled with glow focus */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-primary/5 via-transparent to-accent/5 opacity-0 transition-opacity duration-300 peer-focus:opacity-100" />
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="peer h-12 w-full rounded-xl border border-border/50 bg-card/80 pl-11 pr-12 text-sm text-foreground backdrop-blur-sm placeholder:text-muted-foreground/50 transition-all duration-200 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/25 focus:shadow-[0_0_20px_-5px_hsl(var(--ring)/0.3)]"
          aria-label={t('searchPlaceholder')}
        />
        {isSearching ? (
          <Loader2
            className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary/60"
            aria-hidden
          />
        ) : (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-border/40 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/50">
            {brokers.length}+
          </span>
        )}
      </div>

      {/* Results grid */}
      {brokers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <div className="flex size-16 items-center justify-center rounded-2xl border border-border/40 bg-muted/30">
            <Building2 className="size-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {brokers.map((broker, idx) => (
              <BrokerCard key={broker.id} broker={broker} locale={locale} index={idx} />
            ))}
          </div>

          {/* Load more */}
          {cursor ? (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={isLoadingMore}
                className="group relative inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-6 py-3 text-sm font-medium text-primary transition-all duration-200 hover:border-primary/40 hover:bg-primary/10 hover:shadow-[0_0_16px_-4px_hsl(var(--ring)/0.3)] disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <span className="inline-block size-1.5 rounded-full bg-primary/60 transition-transform group-hover:scale-125" />
                )}
                {t('loadMore')}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

const BrokerCard = ({
  broker,
  locale,
  index,
}: {
  broker: BrokerListItem;
  locale: string;
  index: number;
}) => {
  const t = useTranslations('brokers');

  return (
    <Link
      href={`/${locale}/brokers/${broker.slug}`}
      className="group relative flex items-center gap-3.5 rounded-xl border border-border/40 bg-card/50 p-4 backdrop-blur-sm transition-all duration-200 hover:border-primary/30 hover:bg-card/80 hover:shadow-[0_0_20px_-6px_hsl(var(--ring)/0.15)]"
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
    >
      {/* Avatar — gradient with initial */}
      <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 transition-all duration-200 group-hover:from-primary/15 group-hover:to-primary/10 group-hover:border-primary/20">
        <span className="text-sm font-semibold text-primary/70 transition-colors group-hover:text-primary">
          {broker.displayName.charAt(0).toUpperCase()}
        </span>
        {broker.isClaimed ? (
          <div className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border-2 border-card bg-success">
            <ShieldCheck className="size-2.5 text-success-foreground" aria-hidden />
          </div>
        ) : null}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium leading-tight text-foreground/90 transition-colors group-hover:text-foreground">
          {broker.displayName}
        </span>
        <span className="truncate text-[11px] text-muted-foreground/70">{broker.legalName}</span>
        <div className="mt-1 flex items-center gap-2">
          {broker.reviewCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-primary/15 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary/80">
              {t('reviewCount', { count: broker.reviewCount })}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground/50">{t('noReviews')}</span>
          )}
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground/30 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary/50"
        aria-hidden
      />
    </Link>
  );
};
