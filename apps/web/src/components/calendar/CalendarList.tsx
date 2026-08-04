'use client';

import { CalendarDays, ExternalLink, Loader2 } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { ECONOMIC_CATEGORIES, ECONOMIC_REGIONS, fetchCalendar } from '../../lib/api/client';
import { calendarWindow } from '../../lib/calendarWindow';

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
  const [region, setRegion] = useState<EconomicRegion | null>(null);
  const [category, setCategory] = useState<EconomicCategory | null>(null);

  const [items, setItems] = useState<EconomicEventItem[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const buildParams = useCallback(
    (
      nextTimeframe: CalendarTimeframe,
      nextRegion: EconomicRegion | null,
      nextCategory: EconomicCategory | null,
    ) => {
      const window = calendarWindow(nextTimeframe, new Date());
      return {
        from: window.from,
        to: window.to,
        limit: PAGE_SIZE,
        ...(nextRegion !== null ? { region: nextRegion } : {}),
        ...(nextCategory !== null ? { category: nextCategory } : {}),
      };
    },
    [],
  );

  const applyFilters = useCallback(
    async (
      nextTimeframe: CalendarTimeframe,
      nextRegion: EconomicRegion | null,
      nextCategory: EconomicCategory | null,
    ) => {
      setTimeframe(nextTimeframe);
      setRegion(nextRegion);
      setCategory(nextCategory);
      setIsLoading(true);
      setError(false);
      try {
        const data = await fetchCalendar(buildParams(nextTimeframe, nextRegion, nextCategory));
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

  const handleLoadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const data = await fetchCalendar({ ...buildParams(timeframe, region, category), cursor });
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
    } catch {
      setError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }, [buildParams, category, cursor, isLoadingMore, region, timeframe]);

  const chipClass = (active: boolean) =>
    `rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'border-[#00FF88]/60 bg-[#00FF88]/10 text-[#00FF88]'
        : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <div className="flex flex-col gap-6">
      {/* Timeframe + region + category filter chips (filters only, no ranking — ADR-0058 D1) */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {(['week', 'month'] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => void applyFilters(tf, region, category)}
              className={chipClass(timeframe === tf)}
            >
              {tf === 'week' ? t('timeframeWeek') : t('timeframeMonth')}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void applyFilters(timeframe, null, category)}
            className={chipClass(region === null)}
          >
            {t('filterAllRegions')}
          </button>
          {ECONOMIC_REGIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => void applyFilters(timeframe, r, category)}
              className={chipClass(region === r)}
            >
              {t(`region${r}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void applyFilters(timeframe, region, null)}
            className={chipClass(category === null)}
          >
            {t('filterAllCategories')}
          </button>
          {ECONOMIC_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => void applyFilters(timeframe, region, c)}
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
