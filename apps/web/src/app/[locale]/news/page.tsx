import { getTranslations, setRequestLocale } from 'next-intl/server';

import { NewsList } from '@/components/news/NewsList';
import { ApiClientError, fetchNews } from '@/lib/api/client';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type Props = { params: Promise<{ locale: string }> };

export const generateMetadata = async (props: Props): Promise<Metadata> => {
  const params = await props.params;
  const t = await getTranslations({ locale: params.locale, namespace: 'news' });
  return {
    title: `${t('title')} | OpenTrade`,
    description: t('subtitle'),
  };
};

const NewsPage = async (props: Props): Promise<ReactNode> => {
  const params = await props.params;
  setRequestLocale(params.locale);

  const t = await getTranslations('news');

  let items: Awaited<ReturnType<typeof fetchNews>>['items'] = [];
  let nextCursor: string | null = null;
  let error: string | null = null;

  try {
    const data = await fetchNews({ limit: 30 }, { next: { revalidate: 300 } });
    items = data.items;
    nextCursor = data.nextCursor;
  } catch (err) {
    error = err instanceof ApiClientError ? err.message : 'Failed to fetch news';
  }

  return (
    <div className="-mt-16 relative pt-16">
      {/* atmospheric glow blobs */}
      <div className="pointer-events-none fixed right-[-5%] top-[-10%] z-0 h-[700px] w-[700px] rounded-full bg-[#00FF88]/20 blur-[150px]" />
      <div className="pointer-events-none fixed bottom-[-10%] left-[-5%] z-0 h-[600px] w-[600px] rounded-full bg-blue-600/20 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[1440px] px-6 py-8 lg:px-10 lg:py-12">
        <div className="mb-10 space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-[#00FF88]/80">
            {t('eyebrow')}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{t('title')}</h1>
          <p className="max-w-2xl text-sm text-white/50">{t('subtitle')}</p>
        </div>

        {error !== null ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-sm text-red-400">
            {t('error')}
          </div>
        ) : (
          <NewsList initialItems={items} initialCursor={nextCursor} />
        )}

        <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-white/30">
          {t('disclaimer')}
        </footer>
      </div>
    </div>
  );
};

export default NewsPage;
