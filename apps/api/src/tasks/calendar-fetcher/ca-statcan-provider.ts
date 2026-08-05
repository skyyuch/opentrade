/**
 * Statistics Canada (StatCan) calendar provider (ADR-0061 D2, batch 2; value
 * backfill Q3-B).
 *
 * StatCan is Canada's official statistical authority. Two key-less official
 * endpoints are combined for ADR-0058 D3's two-phase population:
 *
 *   1. Schedule — the key-indicators schedule JSON
 *      (`schedule-key_indicators-eng.json`) lists each forthcoming release
 *      with a stable official `title` (e.g. "Consumer Price Index") and a
 *      `description` period (e.g. "June 2026" / "Second quarter 2026"). Each
 *      release is mapped to a configured indicator by an exact,
 *      case-insensitive `title` match against the curated registry.
 *   2. Values — the Web Data Service (WDS) endpoint
 *      `getDataFromVectorsAndLatestNPeriods` returns the authority's own
 *      published observations for the headline series pinned by each
 *      indicator's `statcanVectorId`. For each such indicator the provider
 *      backfills `previousValue` / `actualValue` onto the scheduled drafts,
 *      joining on the draft's own period label — so schedule and data can
 *      never drift into duplicate rows. WDS stores no pre-computed headline
 *      percent changes (only the Bank-of-Canada core-inflation measures,
 *      which are not the headline), so where `statcanTransform` is configured
 *      the provider computes the standard YoY (`pc1`) / MoM (`pch`) percent
 *      change locally from the verbatim series, rounded half-away-from-zero
 *      to one decimal — The Daily's own headline precision (owner-ratified
 *      2026-08-05; every configured figure cross-checked verbatim against the
 *      official The Daily bulletin, rule 00).
 *
 * StatCan's flagship bulletin, "The Daily", is released at a fixed 08:30
 * Eastern time; the schedule file carries a date only, so this provider
 * constructs the UTC timestamp as 08:30 America/Toronto with DST awareness
 * (no date library, per ADR-0058 D7).
 *
 * Compliance (ADR-0058 D1): only the authority's own previous/actual figures
 * are ever produced — NEVER a forecast/consensus value, NEVER an impact
 * rating. A period StatCan has not published yet simply stays null (honest);
 * the fetcher's two-phase upsert backfills it on a later poll. Every event
 * links back to the authority's official page via the config registry
 * (`sourceUrl`).
 *
 * Per-event and per-series failures are isolated: one malformed entry or one
 * broken series can never block the others (mirrors the Eurostat / ONS / FRED
 * providers).
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

const STATCAN_SCHEDULE_URL =
  'https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-key_indicators-eng.json';
const STATCAN_WDS_DATA_URL =
  'https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods';
/**
 * Observations fetched per vector: the drafts window spans at most ~2 past
 * months, and the `pc1` (YoY) transform needs 12 months of history behind the
 * earliest of them — 20 leaves comfortable slack.
 */
const WDS_LATEST_N = 20;
const REQUEST_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back to keep just-released events, and how far ahead to schedule. */
const LOOKBACK_MS = 60 * DAY_MS;
const LOOKAHEAD_MS = 120 * DAY_MS;

type FetchFn = typeof fetch;

/** One raw entry from the StatCan key-indicators schedule file. */
type StatCanRawEntry = {
  date?: unknown;
  title?: unknown;
  description?: unknown;
};

/** One per-vector result from the WDS `getDataFromVectorsAndLatestNPeriods`. */
type StatCanWdsResult = {
  status?: unknown;
  object?: {
    vectorId?: unknown;
    vectorDataPoint?: { refPer?: unknown; value?: unknown; decimals?: unknown }[];
  };
};

/** One monthly observation of a WDS series, keyed by `YYYY-MM` in the map. */
export type StatCanObservation = {
  value: number;
  /** The series' own published precision, used to render levels verbatim. */
  decimals: number;
};

export type CaStatCanCalendarProviderOptions = {
  /** Defaults to the curated enabled STATCAN registry; injectable for tests. */
  indicators?: readonly CalendarIndicatorSource[];
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchFn?: FetchFn;
  /** Injectable clock for deterministic tests; defaults to `Date`. */
  now?: () => Date;
};

export class CaStatCanCalendarProvider implements ICalendarProvider {
  readonly source = 'StatCan';

  private readonly indicators: readonly CalendarIndicatorSource[];
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(options: CaStatCanCalendarProviderOptions = {}) {
    this.indicators = options.indicators ?? calendarIndicatorsForProvider('STATCAN');
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? ((): Date => new Date());
  }

  async fetchEvents(): Promise<CalendarEventDraft[]> {
    // Build a case-insensitive title → indicatorCode lookup from the registry.
    const byTitle = new Map<string, string>();
    for (const indicator of this.indicators) {
      if (indicator.statcanTitle) {
        byTitle.set(indicator.statcanTitle.trim().toLowerCase(), indicator.indicatorCode);
      }
    }
    if (byTitle.size === 0) return [];

    let raw: StatCanRawEntry[];
    try {
      raw = await this.fetchSchedule();
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
   * the WDS headline vectors (ADR-0058 D3 phase two). Joining on the draft's
   * own period label guarantees the value lands on the exact row the schedule
   * created — never a duplicate. A series failure only skips that one
   * indicator (its drafts stay honestly null).
   */
  private async backfillValues(drafts: CalendarEventDraft[]): Promise<void> {
    const wanted = this.indicators.filter(
      (i) =>
        typeof i.statcanVectorId === 'number' &&
        drafts.some((d) => d.indicatorCode === i.indicatorCode),
    );
    if (wanted.length === 0) return;

    let seriesByVector: Map<number, Map<string, StatCanObservation>>;
    try {
      seriesByVector = await this.fetchVectors(
        wanted.map((i) => i.statcanVectorId).filter((v): v is number => typeof v === 'number'),
      );
    } catch {
      return; // Non-fatal: drafts stay honestly null until a later poll.
    }

    for (const indicator of wanted) {
      const series =
        indicator.statcanVectorId === undefined
          ? undefined
          : seriesByVector.get(indicator.statcanVectorId);
      if (!series) continue; // Per-vector failure: skip just this indicator.

      for (const draft of drafts) {
        if (draft.indicatorCode !== indicator.indicatorCode) continue;
        const actual = valueForPeriod(series, draft.periodLabel, indicator.statcanTransform);
        if (actual !== null) draft.actualValue = actual;
        const prevMonth = shiftMonthLabel(draft.periodLabel, -1);
        if (prevMonth) {
          const previous = valueForPeriod(series, prevMonth, indicator.statcanTransform);
          if (previous !== null) draft.previousValue = previous;
        }
      }
    }
  }

  /** Fetch all headline vectors in one WDS call; returns per-vector maps. */
  private async fetchVectors(
    vectorIds: readonly number[],
  ): Promise<Map<number, Map<string, StatCanObservation>>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(STATCAN_WDS_DATA_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(vectorIds.map((vectorId) => ({ vectorId, latestN: WDS_LATEST_N }))),
      });
      if (!res.ok) throw new Error(`StatCan WDS request failed: ${String(res.status)}`);
      const json: unknown = await res.json();
      return parseWdsResults(Array.isArray(json) ? (json as StatCanWdsResult[]) : []);
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchSchedule(): Promise<StatCanRawEntry[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(STATCAN_SCHEDULE_URL, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`StatCan request failed: ${String(res.status)}`);
      const json: unknown = await res.json();
      return Array.isArray(json) ? (json as StatCanRawEntry[]) : [];
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Turn one raw StatCan entry into a compliance-bounded draft (ADR-0058 D1), or
 * `null` when it is not a whitelisted indicator or falls outside the window.
 * Values are always null — StatCan's schedule carries no figures.
 */
function toDraft(
  entry: StatCanRawEntry,
  byTitle: Map<string, string>,
  now: number,
): CalendarEventDraft | null {
  if (typeof entry.title !== 'string') return null;
  const indicatorCode = byTitle.get(entry.title.trim().toLowerCase());
  if (!indicatorCode) return null;

  const scheduledAt = parseDailyRelease(entry.date);
  if (!scheduledAt) return null;

  const t = scheduledAt.getTime();
  if (t < now - LOOKBACK_MS || t > now + LOOKAHEAD_MS) return null;

  return {
    indicatorCode,
    scheduledAt,
    periodLabel: normalizeStatCanPeriod(
      typeof entry.description === 'string' ? entry.description : '',
    ),
    previousValue: null,
    actualValue: null,
  };
}

/**
 * Parse a StatCan schedule date ("2026-08-04 00:00:01") into the UTC timestamp
 * of the 08:30 Eastern "The Daily" release. The file carries a placeholder
 * time, so only the date part is used; 08:30 America/Toronto is converted to
 * UTC with DST awareness (EDT = UTC-4, EST = UTC-5).
 */
export function parseDailyRelease(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  const day = Number(m[3]);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const offsetHours = easternIsDst(year, month, day) ? 4 : 5;
  // 08:30 local Eastern + offset = UTC hour.
  const utc = Date.UTC(year, month - 1, day, 8 + offsetHours, 30, 0, 0);
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * US/Canada Eastern DST: EDT (UTC-4) from the second Sunday of March to the
 * first Sunday of November, otherwise EST (UTC-5). Evaluated at day
 * granularity, which is correct for an 08:30 release (after the 02:00 local
 * transition) on both transition Sundays.
 */
export function easternIsDst(year: number, month: number, day: number): boolean {
  const marchStart = nthSundayOfMonth(year, 3, 2);
  const novEnd = nthSundayOfMonth(year, 11, 1);
  const date = Date.UTC(year, month - 1, day);
  return date >= Date.UTC(year, 2, marchStart) && date < Date.UTC(year, 10, novEnd);
}

/** Day-of-month of the `n`th Sunday of a 1-based month. */
function nthSundayOfMonth(year: number, month: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sunday
  const firstSunday = 1 + ((7 - firstDow) % 7);
  return firstSunday + (n - 1) * 7;
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

const QUARTERS: Record<string, string> = {
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
};

/**
 * Normalise a StatCan `description` period to the FRED-aligned convention
 * (ADR-0058 D6): "June 2026" → "2026-06", "Second quarter 2026" → "2026 Q2",
 * "2026" → "2026". Unrecognised labels fall back to the trimmed original so an
 * event is never dropped for an unusual period string.
 */
export function normalizeStatCanPeriod(period: string): string {
  const trimmed = period.trim();
  if (trimmed === '') return trimmed;

  const month = /^([A-Za-z]+)\s+(\d{4})$/.exec(trimmed);
  if (month) {
    const [, name, year] = month;
    const mm = name ? MONTHS[name.toLowerCase()] : undefined;
    if (mm && year) return `${year}-${mm}`;
  }

  const quarter = /^([A-Za-z]+)\s+quarter\s+(\d{4})$/i.exec(trimmed);
  if (quarter) {
    const [, word, year] = quarter;
    const q = word ? QUARTERS[word.toLowerCase()] : undefined;
    if (q && year) return `${year} Q${q}`;
  }

  if (/^\d{4}$/.test(trimmed)) return trimmed;

  return trimmed;
}

/**
 * Parse the WDS `getDataFromVectorsAndLatestNPeriods` response into one
 * `YYYY-MM → observation` map per vector. A non-SUCCESS vector result is
 * simply absent from the map (per-series isolation); malformed data points
 * are skipped so one bad observation never poisons a series.
 */
export function parseWdsResults(
  results: readonly StatCanWdsResult[],
): Map<number, Map<string, StatCanObservation>> {
  const byVector = new Map<number, Map<string, StatCanObservation>>();
  for (const result of results) {
    if (result.status !== 'SUCCESS') continue;
    const vectorId = result.object?.vectorId;
    if (typeof vectorId !== 'number') continue;
    const series = new Map<string, StatCanObservation>();
    for (const dp of result.object?.vectorDataPoint ?? []) {
      if (typeof dp.refPer !== 'string') continue;
      const m = /^(\d{4})-(\d{2})/.exec(dp.refPer.trim());
      if (!m) continue;
      // WDS carries numbers; a null/absent value means suppressed or not yet
      // published (must NOT coerce — `Number(null)` would fabricate a 0).
      if (typeof dp.value !== 'number' || !Number.isFinite(dp.value)) continue;
      const value = dp.value;
      const decimals = typeof dp.decimals === 'number' ? dp.decimals : 0;
      series.set(`${m[1] ?? ''}-${m[2] ?? ''}`, { value, decimals });
    }
    byVector.set(vectorId, series);
  }
  return byVector;
}

/**
 * Resolve the figure for one `YYYY-MM` period from a WDS series, applying the
 * configured standard transformation (Q3-B, owner-ratified 2026-08-05):
 *
 *   - (none) — the observation itself, rendered at the series' own published
 *     precision so verbatim trailing zeros are kept (e.g. "6.5", "3855.5").
 *   - `pch`  — percent change from the previous month, one decimal.
 *   - `pc1`  — percent change from the same month a year ago, one decimal.
 *
 * One decimal, rounded half away from zero, is The Daily's own headline
 * precision — every configured series was cross-checked verbatim against the
 * official bulletin (rule 00). Returns null when any needed observation is
 * missing (not yet published) or the period label is not monthly.
 */
export function valueForPeriod(
  series: ReadonlyMap<string, StatCanObservation>,
  periodLabel: string,
  transform: 'pc1' | 'pch' | undefined,
): string | null {
  const current = series.get(periodLabel);
  if (!current) return null;

  if (transform === undefined) return current.value.toFixed(current.decimals);

  const baseMonth = shiftMonthLabel(periodLabel, transform === 'pc1' ? -12 : -1);
  if (!baseMonth) return null;
  const base = series.get(baseMonth);
  if (!base || base.value === 0) return null;

  const pct = (current.value / base.value - 1) * 100;
  const rounded = Math.sign(pct) * Math.round(Math.abs(pct) * 10);
  return (rounded / 10).toFixed(1);
}

/**
 * Shift a `YYYY-MM` period label by a number of months (negative = back),
 * e.g. ("2026-01", -12) → "2025-01". Returns null for labels outside the
 * month convention (e.g. a quarterly or annual period) so the caller skips
 * the lookup instead of joining a wrong period (rule 00).
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
