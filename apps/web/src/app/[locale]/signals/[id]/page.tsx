import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SignalDetailClient } from '@/components/kols/SignalDetailClient';
import { ApiClientError, fetchSignal } from '@/lib/api/client';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export const generateMetadata = async (props: Props): Promise<Metadata> => {
  const params = await props.params;
  try {
    const data = await fetchSignal(params.id, { next: { revalidate: 60 } });
    return {
      title: `${data.signal.direction} ${data.signal.symbol} | OpenTrade`,
      description: `Signal: ${data.signal.direction} ${data.signal.symbol} @ ${data.signal.entryPrice}`,
    };
  } catch {
    return { title: 'Signal | OpenTrade' };
  }
};

const SignalDetailPage = async (props: Props): Promise<ReactNode> => {
  const params = await props.params;
  setRequestLocale(params.locale);

  const t = await getTranslations('kols');

  let data: Awaited<ReturnType<typeof fetchSignal>>;
  try {
    data = await fetchSignal(params.id, { next: { revalidate: 0 } });
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const signal = data.signal;

  return (
    <div className="-mt-16 relative pt-16">
      <div className="pointer-events-none fixed right-[-5%] top-[-10%] z-0 h-[700px] w-[700px] rounded-full bg-[#00FF88]/20 blur-[150px]" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 py-8 lg:px-10 lg:py-12">
        <h1 className="mb-6 text-2xl font-bold text-white">{t('signalDetailTitle')}</h1>
        <SignalDetailClient signal={signal} />

        <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-white/30">
          {t('disclaimer')}
        </footer>
      </div>
    </div>
  );
};

export default SignalDetailPage;
