/**
 * `/brokers/:slug` — Broker detail page with tabs (reviews / license / arbitration).
 *
 * Server Component that fetches broker details and reviews in parallel,
 * then passes data to the BrokerDetailTabs client component.
 */

import { ArrowLeft, CheckCircle, ExternalLink, ShieldAlert, ShieldCheck } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BrokerDetailTabs } from '@/components/brokers/BrokerDetailTabs';
import { Link } from '@/i18n/navigation';
import { ApiClientError, fetchBroker, fetchBrokerReviews } from '@/lib/api/client';

import type { BrokerDetail, ReviewItem } from '@/lib/api/client';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type Props = {
  params: { locale: string; slug: string };
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const t = await getTranslations({ locale: params.locale, namespace: 'brokerDetail' });
  try {
    const { broker } = await fetchBroker(params.slug, { next: { revalidate: 60 } });
    return {
      title: `${broker.displayName} | OpenTrade`,
      description: `${broker.displayName} — ${t('reviews')}`,
    };
  } catch {
    return { title: 'Broker | OpenTrade' };
  }
};

const BrokerDetailPage = async ({ params }: Props): Promise<ReactNode> => {
  setRequestLocale(params.locale);

  const t = await getTranslations('brokerDetail');

  const { broker, reviews } = await fetchBrokerData(params.slug);
  const isChineseLocale = params.locale.startsWith('zh');

  const primaryName = isChineseLocale ? broker.displayName : broker.legalName;
  const secondaryName = isChineseLocale
    ? broker.displayName !== broker.legalName
      ? broker.legalName
      : null
    : broker.displayName !== broker.legalName
      ? broker.displayName
      : null;

  const hasDisciplinary =
    broker.sfcDetailJson?.disciplinaryActions &&
    broker.sfcDetailJson.disciplinaryActions.length > 0;

  return (
    <main className="min-h-screen bg-[#050608] text-white relative overflow-x-hidden">
      {/* Background Atmospheric Glows */}
      <div className="pointer-events-none fixed right-[-5%] top-[-10%] z-0 h-[600px] w-[600px] rounded-full bg-[#00FF88]/10 blur-[120px]" />
      <div className="pointer-events-none fixed bottom-[-10%] left-[-5%] z-0 h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-[1440px] px-6 lg:px-10 py-8">
        <Link
          href="/brokers"
          className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-[#00FF88] transition-colors mb-8 font-medium w-fit group"
        >
          <ArrowLeft
            className="size-4 group-hover:-translate-x-1 transition-transform"
            aria-hidden
          />
          {t('backToBrokers')}
        </Link>

        <header className="mb-10 block lg:flex items-start justify-between gap-8 bg-zinc-900/40 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-xl">
          <div className="flex items-start gap-6">
            {broker.logoUrl ? (
              <img
                src={broker.logoUrl}
                alt={primaryName}
                className="w-20 h-20 md:w-24 md:h-24 shrink-0 rounded-2xl object-contain bg-white p-2 border border-white/10"
              />
            ) : (
              <div className="w-20 h-20 md:w-24 md:h-24 shrink-0 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center font-bold text-3xl md:text-4xl border border-white/10 shadow-inner">
                {primaryName.substring(0, 2).toUpperCase()}
              </div>
            )}

            <div className="flex flex-col justify-center">
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{primaryName}</h1>
              <div className="flex flex-wrap items-center gap-3">
                {secondaryName && (
                  <span className="text-white/60 font-medium">{secondaryName}</span>
                )}
                {secondaryName && (
                  <div className="w-1 h-1 rounded-full bg-white/20 hidden sm:block" />
                )}
                {broker.isClaimed ? (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[11px] font-bold">
                    <CheckCircle size={12} />
                    {t('claimed')}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/40 text-[11px] font-bold">
                    {t('unclaimed')}
                  </div>
                )}
                {hasDisciplinary && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold">
                    <ShieldAlert size={12} />
                    {t('hasDisciplinary')}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 mt-4">
                {broker.websiteUrl && (
                  <a
                    href={broker.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-[#00FF88] hover:underline"
                  >
                    <ExternalLink size={14} />
                    {broker.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                )}
                {broker.activeYears != null && broker.activeYears > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-white/50">
                    <ShieldCheck size={14} />
                    {t('activeYears', { years: broker.activeYears })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 lg:mt-0 flex gap-4 lg:flex-col lg:items-end">
            {broker.ceNumber && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00FF88]/10 border border-[#00FF88]/30">
                <ShieldCheck size={16} className="text-[#00FF88]" />
                <span className="text-xs font-bold text-[#00FF88]">{t('sfcLicensed')}</span>
              </div>
            )}
            {broker.licenses.length > 0 && (
              <div className="flex gap-2 flex-wrap lg:justify-end mt-2">
                {broker.licenses.map((lic, i) => (
                  <span
                    key={i}
                    className="text-[10px] uppercase font-bold px-2 py-1 bg-white/5 border border-white/10 rounded text-white/70"
                  >
                    {lic.licenseType.replace('HK_SFC_TYPE_', 'SFC Type ')}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        <BrokerDetailTabs broker={broker} reviews={reviews} locale={params.locale} />

        <footer className="mt-16 pt-8 border-t border-white/5 text-xs text-white/30">
          {t('disclaimer')}
        </footer>
      </div>
    </main>
  );
};

export default BrokerDetailPage;

const fetchBrokerData = async (
  slug: string,
): Promise<{ broker: BrokerDetail; reviews: ReviewItem[] }> => {
  try {
    const [brokerRes, reviewsRes] = await Promise.all([
      fetchBroker(slug, { next: { revalidate: 60 } }),
      fetchBrokerReviews(slug, { next: { revalidate: 0 } }),
    ]);
    return { broker: brokerRes.broker, reviews: reviewsRes.reviews };
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) {
      notFound();
    }
    throw err;
  }
};
