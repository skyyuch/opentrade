/**
 * `/verify` — L2 identity verification page.
 *
 * Users upload broker account proof; the file is pinned to IPFS by our API
 * (PinataIpfsService.pinFile), browser computes a keccak256 commitment
 * locally, and the request is submitted for admin review. On approval the
 * outbox triggers an on-chain ReviewerSBT mint.
 *
 * Per ADR-0022: the raw account data never enters our DB — the server only
 * relays the file to IPFS, and only the commitment hash + IPFS CID are
 * persisted.
 *
 * Visual: Google-designed dark crypto layout with two atmospheric glows
 * (#00FF88 + blue-600) — matches the broader OpenTrade dark theme.
 */

import { getTranslations, setRequestLocale } from 'next-intl/server';

import { VerifyForm, VerifySteps } from '../../../components/verify/VerifyForm';
import { fetchBrokers } from '../../../lib/api/client';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type Props = {
  params: { locale: string };
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const t = await getTranslations({ locale: params.locale, namespace: 'verify' });
  return {
    title: `${t('title')} | OpenTrade`,
    description: t('subtitle'),
  };
};

const VerifyPage = async ({ params }: Props): Promise<ReactNode> => {
  setRequestLocale(params.locale);
  const t = await getTranslations('verify');

  let brokers: {
    slug: string;
    displayName: string;
    displayNameZhHans: string | null;
    legalName: string;
  }[] = [];
  try {
    const data = await fetchBrokers({ limit: 100, next: { revalidate: 300 } });
    // Per ADR-0026: forward all three name columns (TC + SC + EN) so
    // `localizedBrokerName()` inside VerifyForm can pick the right one.
    brokers = data.brokers.map((b) => ({
      slug: b.slug,
      displayName: b.displayName,
      displayNameZhHans: b.displayNameZhHans,
      legalName: b.legalName,
    }));
  } catch {
    // Graceful fallback: empty broker list (UI shows placeholder option).
  }

  return (
    <div className="relative w-full overflow-hidden">
      {/* Atmospheric background glows */}
      <div className="pointer-events-none absolute right-[-5%] top-[-10%] z-0 h-[600px] w-[600px] rounded-full bg-[#00FF88]/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-10%] left-[-5%] z-0 h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[100px]" />

      <main className="container relative z-10 mx-auto flex flex-col gap-12 px-4 py-12 md:py-16 lg:px-10">
        <header className="space-y-3">
          <p className="text-sm font-bold text-blue-400">{t('eyebrow')}</p>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">{t('title')}</h1>
          <p className="max-w-2xl text-base text-white/50 md:text-lg">{t('subtitle')}</p>
        </header>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-20">
          <div className="lg:col-span-7">
            <VerifyForm brokers={brokers} />
          </div>
          <aside className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <VerifySteps />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default VerifyPage;
