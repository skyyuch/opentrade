'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

import type { KolListItem } from '@/lib/api/client';
import type { ReactNode } from 'react';

type Props = {
  initialKols: KolListItem[];
  initialTotal: number;
};

export function KolDirectoryClient({ initialKols, initialTotal }: Props): ReactNode {
  const t = useTranslations('kols');

  if (initialKols.length === 0) {
    return <p className="py-12 text-center text-white/40">{t('noKols')}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/40">{t('totalCount', { count: initialTotal })}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {initialKols.map((kol) => (
          <Link
            key={kol.id}
            href={`/kols/${kol.slug}`}
            className="group rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-[#00FF88]/30 hover:bg-white/[0.07]"
          >
            <div className="flex items-center gap-3">
              {kol.avatarUrl ? (
                <img
                  src={kol.avatarUrl}
                  alt={kol.displayName}
                  className="size-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white/60">
                  {kol.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white group-hover:text-[#00FF88] transition-colors">
                  {kol.displayName}
                </p>
                <p className="text-xs text-white/40">@{kol.slug}</p>
              </div>
              {kol.status === 'UNCLAIMED' && (
                <span className="shrink-0 rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
                  {t('unverifiedBadge')}
                </span>
              )}
              {kol.iamSmartVerified && (
                <span className="shrink-0 rounded bg-[#00FF88]/20 px-2 py-0.5 text-[10px] font-bold text-[#00FF88]">
                  {t('iamSmartBadge')}
                </span>
              )}
            </div>
            {kol.bio && <p className="mt-3 line-clamp-2 text-sm text-white/50">{kol.bio}</p>}
            {kol.credentials && kol.credentials.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {kol.credentials.slice(0, 3).map((c, i) => (
                  <span
                    key={i}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${c.verified ? 'bg-[#00FF88]/10 text-[#00FF88]' : 'bg-white/10 text-white/50'}`}
                  >
                    {c.type}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
