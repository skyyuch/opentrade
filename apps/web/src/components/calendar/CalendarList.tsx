'use client';

import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { ECONOMIC_CATEGORIES, ECONOMIC_REGIONS, fetchCalendar } from '../../lib/api/client';
import { calendarWindowAt } from '../../lib/calendarWindow';

import type { EconomicCategory, EconomicEventItem, EconomicRegion } from '../../lib/api/client';
import type { CalendarTimeframe } from '../../lib/calendarWindow';

type Props = {
  /** Server-rendered seed page for the default view (this HK week, no filters). */
  initialItems: EconomicEventItem[];
  initialCursor: string | null;
};

const PAGE_SIZE = 50;

const localizedName = (item: EconomicEventItem, locale: string): string => {
  if (locale === 'zh-Hant') return item.nameZhHant;
  if (locale === 'zh-Hans') return item.nameZhHans;
  return item.nameEn;
};

/**
 * Region → Unicode flag emoji (ADR-0061 D1). Purely a visual region marker
 * (region is a filter/label, never a ranking). Mirrors `CALENDAR_REGION_FLAG`
 * in `@opentrade/config`; the euro area (`EA`) shares the EU flag.
 */
const REGION_FLAG: Record<EconomicRegion, string> = {
  US: '🇺🇸',
  HK: '🇭🇰',
  CN: '🇨🇳',
  EU: '🇪🇺',
  EA: '🇪🇺',
  GB: '🇬🇧',
  CA: '🇨🇦',
  AU: '🇦🇺',
  JP: '🇯🇵',
  NZ: '🇳🇿',
  KR: '🇰🇷',
  ID: '🇮🇩',
  VN: '🇻🇳',
  SG: '🇸🇬',
};

/**
 * Region filter split (ADR-0058 D1): the region row is a *filter*, never a
 * ranking. As official coverage grows past a dozen regions, showing every chip
 * inline gets noisy, so a small "popular" set stays inline and the rest live
 * behind a "More" picker. Membership here is purely a UI convenience for the
 * HK-centric default audience — it confers no prominence to the underlying
 * events (ordering is always chronological, server-side).
 */
const POPULAR_REGIONS: readonly EconomicRegion[] = ['US', 'HK', 'CN', 'EU', 'JP'];
const MORE_REGIONS: readonly EconomicRegion[] = ECONOMIC_REGIONS.filter(
  (r) => !POPULAR_REGIONS.includes(r),
);

/**
 * Stable Asia/Hong_Kong date key (YYYY-MM-DD) for grouping. `en-CA` yields the
 * ISO-ordered date parts so the string is both a valid group key and sorts
 * chronologically. Times are stored UTC and rendered in HK time (ADR-0058 D7).
 */
const hkDateKey = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));

/**
 * Bucket the (already chronological, server-ordered) events by their HK-local
 * date, preserving order — an Investing.com-style date-grouped layout.
 */
const groupByHkDate = (
  items: EconomicEventItem[],
): { dateKey: string; headingAt: string; events: EconomicEventItem[] }[] => {
  const groups: { dateKey: string; headingAt: string; events: EconomicEventItem[] }[] = [];
  for (const item of items) {
    const dateKey = hkDateKey(item.scheduledAt);
    const last = groups[groups.length - 1];
    if (last?.dateKey === dateKey) last.events.push(item);
    else groups.push({ dateKey, headingAt: item.scheduledAt, events: [item] });
  }
  return groups;
};

/**
 * Filterable, cursor-paginated economic-event list (ADR-0058).
 *
 * Compliance shape (D1): ordering is strictly chronological (`scheduledAt`,
 * server-side); `region` / `category` and the week/month timeframe only
 * narrow the window — they never rank one event above another. Each row shows
 * only official facts (name / time / period / previous / actual) and links
 * out to the authority's own release page.
 */
export const CalendarList = ({ initialItems, initialCursor }: Props) => {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const format = useFormatter();

  const [timeframe, setTimeframe] = useState<CalendarTimeframe>('week');
  const [periodOffset, setPeriodOffset] = useState(0);
  // Multi-select region filter (OR set). Empty = all regions (ADR-0058 D1:
  // filter only, never ranking).
  const [regions, setRegions] = useState<EconomicRegion[]>([]);
  const [category, setCategory] = useState<EconomicCategory | null>(null);
  const [isRegionMenuOpen, setIsRegionMenuOpen] = useState(false);

  const [items, setItems] = useState<EconomicEventItem[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const buildParams = useCallback(
    (
      nextTimeframe: CalendarTimeframe,
      nextOffset: number,
      nextRegions: readonly EconomicRegion[],
      nextCategory: EconomicCategory | null,
    ) => {
      const window = calendarWindowAt(nextTimeframe, nextOffset, new Date());
      return {
        from: window.from,
        to: window.to,
        limit: PAGE_SIZE,
        ...(nextRegions.length > 0 ? { regions: nextRegions } : {}),
        ...(nextCategory !== null ? { category: nextCategory } : {}),
      };
    },
    [],
  );

  const applyFilters = useCallback(
    async (
      nextTimeframe: CalendarTimeframe,
      nextOffset: number,
      nextRegions: readonly EconomicRegion[],
      nextCategory: EconomicCategory | null,
    ) => {
      setTimeframe(nextTimeframe);
      setPeriodOffset(nextOffset);
      setRegions([...nextRegions]);
      setCategory(nextCategory);
      setIsLoading(true);
      setError(false);
      try {
        const data = await fetchCalendar(
          buildParams(nextTimeframe, nextOffset, nextRegions, nextCategory),
        );
        setItems(data.items);
        setCursor(data.nextCursor);
      } catch {
        setError(true);
      } finally {
        setIsLoading(false);
      }
    },
    [buildParams],
  );

  /** Toggle one region in/out of the OR set, then refetch. */
  const toggleRegion = useCallback(
    (r: EconomicRegion) => {
      const next = regions.includes(r) ? regions.filter((x) => x !== r) : [...regions, r];
      void applyFilters(timeframe, periodOffset, next, category);
    },
    [applyFilters, category, periodOffset, regions, timeframe],
  );

  const handleLoadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const data = await fetchCalendar({
        ...buildParams(timeframe, periodOffset, regions, category),
        cursor,
      });
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
    } catch {
      setError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }, [buildParams, category, cursor, isLoadingMore, periodOffset, regions, timeframe]);

  const chipClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'border-[#00FF88]/60 bg-[#00FF88]/10 text-[#00FF88]'
        : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
    }`;

  /**
   * A multi-select region filter chip shown as "🇺🇸 United States" (flag +
   * localized name). Clicking toggles it in/out of the OR set. The flag is
   * `aria-hidden` so the button's accessible name stays the plain region label
   * (screen readers + tests key off the name only).
   */
  const regionChip = (r: EconomicRegion) => (
    <button
      key={r}
      type="button"
      aria-pressed={regions.includes(r)}
      onClick={() => toggleRegion(r)}
      className={chipClass(regions.includes(r))}
    >
      <span aria-hidden className="text-base leading-none">
        {REGION_FLAG[r]}
      </span>
      {t(`region${r}`)}
    </button>
  );

  const selectedMoreRegions = regions.filter((r) => MORE_REGIONS.includes(r));

  // The currently-viewed period (offset from now), for the nav label. Rendered
  // in HK time (D7); Intl supplies locale-aware month names, so no i18n string.
  const periodWindow = calendarWindowAt(timeframe, periodOffset, new Date());
  const periodLabel =
    timeframe === 'week'
      ? `${format.dateTime(new Date(periodWindow.from), {
          month: 'short',
          day: 'numeric',
          timeZone: 'Asia/Hong_Kong',
        })} – ${format.dateTime(new Date(periodWindow.to), {
          month: 'short',
          day: 'numeric',
          timeZone: 'Asia/Hong_Kong',
        })}`
      : format.dateTime(new Date(periodWindow.from), {
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Hong_Kong',
        });

  return (
    <div className="flex flex-col gap-6">
      {/* Timeframe + region + category filter chips (filters only, no ranking — ADR-0058 D1) */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {(['week', 'month'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => void applyFilters(tf, 0, regions, category)}
                className={chipClass(timeframe === tf)}
              >
                {tf === 'week' ? t('timeframeWeek') : t('timeframeMonth')}
              </button>
            ))}
          </div>

          {/* Period pager — browse past/future weeks or months (offset paging). */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t('previousPeriod')}
              onClick={() => void applyFilters(timeframe, periodOffset - 1, regions, category)}
              className="inline-flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[9rem] text-center text-sm font-medium tabular-nums text-white/70">
              {periodLabel}
            </span>
            <button
              type="button"
              aria-label={t('nextPeriod')}
              onClick={() => void applyFilters(timeframe, periodOffset + 1, regions, category)}
              className="inline-flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronRight size={16} />
            </button>
            {periodOffset !== 0 && (
              <button
                type="button"
                onClick={() => void applyFilters(timeframe, 0, regions, category)}
                className="ml-1 rounded-full border border-[#00FF88]/40 bg-[#00FF88]/10 px-3 py-1 text-xs font-medium text-[#00FF88] transition-colors hover:bg-[#00FF88]/20"
              >
                {t('filterToday')}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIsRegionMenuOpen(false);
              void applyFilters(timeframe, periodOffset, [], category);
            }}
            className={chipClass(regions.length === 0)}
          >
            {t('filterAllRegions')}
          </button>
          {POPULAR_REGIONS.map((r) => regionChip(r))}

          {/* Keep any picked "More" regions visible inline as active chips. */}
          {selectedMoreRegions.map((r) => regionChip(r))}

          {/* "More" region picker — the long tail of official regions (D1). */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsRegionMenuOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={isRegionMenuOpen}
              className={chipClass(selectedMoreRegions.length > 0)}
            >
              {selectedMoreRegions.length > 0
                ? `${t('filterMoreRegions')} · ${selectedMoreRegions.length}`
                : t('filterMoreRegions')}
              <ChevronDown
                size={14}
                className={`transition-transform ${isRegionMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isRegionMenuOpen && (
              <>
                {/* Click-away backdrop. */}
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  onClick={() => setIsRegionMenuOpen(false)}
                  className="fixed inset-0 z-20 cursor-default"
                />
                <div
                  role="listbox"
                  className="absolute left-0 top-full z-30 mt-2 grid max-h-72 w-56 grid-cols-1 gap-1 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900/95 p-2 shadow-xl backdrop-blur-xl"
                >
                  {MORE_REGIONS.map((r) => {
                    const active = regions.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        role="option"
                        aria-selected={active}
                        // Toggle without closing — multi-select (pick several).
                        onClick={() => toggleRegion(r)}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                          active
                            ? 'bg-[#00FF88]/10 text-[#00FF88]'
                            : 'text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span aria-hidden className="text-base leading-none">
                          {REGION_FLAG[r]}
                        </span>
                        <span className="flex-1">{t(`region${r}`)}</span>
                        {active && <Check size={14} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void applyFilters(timeframe, periodOffset, regions, null)}
            className={chipClass(category === null)}
          >
            {t('filterAllCategories')}
          </button>
          {ECONOMIC_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => void applyFilters(timeframe, periodOffset, regions, c)}
              className={chipClass(category === c)}
            >
              {t(`category${c}`)}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-sm text-red-400">
          {t('error')}
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-white/40" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 py-20 text-center">
          <CalendarDays size={40} className="mb-4 text-white/20" />
          <h3 className="text-lg font-bold text-white">{t('empty')}</h3>
        </div>
      ) : (
        <>
          <div className="border-b border-white/10 pb-4 text-sm text-white/40">
            {t('showingCount', { count: items.length })}
          </div>

          {/*
            Date-grouped layout (ADR-0061): events are bucketed under an HK-local
            day heading, Investing.com-style, while ordering stays strictly
            chronological (server `scheduledAt`) — grouping never re-ranks (D1).
          */}
          <div className="flex flex-col gap-8">
            {groupByHkDate(items).map((group) => (
              <section key={group.dateKey} className="flex flex-col gap-3">
                <h2 className="sticky top-0 z-10 -mx-1 bg-black/40 px-1 py-1 text-sm font-semibold text-white/70 backdrop-blur">
                  {format.dateTime(new Date(group.headingAt), {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'Asia/Hong_Kong',
                  })}
                </h2>

                <ul className="flex flex-col gap-3">
                  {group.events.map((item) => {
                    const released = item.actualValue !== null;
                    return (
                      <li key={item.id}>
                        {/*
                          External outbound link (ADR-0058 D1): each event links to
                          the authority's official release page — we never reproduce
                          release text. `nofollow` + `noopener` on third-party links.
                        */}
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-zinc-900/40 p-5 backdrop-blur-xl transition-all hover:border-[#00FF88]/30 hover:bg-zinc-900/60"
                        >
                          {/* Time column — the day's chronological anchor (HK time, D7). */}
                          <time
                            dateTime={item.scheduledAt}
                            className="w-14 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-white/70"
                          >
                            {format.dateTime(new Date(item.scheduledAt), {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                              timeZone: 'Asia/Hong_Kong',
                            })}
                          </time>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                aria-hidden
                                className="text-lg leading-none"
                                title={t(`region${item.region}`)}
                              >
                                {REGION_FLAG[item.region]}
                              </span>
                              <h3 className="text-base font-semibold leading-snug text-white transition-colors group-hover:text-[#00FF88]">
                                {localizedName(item, locale)}
                              </h3>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                  released
                                    ? 'border-[#00FF88]/40 text-[#00FF88]/90'
                                    : 'border-white/20 text-white/50'
                                }`}
                              >
                                {released ? t('statusReleased') : t('statusUpcoming')}
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">
                              <span className="font-medium text-white/60">{item.sourceName}</span>
                              <span aria-hidden>·</span>
                              <span>
                                {t('period')}: {item.periodLabel}
                              </span>
                            </div>

                            {/* Official facts only — previous + actual, never forecast/consensus (D1). */}
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                              <span className="text-white/50">
                                {t('previousValue')}:{' '}
                                <span className="font-medium text-white/80">
                                  {item.previousValue !== null
                                    ? `${item.previousValue} ${item.unit}`
                                    : t('pendingValue')}
                                </span>
                              </span>
                              <span className="text-white/50">
                                {t('actualValue')}:{' '}
                                <span
                                  className={`font-medium ${released ? 'text-[#00FF88]' : 'text-white/40'}`}
                                >
                                  {item.actualValue !== null
                                    ? `${item.actualValue} ${item.unit}`
                                    : t('pendingValue')}
                                </span>
                              </span>
                            </div>
                          </div>
                          <ExternalLink
                            size={16}
                            className="mt-1 shrink-0 text-white/30 transition-colors group-hover:text-[#00FF88]"
                          />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

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
        </>
      )}
    </div>
  );
};
