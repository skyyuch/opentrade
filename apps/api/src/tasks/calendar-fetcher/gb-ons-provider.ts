/**
 * UK Office for National Statistics (ONS) calendar provider (ADR-0061 D2,
 * batch 2; value backfill Q3-B).
 *
 * The ONS is the UK's official statistical authority. Two key-less official
 * endpoints are combined for ADR-0058 D3's two-phase population:
 *
 *   1. Schedule — the releases API (`api.beta.ons.gov.uk/v1/search/releases`)
 *      lists each dated release with a stable `/releases/<slug><period>` uri,
 *      an ISO-UTC `release_date`, and `published` / `cancelled` flags. Each
 *      release is mapped to a configured indicator by the stable slug prefix
 *      (`onsUriPrefix`) — never a fuzzy title search — excluding the
 *      `…timeseries` companion release that shares a date/period.
 *   2. Values — the ONS website timeseries endpoint
 *      (`www.ons.gov.uk/<topic…>/timeseries/<cdid>/<dataset>/data`) returns
 *      the headline series as JSON whose `months[]` carry the authority's own
 *      published figures as verbatim strings. For each indicator carrying
 *      `onsTimeseriesPath` the provider backfills `previousValue` /
 *      `actualValue` onto the scheduled drafts, joining on the draft's own
 *      period label (shifted by `onsPeriodShiftMonths` where the bulletin is
 *      named after its publication month, e.g. the labour market bulletin) —
 *      so schedule and data can never drift into duplicate rows. NOTE (rule
 *      00): the old `api.ons.gov.uk` v0 timeseries API was retired on
 *      2024-11-25; the website endpoint is the live official one.
 *
 * Compliance (ADR-0058 D1): only the authority's own previous/actual figures
 * are ever produced — NEVER a forecast/consensus value, NEVER an impact
 * rating. A period the ONS has not published yet simply stays null (honest);
 * the fetcher's two-phase upsert backfills it on a later poll. Every event
 * links back to the authority's official bulletin via the config registry
 * (`sourceUrl`).
 *
 * Per-event and per-series failures are isolated: one malformed entry or one
 * broken series can never block the others (mirrors the Eurostat / FRED
 * providers).
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

const ONS_RELEASES_URL = 'https://api.beta.ons.gov.uk/v1/search/releases';
const ONS_TIMESERIES_BASE = 'https://www.ons.gov.uk';
const REQUEST_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back to keep just-released events, and how far ahead to schedule. */
const LOOKBACK_MS = 60 * DAY_MS;
const LOOKAHEAD_MS = 120 * DAY_MS;
/** Per-page cap; the ONS list is far smaller than this once prefix-filtered. */
const PAGE_LIMIT = 100;

type FetchFn = typeof fetch;

/** One raw entry from the ONS `search/releases` response. */
type OnsRawRelease = {
  uri?: unknown;
  description?: {
    release_date?: unknown;
    cancelled?: unknown;
  };
};

/** The subset of the ONS website timeseries `/data` JSON we consume. */
type OnsTimeseriesResponse = {
  months?: { date?: unknown; value?: unknown }[];
};

export type GbOnsCalendarProviderOptions = {
  /** Defaults to the curated enabled ONS registry; injectable for tests. */
  indicators?: readonly CalendarIndicatorSource[];
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchFn?: FetchFn;
  /** Injectable clock for deterministic tests; defaults to `Date`. */
  now?: () => Date;
};

export class GbOnsCalendarProvider implements ICalendarProvider {
  readonly source = 'ONS';

  private readonly indicators: readonly CalendarIndicatorSource[];
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(options: GbOnsCalendarProviderOptions = {}) {
    this.indicators = options.indicators ?? calendarIndicatorsForProvider('ONS');
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? ((): Date => new Date());
  }

  async fetchEvents(): Promise<CalendarEventDraft[]> {
    // Build a slug-prefix → indicatorCode list from the registry.
    const prefixes: { prefix: string; indicatorCode: string }[] = [];
    for (const indicator of this.indicators) {
      if (indicator.onsUriPrefix) {
        prefixes.push({
          prefix: indicator.onsUriPrefix.toLowerCase(),
          indicatorCode: indicator.indicatorCode,
        });
      }
    }
    if (prefixes.length === 0) return [];

    let raw: OnsRawRelease[];
    try {
      raw = await this.fetchReleases();
    } catch {
      return []; // Non-fatal: the fetcher isolates a whole-provider failure too.
    }

    const now = this.now().getTime();
    const drafts: CalendarEventDraft[] = [];
    for (const entry of raw) {
      try {
        const draft = toDraft(entry, prefixes, now);
        if (draft) drafts.push(draft);
      } catch {
        // Non-fatal: one malformed entry must not stop the others.
      }
    }

    await this.backfillValues(drafts);
    return drafts;
  }

  /**
   * Backfill `previousValue` / `actualValue` onto the scheduled drafts from
   * the ONS website timeseries endpoint (ADR-0058 D3 phase two). Joining on
   * the draft's own period label (plus the configured publication-month
   * shift) guarantees the value lands on the exact row the schedule created —
   * never a duplicate. A series failure only skips that one indicator (its
   * drafts stay honestly null).
   */
  private async backfillValues(drafts: CalendarEventDraft[]): Promise<void> {
    for (const indicator of this.indicators) {
      if (!indicator.onsTimeseriesPath) continue;
      const own = drafts.filter((d) => d.indicatorCode === indicator.indicatorCode);
      if (own.length === 0) continue;

      let series: Map<string, string>;
      try {
        series = await this.fetchSeries(indicator.onsTimeseriesPath);
      } catch {
        continue; // Non-fatal: one broken series must not stop the others.
      }

      const shift = indicator.onsPeriodShiftMonths ?? 0;
      for (const draft of own) {
        const obsMonth = shiftMonthLabel(draft.periodLabel, shift);
        if (!obsMonth) continue;
        const actual = series.get(obsMonth);
        if (actual !== undefined) draft.actualValue = actual;
        const prevMonth = shiftMonthLabel(obsMonth, -1);
        if (prevMonth) {
          const previous = series.get(prevMonth);
          if (previous !== undefined) draft.previousValue = previous;
        }
      }
    }
  }

  /** Fetch one headline series and return a `YYYY-MM → value` map. */
  private async fetchSeries(path: string): Promise<Map<string, string>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(`${ONS_TIMESERIES_BASE}${path}/data`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`ONS timeseries request failed: ${String(res.status)}`);
      const json: unknown = await res.json();
      return parseOnsMonths(json as OnsTimeseriesResponse);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch the upcoming and recently-published releases in two typed pages
   * (rather than a fuzzy `query`), so prefix-matching afterwards is exact.
   */
  private async fetchReleases(): Promise<OnsRawRelease[]> {
    const [upcoming, published] = await Promise.all([
      this.fetchPage('type-upcoming', 'release_date_asc'),
      this.fetchPage('type-published', 'release_date_desc'),
    ]);
    return [...upcoming, ...published];
  }

  private async fetchPage(releaseType: string, sort: string): Promise<OnsRawRelease[]> {
    const params = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      'release-type': releaseType,
      sort,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(`${ONS_RELEASES_URL}?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`ONS request failed: ${String(res.status)}`);
      const json: unknown = await res.json();
      const releases = (json as { releases?: unknown }).releases;
      return Array.isArray(releases) ? (releases as OnsRawRelease[]) : [];
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Turn one raw ONS release into a compliance-bounded draft (ADR-0058 D1), or
 * `null` when it is not a whitelisted indicator, is cancelled, is the
 * `…timeseries` duplicate, or falls outside the window. Values start null —
 * the releases calendar carries no figures; `backfillValues` fills them from
 * the timeseries endpoint afterwards.
 */
function toDraft(
  entry: OnsRawRelease,
  prefixes: readonly { prefix: string; indicatorCode: string }[],
  now: number,
): CalendarEventDraft | null {
  if (typeof entry.uri !== 'string') return null;
  if (entry.description?.cancelled === true) return null;

  const slug = entry.uri.replace(/^\/releases\//, '').toLowerCase();
  // The companion `…timeseries` release shares the date/period — skip it so a
  // single release maps to a single indicator.
  if (slug.endsWith('timeseries')) return null;

  const match = prefixes.find((p) => slug.startsWith(p.prefix));
  if (!match) return null;

  const scheduledAt = parseReleaseDate(entry.description?.release_date);
  if (!scheduledAt) return null;

  const t = scheduledAt.getTime();
  if (t < now - LOOKBACK_MS || t > now + LOOKAHEAD_MS) return null;

  const remainder = slug.slice(match.prefix.length);
  return {
    indicatorCode: match.indicatorCode,
    scheduledAt,
    periodLabel: periodFromRemainder(remainder) ?? monthFromDate(scheduledAt),
    previousValue: null,
    actualValue: null,
  };
}

/** Parse the ONS `release_date` (ISO-8601 UTC, e.g. "2026-08-19T06:00:00.000Z"). */
function parseReleaseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const MONTHS: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

/**
 * Derive a `YYYY-MM` period from an ONS slug remainder (the part after the
 * matched prefix), e.g. "july2026" → "2026-07". Returns `null` when the
 * remainder is not a plain `<monthname><year>` so the caller can fall back to
 * the release month (some releases carry a range like "apriltojune2026").
 */
export function periodFromRemainder(remainder: string): string | null {
  const m = /^([a-z]+)(\d{4})$/.exec(remainder);
  if (!m) return null;
  const [, name, year] = m;
  const mm = name ? MONTHS[name] : undefined;
  return mm && year ? `${year}-${mm}` : null;
}

function monthFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${String(year)}-${month}`;
}

const MONTH_ABBREVS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/**
 * Parse the ONS website timeseries `months[]` into a `YYYY-MM → value` map.
 * Observation dates come as "2026 JUN"; values are kept as the ONS's own
 * verbatim strings ("2.6", "-0.1", "1.0") so no precision or trailing zero is
 * ever lost (ADR-0058 D1 — the figure is the authority's own reported
 * number). Non-numeric or empty values are skipped (not yet published).
 */
export function parseOnsMonths(json: OnsTimeseriesResponse): Map<string, string> {
  const series = new Map<string, string>();
  for (const entry of json.months ?? []) {
    if (typeof entry.date !== 'string' || typeof entry.value !== 'string') continue;
    const m = /^(\d{4})\s+([A-Za-z]{3})$/.exec(entry.date.trim());
    if (!m) continue;
    const mm = MONTH_ABBREVS[(m[2] ?? '').toLowerCase()];
    if (!mm) continue;
    const value = entry.value.trim();
    if (value === '' || !Number.isFinite(Number(value))) continue;
    series.set(`${m[1] ?? ''}-${mm}`, value);
  }
  return series;
}

/**
 * Shift a `YYYY-MM` period label by a number of months (negative = back),
 * e.g. ("2026-07", -3) → "2026-04". Returns null for labels outside the
 * month convention (e.g. a range-slug fallback) so the caller skips the
 * lookup instead of joining a wrong period (rule 00).
 */
export function shiftMonthLabel(label: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const total = year * 12 + (month - 1) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${String(newYear)}-${String(newMonth).padStart(2, '0')}`;
}
