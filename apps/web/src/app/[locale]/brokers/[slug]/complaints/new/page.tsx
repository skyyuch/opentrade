/**
 * `/brokers/[slug]/complaints/new` — submit a complaint about a broker.
 *
 * Per ADR-0029 D3: every complaint requires an evidence file. The page
 * is a thin server-component shell that fetches the broker for
 * displayName / SC-displayName / legalName (so the form header can
 * pick the locale-correct variant) and mounts `<ComplaintForm>` for
 * the actual write surface.
 *
 * Sidebar with "what is a complaint" copy explains the difference
 * between a `kind = REVIEW` opinion and a `kind = COMPLAINT` factual
 * allegation, plus the immutability + admin verification model that
 * justifies the heavier UX (evidence requirement, L2 SBT gate) vs the
 * one-tap review submit on the broker detail page.
 */

import { ArrowLeft, FileText, Lock, ScrollText, ShieldCheck } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { localizedBrokerName } from '@opentrade/shared';

import { ComplaintForm } from '@/components/complaints/ComplaintForm';
import { Link } from '@/i18n/navigation';
import { ApiClientError, fetchBroker } from '@/lib/api/client';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

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

      <div className="relative z-10 mx-auto max-w-[1280px] px-6 py-8 lg:px-10">
        <Link
          href={`/brokers/${params.slug}`}
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-white/50 hover:text-[#00FF88] transition-colors"
        >
          <ArrowLeft size={16} aria-hidden />
          {t('backToBroker', { broker: brokerName })}
        </Link>

        <header className="mb-10 max-w-3xl space-y-3">
          <p className="text-sm font-bold text-red-400">{t('eyebrow')}</p>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {t('pageTitle', { broker: brokerName })}
          </h1>
          <p className="text-base text-white/60 md:text-lg">{t('pageDescription')}</p>
        </header>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <ComplaintForm brokerId={brokerId} brokerSlug={params.slug} brokerName={brokerName} />
          </div>
          <aside className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">{renderExplainer(t)}</div>
          </aside>
        </div>

        <footer className="mt-16 border-t border-white/5 pt-8 text-xs text-white/30">
          {t('disclaimer')}
        </footer>
      </div>
    </div>
  );
};

export default ComplaintsNewPage;

type Translator = Awaited<ReturnType<typeof getTranslations>>;

const renderExplainer = (t: Translator): ReactNode => {
  const steps: { Icon: typeof ScrollText; titleKey: string; descKey: string }[] = [
    { Icon: ScrollText, titleKey: 'steps.differenceTitle', descKey: 'steps.differenceDesc' },
    { Icon: FileText, titleKey: 'steps.evidenceTitle', descKey: 'steps.evidenceDesc' },
    { Icon: ShieldCheck, titleKey: 'steps.reviewTitle', descKey: 'steps.reviewDesc' },
    { Icon: Lock, titleKey: 'steps.immutableTitle', descKey: 'steps.immutableDesc' },
  ];

  return (
    <div className="rounded-2xl bg-zinc-900/40 border border-white/10 p-6 backdrop-blur-xl">
      <h3 className="text-base font-bold text-white">{t('steps.title')}</h3>
      <ol className="mt-5 space-y-5">
        {steps.map(({ Icon, titleKey, descKey }, idx) => (
          <li key={titleKey} className="flex gap-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/60 ring-1 ring-white/10">
              <Icon size={16} aria-hidden />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold text-white">
                <span className="mr-2 text-white/40">{idx + 1}.</span>
                {t(titleKey)}
              </div>
              <p className="text-xs leading-relaxed text-white/50">{t(descKey)}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};
