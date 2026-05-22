/**
 * `/brokers` — Broker directory listing.
 *
 * Server Component that fetches the first page of brokers from the API with
 * ISR (revalidate every 60s). BrokerDirectory handles client-side pagination
 * and API-side search from there.
 */

import { Blocks } from 'lucide-react';
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
  let nextCursor: string | null = null;
  let error: string | null = null;

  try {
    const data = await fetchBrokers({ next: { revalidate: 60 } });
    brokers = data.brokers;
    nextCursor = data.nextCursor;
  } catch (err) {
    error = err instanceof ApiClientError ? err.message : 'Failed to fetch brokers';
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Subtle background gradients for Web3 feel */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/4 size-80 rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute -bottom-40 right-1/4 size-80 rounded-full bg-accent/[0.03] blur-3xl" />
      </div>

      <div className="container relative mx-auto flex flex-col gap-10 px-4 py-12 md:py-16">
        {/* Header */}
        <header className="flex flex-col gap-3">
          <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary/80">
            <Blocks className="size-3.5" aria-hidden />
            {t('eyebrow')}
          </div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            {t('subtitle')}
          </p>
        </header>

        {error !== null ? (
          <div className="rounded-xl border border-danger/40 bg-danger/5 p-6 text-sm text-danger">
            {error}
          </div>
        ) : (
          <BrokerDirectory initialBrokers={brokers} initialCursor={nextCursor} />
        )}

        <footer className="border-t border-border/40 pt-6 text-xs text-muted-foreground/60">
          {t('disclaimer')}
        </footer>
      </div>
    </main>
  );
};

export default BrokersPage;
