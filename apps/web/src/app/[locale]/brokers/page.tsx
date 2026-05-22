/**
 * `/brokers` — Broker directory listing.
 *
 * Server Component that fetches all brokers from the API with ISR
 * (revalidate every 60s). Each broker renders as a card linking to
 * the detail page at `/brokers/:slug`.
 */

import { Building2, ChevronRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ApiClientError, fetchBrokers } from '../../../lib/api/client';

import type { BrokerListItem } from '../../../lib/api/client';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type Props = {
  params: { locale: string };
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const t = await getTranslations({ locale: params.locale, namespace: 'brokers' });
  return {
    title: `${t('title')} | OpenTrade`,
    description: t('subtitle'),
  };
};

const BrokersPage = async ({ params }: Props): Promise<ReactNode> => {
  setRequestLocale(params.locale);

  const t = await getTranslations('brokers');

  let brokers: BrokerListItem[] = [];
  let error: string | null = null;

  try {
    const data = await fetchBrokers({ next: { revalidate: 60 } });
    brokers = data.brokers;
  } catch (err) {
    error = err instanceof ApiClientError ? err.message : 'Failed to fetch brokers';
  }

  return (
    <main className="container mx-auto flex flex-col gap-8 px-4 py-12 md:py-16">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('eyebrow')}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t('title')}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{t('subtitle')}</p>
      </header>

      {error !== null ? (
        <div className="rounded-lg border border-danger/40 bg-danger/5 p-6 text-sm text-danger">
          {error}
        </div>
      ) : brokers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brokers.map((broker) => (
            <BrokerCard key={broker.id} broker={broker} locale={params.locale} t={t} />
          ))}
        </div>
      )}

      <footer className="text-xs text-muted-foreground">{t('disclaimer')}</footer>
    </main>
  );
};

export default BrokersPage;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type BrokerTranslator = Awaited<ReturnType<typeof getTranslations<'brokers'>>>;

type BrokerCardProps = {
  broker: BrokerListItem;
  locale: string;
  t: BrokerTranslator;
};

const BrokerCard = ({ broker, locale, t }: BrokerCardProps): ReactNode => (
  <Link
    href={`/${locale}/brokers/${broker.slug}`}
    className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-foreground/20"
  >
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted">
          <Building2 className="size-5 text-muted-foreground" aria-hidden />
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
        <span className="flex items-center gap-1 text-success">
          <ShieldCheck className="size-3.5" aria-hidden />
          {t('claimed')}
        </span>
      ) : null}
      <span>
        {broker.reviewCount > 0 ? t('reviewCount', { count: broker.reviewCount }) : t('noReviews')}
      </span>
    </div>
  </Link>
);
