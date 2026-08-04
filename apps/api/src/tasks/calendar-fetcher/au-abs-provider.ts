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
 * Compliance (ADR-0058 D1 / ADR-0061 D4): the page exposes no figures, so every
 * event carries release time + period with `previousValue = actualValue = null`
 * — honest and compliant. NEVER a forecast/consensus value, NEVER an impact
 * rating. ONLY ABS first-party indicators are configured — private
 * Manufacturing PMIs (S&P Global / Judo Bank / AiG) are deliberately excluded
 * upstream in config. Every event links back to the ABS official page via the
 * config registry (`sourceUrl`).
 *
 * Per-row failures are isolated: one malformed row can never block the others
 * (mirrors the Eurostat / ONS / StatCan / FRED providers).
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

const ABS_FUTURE_RELEASES_URL = 'https://www.abs.gov.au/release-calendar/future-releases';
const REQUEST_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back to keep just-released events, and how far ahead to schedule. */
const LOOKBACK_MS = 60 * DAY_MS;
const LOOKAHEAD_MS = 120 * DAY_MS;

/**
 * One parsed future-release row: the raw ISO datetime attribute, the period-
 * less product name, and the reference-period label (if present).
 */
type AbsRow = {
  datetime: string;
  eventName: string;
  referencePeriod: string;
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
    return drafts;
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
