'use client';

import { ExternalLink, Loader2, Newspaper } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { fetchNews } from '../../lib/api/client';

import type { NewsItem } from '../../lib/api/client';

type Props = {
  initialItems: NewsItem[];
  initialCursor: string | null;
};

export const NewsList = ({ initialItems, initialCursor }: Props) => {
  const t = useTranslations('news');
  const format = useFormatter();

  const [items, setItems] = useState<NewsItem[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const handleLoadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const data = await fetchNews({ limit: 30, cursor });
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, isLoadingMore]);

  if (items.length === 0) {
    return (
      <div className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 py-20 text-center">
        <Newspaper size={40} className="mb-4 text-white/20" />
        <h3 className="text-lg font-bold text-white">{t('empty')}</h3>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-white/10 pb-4 text-sm text-white/40">
        {t('showingCount', { count: items.length })}
      </div>

      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id}>
            {/*
              External outbound link (ADR-0057 D1): the headline links to the
              original article on the publisher's site — we never reproduce the
              body. `nofollow` + `noopener` on all third-party links.
            */}
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="group flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-zinc-900/40 p-5 backdrop-blur-xl transition-all hover:border-[#00FF88]/30 hover:bg-zinc-900/60"
            >
              <div className="min-w-0">
                <h3 className="text-base font-semibold leading-snug text-white transition-colors group-hover:text-[#00FF88]">
                  {item.title}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">
                  <span className="font-medium text-white/60">{item.sourceName}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={item.publishedAt}>
                    {format.dateTime(new Date(item.publishedAt), {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              </div>
              <ExternalLink
                size={16}
                className="mt-1 shrink-0 text-white/30 transition-colors group-hover:text-[#00FF88]"
              />
            </a>
          </li>
        ))}
      </ul>

      {cursor && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void handleLoadMore()}
            disabled={isLoadingMore}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {isLoadingMore && <Loader2 className="size-3.5 animate-spin" />}
            {t('loadMore')}
          </button>
        </div>
      )}
    </div>
  );
};
