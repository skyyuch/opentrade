'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Link } from '@/i18n/navigation';
import { fetchKols } from '@/lib/api/client';

import type { KolListItem } from '@/lib/api/client';
import type { ReactNode } from 'react';

type Props = {
  limit?: number;
};

export function RelatedKolsSection({ limit = 6 }: Props): ReactNode {
  const t = useTranslations('kols');
  const [kols, setKols] = useState<KolListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const data = await fetchKols({ limit }, { next: { revalidate: 120 } });
        if (!controller.signal.aborted) setKols(data.kols);
      } catch {
        /* swallow */
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [limit]);

  if (loading) {
    return (
      <div className="py-6">
        <div className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88] mx-auto" />
      </div>
    );
  }

  if (kols.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">{t('directoryTitle')}</h3>
        <Link href="/kols" className="text-xs text-[#00FF88] hover:underline">
          {t('directoryTitle')} &rarr;
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kols.map((kol) => (
          <Link
            key={kol.id}
            href={`/kols/${kol.slug}`}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:border-[#00FF88]/30"
          >
            {kol.avatarUrl ? (
              <img
                src={kol.avatarUrl}
                alt={kol.displayName}
                className="size-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/60">
                {kol.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{kol.displayName}</p>
              <p className="text-[11px] text-white/40">@{kol.slug}</p>
            </div>
            {kol.iamSmartVerified && (
              <span className="shrink-0 rounded bg-[#00FF88]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#00FF88]">
                {t('iamSmartBadge')}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
