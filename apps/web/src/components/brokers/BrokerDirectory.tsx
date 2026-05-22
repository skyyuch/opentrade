'use client';

import { Building2, ChevronRight, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useMemo, useState } from 'react';

type BrokerListItem = {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  isClaimed: boolean;
  reviewCount: number;
};

type Props = {
  brokers: BrokerListItem[];
};

export const BrokerDirectory = ({ brokers }: Props) => {
  const t = useTranslations('brokers');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    if (!deferredQuery.trim()) return brokers;
    const q = deferredQuery.toLowerCase();
    return brokers.filter(
      (b) => b.displayName.toLowerCase().includes(q) || b.legalName.toLowerCase().includes(q),
    );
  }, [brokers, deferredQuery]);

  return (
    <div className="flex flex-col gap-6">
      {/* Search bar */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 transition-all duration-150 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:shadow-[0_0_12px_-4px_hsl(var(--ring)/0.25)]"
          aria-label={t('searchPlaceholder')}
        />
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((broker) => (
            <BrokerCard key={broker.id} broker={broker} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
};

const BrokerCard = ({ broker, locale }: { broker: BrokerListItem; locale: string }) => {
  const t = useTranslations('brokers');

  return (
    <Link
      href={`/${locale}/brokers/${broker.slug}`}
      className="group relative flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-5 transition-all duration-150 hover:border-primary/20 hover:shadow-[0_0_12px_-4px_hsl(var(--ring)/0.15)]"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/5 border border-primary/10">
            <Building2 className="size-5 text-primary/70" aria-hidden />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold leading-tight">{broker.displayName}</span>
            <span className="text-xs text-muted-foreground">{broker.legalName}</span>
          </div>
        </div>
        <ChevronRight
          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {broker.isClaimed ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-success/20 bg-success/5 px-1.5 py-0.5 text-success">
            <ShieldCheck className="size-3" aria-hidden />
            {t('claimed')}
          </span>
        ) : null}
        <span>
          {broker.reviewCount > 0
            ? t('reviewCount', { count: broker.reviewCount })
            : t('noReviews')}
        </span>
      </div>
    </Link>
  );
};
