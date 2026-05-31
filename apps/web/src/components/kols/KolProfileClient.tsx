'use client';

import { usePrivy } from '@privy-io/react-auth';
import {
  Activity,
  AlignJustify,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  GitCommit,
  LayoutGrid,
  List,
  ShieldAlert,
  TrendingUp,
  Youtube,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { NoteCard } from '@/components/notes/NoteCard';
import { useOpenTradeAuth } from '@/hooks/useOpenTradeAuth';
import { Link } from '@/i18n/navigation';
import {
  fetchKolStats,
  fetchNotes,
  followKol,
  unfollowKol,
  type KolListItem,
  type KolNoteListItemDto,
  type KolStats,
  type SignalItem,
} from '@/lib/api/client';

import type { ReactNode } from 'react';

type SignalLayout = 'timeline' | 'grid' | 'list' | 'compact';

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
      .catch(() => undefined);
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
      {/* Unclaimed Banner */}
      {kol.status === 'UNCLAIMED' && (
        <div className="col-span-full flex flex-col items-center justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <ShieldAlert className="shrink-0 text-red-400" size={24} />
            <div>
              <h4 className="mb-1 font-bold text-red-400">{t('unclaimedTitle')}</h4>
              <p className="text-sm text-red-400/70">{t('unclaimedDesc')}</p>
            </div>
          </div>
          <button
            type="button"
            className="whitespace-nowrap rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600"
          >
            {t('unclaimedCta')}
          </button>
        </div>
      )}

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
      <SignalSection kol={kol} signals={initialSignals} total={initialSignalTotal} t={t} />
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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="mb-6 flex flex-col items-center space-y-4 text-center">
        <div className="relative size-24 overflow-hidden rounded-full border-4 border-white/10 bg-zinc-900">
          {kol.avatarUrl ? (
            <img src={kol.avatarUrl} alt={kol.displayName} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-3xl font-bold text-white/60">
              {kol.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {kol.status === 'APPROVED' && (
            <div className="absolute bottom-0 right-0 rounded-full border-2 border-zinc-950 bg-[#00FF88] p-1 text-black">
              <CheckCircle2 size={12} className="fill-black text-[#00FF88]" />
            </div>
          )}
        </div>

        <div>
          <h1 className="mb-1 text-2xl font-bold text-white">{kol.displayName}</h1>
          <div className="flex items-center justify-center gap-2 text-sm text-white/40">
            <span>
              {followerCount >= 1000 ? `${(followerCount / 1000).toFixed(1)}k` : followerCount}{' '}
              {t('followers')}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-white/30">
            {signalCount} {t('signals')}
          </p>
        </div>

        {/* Social icons */}
        {socialLinks && (
          <div className="flex w-full items-center justify-center gap-3">
            {socialLinks.youtube && (
              <a
                href={socialLinks.youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-white/5 p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Youtube size={18} />
              </a>
            )}
            {socialLinks.twitter && (
              <a
                href={socialLinks.twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-white/5 p-2 text-white/60 transition-colors hover:bg-[#1DA1F2]/20 hover:text-[#1DA1F2]"
              >
                <svg className="size-[18px]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            )}
            {socialLinks.instagram && (
              <a
                href={socialLinks.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-white/5 p-2 text-white/60 transition-colors hover:bg-[#E1306C]/20 hover:text-[#E1306C]"
              >
                <svg className="size-[18px]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
            )}
          </div>
        )}

        {/* Badges */}
        <div className="flex w-full flex-wrap justify-center gap-2">
          {kol.iamSmartVerified && (
            <span className="rounded-full border border-[#00FF88]/20 bg-[#00FF88]/10 px-3 py-1 text-xs font-bold text-[#00FF88]">
              {t('iamSmartBadge')}
            </span>
          )}
          {kol.credentials?.map((c, i) => (
            <span
              key={i}
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                c.verified
                  ? 'border-[#00FF88]/20 bg-[#00FF88]/10 text-[#00FF88]'
                  : 'border-white/10 bg-white/10 text-white/80'
              }`}
            >
              {c.type}
            </span>
          ))}
        </div>
      </div>

      {/* Bio */}
      {kol.bio && <p className="mb-4 text-center text-sm text-white/60">{kol.bio}</p>}

      {/* Follow button */}
      {authenticated && (
        <button
          type="button"
          onClick={onFollow}
          disabled={followLoading}
          className={`w-full rounded-xl py-3 font-bold transition-all disabled:opacity-50 ${
            isFollowing
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-blue-600 text-white hover:bg-blue-500'
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
      <h3 className="mb-6 flex items-center gap-2 text-lg font-bold text-white">
        <TrendingUp size={20} className="text-[#00FF88]" />
        {t('statsTitle')}
      </h3>

      {/* Headline win rates */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/5 bg-black/30 p-4">
          <div className="mb-1 text-xs text-white/40">{t('winRateDirection')}</div>
          <div className="font-mono text-2xl font-bold text-[#00FF88]">
            {stats.directionWinRate !== null ? `${stats.directionWinRate}%` : '—'}
          </div>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/30 p-4">
          <div className="mb-1 text-xs text-white/40">{t('winRateTarget')}</div>
          <div className="font-mono text-2xl font-bold text-white">
            {stats.targetWinRate !== null ? `${stats.targetWinRate}%` : '—'}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* By asset class */}
        {Object.keys(stats.statsByAsset).length > 0 && (
          <div>
            <div className="mb-2 border-b border-white/10 pb-1 text-sm font-bold text-white">
              {t('statsByAsset')}
            </div>
            <div className="space-y-2">
              {Object.entries(stats.statsByAsset).map(([key, rate]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-white/60">{ASSET_LABELS[key] ?? key}</span>
                  <span className="font-mono text-[#00FF88]">{rate}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By horizon */}
        {Object.values(stats.statsByHorizon).some((v) => v > 0) && (
          <div>
            <div className="mb-2 border-b border-white/10 pb-1 text-sm font-bold text-white">
              {t('statsByHorizon')}
            </div>
            <div className="space-y-2">
              {Object.entries(stats.statsByHorizon).map(([key, rate]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-white/60">{HORIZON_LABELS[key] ?? key}</span>
                  <span className="font-mono text-[#00FF88]">{rate}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Unresolved footnote */}
      {stats.unresolvedCount > 0 && (
        <p className="mt-6 text-center text-xs text-[#00FF88]/40">
          * {stats.unresolvedCount} {t('unresolvedFootnote')}
        </p>
      )}
    </div>
  );
}

const LAYOUT_ICONS: { key: SignalLayout; Icon: typeof GitCommit; label: string }[] = [
  { key: 'timeline', Icon: GitCommit, label: 'Timeline' },
  { key: 'grid', Icon: LayoutGrid, label: 'Grid' },
  { key: 'list', Icon: List, label: 'List' },
  { key: 'compact', Icon: AlignJustify, label: 'Compact' },
];

type HistoryFilter = 'all' | 'HIT_TARGET' | 'HIT_DIRECTION' | 'STOPPED' | 'UNRESOLVED' | 'EXPIRED';

function SignalSection({
  kol,
  signals,
  total,
  t,
}: {
  kol: KolListItem;
  signals: SignalItem[];
  total: number;
  t: ReturnType<typeof useTranslations<'kols'>>;
}): ReactNode {
  const tCard = useTranslations('noteCard');
  const [layout, setLayout] = useState<SignalLayout>('timeline');
  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'notes'>('active');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [notes, setNotes] = useState<KolNoteListItemDto[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchNotes({ kolId: kol.id, limit: 50 })
      .then((res) => {
        if (!cancelled) setNotes(res.notes);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [kol.id]);

  const activeSignals = useMemo(() => signals.filter((s) => s.outcome === 'ACTIVE'), [signals]);
  const historySignals = useMemo(() => signals.filter((s) => s.outcome !== 'ACTIVE'), [signals]);

  const displaySignals = useMemo(() => {
    if (activeTab === 'active') return activeSignals;
    return historyFilter === 'all'
      ? historySignals
      : historySignals.filter((s) => s.outcome === historyFilter);
  }, [activeTab, activeSignals, historySignals, historyFilter]);

  return (
    <div className="min-w-0 lg:col-span-8">
      {/* Tab bar */}
      <div className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`flex items-center gap-2 border-b-2 pb-2 text-lg font-bold transition-colors ${
              activeTab === 'active'
                ? 'border-[#00FF88] text-[#00FF88]'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            {t('tabActive')}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'active'
                  ? 'bg-[#00FF88]/20 text-[#00FF88]'
                  : 'bg-white/10 text-white/50'
              }`}
            >
              {activeSignals.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 border-b-2 pb-2 text-lg font-bold transition-colors ${
              activeTab === 'history'
                ? 'border-white text-white'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            {t('tabHistory')}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'history' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'
              }`}
            >
              {historySignals.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`flex items-center gap-2 border-b-2 pb-2 text-lg font-bold transition-colors ${
              activeTab === 'notes'
                ? 'border-[#00FF88] text-[#00FF88]'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            {t('tabNotes')}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === 'notes'
                  ? 'bg-[#00FF88]/20 text-[#00FF88]'
                  : 'bg-white/10 text-white/50'
              }`}
            >
              {notes.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-4">
          {activeTab === 'history' && (
            <div className="flex animate-in fade-in items-center gap-2 text-sm">
              <span className="text-white/40">{t('filterLabel')}</span>
              <select
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value as HistoryFilter)}
                className="cursor-pointer appearance-none rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white transition-colors hover:bg-white/10 focus:outline-none"
              >
                <option value="all" className="bg-zinc-900">
                  {t('filterAll')}
                </option>
                <option value="HIT_TARGET" className="bg-zinc-900">
                  Hit Target
                </option>
                <option value="HIT_DIRECTION" className="bg-zinc-900">
                  Hit Direction
                </option>
                <option value="STOPPED" className="bg-zinc-900">
                  Stopped
                </option>
                <option value="UNRESOLVED" className="bg-zinc-900">
                  Unresolved
                </option>
                <option value="EXPIRED" className="bg-zinc-900">
                  Expired
                </option>
              </select>
            </div>
          )}

          <div
            className={`ml-auto hidden items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1 lg:flex ${
              activeTab === 'notes' ? 'lg:hidden' : ''
            }`}
          >
            {LAYOUT_ICONS.map(({ key, Icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setLayout(key)}
                title={label}
                className={`rounded-md p-1.5 transition-colors ${
                  layout === key
                    ? 'bg-[#00FF88]/20 text-[#00FF88]'
                    : 'text-white/40 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notes tab */}
      {activeTab === 'notes' ? (
        notes.length === 0 ? (
          <div className="flex w-full flex-col items-center rounded-2xl border border-dashed border-white/10 bg-white/5 p-12 text-center">
            <GitCommit className="mb-4 text-white/20" size={48} />
            <h3 className="mb-2 text-lg font-bold text-white/80">{t('noNotes')}</h3>
            <p className="max-w-md text-sm text-white/40">{t('noNotesDesc')}</p>
          </div>
        ) : (
          <div className="grid animate-in fade-in slide-in-from-bottom-4 grid-cols-1 items-start gap-4 duration-500 md:grid-cols-2">
            {notes.map((note) => (
              <div key={note.id} className="min-h-[160px]">
                <NoteCard
                  note={note}
                  href={`/notes/${note.id}`}
                  labels={{
                    associatedSignal: tCard('associatedSignal'),
                    readMore: tCard('readMore'),
                  }}
                />
              </div>
            ))}
          </div>
        )
      ) : /* Unclaimed — cannot view signals */
      kol.status === 'UNCLAIMED' ? (
        <div className="flex w-full flex-col items-center rounded-2xl border border-dashed border-white/10 bg-white/5 p-12 text-center">
          <ShieldAlert className="mb-4 text-white/20" size={48} />
          <h3 className="mb-2 text-lg font-bold text-white/80">{t('cannotViewSignals')}</h3>
          <p className="max-w-md text-sm text-white/40">{t('cannotViewSignalsDesc')}</p>
        </div>
      ) : displaySignals.length === 0 ? (
        <div className="flex w-full flex-col items-center rounded-2xl border border-dashed border-white/10 bg-white/5 p-12 text-center">
          <Activity className="mb-4 text-white/20" size={48} />
          <h3 className="text-lg font-bold text-white/80">
            {activeTab === 'active' ? t('noActiveSignals') : t('noHistorySignals')}
          </h3>
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs text-white/40">{t('totalCount', { count: total })}</p>

          {layout === 'grid' && <SignalGrid signals={displaySignals} t={t} />}
          {layout === 'timeline' && <SignalTimeline signals={displaySignals} t={t} />}
          {layout === 'list' && <SignalList signals={displaySignals} t={t} />}
          {layout === 'compact' && <SignalCompact signals={displaySignals} t={t} />}
        </>
      )}
    </div>
  );
}

type SignalRenderProps = {
  signals: SignalItem[];
  t: ReturnType<typeof useTranslations<'kols'>>;
};

function getTypeIcon(direction: string): ReactNode {
  switch (direction) {
    case 'BUY':
      return (
        <div className="rounded-full bg-[#00FF88]/10 p-1.5 text-[#00FF88]">
          <ArrowUpRight size={16} />
        </div>
      );
    case 'SELL':
      return (
        <div className="rounded-full bg-red-500/10 p-1.5 text-red-500">
          <ArrowDownRight size={16} />
        </div>
      );
    default:
      return (
        <div className="rounded-full bg-white/10 p-1.5 text-white/50">
          <Circle size={16} />
        </div>
      );
  }
}

function SignalCardContent({
  s,
  t,
}: {
  s: SignalItem;
  t: ReturnType<typeof useTranslations<'kols'>>;
}): ReactNode {
  return (
    <>
      {s.outcome.includes('HIT') && (
        <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-[#00FF88]/5 blur-3xl" />
      )}
      {s.outcome === 'STOPPED' && (
        <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-red-500/5 blur-3xl" />
      )}

      {/* Top: Direction icon + symbol + date → status badge */}
      <div className="relative z-10 flex w-full items-start justify-between">
        <div className="flex items-center gap-3">
          {getTypeIcon(s.direction)}
          <div>
            <div className="flex items-center gap-2 font-mono text-lg font-bold text-white">
              {s.symbol}
            </div>
            <div className="mt-0.5 font-mono text-xs text-white/40">{s.createdAt.slice(0, 10)}</div>
          </div>
        </div>
        <div className="shrink-0">{getStatusBadge(s.outcome)}</div>
      </div>

      {/* Middle: 3-column prices */}
      <div className="relative z-10 grid w-full grid-cols-3 gap-2">
        <div className="overflow-hidden rounded-xl border border-white/5 bg-black/30 p-2.5">
          <div className="mb-1 truncate text-[10px] leading-tight text-white/40">{t('entry')}</div>
          <div className="truncate font-mono text-sm text-white">{s.entryPrice}</div>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/5 bg-black/30 p-2.5">
          <div className="mb-1 truncate text-[10px] leading-tight text-white/40">{t('target')}</div>
          <div className="truncate font-mono text-sm text-[#00FF88]">{s.targetPrice}</div>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/5 bg-black/30 p-2.5">
          <div className="mb-1 truncate text-[10px] leading-tight text-white/40">
            {t('stoploss')}
          </div>
          <div className="truncate font-mono text-sm text-red-400">{s.stoplossPrice ?? '—'}</div>
        </div>
      </div>

      {/* Bottom: settle price or horizon */}
      <div className="relative z-10 mt-auto flex w-full items-center justify-between border-t border-white/5 pt-2">
        {s.settlePrice ? (
          <>
            <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] text-white/40">
              {t('settledPrice')}
            </span>
            <span
              className={`font-mono text-lg ${
                s.outcome.includes('HIT')
                  ? 'font-bold text-[#00FF88]'
                  : s.outcome === 'STOPPED'
                    ? 'font-bold text-red-400'
                    : 'text-white'
              }`}
            >
              {s.settlePrice}
            </span>
          </>
        ) : (
          <>
            <span className="inline-block rounded bg-black/30 px-2 py-1 text-[10px] text-white/50">
              {t('days', { count: s.horizon })}
            </span>
            <span className="hidden text-[10px] text-white/30 sm:block">
              Tx: {s.contentHash.substring(0, 6)}...
              {s.contentHash.substring(s.contentHash.length - 4)}
            </span>
          </>
        )}
      </div>
    </>
  );
}

function SignalGrid({ signals, t }: SignalRenderProps): ReactNode {
  return (
    <div className="grid animate-in fade-in slide-in-from-bottom-4 grid-cols-1 items-start gap-4 duration-500 md:grid-cols-2">
      {signals.map((s) => (
        <Link
          key={s.id}
          href={`/signals/${s.id}`}
          className="group relative flex cursor-pointer flex-col gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-sm transition-all hover:bg-white/10"
        >
          <SignalCardContent s={s} t={t} />
        </Link>
      ))}
    </div>
  );
}

function SignalTimeline({ signals, t }: SignalRenderProps): ReactNode {
  return (
    <div className="relative animate-in fade-in slide-in-from-bottom-4 space-y-4 duration-500 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-white/10 before:to-transparent md:before:mx-auto md:before:translate-x-0">
      {signals.map((s) => (
        <div
          key={s.id}
          className="group relative flex select-none items-center justify-between md:justify-normal md:odd:flex-row-reverse"
        >
          <div className="absolute left-5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-[#050608] md:left-1/2 md:-translate-x-1/2">
            <div className="h-1.5 w-1.5 rounded-full bg-[#00FF88] opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="ml-auto w-full cursor-pointer pl-12 transition-transform hover:-translate-y-1 md:ml-0 md:w-[47%] md:pl-0 md:odd:ml-auto md:even:mr-auto">
            <Link
              href={`/signals/${s.id}`}
              className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur-sm transition-colors hover:bg-white/10"
            >
              <SignalCardContent s={s} t={t} />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function SignalList({ signals, t }: SignalRenderProps): ReactNode {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-3 duration-500">
      {signals.map((s) => (
        <Link
          key={s.id}
          href={`/signals/${s.id}`}
          className="flex cursor-pointer flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-4 transition-all hover:scale-[1.01] hover:bg-white/10 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-4 sm:w-1/4">
            {getTypeIcon(s.direction)}
            <div>
              <div className="flex items-center gap-2 font-mono font-bold text-white">
                {s.symbol}
              </div>
              <div className="font-mono text-xs text-white/50">{s.createdAt.slice(0, 10)}</div>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-4 border-b border-t border-white/10 py-3 sm:border-transparent sm:py-0">
            <div>
              <div className="text-[10px] text-white/40">{t('entry')}</div>
              <div className="font-mono text-sm">{s.entryPrice}</div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">{t('target')}</div>
              <div className="font-mono text-sm text-[#00FF88]">{s.targetPrice}</div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">{t('stoploss')}</div>
              <div className="font-mono text-sm text-red-400">{s.stoplossPrice ?? '—'}</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-1 sm:w-1/4 sm:flex-col sm:items-end">
            {getStatusBadge(s.outcome)}
            <span className="text-xs text-white/50">
              {s.settlePrice ? (
                <span className="font-mono font-bold">{s.settlePrice}</span>
              ) : (
                t('days', { count: s.horizon })
              )}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function SignalCompact({ signals, t }: SignalRenderProps): ReactNode {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 overflow-hidden overflow-x-auto rounded-xl border border-white/10 bg-white/5 duration-500">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead className="border-b border-white/10 bg-black/40 text-xs text-white/40">
          <tr>
            <th className="px-4 py-3 font-medium">{t('emittedAt')}</th>
            <th className="px-4 py-3 font-medium">{t('signals')}</th>
            <th className="px-4 py-3 font-medium">{t('entry')}</th>
            <th className="px-4 py-3 font-medium">{t('target')}</th>
            <th className="px-4 py-3 font-medium">{t('stoploss')}</th>
            <th className="px-4 py-3 text-right font-medium">{t('outcome')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {signals.map((s) => (
            <tr key={s.id} className="group cursor-pointer transition-colors hover:bg-white/10">
              <td className="px-4 py-3.5 font-mono text-white/50 group-hover:text-white/80">
                {s.createdAt.slice(0, 10)}
              </td>
              <td className="px-4 py-3.5">
                <Link href={`/signals/${s.id}`} className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${directionColor(s.direction)}`}
                  >
                    {s.direction}
                  </span>
                  <span className="font-mono font-bold text-white">{s.symbol}</span>
                </Link>
              </td>
              <td className="px-4 py-3.5 font-mono">{s.entryPrice}</td>
              <td className="px-4 py-3.5 font-mono text-[#00FF88]">{s.targetPrice}</td>
              <td className="px-4 py-3.5 font-mono text-red-400">{s.stoplossPrice ?? '—'}</td>
              <td className="px-4 py-3.5 text-right">
                <div className="flex justify-end">{getStatusBadge(s.outcome)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getStatusBadge(outcome: string): ReactNode {
  switch (outcome) {
    case 'HIT_TARGET':
      return (
        <span className="rounded border border-[#00FF88]/20 bg-[#00FF88]/10 px-2 py-0.5 text-xs font-bold text-[#00FF88]">
          Hit Target
        </span>
      );
    case 'HIT_DIRECTION':
      return (
        <span className="rounded border border-[#00FF88]/10 bg-[#00FF88]/5 px-2 py-0.5 text-xs font-bold text-[#00FF88]/70">
          Hit Direction
        </span>
      );
    case 'STOPPED':
      return (
        <span className="rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-500">
          Stopped
        </span>
      );
    case 'EXPIRED':
      return (
        <span className="rounded border border-white/20 bg-white/10 px-2 py-0.5 text-xs font-bold text-white/50">
          Expired
        </span>
      );
    case 'UNRESOLVED':
      return (
        <span className="rounded border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-xs font-bold text-yellow-500">
          Unresolved
        </span>
      );
    case 'ACTIVE':
      return (
        <span className="relative overflow-hidden rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-400">
          Active
          <span className="absolute inset-0 animate-pulse bg-blue-400/20" />
        </span>
      );
    default:
      return null;
  }
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
