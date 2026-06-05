/**
 * `/bullion-dealers/:slug` — Bullion-dealer (CGSE member) detail page.
 *
 * Per ADR-0045 D7 this reuses the broker detail layout + BrokerDetailTabs
 * for a consistent experience, but renders a bullion-specific header (CGSE
 * membership pill instead of the SFC license badge) and a slim 會籍 / 評論 /
 * 投訴 tab set. The data comes from the same `GET /v1/brokers/:slug` endpoint
 * (a bullion dealer is a Broker row with category = BULLION; its slug is
 * namespaced `cgse-{memberCode}` so it never collides with an SFC broker).
 */

import { ArrowLeft, CheckCircle, ExternalLink, ShieldAlert, ShieldCheck } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { localizedBrokerName } from '@opentrade/shared';

import { BrokerDetailTabs } from '@/components/brokers/BrokerDetailTabs';
import { Link } from '@/i18n/navigation';
import {
  ApiClientError,
  fetchBroker,
  fetchBrokerComplaints,
  fetchBrokerReviews,
} from '@/lib/api/client';

import type { BrokerDetail, ComplaintItem, ReviewItem } from '@/lib/api/client';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export const generateMetadata = async (props: Props): Promise<Metadata> => {
  const params = await props.params;
  const t = await getTranslations({ locale: params.locale, namespace: 'brokerDetail' });
  try {
    const { broker } = await fetchBroker(params.slug, { next: { revalidate: 60 } });
    const name = localizedBrokerName(broker, params.locale);
    return {
      title: `${name} | OpenTrade`,
      description: `${name} — ${t('reviews')}`,
    };
  } catch {
    return { title: 'Bullion Dealer | OpenTrade' };
  }
};

const BullionDealerDetailPage = async (props: Props): Promise<ReactNode> => {
  const params = await props.params;
  setRequestLocale(params.locale);

  const t = await getTranslations('brokerDetail');

  const { broker, reviews, complaints } = await fetchDealerData(params.slug);

  // Per cursor rule 51 + ADR-0026: localise the primary name; surface the
  // English legal name as a secondary line when it differs.
  const primaryName = localizedBrokerName(broker, params.locale);
  const secondaryName =
    params.locale === 'en'
      ? broker.displayName !== primaryName
        ? broker.displayName
        : null
      : broker.legalName !== primaryName
        ? broker.legalName
        : null;

  const cgse = broker.licenses.find((l) => l.regulator === 'HK_CGSE') ?? broker.licenses[0];
  const isInactive = cgse?.status === 'REVOKED' || cgse?.status === 'SUSPENDED';

  return (
    <div className="-mt-16 relative pt-16 text-white">
      <div className="pointer-events-none fixed right-[-5%] top-[-10%] z-0 h-[700px] w-[700px] rounded-full bg-[#00FF88]/20 blur-[150px]" />
      <div className="pointer-events-none fixed bottom-[-10%] left-[-5%] z-0 h-[600px] w-[600px] rounded-full bg-blue-600/20 blur-[120px]" />
      <div className="relative z-10 mx-auto max-w-[1440px] px-6 lg:px-10 py-8">
        <Link
          href="/bullion-dealers"
          className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-[#00FF88] transition-colors mb-8 font-medium w-fit group"
        >
          <ArrowLeft
            className="size-4 group-hover:-translate-x-1 transition-transform"
            aria-hidden
          />
          {t('backToDealers')}
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
                {isInactive && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold">
                    <ShieldAlert size={12} />
                    {cgse?.status === 'REVOKED' ? t('statusRevoked') : t('statusSuspended')}
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
            {cgse && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00FF88]/10 border border-[#00FF88]/30">
                <ShieldCheck size={16} className="text-[#00FF88]" />
                <span className="text-xs font-bold text-[#00FF88]">
                  {t('cgseMembershipPill', { number: cgse.licenseNumber })}
                </span>
              </div>
            )}
          </div>
        </header>

        <BrokerDetailTabs
          broker={broker}
          reviews={reviews}
          complaints={complaints}
          locale={params.locale}
        />

        <footer className="mt-16 pt-8 border-t border-white/5 text-xs text-white/30">
          {t('disclaimer')}
        </footer>
      </div>
    </div>
  );
};

export default BullionDealerDetailPage;

const fetchDealerData = async (
  slug: string,
): Promise<{
  broker: BrokerDetail;
  reviews: ReviewItem[];
  complaints: ComplaintItem[];
}> => {
  try {
    const [brokerRes, reviewsRes, complaintsRes] = await Promise.all([
      fetchBroker(slug, { next: { revalidate: 60 } }),
      fetchBrokerReviews(slug, { next: { revalidate: 0 } }),
      fetchBrokerComplaints(slug, { next: { revalidate: 0 } }),
    ]);
    return {
      broker: brokerRes.broker,
      reviews: reviewsRes.reviews,
      complaints: complaintsRes.complaints,
    };
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) {
      notFound();
    }
    throw err;
  }
};
