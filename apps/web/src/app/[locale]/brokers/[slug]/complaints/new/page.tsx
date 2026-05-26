/**
 * `/brokers/[slug]/complaints/new` — submit a complaint about a broker.
 *
 * Per ADR-0029 D3: every complaint requires an evidence file.
 * S22.1 redesign: the page is simplified to a single-column layout since
 * the ComplaintForm now contains a 3-step wizard with built-in guidelines
 * (per Google `ComplaintForm.tsx` design reference).
 */

import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { localizedBrokerName } from '@opentrade/shared';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { ComplaintForm } from '@/components/complaints/ComplaintForm';
import { Link } from '@/i18n/navigation';
import { ApiClientError, fetchBroker } from '@/lib/api/client';

type Props = {
  params: { locale: string; slug: string };
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const t = await getTranslations({ locale: params.locale, namespace: 'complaintForm' });
  try {
    const { broker } = await fetchBroker(params.slug, { next: { revalidate: 60 } });
    const name = localizedBrokerName(
      {
        slug: broker.slug,
        displayName: broker.displayName,
        displayNameZhHans: broker.displayNameZhHans,
        legalName: broker.legalName,
      },
      params.locale,
    );
    return {
      title: `${t('pageTitle', { broker: name })} | OpenTrade`,
      description: t('pageDescription'),
    };
  } catch {
    return { title: 'Complaint | OpenTrade' };
  }
};

const ComplaintsNewPage = async ({ params }: Props): Promise<ReactNode> => {
  setRequestLocale(params.locale);
  const t = await getTranslations('complaintForm');

  let brokerId: string;
  let brokerName: string;
  try {
    const { broker } = await fetchBroker(params.slug, { next: { revalidate: 60 } });
    brokerId = broker.id;
    brokerName = localizedBrokerName(
      {
        slug: broker.slug,
        displayName: broker.displayName,
        displayNameZhHans: broker.displayNameZhHans,
        legalName: broker.legalName,
      },
      params.locale,
    );
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="relative -mt-16 w-full overflow-hidden pt-16 text-white">
      <div className="pointer-events-none fixed right-[-5%] top-[-10%] z-0 h-[700px] w-[700px] rounded-full bg-[#00FF88]/15 blur-[150px]" />
      <div className="pointer-events-none fixed bottom-[-10%] left-[-5%] z-0 h-[600px] w-[600px] rounded-full bg-red-600/15 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-8 lg:px-10">
        <Link
          href={`/brokers/${params.slug}`}
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-white/50 hover:text-[#00FF88] transition-colors"
        >
          <ArrowLeft size={16} aria-hidden />
          {t('backToBroker', { broker: brokerName })}
        </Link>

        <header className="mb-10 space-y-3">
          <p className="text-sm font-bold text-red-400">{t('eyebrow')}</p>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {t('pageTitle', { broker: brokerName })}
          </h1>
          <p className="text-base text-white/60 md:text-lg">{t('pageDescription')}</p>
        </header>

        <ComplaintForm brokerId={brokerId} brokerSlug={params.slug} brokerName={brokerName} />

        <footer className="mt-16 border-t border-white/5 pt-8 text-xs text-white/30">
          {t('disclaimer')}
        </footer>
      </div>
    </div>
  );
};

export default ComplaintsNewPage;
