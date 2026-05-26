'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { useOpenTradeAuth } from '@/hooks/useOpenTradeAuth';
import { Link } from '@/i18n/navigation';
import { followKol, unfollowKol } from '@/lib/api/client';

import type { KolListItem, SignalItem } from '@/lib/api/client';
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
    <div className="space-y-8">
      {/* Header section */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {kol.avatarUrl ? (
            <img
              src={kol.avatarUrl}
              alt={kol.displayName}
              className="size-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-white/60">
              {kol.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-white">{kol.displayName}</h1>
            <p className="text-sm text-white/40">@{kol.slug}</p>
            <div className="mt-1 flex gap-3 text-xs text-white/50">
              <span>
                {t('signals')}: {signalCount}
              </span>
              <span>
                {t('followers')}: {localFollowerCount}
              </span>
            </div>
          </div>
        </div>

        {authenticated && (
          <button
            type="button"
            onClick={() => void handleFollow()}
            disabled={followLoading}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50 ${
              isFollowing
                ? 'border border-white/20 text-white/60 hover:border-red-500/30 hover:text-red-400'
                : 'bg-[#00FF88] text-[#050608] hover:bg-[#00FF88]/90'
            }`}
          >
            {isFollowing ? t('following') : t('follow')}
          </button>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        {kol.status === 'UNCLAIMED' && (
          <span className="rounded bg-red-500/20 px-2 py-1 text-xs font-bold text-red-400">
            {t('unverifiedBadge')}
          </span>
        )}
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
      {kol.bio && <p className="text-sm text-white/60">{kol.bio}</p>}

      {/* Social links */}
      {kol.socialLinks && (
        <div className="flex gap-4 text-xs text-white/40">
          {kol.socialLinks.youtube && (
            <a
              href={kol.socialLinks.youtube}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white"
            >
              YouTube
            </a>
          )}
          {kol.socialLinks.twitter && (
            <a
              href={kol.socialLinks.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white"
            >
              Twitter
            </a>
          )}
          {kol.socialLinks.instagram && (
            <a
              href={kol.socialLinks.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white"
            >
              Instagram
            </a>
          )}
        </div>
      )}

      {/* Signal history */}
      <div className="space-y-4">
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
