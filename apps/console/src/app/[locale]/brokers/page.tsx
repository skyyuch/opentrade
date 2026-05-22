/**
 * `/brokers` — Broker directory for the merchant console.
 *
 * Server Component that fetches all brokers. Merchants browse this
 * list to find and eventually claim their broker profile.
 */

import { Building2, ChevronRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ApiClientError, fetchBrokers } from '../../../lib/api/client';

import type { BrokerListItem } from '../../../lib/api/client';
import type { ReactNode } from 'react';

type Props = {
  params: { locale: string };
};

const BrokersPage = async ({ params }: Props): Promise<ReactNode> => {
  setRequestLocale(params.locale);

  const t = await getTranslations('brokerList');

  let brokers: BrokerListItem[] = [];
  let error: string | null = null;

  try {
    const data = await fetchBrokers({ next: { revalidate: 60 } });
    brokers = data.brokers;
  } catch (err) {
    error = err instanceof ApiClientError ? err.message : 'Failed to fetch brokers';
  }

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {error !== null ? (
        <div className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          {error}
        </div>
      ) : brokers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {brokers.map((broker) => (
            <BrokerRow key={broker.id} broker={broker} locale={params.locale} t={t} />
          ))}
        </div>
      )}
    </div>
  );
};

export default BrokersPage;

type BrokerTranslator = Awaited<ReturnType<typeof getTranslations<'brokerList'>>>;

const BrokerRow = ({
  broker,
  locale,
  t,
}: {
  broker: BrokerListItem;
  locale: string;
  t: BrokerTranslator;
}): ReactNode => (
  <Link
    href={`/${locale}/brokers/${broker.slug}`}
    className="group flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
  >
    <div className="flex items-center gap-3">
      <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
        <Building2 className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium">{broker.displayName}</span>
        <span className="text-xs text-muted-foreground">{broker.legalName}</span>
      </div>
    </div>
    <div className="flex items-center gap-3">
      {broker.isClaimed ? (
        <span className="flex items-center gap-1 text-xs text-success">
          <ShieldCheck className="size-3.5" aria-hidden />
          {t('claimed')}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{t('unclaimed')}</span>
      )}
      <span className="text-xs text-muted-foreground">
        {broker.reviewCount > 0 ? t('reviewCount', { count: broker.reviewCount }) : t('noReviews')}
      </span>
      <ChevronRight
        className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </div>
  </Link>
);
