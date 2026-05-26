'use client';

import { ArrowDownRight, ArrowUpRight, Radio, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { Link } from '../../../../i18n/navigation';
import { fetchMyKolProfile, fetchKolSignals } from '../../../../lib/api/client';

import type { SignalItem, SignalOutcome } from '../../../../lib/api/client';
import type { ReactNode } from 'react';

type FilterTab = 'ALL' | SignalOutcome;

const FILTER_TABS: FilterTab[] = [
  'ALL',
  'ACTIVE',
  'HIT_TARGET',
  'HIT_DIRECTION',
  'STOPPED',
  'UNRESOLVED',
];

export default function KolSignalsPage(): ReactNode {
  const t = useTranslations('kolConsole');
  const { getAccessToken } = useOpenTradeAuth();

  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('ALL');
  const [search, setSearch] = useState('');
  const [kolSlug, setKolSlug] = useState<string | null>(null);

  const loadSignals = useCallback(async (slug: string, outcome?: SignalOutcome) => {
    try {
      const params: { outcome?: SignalOutcome; limit?: number } = { limit: 50 };
      if (outcome) params.outcome = outcome;
      const res = await fetchKolSignals(slug, params);
      setSignals(res.signals);
      setTotal(res.total);
    } catch {
      // swallow — auth gate protects
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      if (cancelled) return;
      try {
        const profileRes = await fetchMyKolProfile({ accessToken: token });
        if (cancelled) return;
        setKolSlug(profileRes.kol.slug);
        const outcome = filter === 'ALL' ? undefined : filter;
        await loadSignals(profileRes.kol.slug, outcome);
      } catch {
        // swallow
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken, filter, loadSignals]);

  useEffect(() => {
    if (!kolSlug) return;
    const outcome = filter === 'ALL' ? undefined : filter;
    void loadSignals(kolSlug, outcome);
  }, [filter, kolSlug, loadSignals]);

  const filteredSignals = search
    ? signals.filter((s) => s.symbol.toLowerCase().includes(search.toLowerCase()))
    : signals;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-white">{t('signalHistory')}</h1>
        <Link
          href="/kol/signals/new"
          className="flex items-center gap-2 rounded-lg bg-[#00FF88] px-4 py-2 text-sm font-bold text-black transition-all hover:bg-[#00e67a]"
        >
          <Radio size={16} />
          {t('newSignal')}
        </Link>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${
                filter === tab ? tabActiveClass(tab) : 'text-white/50 hover:bg-white/10'
              }`}
            >
              {t(`filter${tab}`)}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm">
          <Search size={14} className="text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-32 border-none bg-transparent text-white placeholder:text-white/30 focus:outline-none"
          />
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-white/40">
        {t('totalResults', { count: filteredSignals.length, total })}
      </p>

      {/* Signal List Table */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="border-b border-white/10 bg-black/40 text-white/50">
            <tr>
              <th className="p-4 pl-6 font-medium">{t('thSymbolDirection')}</th>
              <th className="p-4 font-medium">{t('thPrices')}</th>
              <th className="p-4 font-medium">{t('thDateHorizon')}</th>
              <th className="p-4 text-right pr-6 font-medium">{t('thOutcome')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredSignals.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-white/40">
                  {t('noSignals')}
                </td>
              </tr>
            )}
            {filteredSignals.map((sig) => (
              <tr key={sig.id} className="group transition-colors hover:bg-white/10">
                <td className="p-4 pl-6">
                  <div className="mb-1 text-base font-bold font-mono">{sig.symbol}</div>
                  <div
                    className={`flex items-center gap-1 text-xs font-bold ${
                      sig.direction === 'BUY' ? 'text-[#00FF88]' : 'text-red-400'
                    }`}
                  >
                    {sig.direction === 'BUY' ? (
                      <ArrowUpRight size={14} />
                    ) : (
                      <ArrowDownRight size={14} />
                    )}
                    {sig.direction}
                  </div>
                </td>
                <td className="p-4">
                  <div className="grid w-48 grid-cols-3 gap-2">
                    <div>
                      <span className="block text-[10px] text-white/30">Entry</span>
                      <span className="font-mono">{sig.entryPrice}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#00FF88]/50">Target</span>
                      <span className="font-mono text-[#00FF88]">{sig.targetPrice}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-red-500/50">Stop</span>
                      <span className="font-mono text-red-400">{sig.stoplossPrice ?? '—'}</span>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-mono text-white/60">
                  <div>{new Date(sig.createdAt).toLocaleDateString()}</div>
                  <div className="mt-1 inline-block rounded-sm border border-white/10 px-1 text-[10px] uppercase text-white/30">
                    {t('horizon')}: {sig.horizon}d
                  </div>
                </td>
                <td className="p-4 pr-6 text-right">
                  <OutcomeBadge outcome={sig.outcome} t={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tabActiveClass(tab: FilterTab): string {
  switch (tab) {
    case 'ALL':
      return 'bg-white text-black';
    case 'ACTIVE':
      return 'bg-blue-500 text-white';
    case 'HIT_TARGET':
      return 'bg-[#00FF88] text-black';
    case 'HIT_DIRECTION':
      return 'bg-orange-500 text-white';
    case 'STOPPED':
      return 'bg-red-500 text-white';
    default:
      return 'bg-white/20 text-white';
  }
}

function OutcomeBadge({
  outcome,
  t,
}: {
  outcome: string;
  t: ReturnType<typeof useTranslations<'kolConsole'>>;
}) {
  switch (outcome) {
    case 'ACTIVE':
      return (
        <span className="inline-flex items-center gap-1.5 rounded bg-blue-500/20 px-2 py-1 text-xs font-bold uppercase text-blue-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
          {t('outcomeActive')}
        </span>
      );
    case 'HIT_TARGET':
      return (
        <span className="rounded border border-[#00FF88]/20 bg-[#00FF88]/10 px-2 py-1 text-xs font-bold uppercase text-[#00FF88]">
          {t('outcomeHitTarget')}
        </span>
      );
    case 'HIT_DIRECTION':
      return (
        <span className="rounded border border-orange-500/20 bg-orange-500/10 px-2 py-1 text-xs font-bold uppercase text-orange-400">
          {t('outcomeHitDirection')}
        </span>
      );
    case 'STOPPED':
      return (
        <span className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs font-bold uppercase text-red-500">
          {t('outcomeStopped')}
        </span>
      );
    case 'EXPIRED':
      return (
        <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs font-bold uppercase text-white/50">
          {t('outcomeExpired')}
        </span>
      );
    default:
      return (
        <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs font-bold uppercase text-white/50">
          {t('outcomeUnresolved')}
        </span>
      );
  }
}
