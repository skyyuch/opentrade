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
    <div className="-mt-16 relative pt-16">
      <div className="mx-auto max-w-[1440px] px-6 py-8 lg:px-10 lg:py-12">
        {/* Page header */}
        <div className="mb-10 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            {t('title')} <span className="text-[#00FF88]">{t('titleAccent')}</span>
          </h1>
          <p className="max-w-2xl text-sm text-white/50">{t('subtitle')}</p>
        </div>

        {error !== null ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-sm text-red-400">
            {error}
          </div>
        ) : (
          <BrokerDirectory initialBrokers={brokers} initialCursor={nextCursor} />
        )}

        <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-white/30">
          {t('disclaimer')}
        </footer>
      </div>
    </div>
  );
};

export default BrokersPage;
