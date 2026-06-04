/**
 * `/brokers` — Broker directory for the merchant console.
 *
 * Server Component that fetches all brokers. Merchants browse this
 * list to find and eventually claim their broker profile.
 * UI design by Google.
 */

import { ChevronRight, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { localizedBrokerName } from '@opentrade/shared';

import { ApiClientError, fetchBrokers } from '../../../lib/api/client';

import type { BrokerListItem } from '../../../lib/api/client';
import type { ReactNode } from 'react';

type Props = {
  params: Promise<{ locale: string }>;
};

const BrokersPage = async (props: Props): Promise<ReactNode> => {
  const params = await props.params;
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
    <div className="flex-1 w-full max-w-[1440px] mx-auto relative z-10 animate-in fade-in duration-300">
      {/* Header & Search */}
      <div className="mb-10 space-y-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            {t('title')} <span className="text-[#00FF88]">Broker Directory</span>
          </h1>
          <p className="text-white/50 text-sm max-w-2xl">{t('subtitle')}</p>
        </div>
      </div>

      {/* Results Count */}
      <div className="mb-6 flex items-center justify-between text-sm text-white/40 border-b border-white/10 pb-4">
        <span>
          {brokers.length} {t('title')}
        </span>
      </div>

      {/* Error State */}
      {error !== null ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-400">
          {error}
        </div>
      ) : brokers.length === 0 ? (
        <div className="w-full py-20 flex flex-col items-center justify-center text-center border border-white/5 rounded-2xl bg-white/5 border-dashed">
          <Search size={40} className="text-white/20 mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">{t('empty')}</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {brokers.map((broker) => (
            <BrokerCard key={broker.id} broker={broker} locale={params.locale} t={t} />
          ))}
        </div>
      )}
    </div>
  );
};

export default BrokersPage;

type BrokerTranslator = Awaited<ReturnType<typeof getTranslations<'brokerList'>>>;

const BrokerCard = ({
  broker,
  locale,
  t,
}: {
  broker: BrokerListItem;
  locale: string;
  t: BrokerTranslator;
}): ReactNode => {
  // Per cursor rule 51: pick primary + secondary by locale rather than
  // hard-coding `displayName` (Chinese) as primary. English-locale users
  // were seeing Chinese as the headline and avatar initials.
  const primary = localizedBrokerName(broker, locale);
  const secondary = locale === 'en' ? broker.displayName : broker.legalName;
  return (
    <Link
      href={`/${locale}/brokers/${broker.slug}`}
      className="bg-zinc-900/40 border border-white/10 rounded-2xl p-6 backdrop-blur-xl hover:border-[#00FF88]/30 hover:bg-zinc-900/60 transition-all group cursor-pointer flex flex-col h-full"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center font-bold text-xl border border-white/10 group-hover:border-[#00FF88]/30 transition-colors shadow-inner">
            {primary.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white group-hover:text-[#00FF88] transition-colors line-clamp-1">
              {primary}
            </h3>
            {secondary && secondary !== primary ? (
              <span className="text-xs text-white/50">{secondary}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/5 border border-white/5 w-fit mb-4">
        <ShieldCheck size={14} className="text-[#00FF88]" />
        <span className="text-[10px] text-white/70 font-medium tracking-wide">
          {broker.isClaimed ? t('claimed') : t('unclaimed')}
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-end justify-between pt-4 border-t border-white/10 mt-auto">
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Reviews</div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-[#00FF88]">{broker.reviewCount}</span>
            <span className="text-xs text-white/40">
              {broker.reviewCount > 0
                ? t('reviewCount', { count: broker.reviewCount })
                : t('noReviews')}
            </span>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-[#00FF88] group-hover:text-[#050608] transition-all">
          <ChevronRight size={16} />
        </div>
      </div>
    </Link>
  );
};
