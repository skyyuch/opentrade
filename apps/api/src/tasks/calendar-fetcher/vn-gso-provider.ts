/**
 * Vietnam — General Statistics Office (GSO) release-calendar provider
 * (ADR-0061 D2, batch 4).
 *
 * The GSO is Vietnam's primary official statistical authority. It was rebranded
 * the National Statistics Office of Vietnam and moved under the Ministry of
 * Finance; the legacy `gso.gov.vn` now resolves to `nso.gov.vn`. UNLIKE the
 * other Asian authorities in this batch (CN NBS / KR KOSTAT / ID BPS, whose
 * sites are API-less or Cloudflare-walled and therefore config-encoded), the
 * GSO publishes its official Advance Release Calendar (ARC) as a
 * machine-readable `var events=[{title,status,date,format}]` JSON array embedded
 * in the key-less release-calendar page, served by plain Apache with NO
 * Cloudflare challenge — so this provider fetches it live (like GB ONS / CA
 * StatCan / AU ABS / JP e-Stat / NZ Stats NZ), and no annual transcription is
 * needed.
 *
 * Each ARC release title embeds the covered period at the START and the
 * indicator name at the END (e.g. "The January/2026 consumer price index (CPI),
 * gold price index, USD price index"), so a release maps to a configured
 * indicator by `gsoNameIncludes` / `gsoNameExcludes` substrings
 * (case-insensitive, whitespace-collapsed), and the leading period phrase is
 * normalised to the FRED-aligned label (ADR-0058 D6): a month → "YYYY-MM", a
 * quarter → "YYYY Qn" (the first period token wins — Vietnam bundles quarter-end
 * months into the quarterly report, so e.g. the June report is labelled
 * "second quarter … 6 months" → "2026 Q2", which is honest and never collides
 * with the surrounding monthly labels).
 *
 * The ARC commits to a DATE only (the release is officially held "in the
 * morning"; Decree 62/2024/NĐ-CP moved the monthly socio-economic report to the
 * 6th of the following month). The provider therefore anchors the time at 09:00
 * Hanoi (Indochina Time = UTC+7, no DST → 02:00 UTC) — a pure computation, no
 * date library (ADR-0058 D7) — the DATE being the authoritative fact.
 *
 * Compliance (ADR-0058 D1 / ADR-0061 D4): the ARC exposes no figures, so every
 * event carries release date + period with `previousValue = actualValue = null`
 * — honest and compliant. NEVER a forecast/consensus value, NEVER an impact
 * rating. ONLY GSO first-party indicators are configured — Vietnam's private
 * Manufacturing PMI (S&P Global) is not an official statistic and is excluded
 * upstream in config. Every event links back to the GSO official page via the
 * config registry (`sourceUrl`).
 *
 * Robustness (rule 00): the ARC array carries some dirty legacy rows whose
 * `date` is not a strict `YYYY-MM-DD` (the site's own widget drops them via
 * luxon's `fromISO`), so this provider accepts ONLY strict-ISO dates and skips
 * a release whose period cannot be resolved — preferring missing coverage over
 * a wrong date/period. Per-row failures are isolated: one malformed row can
 * never block the others (mirrors the ABS / e-Stat / Stats NZ providers).
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

const GSO_RELEASE_CALENDAR_URL = 'https://www.nso.gov.vn/en/release-calendar-3/';
const REQUEST_TIMEOUT_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back to keep just-released events, and how far ahead to schedule. */
const LOOKBACK_MS = 60 * DAY_MS;
const LOOKAHEAD_MS = 120 * DAY_MS;
/** Indochina Time is UTC+7 with no DST; the release is anchored at 09:00 local. */
const ICT_OFFSET_HOURS = 7;
const RELEASE_HOUR_LOCAL = 9;
/**
 * Browser-like header: the GSO WordPress site serves a plain server-side fetch,
 * but a normal User-Agent is polite and avoids any bot heuristics.
 */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html',
};

/** One release parsed from the embedded ARC array: title + strict-ISO date. */
type GsoEvent = {
  title: string;
  date: string;
};

/** A compiled indicator matcher (all-includes present, no-excludes present). */
type GsoMatcher = {
  indicatorCode: string;
  includes: readonly string[];
  excludes: readonly string[];
};

type FetchFn = typeof fetch;

export type VnGsoCalendarProviderOptions = {
  /** Defaults to the curated enabled GSO registry; injectable for tests. */
  indicators?: readonly CalendarIndicatorSource[];
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchFn?: FetchFn;
  /** Injectable clock for deterministic tests; defaults to `Date`. */
  now?: () => Date;
};

export class VnGsoCalendarProvider implements ICalendarProvider {
  readonly source = 'GSO';

  private readonly indicators: readonly CalendarIndicatorSource[];
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(options: VnGsoCalendarProviderOptions = {}) {
    this.indicators = options.indicators ?? calendarIndicatorsForProvider('GSO');
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? ((): Date => new Date());
  }

  async fetchEvents(): Promise<CalendarEventDraft[]> {
    const matchers = buildMatchers(this.indicators);
    if (matchers.length === 0) return [];

    let html: string;
    try {
      html = await this.fetchPage();
    } catch {
      return []; // Non-fatal: the fetcher isolates a whole-provider failure too.
    }

    const now = this.now().getTime();
    const drafts: CalendarEventDraft[] = [];
    for (const event of extractGsoEvents(html)) {
      try {
        const draft = toDraft(event, matchers, now);
        if (draft) drafts.push(draft);
      } catch {
        // Non-fatal: one malformed row must not stop the others.
      }
    }
    return drafts;
  }

  private async fetchPage(): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(GSO_RELEASE_CALENDAR_URL, {
        signal: controller.signal,
        headers: BROWSER_HEADERS,
      });
      if (!res.ok) throw new Error(`GSO request failed: ${String(res.status)}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Compile the config indicators into lowercase include/exclude matchers. */
function buildMatchers(indicators: readonly CalendarIndicatorSource[]): GsoMatcher[] {
  const matchers: GsoMatcher[] = [];
  for (const indicator of indicators) {
    const includes = indicator.gsoNameIncludes;
    if (!includes || includes.length === 0) continue;
    matchers.push({
      indicatorCode: indicator.indicatorCode,
      includes: includes.map((s) => s.toLowerCase()),
      excludes: (indicator.gsoNameExcludes ?? []).map((s) => s.toLowerCase()),
    });
  }
  return matchers;
}

/**
 * Extract the embedded ARC array (`var events=[…]`) from the release-calendar
 * page and read each `{title, date}`. The array is located by its `var events=`
 * marker and delimited by a string-aware bracket scan (so a `]` inside a title
 * cannot truncate it). Returns `[]` for any shape it cannot parse — a page
 * change degrades to missing coverage, never wrong data (rule 00).
 */
export function extractGsoEvents(html: string): GsoEvent[] {
  const arr = extractEventsArray(html);
  const events: GsoEvent[] = [];
  for (const raw of arr) {
    if (raw === null || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    const title = typeof rec['title'] === 'string' ? collapse(rec['title']) : '';
    const date = typeof rec['date'] === 'string' ? rec['date'].trim() : '';
    if (title === '' || date === '') continue;
    events.push({ title, date });
  }
  return events;
}

/** Locate and JSON-parse the `var events=[…]` array; `[]` on any failure. */
function extractEventsArray(html: string): unknown[] {
  const marker = 'var events=';
  const mi = html.indexOf(marker);
  if (mi === -1) return [];
  const start = html.indexOf('[', mi);
  if (start === -1) return [];

  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [];

  try {
    const parsed: unknown = JSON.parse(html.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Turn one ARC event into a compliance-bounded draft (ADR-0058 D1), or `null`
 * when its title is not a whitelisted indicator, its date is not a strict-ISO
 * `YYYY-MM-DD`, its period cannot be resolved, or it falls outside the window.
 * Values are always null — the ARC carries no figures.
 */
function toDraft(
  event: GsoEvent,
  matchers: readonly GsoMatcher[],
  now: number,
): CalendarEventDraft | null {
  const indicatorCode = matchIndicator(event.title, matchers);
  if (!indicatorCode) return null;

  const scheduledAt = vnDateToUtc(event.date);
  if (!scheduledAt) return null;

  const t = scheduledAt.getTime();
  if (t < now - LOOKBACK_MS || t > now + LOOKAHEAD_MS) return null;

  const periodLabel = normalizeVnPeriod(event.title);
  if (!periodLabel) return null;

  return {
    indicatorCode,
    scheduledAt,
    periodLabel,
    previousValue: null,
    actualValue: null,
  };
}

/**
 * The first configured indicator whose `includes` are ALL present and whose
 * `excludes` are NONE present in the (lowercased, whitespace-collapsed) title,
 * or `null`. Config order is the tie-break, but the curated filters are
 * mutually exclusive by design (verified against the live ARC).
 */
export function matchIndicator(title: string, matchers: readonly GsoMatcher[]): string | null {
  const s = collapse(title).toLowerCase();
  for (const m of matchers) {
    if (m.includes.every((x) => s.includes(x)) && !m.excludes.some((x) => s.includes(x))) {
      return m.indicatorCode;
    }
  }
  return null;
}

/**
 * Convert a strict-ISO `YYYY-MM-DD` ARC date to the UTC release `Date`, anchored
 * at 09:00 Hanoi (ICT = UTC+7, no DST → 02:00 UTC). Returns `null` for anything
 * that is not a strict `YYYY-MM-DD` with a valid month/day — the ARC array
 * carries dirty legacy rows (e.g. "The 6th next month …") that must be skipped.
 */
export function vnDateToUtc(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = new Date(
    Date.UTC(year, month - 1, day, RELEASE_HOUR_LOCAL - ICT_OFFSET_HOURS, 0, 0, 0),
  );
  return Number.isNaN(utc.getTime()) ? null : utc;
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

const QUARTER_WORD: Record<string, string> = {
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  '1st': '1',
  '2nd': '2',
  '3rd': '3',
  '4th': '4',
};

/**
 * Normalise the leading period phrase of a GSO release title to the FRED-aligned
 * convention (ADR-0058 D6). The period is at the start of the title, e.g.:
 *   "The January/2026 consumer price index (CPI) …"          → "2026-01"
 *   "The February and first 2 months 2026 …"                 → "2026-02"
 *   "The first quarter 2026 gross domestic product (GDP)"    → "2026 Q1"
 *   "The second quarter and first 6 months 2026 …"           → "2026 Q2"
 *   "The fourth quarter and 2025 …"                          → "2025 Q4"
 *
 * The FIRST period token (month name or "<ordinal> quarter") wins, paired with
 * the first 4-digit year. Returns `null` when no month/quarter or no year is
 * present (annual / period-less legacy rows) — the caller then skips the event
 * (prefer missing coverage over a wrong period, rule 00). Such rows never
 * occur in-window for the configured indicators.
 */
export function normalizeVnPeriod(title: string): string | null {
  const s = collapse(title).toLowerCase();

  const yearMatch = /\b(20\d{2})\b/.exec(s);
  if (!yearMatch) return null;
  const year = yearMatch[1];

  const quarterMatch = /\b(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter\b/.exec(s);
  const monthMatch =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/.exec(
      s,
    );

  const quarterIdx = quarterMatch ? quarterMatch.index : Number.POSITIVE_INFINITY;
  const monthIdx = monthMatch ? monthMatch.index : Number.POSITIVE_INFINITY;

  if (quarterMatch && quarterIdx < monthIdx) {
    const q = quarterMatch[1] ? QUARTER_WORD[quarterMatch[1]] : undefined;
    return q ? `${year} Q${q}` : null;
  }
  if (monthMatch) {
    const mm = monthMatch[1] ? MONTHS[monthMatch[1]] : undefined;
    return mm ? `${year}-${mm}` : null;
  }
  if (quarterMatch) {
    const q = quarterMatch[1] ? QUARTER_WORD[quarterMatch[1]] : undefined;
    return q ? `${year} Q${q}` : null;
  }
  return null;
}

/** Collapse all runs of whitespace (incl. embedded newlines) to single spaces. */
function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
