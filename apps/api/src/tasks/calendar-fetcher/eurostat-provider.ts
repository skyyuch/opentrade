/**
 * Eurostat-backed calendar provider for the EU / euro area batch (ADR-0061 D2;
 * value backfill Q3-B).
 *
 * Eurostat is the EU's official statistical authority. Two key-less official
 * endpoints are combined for ADR-0058 D3's two-phase population:
 *
 *   1. Schedule — `/eurostat/o/calendars/eventsJson` lists forthcoming
 *      releases with a stable official `title`, covered `period` and UTC
 *      `start` timestamp. Each release is mapped to a configured indicator by
 *      an exact, case-insensitive `title` match against the curated
 *      `@opentrade/config` registry.
 *   2. Values — the dissemination statistics API
 *      (`/eurostat/api/dissemination/statistics/1.0/data/<dataset>`) returns
 *      the authority's own published observations as JSON-stat. For each
 *      indicator carrying `eurostatDataset` + `eurostatFilters` the provider
 *      fetches the single configured headline series and backfills
 *      `previousValue` / `actualValue` onto the scheduled drafts, joining on
 *      the normalised period label — so the pair can never drift apart and
 *      create duplicate `(indicatorCode, periodLabel)` rows.
 *
 * NOTE (ADR-0061 D2): the ICS feed named in ADR-0061's first draft
 * (`RELEASE_CALENDAR/calendar_EN.ics`) has been retired (returns 404). This
 * provider uses the official `eventsJson` endpoint Eurostat's own
 * release-calendar page consumes — see
 * docs/conversations/2026-08-03-calendar-multi-region-research.md 發現 1.
 *
 * Compliance (ADR-0058 D1): only the authority's own previous/actual figures
 * are ever produced — NEVER a forecast/consensus value, NEVER an impact
 * rating. A period the authority has not published yet simply stays null
 * (honest); the fetcher's two-phase upsert backfills it on a later poll.
 * Every event links back to the authority's official page via the config
 * registry (`sourceUrl`).
 *
 * Per-event and per-series failures are isolated: one malformed entry or one
 * broken dataset can never block the others (mirrors the FRED provider /
 * news-fetcher per-source isolation).
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

const EUROSTAT_EVENTS_URL = 'https://ec.europa.eu/eurostat/o/calendars/eventsJson';
const EUROSTAT_DATA_BASE = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';
const REQUEST_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back to keep just-released events, and how far ahead to schedule. */
const LOOKBACK_MS = 60 * DAY_MS;
const LOOKAHEAD_MS = 120 * DAY_MS;
/**
 * How many trailing periods of the value series to request. The schedule
 * window spans ~2 months back, so 8 periods (8 months / 8 quarters) always
 * covers every in-window release plus the period before it (the `previous`).
 */
const DATA_LAST_PERIODS = 8;

type FetchFn = typeof fetch;

/** One raw entry from the Eurostat `eventsJson` response. */
type EurostatRawEvent = {
  title?: unknown;
  period?: unknown;
  start?: unknown;
};

/** The JSON-stat subset the dissemination statistics API returns. */
type JsonStatResponse = {
  id?: unknown;
  size?: unknown;
  dimension?: Record<string, { category?: { index?: unknown } }>;
  value?: Record<string, unknown>;
};

export type EurostatCalendarProviderOptions = {
  /** Defaults to the curated enabled EUROSTAT registry; injectable for tests. */
  indicators?: readonly CalendarIndicatorSource[];
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchFn?: FetchFn;
  /** Injectable clock for deterministic tests; defaults to `Date`. */
  now?: () => Date;
};

export class EurostatCalendarProvider implements ICalendarProvider {
  readonly source = 'Eurostat';

  private readonly indicators: readonly CalendarIndicatorSource[];
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(options: EurostatCalendarProviderOptions = {}) {
    this.indicators = options.indicators ?? calendarIndicatorsForProvider('EUROSTAT');
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? ((): Date => new Date());
  }

  async fetchEvents(): Promise<CalendarEventDraft[]> {
    // Build a case-insensitive title → indicatorCode lookup from the registry.
    const byTitle = new Map<string, string>();
    for (const indicator of this.indicators) {
      if (indicator.eurostatTitle) {
        byTitle.set(indicator.eurostatTitle.trim().toLowerCase(), indicator.indicatorCode);
      }
    }
    if (byTitle.size === 0) return [];

    let raw: EurostatRawEvent[];
    try {
      raw = await this.fetchCalendar();
    } catch {
      return []; // Non-fatal: the fetcher isolates a whole-provider failure too.
    }

    const now = this.now().getTime();
    const drafts: CalendarEventDraft[] = [];
    for (const entry of raw) {
      try {
        const draft = toDraft(entry, byTitle, now);
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
   * the dissemination statistics API (ADR-0058 D3 phase two). Joining on the
   * draft's own normalised `periodLabel` guarantees the value lands on the
   * exact row the schedule created — never a duplicate. A series failure only
   * skips that one indicator (its drafts stay honestly null).
   */
  private async backfillValues(drafts: CalendarEventDraft[]): Promise<void> {
    for (const indicator of this.indicators) {
      if (!indicator.eurostatDataset) continue;
      const own = drafts.filter((d) => d.indicatorCode === indicator.indicatorCode);
      if (own.length === 0) continue;

      let series: Map<string, string>;
      try {
        series = await this.fetchSeries(indicator);
      } catch {
        continue; // Non-fatal: one broken dataset must not stop the others.
      }

      for (const draft of own) {
        const actual = series.get(draft.periodLabel);
        if (actual !== undefined) draft.actualValue = actual;
        const prevPeriod = previousPeriodLabel(draft.periodLabel);
        if (prevPeriod) {
          const previous = series.get(prevPeriod);
          if (previous !== undefined) draft.previousValue = previous;
        }
      }
    }
  }

  /**
   * Fetch the indicator's single configured headline series and return a
   * normalised `periodLabel → value` map.
   */
  private async fetchSeries(indicator: CalendarIndicatorSource): Promise<Map<string, string>> {
    const params = new URLSearchParams({
      format: 'JSON',
      lang: 'EN',
      lastTimePeriod: String(DATA_LAST_PERIODS),
      ...indicator.eurostatFilters,
    });
    const url = `${EUROSTAT_DATA_BASE}/${encodeURIComponent(indicator.eurostatDataset ?? '')}?${params.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Eurostat data request failed: ${String(res.status)}`);
      const json: unknown = await res.json();
      return parseJsonStatSeries(json as JsonStatResponse);
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchCalendar(): Promise<EurostatRawEvent[]> {
    const now = this.now().getTime();
    const start = new Date(now - LOOKBACK_MS).toISOString();
    const end = new Date(now + LOOKAHEAD_MS).toISOString();
    const params = new URLSearchParams({
      theme: '0',
      category: '0',
      keywords: '',
      // Euro-indicators only: the small set of key euro-area/EU PEEIs, quiet
      // and precise (research 發現 1). Broader themes would pull country-level
      // noise we do not curate.
      isEuroindicator: 'true',
      authorInclude: '',
      authorExclude: '',
      start,
      end,
      timeZone: 'UTC',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(`${EUROSTAT_EVENTS_URL}?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Eurostat request failed: ${String(res.status)}`);
      const json: unknown = await res.json();
      return Array.isArray(json) ? (json as EurostatRawEvent[]) : [];
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Turn one raw Eurostat entry into a compliance-bounded draft (ADR-0058 D1),
 * or `null` when it is not a whitelisted indicator or falls outside the window.
 * Values are always null — Eurostat's calendar carries no figures.
 */
function toDraft(
  entry: EurostatRawEvent,
  byTitle: Map<string, string>,
  now: number,
): CalendarEventDraft | null {
  if (typeof entry.title !== 'string') return null;
  const indicatorCode = byTitle.get(entry.title.trim().toLowerCase());
  if (!indicatorCode) return null;

  const scheduledAt = parseStart(entry.start);
  if (!scheduledAt) return null;

  const t = scheduledAt.getTime();
  if (t < now - LOOKBACK_MS || t > now + LOOKAHEAD_MS) return null;

  return {
    indicatorCode,
    scheduledAt,
    periodLabel: normalizePeriod(typeof entry.period === 'string' ? entry.period : ''),
    previousValue: null,
    actualValue: null,
  };
}

/** Parse Eurostat's UTC `start` (e.g. "2026-08-19T11:00Z"). */
function parseStart(value: unknown): Date | null {
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
 * Normalise a Eurostat period label to the FRED-aligned convention
 * (ADR-0058 D6): "July 2026" → "2026-07", "Q2/2026" → "2026 Q2",
 * "2026" → "2026". Unrecognised labels fall back to the trimmed original so an
 * event is never dropped just for an unusual period string.
 */
export function normalizePeriod(period: string): string {
  const trimmed = period.trim();
  if (trimmed === '') return trimmed;

  // "July 2026"
  const month = /^([A-Za-z]+)\s+(\d{4})$/.exec(trimmed);
  if (month) {
    const [, name, year] = month;
    const mm = name ? MONTHS[name.toLowerCase()] : undefined;
    if (mm && year) return `${year}-${mm}`;
  }

  // "Q2/2026" or "Q2 2026"
  const quarter = /^Q([1-4])[\s/](\d{4})$/.exec(trimmed);
  if (quarter) {
    const [, q, year] = quarter;
    if (q && year) return `${year} Q${q}`;
  }

  // "2026"
  if (/^\d{4}$/.test(trimmed)) return trimmed;

  return trimmed;
}

/**
 * Parse a JSON-stat dissemination-API response into a normalised
 * `periodLabel → value` map (ADR-0058 D6 period convention: "2026-07" /
 * "2026 Q2").
 *
 * The configured `eurostatFilters` must pin every non-time dimension to a
 * single category so exactly one headline series remains; this is asserted
 * here (rule 00): if more than one series came back, the filters are
 * mis-specified and silently picking one could store a WRONG figure (the US
 * `CPIAUCSL` 333 lesson) — so the whole series is rejected instead, leaving
 * values honestly null.
 */
export function parseJsonStatSeries(json: JsonStatResponse): Map<string, string> {
  const ids = json.id;
  const sizes = json.size;
  if (!Array.isArray(ids) || !Array.isArray(sizes) || ids.length !== sizes.length) {
    throw new Error('Eurostat data: malformed JSON-stat envelope');
  }

  const timePos = ids.indexOf('time');
  if (timePos < 0) throw new Error('Eurostat data: no time dimension');
  for (const [i, size] of sizes.entries()) {
    if (i !== timePos && size !== 1) {
      throw new Error('Eurostat data: filters did not isolate a single series');
    }
  }
  // Row-major flattening: with every non-time dimension at position 0, a
  // value's flat index is the time position times the product of the sizes of
  // the dimensions AFTER time (Eurostat puts time last, so this is 1 — but
  // compute it anyway rather than assume).
  let stride = 1;
  for (let i = timePos + 1; i < sizes.length; i++) stride *= Number(sizes[i]);

  const timeIndex = json.dimension?.['time']?.category?.index;
  if (timeIndex === null || typeof timeIndex !== 'object') {
    throw new Error('Eurostat data: no time index');
  }
  const values = json.value ?? {};

  const series = new Map<string, string>();
  for (const [label, pos] of Object.entries(timeIndex)) {
    if (typeof pos !== 'number') continue;
    const value = values[String(pos * stride)];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue; // not yet published
    series.set(normalizeJsonStatPeriod(label), String(value));
  }
  return series;
}

/**
 * Normalise a JSON-stat time label to the shared period convention: monthly
 * "2026-07" is already aligned; quarterly "2026-Q2" becomes "2026 Q2".
 */
export function normalizeJsonStatPeriod(label: string): string {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(label.trim());
  if (quarter) return `${quarter[1] ?? ''} Q${quarter[2] ?? ''}`;
  return label.trim();
}

/**
 * The period immediately before the given one, in the same label convention —
 * used to look up the `previousValue` for a release. Returns null for labels
 * outside the month / quarter conventions (e.g. bare years).
 */
export function previousPeriodLabel(label: string): string | null {
  const month = /^(\d{4})-(\d{2})$/.exec(label);
  if (month) {
    const year = Number(month[1]);
    const mm = Number(month[2]);
    if (mm < 1 || mm > 12) return null;
    return mm === 1
      ? `${String(year - 1)}-12`
      : `${String(year)}-${String(mm - 1).padStart(2, '0')}`;
  }

  const quarter = /^(\d{4}) Q([1-4])$/.exec(label);
  if (quarter) {
    const year = Number(quarter[1]);
    const q = Number(quarter[2]);
    return q === 1 ? `${String(year - 1)} Q4` : `${String(year)} Q${String(q - 1)}`;
  }

  return null;
}
