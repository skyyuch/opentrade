/**
 * New Zealand — Stats NZ (Tatauranga Aotearoa) release-calendar provider
 * (ADR-0061 D2, batch 3).
 *
 * Stats NZ is New Zealand's primary official statistical authority. Its site
 * sits behind an Incapsula WAF that 403s the legacy `.json` asset path, but its
 * release calendar is served as clean JSON by the key-less month endpoint
 * `/api/v1/releaseCalendarMonth/<YYYY-MM>` when fetched with browser-like
 * headers. Each month's payload has `items.published[]` (already released) and
 * `items.upcoming[]` (forthcoming); this provider walks the months spanning its
 * window, merges both buckets, and maps each release to a configured indicator.
 *
 * A release's `DisplayName` is consistently `"<statistic name>: <period>"`
 * (e.g. "Consumers price index: June 2026 quarter"), so a release maps to an
 * indicator by an exact, case-insensitive match of the name BEFORE the first
 * colon (`statsNzTitlePrefix`). Splitting on the first colon cleanly separates
 * sibling releases (e.g. the headline "Labour market statistics" from "Labour
 * market statistics (income)").
 *
 * Release time is a fixed 10:45 Pacific/Auckland, converted to UTC with DST
 * awareness (NZDT = UTC+13 from the last Sunday of September to the first
 * Sunday of April; NZST = UTC+12 otherwise) — a pure computation, so no date
 * library is needed (ADR-0058 D7).
 *
 * Compliance (ADR-0058 D1 / ADR-0061 D4): the endpoint exposes no figures, so
 * every event carries release time + period with `previousValue = actualValue
 * = null` — honest and compliant. NEVER a forecast/consensus value, NEVER an
 * impact rating. ONLY Stats NZ first-party indicators are configured — New
 * Zealand's private PMI/PSI (BusinessNZ) are not official statistics and are
 * excluded upstream in config. Every event links back to the Stats NZ official
 * page via the config registry (`sourceUrl`).
 *
 * Per-row and per-month failures are isolated: one malformed row or one failed
 * month fetch can never block the others (mirrors the Eurostat / ONS / StatCan
 * / ABS / e-Stat providers).
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

const STATSNZ_MONTH_API = 'https://www.stats.govt.nz/api/v1/releaseCalendarMonth';
const REQUEST_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back to keep just-released events, and how far ahead to schedule. */
const LOOKBACK_MS = 60 * DAY_MS;
const LOOKAHEAD_MS = 120 * DAY_MS;
/**
 * Browser-like headers: the site's Incapsula WAF rejects unadorned requests.
 * These mirror a normal calendar-page XHR (the JS app fetches the same API).
 */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.stats.govt.nz/release-calendar/',
  'X-Requested-With': 'XMLHttpRequest',
};

/** One release parsed from a month payload: the full display name + local time. */
type StatsNzRow = {
  displayName: string;
  /** NZ-local publication datetime, `"YYYY-MM-DD HH:MM:SS"`. */
  publicationDate: string;
};

type FetchFn = typeof fetch;

export type NzStatsNzCalendarProviderOptions = {
  /** Defaults to the curated enabled Stats NZ registry; injectable for tests. */
  indicators?: readonly CalendarIndicatorSource[];
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchFn?: FetchFn;
  /** Injectable clock for deterministic tests; defaults to `Date`. */
  now?: () => Date;
};

export class NzStatsNzCalendarProvider implements ICalendarProvider {
  readonly source = 'STATSNZ';

  private readonly indicators: readonly CalendarIndicatorSource[];
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(options: NzStatsNzCalendarProviderOptions = {}) {
    this.indicators = options.indicators ?? calendarIndicatorsForProvider('STATSNZ');
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? ((): Date => new Date());
  }

  async fetchEvents(): Promise<CalendarEventDraft[]> {
    // Build a case-insensitive title-prefix → indicatorCode lookup.
    const byPrefix = new Map<string, string>();
    for (const indicator of this.indicators) {
      if (indicator.statsNzTitlePrefix) {
        byPrefix.set(indicator.statsNzTitlePrefix.trim().toLowerCase(), indicator.indicatorCode);
      }
    }
    if (byPrefix.size === 0) return [];

    const now = this.now().getTime();
    const drafts: CalendarEventDraft[] = [];
    for (const month of monthsInWindow(this.now())) {
      let rows: StatsNzRow[];
      try {
        rows = parseMonthPayload(await this.fetchMonth(month));
      } catch {
        continue; // Non-fatal: one failed month must not stop the others.
      }
      for (const row of rows) {
        try {
          const draft = toDraft(row, byPrefix, now);
          if (draft) drafts.push(draft);
        } catch {
          // Non-fatal: one malformed row must not stop the others.
        }
      }
    }
    return drafts;
  }

  private async fetchMonth(month: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(`${STATSNZ_MONTH_API}/${month}`, {
        signal: controller.signal,
        headers: BROWSER_HEADERS,
      });
      if (!res.ok) throw new Error(`Stats NZ request failed: ${String(res.status)}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * The `YYYY-MM` month keys spanning `[now − LOOKBACK, now + LOOKAHEAD]`,
 * inclusive. The month endpoint is queried once per month; the per-row window
 * filter then bounds the events precisely.
 */
export function monthsInWindow(now: Date): string[] {
  const start = new Date(now.getTime() - LOOKBACK_MS);
  const end = new Date(now.getTime() + LOOKAHEAD_MS);
  const months: string[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth(); // 0-based
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${String(y)}-${String(m + 1).padStart(2, '0')}`);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return months;
}

/**
 * Extract the release rows from one month payload. `items.published[]` entries
 * nest their fields under `DateTaxonomyTerm` (and carry a top-level `Title`),
 * while `items.upcoming[]` entries are flat (`DisplayName` / `PublicationDate`
 * directly) — this reads both shapes. Unknown/partial shapes are skipped, not
 * thrown, so a payload change degrades to missing coverage, never wrong data.
 */
export function parseMonthPayload(payload: unknown): StatsNzRow[] {
  const items = (payload as { items?: unknown } | null)?.items;
  if (items === null || typeof items !== 'object') return [];
  const buckets = items as { published?: unknown; upcoming?: unknown };
  const rows: StatsNzRow[] = [];
  for (const bucket of [buckets.published, buckets.upcoming]) {
    if (!Array.isArray(bucket)) continue;
    for (const raw of bucket) {
      const row = extractRow(raw);
      if (row) rows.push(row);
    }
  }
  return rows;
}

/** Read `{displayName, publicationDate}` from either the published or upcoming row shape. */
function extractRow(raw: unknown): StatsNzRow | null {
  if (raw === null || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const nested = rec['DateTaxonomyTerm'];
  const term = nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : rec;
  const displayName = pickString(rec['Title']) ?? pickString(term['DisplayName']);
  const publicationDate = pickString(term['PublicationDate']);
  if (!displayName || !publicationDate) return null;
  return { displayName, publicationDate };
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Turn one Stats NZ row into a compliance-bounded draft (ADR-0058 D1), or
 * `null` when its name prefix is not a whitelisted indicator, its datetime is
 * unparseable, or it falls outside the window. Values are always null — the
 * endpoint carries no figures.
 */
function toDraft(
  row: StatsNzRow,
  byPrefix: Map<string, string>,
  now: number,
): CalendarEventDraft | null {
  const colon = row.displayName.indexOf(':');
  const namePart = colon === -1 ? row.displayName : row.displayName.slice(0, colon);
  const periodPart = colon === -1 ? '' : row.displayName.slice(colon + 1);

  const indicatorCode = byPrefix.get(namePart.trim().toLowerCase());
  if (!indicatorCode) return null;

  const scheduledAt = parseNzPublicationDate(row.publicationDate);
  if (!scheduledAt) return null;

  const t = scheduledAt.getTime();
  if (t < now - LOOKBACK_MS || t > now + LOOKAHEAD_MS) return null;

  return {
    indicatorCode,
    scheduledAt,
    periodLabel: normalizeStatsNzPeriod(periodPart),
    previousValue: null,
    actualValue: null,
  };
}

/**
 * Parse a Stats NZ NZ-local `"YYYY-MM-DD HH:MM:SS"` publication datetime into a
 * UTC `Date`, applying the New Zealand DST offset (no date library — D7).
 * Returns null for a malformed string.
 */
export function parseNzPublicationDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const offsetHours = nzIsDst(year, month, day) ? 13 : 12;
  const date = new Date(Date.UTC(year, month - 1, day, hour - offsetHours, minute, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * New Zealand DST: NZDT (UTC+13) from the last Sunday of September to the first
 * Sunday of April; NZST (UTC+12) otherwise. The transition is at ~02:00–03:00
 * local, well before the fixed 10:45 release, so day-granularity is correct on
 * both transition Sundays (DST already in effect on the September Sunday; DST
 * already ended on the April Sunday).
 */
export function nzIsDst(year: number, month: number, day: number): boolean {
  if (month > 9 || month < 4) return true; // Oct–Dec and Jan–Mar are always NZDT.
  if (month > 4 && month < 9) return false; // May–Aug are always NZST.
  if (month === 9) return day >= lastSundayOfMonth(year, 9);
  // month === 4: DST ends on the first Sunday of April (release after 03:00 → NZST).
  return day < nthSundayOfMonth(year, 4, 1);
}

/** Day-of-month of the `n`th Sunday of a 1-based month. */
function nthSundayOfMonth(year: number, month: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sunday
  const firstSunday = 1 + ((7 - firstDow) % 7);
  return firstSunday + (n - 1) * 7;
}

/** Day-of-month of the last Sunday of a 1-based month. */
function lastSundayOfMonth(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(); // day 0 of next month
  const lastDow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return lastDay - lastDow;
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
 * Stats NZ labels quarterly releases by the quarter's END month ("June 2026
 * quarter" = the April–June quarter = Q2). Map an end-month name to its quarter
 * (same convention as ABS).
 */
const QUARTER_END_MONTH: Record<string, string> = {
  march: '1',
  june: '2',
  september: '3',
  december: '4',
};

/**
 * Normalise a Stats NZ period (the text after the first colon in `DisplayName`)
 * to the FRED-aligned convention (ADR-0058 D6): "June 2026 quarter" → "2026 Q2",
 * "July 2026" → "2026-07", "2026" → "2026". Unrecognised labels (e.g. "Year
 * ended June 2026", "At 30 June 2026") fall back to the trimmed original so an
 * event is never dropped for an unusual period string.
 */
export function normalizeStatsNzPeriod(period: string): string {
  const trimmed = period.trim();
  if (trimmed === '') return trimmed;

  const quarter = /^([A-Za-z]+)\s+(\d{4})\s+quarter$/i.exec(trimmed);
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
