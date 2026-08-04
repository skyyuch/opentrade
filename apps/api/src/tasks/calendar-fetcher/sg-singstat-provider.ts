/**
 * Singapore — Department of Statistics (SingStat) release-calendar provider
 * (ADR-0061 D2, batch 4).
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
 * Compliance (ADR-0058 D1 / ADR-0061 D4): the ARC exposes no figures, so every
 * event carries release date + period with `previousValue = actualValue = null`
 * — honest and compliant. NEVER a forecast/consensus value, NEVER an impact
 * rating. ONLY SingStat first-party indicators are configured — Singapore's
 * private Manufacturing PMI (S&P Global / SIPMM) and the MAS monetary-policy
 * statement (a central-bank release, not a SingStat statistic) are excluded
 * upstream in config. Every event links back to the SingStat official page via
 * the config registry (`sourceUrl`).
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
    return drafts;
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
