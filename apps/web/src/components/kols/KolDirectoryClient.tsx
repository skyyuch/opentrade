'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Link } from '@/i18n/navigation';

import type { KolFocus, KolListItem, KolType } from '@/lib/api/client';
import type { ReactNode } from 'react';

type Props = {
  initialKols: KolListItem[];
  initialTotal: number;
};

// Per ADR-0053: the two orthogonal category axes are filtered independently.
// `ALL` keeps every value for the axis; `NONE` is the "未分類" (null) bucket the
// API cannot express as a query param, so it is filtered client-side here —
// mirroring how BrokerDirectory filters its license pills over the loaded list.
type TypeFilter = KolType | 'ALL' | 'NONE';
type FocusFilter = KolFocus | 'ALL' | 'NONE';

const TYPE_FILTERS: TypeFilter[] = ['ALL', 'FINANCIAL_KOL', 'INDICATOR_VENDOR', 'NONE'];
const FOCUS_FILTERS: FocusFilter[] = ['ALL', 'EQUITY', 'CRYPTO', 'FOREX', 'NONE'];

const TYPE_FILTER_LABEL_KEY: Record<TypeFilter, string> = {
  ALL: 'filterTypeAll',
  FINANCIAL_KOL: 'typeFinancialKol',
  INDICATOR_VENDOR: 'typeIndicatorVendor',
  NONE: 'categoryUncategorised',
};

const FOCUS_FILTER_LABEL_KEY: Record<FocusFilter, string> = {
  ALL: 'filterFocusAll',
  EQUITY: 'focusEquity',
  CRYPTO: 'focusCrypto',
  FOREX: 'focusForex',
  NONE: 'categoryUncategorised',
};

const TYPE_CHIP_LABEL_KEY: Record<KolType, string> = {
  FINANCIAL_KOL: 'typeFinancialKol',
  INDICATOR_VENDOR: 'typeIndicatorVendor',
};

const FOCUS_CHIP_LABEL_KEY: Record<KolFocus, string> = {
  EQUITY: 'focusEquity',
  CRYPTO: 'focusCrypto',
  FOREX: 'focusForex',
};

function matchesType(kol: KolListItem, filter: TypeFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'NONE') return kol.type === null;
  return kol.type === filter;
}

function matchesFocus(kol: KolListItem, filter: FocusFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'NONE') return kol.focus === null;
  return kol.focus === filter;
}

export function KolDirectoryClient({ initialKols, initialTotal }: Props): ReactNode {
  const t = useTranslations('kols');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [focusFilter, setFocusFilter] = useState<FocusFilter>('ALL');

  const filteredKols = useMemo(
    () =>
      initialKols.filter((kol) => matchesType(kol, typeFilter) && matchesFocus(kol, focusFilter)),
    [initialKols, typeFilter, focusFilter],
  );

  const isFiltering = typeFilter !== 'ALL' || focusFilter !== 'ALL';

  return (
    <div className="space-y-6">
      {/* Category filters — two orthogonal axes (ADR-0053 D2) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-white/40">
            {t('filterTypeLabel')}
          </span>
          {TYPE_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTypeFilter(key)}
              className={`rounded-full border px-3.5 py-1 text-xs font-medium transition-colors ${
                typeFilter === key
                  ? 'border-[#00FF88]/50 bg-[#00FF88]/20 text-[#00FF88]'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {t(TYPE_FILTER_LABEL_KEY[key])}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-white/40">
            {t('filterFocusLabel')}
          </span>
          {FOCUS_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFocusFilter(key)}
              className={`rounded-full border px-3.5 py-1 text-xs font-medium transition-colors ${
                focusFilter === key
                  ? 'border-[#00FF88]/50 bg-[#00FF88]/20 text-[#00FF88]'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {t(FOCUS_FILTER_LABEL_KEY[key])}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-white/40">
        {isFiltering
          ? t('showingCount', { count: filteredKols.length, total: initialTotal })
          : t('totalCount', { count: initialTotal })}
      </p>

      {filteredKols.length === 0 ? (
        <div className="flex w-full flex-col items-center rounded-2xl border border-dashed border-white/10 bg-white/5 py-16 text-center">
          <h3 className="mb-2 text-lg font-bold text-white/80">{t('noKols')}</h3>
          {isFiltering && (
            <button
              type="button"
              onClick={() => {
                setTypeFilter('ALL');
                setFocusFilter('ALL');
              }}
              className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
            >
              {t('clearFilters')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredKols.map((kol) => (
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
              {/* Category chips (ADR-0053) — rendered only when assigned. */}
              {(kol.type !== null || kol.focus !== null) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {kol.type && (
                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
                      {t(TYPE_CHIP_LABEL_KEY[kol.type])}
                    </span>
                  )}
                  {kol.focus && (
                    <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
                      {t(FOCUS_CHIP_LABEL_KEY[kol.focus])}
                    </span>
                  )}
                </div>
              )}
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
      )}
    </div>
  );
}
