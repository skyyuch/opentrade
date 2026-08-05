/**
 * Singapore — Department of Statistics (SingStat) release-calendar provider
 * (ADR-0061 D2, batch 4; value backfill Q3-B).
 *
 * SingStat is Singapore's primary official statistical authority. UNLIKE the
 * other Asian authorities that are config-encoded (CN NBS / KR KOSTAT / ID BPS,
 * whose sites are API-less or Cloudflare-walled), SingStat publishes its
 * official whole-year Advance Release Calendar (ARC) as a machine-readable JSON
 * array embedded in the server-rendered ARC page's Next.js RSC payload — the
 * page is served over CloudFront with NO WAF challenge, so this provider fetches
 * it live (like GB ONS / CA StatCan / AU ABS / JP e-Stat / NZ Stats NZ / VN
 * GSO), and no annual transcription is needed.
 *
 * The RSC payload streams the page tree as `self.__next_f.push([1,"…"])` chunks;
 * the ARC lives in the chunk that carries `{"arcData":{"data":[{title,
 * release_date,…}]}}`. Each ARC `title` is "<indicator name>, <period>" (e.g.
 * "CPI For General Households, Jul 2026" / "Advance Gross Domestic Product (GDP)
 * Estimates, 2Q 2026"), so a release maps to a configured indicator by an exact
 * `singstatTitlePrefix` start-match (comma-terminated, so a prefix can never
 * bleed into a sibling series), and the period is parsed from the title tail: a
 * month → "YYYY-MM", a quarter → "YYYY Qn" (ADR-0058 D6).
 *
 * The authoritative fact is the single `release_date` (a strict `YYYY-MM-DD`);
 * the ARC `description` may carry a "Not Later Than" note or a date range, which
 * is deliberately ignored (the date is definitive). SingStat's standard release
 * time is 13:00 Singapore (SGT = UTC+8, no DST → 05:00 UTC); the provider
 * anchors it there — a pure computation, no date library (ADR-0058 D7).
 *
 * Values (ADR-0058 D3 phase two): for each indicator carrying
 * `singstatResourceId` the provider backfills `previousValue` / `actualValue`
 * from the key-less Table Builder API
 * (`tablebuilder.singstat.gov.sg/api/table/tabledata/<id>`), fetching the
 * table's headline series (series 1, guarded by an exact `singstatRowText`
 * match so a table restructuring degrades to honest nulls, never a wrong
 * series) and joining observations onto the drafts by their own period label —
 * so schedule and data can never drift into duplicate rows. CPI / IIP / the
 * unemployment rate have official pre-computed headline tables; the
 * retail-sales and merchandise-trade tables carry only levels — DOS/ESG
 * compute the headline YoY themselves in each press release — so where
 * `singstatTransform: 'pc1'` is configured the provider computes the standard
 * YoY locally from the verbatim series (12 months or 4 quarters back,
 * inferred from the period-label form), rounded half-away-from-zero to one
 * decimal, the press releases' own precision (owner-ratified 2026-08-05, same
 * ratification as the StatCan transforms; every configured figure
 * cross-checked against the official press release, rule 00).
 *
 * Compliance (ADR-0058 D1 / ADR-0061 D4): only the authority's own
 * previous/actual figures are ever produced — NEVER a forecast/consensus
 * value, NEVER an impact rating. A period the authority has not published yet
 * simply stays null (honest); the fetcher's two-phase upsert backfills it on a
 * later poll. ONLY SingStat first-party indicators are configured —
 * Singapore's private Manufacturing PMI (S&P Global / SIPMM) and the MAS
 * monetary-policy statement (a central-bank release, not a SingStat
 * statistic) are excluded upstream in config. Every event links back to the
 * SingStat official page via the config registry (`sourceUrl`).
 *
 * Robustness (rule 00): only a release whose title matches a configured prefix
 * AND whose `release_date` is a strict-ISO date AND whose period resolves is
 * emitted; anything else is skipped (prefer missing coverage over a wrong
 * date/period). Per-row failures are isolated — one malformed row can never
 * block the others (mirrors the ABS / e-Stat / Stats NZ / GSO providers).
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

const SINGSTAT_ARC_URL = 'https://www.singstat.gov.sg/data-tools-services/advance-release-calendar';
const SINGSTAT_TABLEDATA_URL = 'https://tablebuilder.singstat.gov.sg/api/table/tabledata';
/**
 * Latest observations fetched per table (`sortBy=key desc`): the drafts window
 * spans at most ~2 past periods and the monthly `pc1` transform needs 12
 * months of history behind the earliest of them — 24 leaves comfortable slack
 * (and covers quarterly tables many times over).
 */
const TABLEDATA_LATEST_N = 24;
const REQUEST_TIMEOUT_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back to keep just-released events, and how far ahead to schedule. */
const LOOKBACK_MS = 60 * DAY_MS;
const LOOKAHEAD_MS = 120 * DAY_MS;
/** Singapore Standard Time is UTC+8 with no DST; release anchored at 13:00 local. */
const SGT_OFFSET_HOURS = 8;
const RELEASE_HOUR_LOCAL = 13;
/**
 * Browser-like header: SingStat's CloudFront front serves a plain server-side
 * fetch, but a normal User-Agent is polite and avoids any bot heuristics.
 */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html',
};

/** One release parsed from the embedded ARC array: title + strict-ISO date. */
type SingstatEntry = {
  title: string;
  releaseDate: string;
};

/** The subset of a Table Builder `tabledata` response we consume. */
type SingstatTableResponse = {
  Data?: {
    row?: { rowText?: unknown; columns?: { key?: unknown; value?: unknown }[] }[];
  };
};

/** A compiled indicator matcher (lowercased, comma-terminated title prefix). */
type SingstatMatcher = {
  indicatorCode: string;
  prefix: string;
};

type FetchFn = typeof fetch;

export type SgSingstatCalendarProviderOptions = {
  /** Defaults to the curated enabled SingStat registry; injectable for tests. */
  indicators?: readonly CalendarIndicatorSource[];
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchFn?: FetchFn;
  /** Injectable clock for deterministic tests; defaults to `Date`. */
  now?: () => Date;
};

export class SgSingstatCalendarProvider implements ICalendarProvider {
  readonly source = 'SINGSTAT';

  private readonly indicators: readonly CalendarIndicatorSource[];
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(options: SgSingstatCalendarProviderOptions = {}) {
    this.indicators = options.indicators ?? calendarIndicatorsForProvider('SINGSTAT');
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
    for (const entry of extractSingstatEntries(html)) {
      try {
        const draft = toDraft(entry, matchers, now);
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
   * the Table Builder headline series (ADR-0058 D3 phase two). Joining on the
   * draft's own period label guarantees the value lands on the exact row the
   * schedule created — never a duplicate. A series failure (or a `rowText`
   * guard mismatch) only skips that one indicator (its drafts stay honestly
   * null).
   */
  private async backfillValues(drafts: CalendarEventDraft[]): Promise<void> {
    for (const indicator of this.indicators) {
      if (!indicator.singstatResourceId || !indicator.singstatRowText) continue;
      const own = drafts.filter((d) => d.indicatorCode === indicator.indicatorCode);
      if (own.length === 0) continue;

      let series: Map<string, string>;
      try {
        series = await this.fetchSeries(indicator.singstatResourceId, indicator.singstatRowText);
      } catch {
        continue; // Non-fatal: one broken series must not stop the others.
      }

      for (const draft of own) {
        const actual = singstatValueForPeriod(
          series,
          draft.periodLabel,
          indicator.singstatTransform,
        );
        if (actual !== null) draft.actualValue = actual;
        const prevPeriod = shiftSingstatPeriod(draft.periodLabel, -1);
        if (prevPeriod) {
          const previous = singstatValueForPeriod(series, prevPeriod, indicator.singstatTransform);
          if (previous !== null) draft.previousValue = previous;
        }
      }
    }
  }

  /**
   * Fetch one table's headline series (series 1, latest observations first)
   * and return a period-label → verbatim-value map. Throws when the series 1
   * `rowText` does not exactly match the configured guard — a silent table
   * restructuring must degrade to honest nulls, never a wrong series
   * (rule 00).
   */
  private async fetchSeries(resourceId: string, rowText: string): Promise<Map<string, string>> {
    const params = new URLSearchParams({
      seriesNoORrowNo: '1',
      sortBy: 'key desc',
      limit: String(TABLEDATA_LATEST_N),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(
        `${SINGSTAT_TABLEDATA_URL}/${resourceId}?${params.toString()}`,
        {
          signal: controller.signal,
          headers: { ...BROWSER_HEADERS, Accept: 'application/json' },
        },
      );
      if (!res.ok) throw new Error(`SingStat tabledata request failed: ${String(res.status)}`);
      const json: unknown = await res.json();
      return parseSingstatTable(json as SingstatTableResponse, rowText);
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchPage(): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(SINGSTAT_ARC_URL, {
        signal: controller.signal,
        headers: BROWSER_HEADERS,
      });
      if (!res.ok) throw new Error(`SingStat request failed: ${String(res.status)}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Compile the config indicators into lowercase comma-terminated prefix matchers. */
function buildMatchers(indicators: readonly CalendarIndicatorSource[]): SingstatMatcher[] {
  const matchers: SingstatMatcher[] = [];
  for (const indicator of indicators) {
    const prefix = indicator.singstatTitlePrefix;
    if (!prefix || prefix.trim() === '') continue;
    matchers.push({
      indicatorCode: indicator.indicatorCode,
      prefix: collapse(prefix).toLowerCase(),
    });
  }
  return matchers;
}

/**
 * Extract the embedded ARC releases (`{"arcData":{"data":[…]}}`) from the ARC
 * page's Next.js RSC payload and read each `{title, release_date}`. Returns `[]`
 * for any shape it cannot parse — a page change degrades to missing coverage,
 * never wrong data (rule 00).
 */
export function extractSingstatEntries(html: string): SingstatEntry[] {
  const data = extractArcDataArray(html);
  const entries: SingstatEntry[] = [];
  for (const raw of data) {
    if (raw === null || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    const title = typeof rec['title'] === 'string' ? collapse(rec['title']) : '';
    const releaseDate = typeof rec['release_date'] === 'string' ? rec['release_date'].trim() : '';
    if (title === '' || releaseDate === '') continue;
    entries.push({ title, releaseDate });
  }
  return entries;
}

/**
 * Locate the RSC chunk that carries `"arcData"`, JSON-decode its string literal,
 * then string-aware brace-scan the `{"arcData":…}` object and return its
 * `.arcData.data` array. `[]` on any failure.
 */
function extractArcDataArray(html: string): unknown[] {
  const marker = 'self.__next_f.push([1,';
  let searchFrom = 0;
  for (;;) {
    const mi = html.indexOf(marker, searchFrom);
    if (mi === -1) return [];
    const quoteStart = html.indexOf('"', mi + marker.length);
    if (quoteStart === -1) return [];

    const literal = readStringLiteral(html, quoteStart);
    searchFrom = literal ? literal.end : quoteStart + 1;
    if (!literal) continue;

    if (literal.value.includes('"arcData"')) {
      const data = parseArcDataFromChunk(literal.value);
      if (data.length > 0) return data;
    }
  }
}

/**
 * Read the JSON string literal beginning at `start` (an opening `"`), returning
 * its decoded value and the index just past the closing quote, or `null` if the
 * literal is unterminated / not valid JSON.
 */
function readStringLiteral(html: string, start: number): { value: string; end: number } | null {
  let esc = false;
  for (let i = start + 1; i < html.length; i += 1) {
    const ch = html[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
    if (ch === '"') {
      try {
        const value: unknown = JSON.parse(html.slice(start, i + 1));
        return typeof value === 'string' ? { value, end: i + 1 } : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** From a decoded RSC chunk string, parse `{"arcData":…}` and return its data array. */
function parseArcDataFromChunk(chunk: string): unknown[] {
  const objStart = chunk.indexOf('{"arcData"');
  if (objStart === -1) return [];
  const objStr = sliceBalanced(chunk, objStart);
  if (!objStr) return [];
  try {
    const parsed: unknown = JSON.parse(objStr);
    if (parsed === null || typeof parsed !== 'object') return [];
    const arcData = (parsed as Record<string, unknown>)['arcData'];
    if (arcData === null || typeof arcData !== 'object') return [];
    const data = (arcData as Record<string, unknown>)['data'];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Return the balanced `{…}` substring starting at `start` (a `{`), using a
 * string-aware scan so a brace inside a JSON string cannot unbalance it. `''`
 * if unbalanced.
 */
function sliceBalanced(str: string, start: number): string {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < str.length; i += 1) {
    const ch = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return '';
}

/**
 * Turn one ARC entry into a compliance-bounded draft (ADR-0058 D1), or `null`
 * when its title is not a whitelisted indicator, its date is not a strict-ISO
 * `YYYY-MM-DD`, its period cannot be resolved, or it falls outside the window.
 * Values are always null — the ARC carries no figures.
 */
function toDraft(
  entry: SingstatEntry,
  matchers: readonly SingstatMatcher[],
  now: number,
): CalendarEventDraft | null {
  const indicatorCode = matchIndicator(entry.title, matchers);
  if (!indicatorCode) return null;

  const scheduledAt = sgDateToUtc(entry.releaseDate);
  if (!scheduledAt) return null;

  const t = scheduledAt.getTime();
  if (t < now - LOOKBACK_MS || t > now + LOOKAHEAD_MS) return null;

  const periodLabel = normalizeSingstatPeriod(entry.title);
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
 * The first configured indicator whose comma-terminated prefix the (lowercased,
 * whitespace-collapsed) title STARTS WITH, or `null`. The comma terminator makes
 * the curated prefixes mutually exclusive (verified against the live ARC).
 */
export function matchIndicator(title: string, matchers: readonly SingstatMatcher[]): string | null {
  const s = collapse(title).toLowerCase();
  for (const m of matchers) {
    if (s.startsWith(m.prefix)) return m.indicatorCode;
  }
  return null;
}

/**
 * Convert a strict-ISO `YYYY-MM-DD` ARC date to the UTC release `Date`, anchored
 * at 13:00 Singapore (SGT = UTC+8, no DST → 05:00 UTC). Returns `null` for
 * anything that is not a strict `YYYY-MM-DD` with a valid month/day.
 */
export function sgDateToUtc(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = new Date(
    Date.UTC(year, month - 1, day, RELEASE_HOUR_LOCAL - SGT_OFFSET_HOURS, 0, 0, 0),
  );
  return Number.isNaN(utc.getTime()) ? null : utc;
}

const MONTH_ABBR: Record<string, string> = {
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
 * Normalise a SingStat ARC title's period to the FRED-aligned convention
 * (ADR-0058 D6). The period is the title tail, e.g.:
 *   "CPI For General Households, Jul 2026"                → "2026-07"
 *   "Advance Gross Domestic Product (GDP) Estimates, 2Q 2026" → "2026 Q2"
 *
 * A quarter ("nQ YYYY", SingStat's digit-before-Q form) takes precedence over a
 * month token when both somehow appear. Returns `null` when no month/quarter or
 * no year is present (e.g. a half-yearly "2H YYYY" or an annual row) — the
 * caller then skips the event (prefer missing coverage over a wrong period,
 * rule 00). Such rows never occur for the configured monthly/quarterly
 * indicators.
 */
export function normalizeSingstatPeriod(title: string): string | null {
  const s = collapse(title).toLowerCase();

  const quarterMatch = /\b([1-4])q\s+(20\d{2})\b/.exec(s);
  if (quarterMatch) return `${quarterMatch[2]} Q${quarterMatch[1]}`;

  const monthMatch = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(20\d{2})\b/.exec(
    s,
  );
  if (monthMatch) {
    const mm = monthMatch[1] ? MONTH_ABBR[monthMatch[1]] : undefined;
    return mm ? `${monthMatch[2]}-${mm}` : null;
  }
  return null;
}

/** Collapse all runs of whitespace (incl. embedded newlines) to single spaces. */
function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Parse a Table Builder `tabledata` response into a period-label →
 * verbatim-value map for the headline series. Observation keys come as
 * "2026 Jun" (monthly) or "2026 2Q" (quarterly) and are normalised to the
 * drafts' own convention ("2026-06" / "2026 Q2", ADR-0058 D6). Values are
 * kept as the authority's own verbatim strings; empty or non-numeric entries
 * (not yet published / suppressed) are skipped. Throws when series 1 is
 * missing or its `rowText` does not exactly match the expected guard.
 */
export function parseSingstatTable(
  json: SingstatTableResponse,
  expectedRowText: string,
): Map<string, string> {
  const row = json.Data?.row?.[0];
  if (!row || typeof row.rowText !== 'string' || collapse(row.rowText) !== expectedRowText) {
    throw new Error('SingStat tabledata: headline series rowText mismatch');
  }
  const series = new Map<string, string>();
  for (const col of row.columns ?? []) {
    if (typeof col.key !== 'string' || typeof col.value !== 'string') continue;
    const period = normalizeTableKey(col.key);
    if (!period) continue;
    const value = col.value.trim();
    if (value === '' || !Number.isFinite(Number(value))) continue;
    series.set(period, value);
  }
  return series;
}

/** Normalise a Table Builder key ("2026 Jun" / "2026 2Q") to the draft convention. */
function normalizeTableKey(key: string): string | null {
  const s = collapse(key).toLowerCase();
  const quarter = /^(20\d{2})\s+([1-4])q$/.exec(s);
  if (quarter) return `${quarter[1] ?? ''} Q${quarter[2] ?? ''}`;
  const month = /^(20\d{2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/.exec(s);
  if (month) {
    const mm = month[2] ? MONTH_ABBR[month[2]] : undefined;
    return mm ? `${month[1] ?? ''}-${mm}` : null;
  }
  return null;
}

/**
 * Resolve the figure for one period from a Table Builder series, applying the
 * configured standard transformation (Q3-B, owner-ratified 2026-08-05):
 *
 *   - (none) — the authority's own verbatim string (e.g. "1.9", "2", "7.2").
 *   - `pc1`  — percent change from the same period a year ago (12 months back
 *     for a monthly label, 4 quarters back for a quarterly one), rounded half
 *     away from zero to one decimal — the press releases' own precision.
 *
 * Returns null when any needed observation is missing (not yet published) or
 * the period label is outside the month/quarter conventions.
 */
export function singstatValueForPeriod(
  series: ReadonlyMap<string, string>,
  periodLabel: string,
  transform: 'pc1' | undefined,
): string | null {
  const current = series.get(periodLabel);
  if (current === undefined) return null;
  if (transform === undefined) return current;

  const baseLabel = shiftSingstatPeriod(periodLabel, /^\d{4}-\d{2}$/.test(periodLabel) ? -12 : -4);
  if (!baseLabel) return null;
  const base = series.get(baseLabel);
  if (base === undefined) return null;

  const currentNum = Number(current);
  const baseNum = Number(base);
  if (!Number.isFinite(currentNum) || !Number.isFinite(baseNum) || baseNum === 0) return null;

  const pct = (currentNum / baseNum - 1) * 100;
  const rounded = Math.sign(pct) * Math.round(Math.abs(pct) * 10);
  return (rounded / 10).toFixed(1);
}

/**
 * Shift a period label by a number of periods (negative = back), in months
 * for a "YYYY-MM" label and in quarters for a "YYYY Qn" label — e.g.
 * ("2026-01", -12) → "2025-01", ("2026 Q1", -1) → "2025 Q4". Returns null for
 * labels outside both conventions so the caller skips the lookup instead of
 * joining a wrong period (rule 00).
 */
export function shiftSingstatPeriod(label: string, periods: number): string | null {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(label);
  if (monthMatch) {
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    if (month < 1 || month > 12) return null;
    const total = year * 12 + (month - 1) + periods;
    const newYear = Math.floor(total / 12);
    const newMonth = (total % 12) + 1;
    return `${String(newYear)}-${String(newMonth).padStart(2, '0')}`;
  }
  const quarterMatch = /^(\d{4}) Q([1-4])$/.exec(label);
  if (quarterMatch) {
    const total = Number(quarterMatch[1]) * 4 + (Number(quarterMatch[2]) - 1) + periods;
    const newYear = Math.floor(total / 4);
    const newQuarter = (total % 4) + 1;
    return `${String(newYear)} Q${String(newQuarter)}`;
  }
  return null;
}
