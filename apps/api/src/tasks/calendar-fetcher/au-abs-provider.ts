/**
 * Australia — Australian Bureau of Statistics (ABS) calendar provider
 * (ADR-0061 D2, batch 3).
 *
 * ABS is Australia's primary official statistical authority, but exposes no
 * clean JSON release-schedule API (its RSS / ICS / `?_format=json` endpoints
 * all 404 or return HTML). Its official forward calendar is the
 * `/release-calendar/future-releases` page, whose semantic Drupal rows each
 * carry a machine-readable UTC `<time datetime="…Z">`, a period-less product
 * `event-name` (e.g. "Consumer Price Index, Australia"), and a
 * `reference-period-value`. This provider fetches that page and maps each row
 * to a configured indicator by an exact, case-insensitive `event-name` match
 * against the curated registry.
 *
 * The release time is read straight from the `datetime` attribute, which is
 * already UTC (the `Z` suffix) — ABS itself accounts for the AEST/AEDT offset,
 * so no date library and no DST maths are needed (ADR-0058 D7).
 *
 * Values (ADR-0058 D3 phase two): for each indicator carrying an
 * `absDataflowId` + `absSeriesKey` the provider backfills `previousValue` /
 * `actualValue` from the key-less ABS Data API
 * (`data.api.abs.gov.au/rest/data/<flow>/<key>?format=jsondata`). Every
 * configured key pins ALL dimensions to the single headline series (no
 * wildcards), so the response can only ever be that series. SDMX time periods
 * ("2026-07" / "2026-Q2") are normalised to the FRED-aligned convention
 * ("2026-07" / "2026 Q2"); the calendar page labels some quarterly releases
 * by their END month (e.g. the Wage Price Index's "June 2026" = 2026 Q2), so
 * a monthly-form draft label joining a quarterly series is mapped to its
 * quarter. Observations are stored verbatim except the Labour Force
 * unemployment rate, whose API series is unrounded — `round1` reproduces the
 * release headline's own one-decimal precision (owner-ratified Q3-B
 * convention, rule 00).
 *
 * Compliance (ADR-0058 D1 / ADR-0061 D4): NEVER a forecast/consensus value,
 * NEVER an impact rating; a period the ABS has not yet published stays
 * honestly null. ONLY ABS first-party indicators are configured — private
 * Manufacturing PMIs (S&P Global / Judo Bank / AiG) are deliberately excluded
 * upstream in config. Every event links back to the ABS official page via the
 * config registry (`sourceUrl`).
 *
 * Per-row failures are isolated: one malformed row can never block the others
 * (mirrors the Eurostat / ONS / StatCan / FRED providers), and one broken
 * data-API series only skips its own indicator's values.
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

const ABS_FUTURE_RELEASES_URL = 'https://www.abs.gov.au/release-calendar/future-releases';
const ABS_DATA_API_URL = 'https://data.api.abs.gov.au/rest/data';
const REQUEST_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back to keep just-released events, and how far ahead to schedule. */
const LOOKBACK_MS = 60 * DAY_MS;
const LOOKAHEAD_MS = 120 * DAY_MS;
/**
 * Latest observations fetched per data-API series: the drafts window spans at
 * most ~2 months of released periods and each needs its previous period, so
 * 15 gives comfortable slack for both monthly and quarterly series.
 */
const DATA_LATEST_N = 15;

/**
 * One parsed future-release row: the raw ISO datetime attribute, the period-
 * less product name, and the reference-period label (if present).
 */
type AbsRow = {
  datetime: string;
  eventName: string;
  referencePeriod: string;
};

/** The subset of an ABS Data API SDMX-JSON response we consume. */
export type AbsSdmxResponse = {
  data?: {
    dataSets?: { series?: Record<string, { observations?: Record<string, unknown[]> }> }[];
    structures?: {
      dimensions?: { observation?: { id?: unknown; values?: { id?: unknown }[] }[] };
    }[];
  };
};

type FetchFn = typeof fetch;

export type AuAbsCalendarProviderOptions = {
  /** Defaults to the curated enabled ABS registry; injectable for tests. */
  indicators?: readonly CalendarIndicatorSource[];
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchFn?: FetchFn;
  /** Injectable clock for deterministic tests; defaults to `Date`. */
  now?: () => Date;
};

export class AuAbsCalendarProvider implements ICalendarProvider {
  readonly source = 'ABS';

  private readonly indicators: readonly CalendarIndicatorSource[];
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(options: AuAbsCalendarProviderOptions = {}) {
    this.indicators = options.indicators ?? calendarIndicatorsForProvider('ABS');
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? ((): Date => new Date());
  }

  async fetchEvents(): Promise<CalendarEventDraft[]> {
    // Build a case-insensitive event-name → indicatorCode lookup.
    const byName = new Map<string, string>();
    for (const indicator of this.indicators) {
      if (indicator.absEventName) {
        byName.set(indicator.absEventName.trim().toLowerCase(), indicator.indicatorCode);
      }
    }
    if (byName.size === 0) return [];

    let html: string;
    try {
      html = await this.fetchPage();
    } catch {
      return []; // Non-fatal: the fetcher isolates a whole-provider failure too.
    }

    const now = this.now().getTime();
    const drafts: CalendarEventDraft[] = [];
    for (const row of parseFutureReleaseRows(html)) {
      try {
        const draft = toDraft(row, byName, now);
        if (draft) drafts.push(draft);
      } catch {
        // Non-fatal: one malformed row must not stop the others.
      }
    }

    await this.backfillValues(drafts);
    return drafts;
  }

  /**
   * Backfill `previousValue` / `actualValue` onto the scheduled drafts from
   * the ABS Data API headline series (ADR-0058 D3 phase two). Joining on the
   * draft's own period label guarantees the value lands on the exact row the
   * schedule created — never a duplicate. A series failure only skips that
   * one indicator (its drafts stay honestly null).
   */
  private async backfillValues(drafts: CalendarEventDraft[]): Promise<void> {
    for (const indicator of this.indicators) {
      if (!indicator.absDataflowId || !indicator.absSeriesKey) continue;
      const own = drafts.filter((d) => d.indicatorCode === indicator.indicatorCode);
      if (own.length === 0) continue;

      let series: Map<string, string>;
      try {
        series = await this.fetchSeries(indicator.absDataflowId, indicator.absSeriesKey);
      } catch {
        continue; // Non-fatal: one broken series must not stop the others.
      }

      for (const draft of own) {
        const period = absSeriesPeriod(draft.periodLabel, series);
        if (!period) continue;
        const actual = absValueForPeriod(series, period, indicator.absTransform);
        if (actual !== null) draft.actualValue = actual;
        const prevPeriod = shiftAbsPeriod(period, -1);
        if (prevPeriod) {
          const previous = absValueForPeriod(series, prevPeriod, indicator.absTransform);
          if (previous !== null) draft.previousValue = previous;
        }
      }
    }
  }

  /**
   * Fetch one fully-pinned headline series from the ABS Data API and return a
   * normalised period-label → verbatim-value map.
   */
  private async fetchSeries(dataflowId: string, seriesKey: string): Promise<Map<string, string>> {
    const url = `${ABS_DATA_API_URL}/${dataflowId}/${seriesKey}?lastNObservations=${String(DATA_LATEST_N)}&format=jsondata`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`ABS data request failed: ${String(res.status)}`);
      return parseAbsSdmxSeries((await res.json()) as AbsSdmxResponse);
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchPage(): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(ABS_FUTURE_RELEASES_URL, {
        signal: controller.signal,
        headers: { Accept: 'text/html' },
      });
      if (!res.ok) throw new Error(`ABS request failed: ${String(res.status)}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Extract each future-release row from the ABS Drupal View HTML. A row is
 * anchored on its `<time datetime="…" class="datetime">` element; the product
 * `event-name` and `reference-period-value` follow within the same row (before
 * the next `<time datetime=`). Matching on the stable semantic field classes
 * (not layout) keeps this resilient to cosmetic markup churn.
 */
export function parseFutureReleaseRows(html: string): AbsRow[] {
  const rows: AbsRow[] = [];
  const rowRe =
    /<time\s+datetime="([^"]+)"[^>]*class="datetime"[^>]*>[^<]*<\/time>([\s\S]*?)(?=<time\s+datetime="|$)/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const datetime = (m[1] ?? '').trim();
    const tail = m[2] ?? '';
    const nameMatch = /class="field-content event-name"[^>]*>\s*([^<]*?)\s*<\/h3>/.exec(tail);
    if (!nameMatch) continue;
    const periodMatch = /class="reference-period-value"[^>]*>\s*([^<]*?)\s*<\/span>/.exec(tail);
    rows.push({
      datetime,
      eventName: decodeEntities(nameMatch[1] ?? ''),
      referencePeriod: decodeEntities(periodMatch?.[1] ?? ''),
    });
  }
  return rows;
}

/**
 * Turn one parsed ABS row into a compliance-bounded draft (ADR-0058 D1), or
 * `null` when it is not a whitelisted indicator, has an unparseable date, or
 * falls outside the window. Values are always null — the page carries no
 * figures.
 */
function toDraft(row: AbsRow, byName: Map<string, string>, now: number): CalendarEventDraft | null {
  const indicatorCode = byName.get(row.eventName.trim().toLowerCase());
  if (!indicatorCode) return null;

  const scheduledAt = new Date(row.datetime);
  if (Number.isNaN(scheduledAt.getTime())) return null;

  const t = scheduledAt.getTime();
  if (t < now - LOOKBACK_MS || t > now + LOOKAHEAD_MS) return null;

  return {
    indicatorCode,
    scheduledAt,
    periodLabel: normalizeAbsPeriod(row.referencePeriod),
    previousValue: null,
    actualValue: null,
  };
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
 * ABS labels quarterly releases by the quarter's END month ("June Quarter
 * 2026" = the April–June quarter = Q2). Map an end-month name to its quarter.
 */
const QUARTER_END_MONTH: Record<string, string> = {
  march: '1',
  june: '2',
  september: '3',
  december: '4',
};

/**
 * Normalise an ABS `reference-period-value` to the FRED-aligned convention
 * (ADR-0058 D6): "July 2026" → "2026-07", "June Quarter 2026" → "2026 Q2",
 * "2026" → "2026". Unrecognised labels (e.g. "2025-26 financial year",
 * "July 2022 - June 2026") fall back to the trimmed original so an event is
 * never dropped for an unusual period string.
 */
export function normalizeAbsPeriod(period: string): string {
  const trimmed = period.trim();
  if (trimmed === '') return trimmed;

  const quarter = /^([A-Za-z]+)\s+Quarter\s+(\d{4})$/i.exec(trimmed);
  if (quarter) {
    const [, word, year] = quarter;
    const q = word ? QUARTER_END_MONTH[word.toLowerCase()] : undefined;
    if (q && year) return `${year} Q${q}`;
  }

  const month = /^([A-Za-z]+)\s+(\d{4})$/.exec(trimmed);
  if (month) {
    const [, name, year] = month;
    const mm = name ? MONTHS[name.toLowerCase()] : undefined;
    if (mm && year) return `${year}-${mm}`;
  }

  if (/^\d{4}$/.test(trimmed)) return trimmed;

  return trimmed;
}

/** Decode the few HTML entities that can appear in ABS product/period text. */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8217;/g, '\u2019')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Parse an ABS Data API SDMX-JSON response into a period-label → verbatim-
 * value map. The configured series key pins every dimension, so the dataset
 * carries exactly one series; its observation indices point into the
 * TIME_PERIOD observation dimension ("2026-07" / "2026-Q2"), normalised here
 * to the FRED-aligned convention ("2026-07" / "2026 Q2"). Null / non-finite
 * observations (not yet published) are skipped, never coerced to 0.
 */
export function parseAbsSdmxSeries(payload: AbsSdmxResponse): Map<string, string> {
  const series = new Map<string, string>();
  const periods = payload.data?.structures?.[0]?.dimensions?.observation?.find(
    (dim) => dim.id === 'TIME_PERIOD',
  )?.values;
  if (!periods) return series;

  for (const s of Object.values(payload.data?.dataSets?.[0]?.series ?? {})) {
    for (const [idx, obs] of Object.entries(s.observations ?? {})) {
      const period = periods[Number(idx)]?.id;
      const value = obs[0];
      if (typeof period !== 'string' || typeof value !== 'number' || !Number.isFinite(value)) {
        continue;
      }
      series.set(normalizeAbsSdmxPeriod(period), String(value));
    }
  }
  return series;
}

/** Normalise an SDMX TIME_PERIOD to the draft convention: "2026-Q2" → "2026 Q2". */
function normalizeAbsSdmxPeriod(period: string): string {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(period);
  return quarter ? `${quarter[1] ?? ''} Q${quarter[2] ?? ''}` : period;
}

/**
 * Map a draft's period label onto the fetched series' own period convention.
 * The ABS calendar labels some QUARTERLY releases by the quarter's END month
 * (the Wage Price Index row reads "June 2026" = 2026 Q2, while others read
 * "June Quarter 2026"), so a monthly-form label joining a quarterly series is
 * converted to its quarter. Returns null when the label cannot be expressed
 * in the series' convention — the draft then stays honestly null (rule 00).
 */
export function absSeriesPeriod(
  periodLabel: string,
  series: ReadonlyMap<string, string>,
): string | null {
  if (series.has(periodLabel)) return periodLabel;

  let quarterly = false;
  for (const key of series.keys()) {
    if (/^\d{4} Q[1-4]$/.test(key)) quarterly = true;
    break; // A series is single-frequency; the first key settles it.
  }
  if (!quarterly) return periodLabel;

  const month = /^(\d{4})-(\d{2})$/.exec(periodLabel);
  if (!month) return periodLabel;
  const mm = Number(month[2]);
  if (mm < 1 || mm > 12) return null;
  return `${month[1] ?? ''} Q${String(Math.ceil(mm / 3))}`;
}

/**
 * Resolve the figure for one period from an ABS series, applying the
 * configured rounding (Q3-B):
 *
 *   - (none)   — the observation verbatim.
 *   - `round1` — rounded half away from zero to one decimal, the release
 *     headline's own precision (the Labour Force API series is unrounded).
 *
 * Returns null when the observation is missing (not yet published).
 */
export function absValueForPeriod(
  series: ReadonlyMap<string, string>,
  periodLabel: string,
  transform: 'round1' | undefined,
): string | null {
  const raw = series.get(periodLabel);
  if (raw === undefined) return null;
  if (transform === undefined) return raw;

  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.sign(value) * Math.round(Math.abs(value) * 10);
  return (rounded / 10).toFixed(1);
}

/**
 * Shift a period label by a number of periods in its own convention
 * (negative = back): "2026-07" → months, "2026 Q2" → quarters. Returns null
 * for labels outside both conventions (e.g. an annual "2026") so the caller
 * skips the lookup instead of joining a wrong period (rule 00).
 */
export function shiftAbsPeriod(periodLabel: string, delta: number): string | null {
  const month = /^(\d{4})-(\d{2})$/.exec(periodLabel);
  if (month) {
    const total = Number(month[1]) * 12 + (Number(month[2]) - 1) + delta;
    if (total < 0) return null;
    const year = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    return `${String(year)}-${String(mm).padStart(2, '0')}`;
  }

  const quarter = /^(\d{4}) Q([1-4])$/.exec(periodLabel);
  if (quarter) {
    const total = Number(quarter[1]) * 4 + (Number(quarter[2]) - 1) + delta;
    if (total < 0) return null;
    const year = Math.floor(total / 4);
    const q = (total % 4) + 1;
    return `${String(year)} Q${String(q)}`;
  }

  return null;
}
