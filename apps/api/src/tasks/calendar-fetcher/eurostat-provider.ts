/**
 * Eurostat-backed calendar provider for the EU / euro area batch (ADR-0061 D2).
 *
 * Eurostat is the EU's official statistical authority. Its public release
 * calendar is exposed as a key-less JSON endpoint
 * (`/eurostat/o/calendars/eventsJson`) that lists forthcoming releases with a
 * stable official `title`, covered `period`, UTC `start` timestamp and machine
 * `datasetCodes`. This provider fetches that endpoint and maps each release to
 * a configured indicator by an exact, case-insensitive `title` match against
 * the curated `@opentrade/config` registry.
 *
 * NOTE (ADR-0061 D2): the ICS feed named in ADR-0061's first draft
 * (`RELEASE_CALENDAR/calendar_EN.ics`) has been retired (returns 404). This
 * provider uses the official `eventsJson` endpoint Eurostat's own
 * release-calendar page consumes — see
 * docs/conversations/2026-08-03-calendar-multi-region-research.md 發現 1.
 *
 * Compliance (ADR-0058 D1): Eurostat's calendar exposes the schedule only, not
 * the figures, so every event carries release time + period with
 * `previousValue = actualValue = null` — honest and compliant. NEVER a
 * forecast/consensus value, NEVER an impact rating. Every event links back to
 * the authority's official page via the config registry (`sourceUrl`).
 *
 * Per-event failures are isolated: one malformed entry can never block the
 * others (mirrors the FRED provider / news-fetcher per-source isolation).
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

const EUROSTAT_EVENTS_URL = 'https://ec.europa.eu/eurostat/o/calendars/eventsJson';
const REQUEST_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back to keep just-released events, and how far ahead to schedule. */
const LOOKBACK_MS = 60 * DAY_MS;
const LOOKAHEAD_MS = 120 * DAY_MS;

type FetchFn = typeof fetch;

/** One raw entry from the Eurostat `eventsJson` response. */
type EurostatRawEvent = {
  title?: unknown;
  period?: unknown;
  start?: unknown;
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
    return drafts;
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
