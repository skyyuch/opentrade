'use client';

import { ArrowDownRight, ArrowUpRight, CheckCircle2, Radio, TrendingUp, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useOpenTradeAuth } from '../../../../hooks/useOpenTradeAuth';
import { Link } from '../../../../i18n/navigation';
import { fetchMyKolProfile, fetchKolStats, fetchKolSignals } from '../../../../lib/api/client';

import type { KolListItem, KolStats, SignalItem } from '../../../../lib/api/client';
import type { ReactNode } from 'react';

export default function KolDashboardPage(): ReactNode {
  const t = useTranslations('kolConsole');
  const { getAccessToken } = useOpenTradeAuth();

  const [kol, setKol] = useState<KolListItem | null>(null);
  const [stats, setStats] = useState<KolStats | null>(null);
  const [recentSignals, setRecentSignals] = useState<SignalItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      if (cancelled) return;

      try {
        const profileRes = await fetchMyKolProfile({ accessToken: token });
        if (cancelled) return;
        setKol(profileRes.kol);

        const [statsRes, signalsRes] = await Promise.all([
          fetchKolStats(profileRes.kol.slug),
          fetchKolSignals(profileRes.kol.slug, { limit: 5 }),
        ]);
        if (cancelled) return;
        setStats(statsRes);
        setRecentSignals(signalsRes.signals);
      } catch {
        // layout auth gate ensures KOL exists; swallow for resilience
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">
            {t('welcomeBack', { name: kol ? kol.displayName : '' })}
          </h1>
          <p className="mt-1 text-sm text-white/50">{t('dashboardSubtitle')}</p>
        </div>
        <Link
          href="/kol/signals"
          className="flex items-center gap-2 rounded-xl bg-[#00FF88] px-6 py-3 font-bold text-black transition-all hover:bg-[#00e67a] hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]"
        >
          <Radio size={18} />
          {t('newSignal')}
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label={t('statFollowers')} value="—" color="blue" />
        <StatCard
          icon={Radio}
          label={t('statTotalSignals')}
          value={stats?.totalSignals?.toString() ?? '0'}
          color="purple"
        />
        <StatCard
          icon={TrendingUp}
          label={t('statDirectionWinRate')}
          value={stats?.directionWinRate != null ? `${stats.directionWinRate}%` : '—'}
          color="green"
          highlight
        />
        <StatCard
          icon={CheckCircle2}
          label={t('statTargetWinRate')}
          value={stats?.targetWinRate != null ? `${stats.targetWinRate}%` : '—'}
          color="orange"
        />
      </div>

      {/* Recent Signals Table */}
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{t('recentSignals')}</h2>
          <Link
            href="/kol/signals"
            className="text-sm text-white/50 transition-colors hover:text-white"
          >
            {t('viewAll')} &rarr;
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="border-b border-white/10 bg-black/40 text-white/50">
              <tr>
                <th className="p-4 font-medium">{t('thDate')}</th>
                <th className="p-4 font-medium">{t('thAsset')}</th>
                <th className="p-4 font-medium">{t('thDirection')}</th>
                <th className="p-4 font-medium">{t('thTarget')}</th>
                <th className="p-4 text-right font-medium">{t('thStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {recentSignals.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-white/40">
                    {t('noSignals')}
                  </td>
                </tr>
              )}
              {recentSignals.map((sig) => (
                <tr key={sig.id} className="transition-colors hover:bg-white/10">
                  <td className="p-4 font-mono text-white/60">
                    {new Date(sig.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 font-bold font-mono">{sig.symbol}</td>
                  <td className="p-4">
                    <span
                      className={`flex items-center gap-1 font-bold ${
                        sig.direction === 'BUY' ? 'text-[#00FF88]' : 'text-red-400'
                      }`}
                    >
                      {sig.direction === 'BUY' ? (
                        <ArrowUpRight size={14} />
                      ) : (
                        <ArrowDownRight size={14} />
                      )}
                      {sig.direction}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-white/80">{sig.targetPrice}</td>
                  <td className="p-4 text-right">
                    <OutcomeBadge outcome={sig.outcome} t={t} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const COLOR_MAP = {
  blue: { bg: 'bg-blue-500/20', text: 'text-blue-400', glow: 'bg-blue-500/10' },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-400', glow: 'bg-purple-500/10' },
  green: { bg: 'bg-[#00FF88]/20', text: 'text-[#00FF88]', glow: 'bg-[#00FF88]/10' },
  orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', glow: 'bg-orange-500/10' },
} as const;

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  highlight,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  color: keyof typeof COLOR_MAP;
  highlight?: boolean;
}) {
  const c = COLOR_MAP[color];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6">
      <div
        className={`pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full ${c.glow} blur-3xl`}
      />
      <div className="mb-4 flex items-center gap-3">
        <div className={`rounded-lg p-2 ${c.bg} ${c.text}`}>
          <Icon size={20} />
        </div>
        <div className="text-sm font-bold text-white/50">{label}</div>
      </div>
      <div className={`text-4xl font-mono font-bold ${highlight ? c.text : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
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
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400">
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
