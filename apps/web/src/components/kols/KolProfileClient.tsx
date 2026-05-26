'use client';

import { CheckCircle2, TrendingUp, Youtube } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useOpenTradeAuth } from '@/hooks/useOpenTradeAuth';
import { Link } from '@/i18n/navigation';
import { fetchKolStats, followKol, unfollowKol } from '@/lib/api/client';

import type { KolListItem, KolStats, SignalItem } from '@/lib/api/client';
import type { ReactNode } from 'react';

type Props = {
  kol: KolListItem;
  signalCount: number;
  followerCount: number;
  initialSignals: SignalItem[];
  initialSignalTotal: number;
};

export function KolProfileClient({
  kol,
  signalCount,
  followerCount,
  initialSignals,
  initialSignalTotal,
}: Props): ReactNode {
  const t = useTranslations('kols');
  const { authenticated } = usePrivy();
  const { getAccessToken } = useOpenTradeAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [localFollowerCount, setLocalFollowerCount] = useState(followerCount);
  const [stats, setStats] = useState<KolStats | null>(null);

  useEffect(() => {
    fetchKolStats(kol.slug)
      .then(setStats)
      .catch(() => {});
  }, [kol.slug]);

  const handleFollow = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await unfollowKol(kol.slug, { accessToken: token });
        setIsFollowing(false);
        setLocalFollowerCount((c) => Math.max(0, c - 1));
      } else {
        await followKol(kol.slug, { accessToken: token });
        setIsFollowing(true);
        setLocalFollowerCount((c) => c + 1);
      }
    } catch {
      /* swallow — UI stays */
    } finally {
      setFollowLoading(false);
    }
  }, [getAccessToken, isFollowing, kol.slug]);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Sidebar — lg:col-span-4 */}
      <aside className="space-y-6 lg:col-span-4">
        <ProfileCard
          kol={kol}
          signalCount={signalCount}
          followerCount={localFollowerCount}
          authenticated={authenticated}
          isFollowing={isFollowing}
          followLoading={followLoading}
          onFollow={() => void handleFollow()}
          t={t}
        />
        {stats && <StatsPanel stats={stats} t={t} />}
      </aside>

      {/* Main content — lg:col-span-8 */}
      <div className="space-y-4 lg:col-span-8">
        {kol.status === 'UNCLAIMED' && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {t('unverifiedBadge')} — {t('disclaimer')}
          </div>
        )}

        <h2 className="text-lg font-bold text-white">{t('signalHistory')}</h2>

        {initialSignals.length === 0 ? (
          <p className="py-8 text-center text-white/40">{t('noSignals')}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-white/40">
              {t('totalCount', { count: initialSignalTotal })}
            </p>
            {initialSignals.map((signal) => (
              <Link
                key={signal.id}
                href={`/signals/${signal.id}`}
                className="block rounded-lg border border-white/10 bg-white/5 p-4 transition-colors hover:border-[#00FF88]/30"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-bold ${directionColor(signal.direction)}`}
                    >
                      {t(
                        `direction${signal.direction.charAt(0) + signal.direction.slice(1).toLowerCase()}`,
                      )}
                    </span>
                    <span className="font-medium text-white">{signal.symbol}</span>
                    <span className="text-xs text-white/40">
                      {t(`assetClass${assetClassKey(signal.assetClass)}`)}
                    </span>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${outcomeColor(signal.outcome)}`}
                  >
                    {t(outcomeKey(signal.outcome))}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-white/50">
                  <div>
                    {t('entry')}: {signal.entryPrice}
                  </div>
                  <div>
                    {t('target')}: {signal.targetPrice}
                  </div>
                  <div>
                    {t('stoploss')}: {signal.stoplossPrice ?? '—'}
                  </div>
                  <div>
                    {t('horizon')}: {t('days', { count: signal.horizon })}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileCard({
  kol,
  signalCount,
  followerCount,
  authenticated,
  isFollowing,
  followLoading,
  onFollow,
  t,
}: {
  kol: KolListItem;
  signalCount: number;
  followerCount: number;
  authenticated: boolean;
  isFollowing: boolean;
  followLoading: boolean;
  onFollow: () => void;
  t: ReturnType<typeof useTranslations<'kols'>>;
}): ReactNode {
  const socialLinks = kol.socialLinks;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
      <div className="relative mx-auto mb-3 size-24">
        {kol.avatarUrl ? (
          <img
            src={kol.avatarUrl}
            alt={kol.displayName}
            className="size-24 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-24 items-center justify-center rounded-full bg-white/10 text-3xl font-bold text-white/60">
            {kol.displayName.charAt(0).toUpperCase()}
          </div>
        )}
        {kol.status === 'APPROVED' && (
          <CheckCircle2 className="absolute bottom-0 right-0 size-6 rounded-full bg-[#050608] text-[#00FF88]" />
        )}
      </div>

      <h2 className="text-xl font-bold text-white">{kol.displayName}</h2>
      <p className="mt-1 text-sm text-white/40">
        {followerCount >= 1000 ? `${(followerCount / 1000).toFixed(1)}k` : followerCount}{' '}
        {t('followers')}
      </p>
      <p className="mt-0.5 text-xs text-white/30">
        {signalCount} {t('signals')}
      </p>

      {/* Social icons */}
      {socialLinks && (
        <div className="mt-3 flex justify-center gap-3">
          {socialLinks.youtube && (
            <a
              href={socialLinks.youtube}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/40 hover:text-white"
            >
              <Youtube className="size-5" />
            </a>
          )}
          {socialLinks.twitter && (
            <a
              href={socialLinks.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/40 hover:text-white"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          )}
          {socialLinks.instagram && (
            <a
              href={socialLinks.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/40 hover:text-white"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
            </a>
          )}
        </div>
      )}

      {/* Badges */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {kol.iamSmartVerified && (
          <span className="rounded bg-[#00FF88]/20 px-2 py-1 text-xs font-bold text-[#00FF88]">
            {t('iamSmartBadge')}
          </span>
        )}
        {kol.credentials?.map((c, i) => (
          <span
            key={i}
            className={`rounded px-2 py-1 text-xs ${c.verified ? 'bg-[#00FF88]/10 text-[#00FF88]' : 'bg-white/10 text-white/50'}`}
          >
            {c.type}
          </span>
        ))}
      </div>

      {/* Bio */}
      {kol.bio && <p className="mt-4 text-sm text-white/60">{kol.bio}</p>}

      {/* Follow button */}
      {authenticated && (
        <button
          type="button"
          onClick={onFollow}
          disabled={followLoading}
          className={`mt-4 w-full rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${
            isFollowing
              ? 'border border-white/20 text-white/60 hover:border-red-500/30 hover:text-red-400'
              : 'bg-[#00FF88] text-[#050608] hover:bg-[#00FF88]/90'
          }`}
        >
          {isFollowing ? t('following') : t('follow')}
        </button>
      )}
    </div>
  );
}

function StatsPanel({
  stats,
  t,
}: {
  stats: KolStats;
  t: ReturnType<typeof useTranslations<'kols'>>;
}): ReactNode {
  const ASSET_LABELS: Record<string, string> = {
    HK: '港股 (HK)',
    US: '美股 (US)',
    Crypto: '加密 (Crypto)',
    Futures: '期貨 (Futures)',
    Forex: '外匯 (Forex)',
  };

  const HORIZON_LABELS: Record<string, string> = {
    short: '短線 (<7d)',
    mid: '中線 (8-30d)',
    long: '長線 (>30d)',
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
        <TrendingUp className="size-4 text-[#00FF88]" />
        {t('statsTitle')}
      </h3>

      {/* Headline win rates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold font-mono text-[#00FF88]">
            {stats.directionWinRate !== null ? `${stats.directionWinRate}%` : '—'}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-white/40">
            {t('winRateDirection')}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold font-mono text-white">
            {stats.targetWinRate !== null ? `${stats.targetWinRate}%` : '—'}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-white/40">
            {t('winRateTarget')}
          </div>
        </div>
      </div>

      {/* By asset class */}
      {Object.keys(stats.statsByAsset).length > 0 && (
        <div className="mt-4">
          <div className="mb-2 border-b border-white/10 pb-1 text-xs font-bold text-white/50">
            {t('statsByAsset')}
          </div>
          <div className="space-y-2">
            {Object.entries(stats.statsByAsset).map(([key, rate]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-white/60">{ASSET_LABELS[key] ?? key}</span>
                <span className="font-mono text-white">{rate}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By horizon */}
      {Object.values(stats.statsByHorizon).some((v) => v > 0) && (
        <div className="mt-4">
          <div className="mb-2 border-b border-white/10 pb-1 text-xs font-bold text-white/50">
            {t('statsByHorizon')}
          </div>
          <div className="space-y-2">
            {Object.entries(stats.statsByHorizon).map(([key, rate]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-white/60">{HORIZON_LABELS[key] ?? key}</span>
                <span className="font-mono text-white">{rate}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unresolved footnote */}
      {stats.unresolvedCount > 0 && (
        <p className="mt-3 text-[10px] text-[#00FF88]/40">
          * {stats.unresolvedCount} {t('unresolvedFootnote')}
        </p>
      )}
    </div>
  );
}

function directionColor(dir: string): string {
  switch (dir) {
    case 'BUY':
      return 'bg-[#00FF88]/20 text-[#00FF88]';
    case 'SELL':
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-white/10 text-white/60';
  }
}

function outcomeColor(outcome: string): string {
  switch (outcome) {
    case 'HIT_TARGET':
      return 'bg-[#00FF88]/20 text-[#00FF88]';
    case 'HIT_DIRECTION':
      return 'bg-emerald-500/20 text-emerald-400';
    case 'STOPPED':
      return 'bg-red-500/20 text-red-400';
    case 'EXPIRED':
      return 'bg-white/10 text-white/50';
    case 'ACTIVE':
      return 'bg-blue-500/20 text-blue-400';
    default:
      return 'bg-white/10 text-white/40';
  }
}

function outcomeKey(outcome: string): string {
  switch (outcome) {
    case 'HIT_TARGET':
      return 'hitTarget';
    case 'HIT_DIRECTION':
      return 'hitDirection';
    case 'STOPPED':
      return 'stopped';
    case 'EXPIRED':
      return 'expired';
    case 'ACTIVE':
      return 'active';
    default:
      return 'unresolved';
  }
}

function assetClassKey(ac: string): string {
  switch (ac) {
    case 'EQUITY_HK':
      return 'EquityHk';
    case 'EQUITY_US':
      return 'EquityUs';
    case 'FUTURES':
      return 'Futures';
    case 'SPOT':
      return 'Spot';
    case 'FOREX':
      return 'Forex';
    case 'CRYPTO':
      return 'Crypto';
    default:
      return 'Crypto';
  }
}
