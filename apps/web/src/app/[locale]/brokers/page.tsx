/**
 * `/brokers` — Broker directory listing.
 *
 * Server Component that fetches all brokers from the API with ISR
 * (revalidate every 60s). Client-side search is handled by BrokerDirectory.
 */

import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BrokerDirectory } from '../../../components/brokers/BrokerDirectory';
import { ApiClientError, fetchBrokers } from '../../../lib/api/client';

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

  let brokers: {
    id: string;
    slug: string;
    displayName: string;
    legalName: string;
    isClaimed: boolean;
    reviewCount: number;
  }[] = [];
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
        <p className="text-xs font-medium uppercase tracking-wider text-primary">{t('eyebrow')}</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t('title')}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{t('subtitle')}</p>
      </header>

      {error !== null ? (
        <div className="rounded-lg border border-danger/40 bg-danger/5 p-6 text-sm text-danger">
          {error}
        </div>
      ) : (
        <BrokerDirectory brokers={brokers} />
      )}

      <footer className="text-xs text-muted-foreground">{t('disclaimer')}</footer>
    </main>
  );
};

export default BrokersPage;
