import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { KolProfileClient } from '@/components/kols/KolProfileClient';
import { ApiClientError, fetchKolProfile, fetchKolSignals } from '@/lib/api/client';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type Props = {
  params: { locale: string; slug: string };
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  try {
    const data = await fetchKolProfile(params.slug, { next: { revalidate: 60 } });
    return {
      title: `${data.kol.displayName} | OpenTrade`,
      description: data.kol.bio ?? `KOL profile for ${data.kol.displayName}`,
    };
  } catch {
    return { title: 'KOL | OpenTrade' };
  }
};

const KolProfilePage = async ({ params }: Props): Promise<ReactNode> => {
  setRequestLocale(params.locale);

  const t = await getTranslations('kols');

  let profileData: Awaited<ReturnType<typeof fetchKolProfile>>;
  let signalsData: Awaited<ReturnType<typeof fetchKolSignals>>;

  try {
    [profileData, signalsData] = await Promise.all([
      fetchKolProfile(params.slug, { next: { revalidate: 0 } }),
      fetchKolSignals(params.slug, { limit: 20 }, { next: { revalidate: 0 } }),
    ]);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="-mt-16 relative pt-16">
      <div className="pointer-events-none fixed right-[-5%] top-[-10%] z-0 h-[700px] w-[700px] rounded-full bg-[#00FF88]/20 blur-[150px]" />

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-8 lg:px-10 lg:py-12">
        <KolProfileClient
          kol={profileData.kol}
          signalCount={profileData.signalCount}
          followerCount={profileData.followerCount}
          initialSignals={signalsData.signals}
          initialSignalTotal={signalsData.total}
        />

        <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-white/30">
          {t('disclaimer')}
        </footer>
      </div>
    </div>
  );
};

export default KolProfilePage;
