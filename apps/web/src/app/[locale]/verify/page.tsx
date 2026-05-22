/**
 * `/verify` — L2 identity verification page.
 *
 * Users submit their broker account proof (commitment hash + IPFS evidence)
 * to earn Verified Reviewer status and receive an on-chain SBT.
 *
 * Per ADR-0022: the server never receives raw account data — only a
 * keccak256 commitment hash computed in the user's browser.
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

  let brokers: { slug: string; displayName: string }[] = [];
  try {
    const data = await fetchBrokers({ next: { revalidate: 300 } });
    brokers = data.brokers.map((b) => ({ slug: b.slug, displayName: b.displayName }));
  } catch {
    // Graceful fallback: empty broker list, user can type slug manually
  }

  return (
    <main className="container mx-auto flex flex-col gap-12 px-4 py-12 md:py-16">
      {/* Header */}
      <header className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">{t('eyebrow')}</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t('title')}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{t('subtitle')}</p>
      </header>

      {/* Two-column layout: form + steps */}
      <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-8">
          <VerifyForm brokers={brokers} />
        </div>
        <aside className="flex flex-col gap-8">
          <VerifySteps />
        </aside>
      </div>

      <footer className="text-xs text-muted-foreground">{t('disclaimer')}</footer>
    </main>
  );
};

export default VerifyPage;
