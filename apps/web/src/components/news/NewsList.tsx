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

/**
 * Publisher-provided thumbnail (ADR-0060). Rendered with a native lazy `<img>`
 * — never `next/image`, which would re-encode/proxy (i.e. modify + re-host) the
 * publisher's own syndicated media. A load error collapses the card to the
 * text-only placeholder, so a broken/hotlink-blocked image never breaks a row.
 */
const NewsThumb = ({ src, alt }: { src: string | null; alt: string }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800/80 to-zinc-900/80">
        <Newspaper size={28} className="text-white/15" />
      </div>
    );
  }

  return (
    // Native <img> by design (ADR-0060): display the publisher's own feed image
    // unmodified from their CDN. next/image would re-encode/proxy (re-host) it.
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  );
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

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.id}>
            {/*
              External outbound link (ADR-0057 D1): the headline links to the
              original article on the publisher's site — we never reproduce the
              body. The thumbnail is the publisher's own feed image (ADR-0060).
              `nofollow` + `noopener` on all third-party links.
            */}
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="group flex h-full gap-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/40 p-3 backdrop-blur-xl transition-all hover:border-[#00FF88]/30 hover:bg-zinc-900/60"
            >
              <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-44">
                <NewsThumb src={item.imageUrl} alt={item.title} />
              </div>

              <div className="flex min-w-0 flex-1 flex-col py-1">
                <h3 className="line-clamp-3 text-base font-semibold leading-snug text-white transition-colors group-hover:text-[#00FF88]">
                  {item.title}
                </h3>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-white/40">
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
                  <ExternalLink
                    size={14}
                    className="text-white/30 transition-colors group-hover:text-[#00FF88]"
                  />
                </div>
              </div>
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
