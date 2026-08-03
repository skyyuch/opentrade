/**
 * Statistics Canada (StatCan) calendar provider (ADR-0061 D2, batch 2).
 *
 * StatCan is Canada's official statistical authority. Its key-indicators
 * release schedule is exposed as a key-less JSON file
 * (`schedule-key_indicators-eng.json`) listing each forthcoming release with a
 * stable official `title` (e.g. "Consumer Price Index"), a `description`
 * period (e.g. "June 2026" / "Second quarter 2026") and a date. This provider
 * fetches that file and maps each release to a configured indicator by an
 * exact, case-insensitive `title` match against the curated registry.
 *
 * StatCan's flagship bulletin, "The Daily", is released at a fixed 08:30
 * Eastern time; the schedule file carries a date only, so this provider
 * constructs the UTC timestamp as 08:30 America/Toronto with DST awareness
 * (no date library, per ADR-0058 D7).
 *
 * Compliance (ADR-0058 D1): the schedule exposes no figures, so every event
 * carries release time + period with `previousValue = actualValue = null` —
 * honest and compliant. NEVER a forecast/consensus value, NEVER an impact
 * rating. Every event links back to the authority's official page via the
 * config registry (`sourceUrl`).
 *
 * Per-event failures are isolated: one malformed entry can never block the
 * others (mirrors the Eurostat / ONS / FRED providers).
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

const STATCAN_SCHEDULE_URL =
  'https://www150.statcan.gc.ca/n1/dai-quo/ssi/homepage/schedule-key_indicators-eng.json';
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
    return drafts;
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
