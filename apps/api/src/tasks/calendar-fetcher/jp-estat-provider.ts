/**
 * Japan — e-Stat (政府統計の総合窓口) release-calendar provider
 * (ADR-0061 D2, batch 3).
 *
 * e-Stat is Japan's official statistics portal. Its appId REST API
 * (`getStatsList` etc.) only lists ALREADY-published tables (a past `OPEN_DATE`),
 * NOT a forward release schedule — so it is unsuitable as a calendar source.
 * The forward schedule is the key-less "公表予定" (release-calendar) Drupal page,
 * whose semantic rows each carry a machine-readable JST release datetime
 * (`data-kensakuKouhyou_date="YYYYMMDDHHMM"`), the issuing ministry, and a stable
 * government-statistics code (`data-toukei_cd`) plus the release name+period.
 * This provider fetches that page (key-less) and maps each row to a configured
 * indicator by an exact `data-toukei_cd` match, further narrowed by
 * `estatNameIncludes` / `estatNameExcludes` — one `toukei_cd` groups a family of
 * release variants (national vs Tokyo-ward CPI, 1st vs 2nd preliminary GDP,
 * preliminary vs final Industrial Production), so the name filter isolates the
 * single headline release and prevents `(indicatorCode, periodLabel)` collisions.
 *
 * The release time is JST (UTC+9, no DST), converted to UTC by subtracting nine
 * hours — a constant offset, so no date library and no DST maths are needed
 * (ADR-0058 D7).
 *
 * Compliance (ADR-0058 D1 / ADR-0061 D4): the page exposes no figures, so every
 * event carries release time + period with `previousValue = actualValue = null`
 * — honest and compliant. NEVER a forecast/consensus value, NEVER an impact
 * rating. ONLY primary government authorities (総務省 統計局 / 内閣府 / 経済産業省
 * / 財務省) are configured — private Manufacturing PMIs (au Jibun Bank / Nikkei /
 * S&P Global) are not government statistics, never appear in this official
 * calendar, and are excluded by design. Every event links back to the
 * authority's canonical page via the config registry (`sourceUrl`).
 *
 * Per-row failures are isolated: one malformed row can never block the others
 * (mirrors the Eurostat / ONS / StatCan / ABS / FRED providers).
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

const ESTAT_RELEASE_CALENDAR_URL = 'https://www.e-stat.go.jp/release-calendar';
const REQUEST_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back to keep just-released events, and how far ahead to schedule. */
const LOOKBACK_MS = 30 * DAY_MS;
const LOOKAHEAD_MS = 120 * DAY_MS;
/** JST is a constant UTC+9 with no daylight saving. */
const JST_OFFSET_HOURS = 9;

/**
 * One parsed release-calendar row: the compact JST datetime string
 * (`YYYYMMDDHHMM`), the government-statistics code, and the release name (which
 * carries the reference period).
 */
type EstatRow = {
  toukeiCode: string;
  jstDateTime: string;
  name: string;
};

type FetchFn = typeof fetch;

export type JpEstatCalendarProviderOptions = {
  /** Defaults to the curated enabled e-Stat registry; injectable for tests. */
  indicators?: readonly CalendarIndicatorSource[];
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchFn?: FetchFn;
  /** Injectable clock for deterministic tests; defaults to `Date`. */
  now?: () => Date;
};

export class JpEstatCalendarProvider implements ICalendarProvider {
  readonly source = 'ESTAT';

  private readonly indicators: readonly CalendarIndicatorSource[];
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(options: JpEstatCalendarProviderOptions = {}) {
    this.indicators = options.indicators ?? calendarIndicatorsForProvider('ESTAT');
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? ((): Date => new Date());
  }

  async fetchEvents(): Promise<CalendarEventDraft[]> {
    // Group configured indicators by their government-statistics code so one
    // pass over the page rows can resolve each row's indicator (with name
    // include/exclude narrowing) in O(1).
    const byCode = new Map<string, CalendarIndicatorSource[]>();
    for (const indicator of this.indicators) {
      if (!indicator.estatToukeiCode) continue;
      const list = byCode.get(indicator.estatToukeiCode) ?? [];
      list.push(indicator);
      byCode.set(indicator.estatToukeiCode, list);
    }
    if (byCode.size === 0) return [];

    let html: string;
    try {
      html = await this.fetchPage();
    } catch {
      return []; // Non-fatal: the fetcher isolates a whole-provider failure too.
    }

    const now = this.now().getTime();
    const drafts: CalendarEventDraft[] = [];
    for (const row of parseReleaseRows(html)) {
      try {
        const draft = toDraft(row, byCode, now);
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
      const res = await this.fetchFn(this.buildUrl(), {
        signal: controller.signal,
        headers: { Accept: 'text/html' },
      });
      if (!res.ok) throw new Error(`e-Stat request failed: ${String(res.status)}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Build the specified-period release-calendar URL from `now`: a small
   * look-back (to still catch a just-released event) through the look-ahead
   * horizon. The server-side range plus the per-row window filter both bound
   * the result.
   */
  private buildUrl(): string {
    const start = new Date(this.now().getTime() - LOOKBACK_MS);
    const end = new Date(this.now().getTime() + LOOKAHEAD_MS);
    const params = new URLSearchParams({
      startDay: String(start.getUTCDate()),
      startMonth: String(start.getUTCMonth() + 1),
      startYear: String(start.getUTCFullYear()),
      endDay: String(end.getUTCDate()),
      endMonth: String(end.getUTCMonth() + 1),
      endYear: String(end.getUTCFullYear()),
    });
    return `${ESTAT_RELEASE_CALENDAR_URL}?${params.toString()}`;
  }
}

/**
 * Extract each release row from the e-Stat 公表予定 Drupal HTML. A row's
 * `stat-announce-comment` span carries both the government-statistics code
 * (`data-toukei_cd`) and the compact JST release datetime
 * (`data-kensakuKouhyou_date`); the release name is the following anchor text.
 * Matching on the stable semantic attributes (not layout) keeps this resilient
 * to cosmetic markup churn.
 */
export function parseReleaseRows(html: string): EstatRow[] {
  const rows: EstatRow[] = [];
  const rowRe =
    /data-toukei_cd="(\d+)"\s+data-kensakuKouhyou_date="(\d{12})"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const toukeiCode = m[1] ?? '';
    const jstDateTime = m[2] ?? '';
    const anchorInner = m[3] ?? '';
    const nameMatch = /target="_blank">\s*([\s\S]*?)\s*$/.exec(anchorInner);
    const rawName = nameMatch ? nameMatch[1] : anchorInner;
    rows.push({
      toukeiCode,
      jstDateTime,
      name: decodeEntities((rawName ?? '').replace(/\s+/g, ' ')),
    });
  }
  return rows;
}

/**
 * Turn one parsed e-Stat row into a compliance-bounded draft (ADR-0058 D1), or
 * `null` when it is not a whitelisted indicator (by code + name filters), has an
 * unparseable datetime, or falls outside the window. Values are always null —
 * the page carries no figures.
 */
function toDraft(
  row: EstatRow,
  byCode: Map<string, CalendarIndicatorSource[]>,
  now: number,
): CalendarEventDraft | null {
  const candidates = byCode.get(row.toukeiCode);
  if (!candidates) return null;

  const indicator = candidates.find((c) => nameMatches(row.name, c));
  if (!indicator) return null;

  const scheduledAt = parseJstDateTime(row.jstDateTime);
  if (!scheduledAt) return null;

  const t = scheduledAt.getTime();
  if (t < now - LOOKBACK_MS || t > now + LOOKAHEAD_MS) return null;

  return {
    indicatorCode: indicator.indicatorCode,
    scheduledAt,
    periodLabel: normalizeEstatPeriod(row.name),
    previousValue: null,
    actualValue: null,
  };
}

/** True when the release name contains ALL `estatNameIncludes` and NONE of `estatNameExcludes`. */
function nameMatches(name: string, indicator: CalendarIndicatorSource): boolean {
  const includes = indicator.estatNameIncludes ?? [];
  for (const token of includes) {
    if (!name.includes(token)) return false;
  }
  const excludes = indicator.estatNameExcludes ?? [];
  for (const token of excludes) {
    if (name.includes(token)) return false;
  }
  return true;
}

/**
 * Parse a compact JST datetime `YYYYMMDDHHMM` into a UTC `Date`. JST is a
 * constant UTC+9 (no DST), so UTC = JST − 9h; `Date.UTC` handles the day/month
 * rollover when the hour goes negative. Returns null for a malformed string.
 */
export function parseJstDateTime(value: string): Date | null {
  if (!/^\d{12}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour - JST_OFFSET_HOURS, minute));
  return Number.isNaN(date.getTime()) ? null : date;
}

const FULLWIDTH_DIGIT_BASE = 0xff10; // '０'

/**
 * Normalise a Japanese e-Stat release name's reference period to the
 * FRED-aligned convention (ADR-0058 D6): "2026年7月分" → "2026-07",
 * "2026年4-6月期" → "2026 Q2", "令和8年7月" → "2026-07" (Reiwa era). Handles
 * full-width digits (`７` → `7`) and both `-` and `～` quarter ranges. An
 * unrecognised period string falls back to the trimmed original so an event is
 * never dropped for an unusual label.
 */
export function normalizeEstatPeriod(name: string): string {
  // 1. Full-width digits → ASCII.
  let s = name.replace(/[\uff10-\uff19]/g, (c) => String(c.charCodeAt(0) - FULLWIDTH_DIGIT_BASE));
  // 2. Reiwa era → Gregorian year (令和1 = 2019, so year = 2018 + n; 元 = 1).
  s = s.replace(/令和(元|\d+)年/g, (_full, n: string) => {
    const reiwa = n === '元' ? 1 : Number(n);
    return `${String(2018 + reiwa)}年`;
  });
  // 3. Flatten brackets so a period split across parens is still contiguous.
  s = s.replace(/[（）()［］【】[\]]/g, '');

  // 4. Take whichever period token appears EARLIEST in the name — a monthly
  //    release can embed a quarter-average sub-detail ("2026年9月分(…2026年7～9
  //    月期平均…)"), where the leading "9月分" is the true period, so a
  //    quarter-first rule would wrongly label it Q3. Scan both and pick the one
  //    with the smaller index.
  const quarter = /(\d{4})年(\d{1,2})[-～](\d{1,2})月期/.exec(s); // "YYYY年M-M月期"
  const month = /(\d{4})年(\d{1,2})月/.exec(s); //                    "YYYY年M月"
  if (quarter !== null && (month === null || quarter.index <= month.index)) {
    const year = quarter[1];
    const firstMonth = Number(quarter[2]);
    if (year && firstMonth >= 1 && firstMonth <= 12) {
      return `${year} Q${String(Math.floor((firstMonth - 1) / 3) + 1)}`;
    }
  }
  if (month) {
    const year = month[1];
    const mm = Number(month[2]);
    if (year && mm >= 1 && mm <= 12) return `${year}-${String(mm).padStart(2, '0')}`;
  }

  // 5. Year only: "YYYY年" → "YYYY".
  const year = /(\d{4})年/.exec(s)?.[1];
  if (year) return year;

  return name.trim();
}

/** Decode the few HTML entities that can appear in e-Stat product text. */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8217;/g, '\u2019')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
