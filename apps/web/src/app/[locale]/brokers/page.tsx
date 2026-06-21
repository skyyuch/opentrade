import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BrokerDirectory } from '../../../components/brokers/BrokerDirectory';
import { ApiClientError, fetchBrokers } from '../../../lib/api/client';

import type { BrokerCategory, BrokerLicenseSummary } from '../../../lib/api/client';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type Props = {
  params: Promise<{ locale: string }>;
};

export const generateMetadata = async (props: Props): Promise<Metadata> => {
  const params = await props.params;
  const t = await getTranslations({ locale: params.locale, namespace: 'brokers' });
  return {
    title: `${t('title')} | OpenTrade`,
    description: t('subtitle'),
  };
};

const BrokersPage = async (props: Props): Promise<ReactNode> => {
  const params = await props.params;
  setRequestLocale(params.locale);

  const t = await getTranslations('brokers');

  let brokers: {
    id: string;
    slug: string;
    category: BrokerCategory;
    // Per cursor rule 51 + ADR-0026: three-column name shape forwarded
    // from the API to the BrokerDirectory client component.
    displayName: string;
    displayNameZhHans: string | null;
    legalName: string;
    logoUrl: string | null;
    isClaimed: boolean;
    reviewCount: number;
    positiveRate: number | null;
    verifiedUserCount: number;
    licenseTypes: string[];
    licenses: BrokerLicenseSummary[];
    hasDisciplinary: boolean;
  }[] = [];
  let nextCursor: string | null = null;
  let error: string | null = null;

  try {
    // Per ADR-0045 D2/D7: the securities page MUST send an explicit
    // `category=SECURITIES`. The API defaults to returning every vertical,
    // so once HKGX members are seeded an unfiltered call would mix bullion
    // dealers into the securities grid.
    const data = await fetchBrokers({ next: { revalidate: 60 }, category: 'SECURITIES' });
    brokers = data.brokers;
    nextCursor = data.nextCursor;
  } catch (err) {
    error = err instanceof ApiClientError ? err.message : 'Failed to fetch brokers';
  }

  return (
    <div className="-mt-16 relative pt-16">
      {/* Atmospheric glows matching homepage */}
      <div className="pointer-events-none fixed right-[-5%] top-[-10%] z-0 h-[700px] w-[700px] rounded-full bg-[#00FF88]/20 blur-[150px]" />
      <div className="pointer-events-none fixed bottom-[-10%] left-[-5%] z-0 h-[600px] w-[600px] rounded-full bg-blue-600/20 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[1440px] px-6 py-8 lg:px-10 lg:py-12">
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
          <BrokerDirectory
            category="SECURITIES"
            namespace="brokers"
            initialBrokers={brokers}
            initialCursor={nextCursor}
          />
        )}

        <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-white/30">
          {t('disclaimer')}
        </footer>
      </div>
    </div>
  );
};

export default BrokersPage;
