/**
 * FRED-backed calendar provider for the US first batch (per ADR-0058 D2).
 *
 * FRED (Federal Reserve Bank of St. Louis) is an official data warehouse that
 * federates the BLS / BEA / Federal Reserve series in this batch and exposes
 * both their official **release schedule** (`/fred/release/dates`) and the
 * published **observation values** (`/fred/series/observations`) as a stable
 * JSON API. This provider uses that single official source for both halves of
 * ADR-0058 D3's two-phase population — the release-dates API for `scheduledAt`
 * (the schedule) and the observations API for `previousValue` / `actualValue`
 * (the actuals) — rather than scraping three separate agency HTML pages, which
 * would be brittle and hard to verify. Every event still links back to the
 * authority's canonical release page via the config registry (`sourceUrl`), so
 * D1/D2 provenance is preserved.
 *
 * Compliance (ADR-0058 D1): only the authority's own previous/actual figures
 * are ever produced — never a forecast/consensus value and never an impact
 * rating. The FRED API key is injected from env (AWS Secrets Manager in
 * production, rule 50) and is NEVER hard-coded here.
 *
 * Per-indicator failures are isolated: one broken series can never block the
 * others (mirrors the news-fetcher's per-feed isolation).
 */

import { enabledCalendarIndicators } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

const FRED_BASE = 'https://api.stlouisfed.org';
const REQUEST_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back to hydrate released events, and how far ahead to show scheduled ones. */
const LOOKBACK_MS = 200 * DAY_MS;
const LOOKAHEAD_MS = 120 * DAY_MS;
/** Extra observation history so the oldest in-window release still has a `previous`. */
const OBS_EXTRA_LOOKBACK_MS = 400 * DAY_MS;

type FetchFn = typeof fetch;

type ObservationPoint = { date: Date; value: string };

export type FredCalendarProviderOptions = {
  /** FRED API key from env/Secrets Manager (rule 50). Empty → provider is inert. */
  apiKey: string;
  /** Defaults to the curated enabled registry; injectable for tests. */
  indicators?: readonly CalendarIndicatorSource[];
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchFn?: FetchFn;
  /** Injectable clock for deterministic tests; defaults to `Date`. */
  now?: () => Date;
};

export class FredCalendarProvider implements ICalendarProvider {
  readonly source = 'FRED';

  private readonly apiKey: string;
  private readonly indicators: readonly CalendarIndicatorSource[];
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(options: FredCalendarProviderOptions) {
    this.apiKey = options.apiKey;
    this.indicators = options.indicators ?? enabledCalendarIndicators();
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? ((): Date => new Date());
  }

  async fetchEvents(): Promise<CalendarEventDraft[]> {
    if (!this.apiKey) return [];

    const drafts: CalendarEventDraft[] = [];
    for (const indicator of this.indicators) {
      if (!indicator.fredSeriesId) continue;
      try {
        drafts.push(...(await this.fetchForIndicator(indicator)));
      } catch {
        // Non-fatal: one series failure must not stop the others.
      }
    }
    return drafts;
  }

  private async fetchForIndicator(
    indicator: CalendarIndicatorSource,
  ): Promise<CalendarEventDraft[]> {
    const seriesId = indicator.fredSeriesId;
    if (!seriesId) return [];

    const releaseId = await this.getReleaseId(seriesId);
    const [releaseDates, observations] = await Promise.all([
      this.getReleaseDates(releaseId),
      this.getObservations(seriesId),
    ]);

    return buildDrafts(indicator.indicatorCode, releaseDates, observations, this.now());
  }

  private async getReleaseId(seriesId: string): Promise<number> {
    const json = await this.getJson(
      `/fred/series/release?series_id=${encodeURIComponent(seriesId)}`,
    );
    const releases = (json as { releases?: { id?: unknown }[] }).releases;
    const id = releases?.[0]?.id;
    if (typeof id !== 'number') throw new Error(`FRED: no release id for ${seriesId}`);
    return id;
  }

  private async getReleaseDates(releaseId: number): Promise<Date[]> {
    const json = await this.getJson(
      `/fred/release/dates?release_id=${String(releaseId)}` +
        `&include_release_dates_with_no_data=true&sort_order=asc`,
    );
    const raw = (json as { release_dates?: { date?: unknown }[] }).release_dates ?? [];
    const now = this.now().getTime();

    return raw
      .map((r) => parseUtcDate(r.date))
      .filter((d): d is Date => d !== null)
      .filter((d) => d.getTime() >= now - LOOKBACK_MS && d.getTime() <= now + LOOKAHEAD_MS)
      .sort((a, b) => a.getTime() - b.getTime());
  }

  private async getObservations(seriesId: string): Promise<ObservationPoint[]> {
    const start = toYmd(new Date(this.now().getTime() - LOOKBACK_MS - OBS_EXTRA_LOOKBACK_MS));
    const json = await this.getJson(
      `/fred/series/observations?series_id=${encodeURIComponent(seriesId)}` +
        `&sort_order=asc&observation_start=${start}`,
    );
    const raw =
      (json as { observations?: { date?: unknown; value?: unknown }[] }).observations ?? [];

    const points: ObservationPoint[] = [];
    for (const o of raw) {
      const date = parseUtcDate(o.date);
      // FRED encodes a missing value as ".".
      if (date && typeof o.value === 'string' && o.value !== '.') {
        points.push({ date, value: o.value });
      }
    }
    return points.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private async getJson(path: string): Promise<unknown> {
    const url = `${FRED_BASE}${path}&api_key=${this.apiKey}&file_type=json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await this.fetchFn(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`FRED request failed: ${String(res.status)}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Turn an indicator's official release dates + published observations into
 * two-phase drafts (ADR-0058 D3): released events carry the authority's actual
 * value, upcoming events carry `actualValue = null` until the next poll.
 *
 * Matching is frequency-aware because a FRED observation's `date` is the period
 * START (e.g. `2026-06-01` for June CPI) while the figure is not RELEASED until
 * ~one period later (e.g. mid-July):
 *   - Periodic series (monthly / quarterly — CPI, payrolls, GDP): exactly one
 *     observation per release, so the release list is tail-aligned to the
 *     observation list by index. This correctly maps the June datapoint to the
 *     July release, not the June one.
 *   - High-frequency series (daily — the fed-funds target behind FOMC
 *     decisions): its FRED release schedule fires EVERY business day, so the
 *     release list is daily noise, not decisions. Instead we derive events from
 *     observation CHANGE-POINTS — a rate "decision" that matters is a day the
 *     target actually moved — ignoring the release schedule entirely.
 */
export function buildDrafts(
  indicatorCode: string,
  releaseDates: readonly Date[],
  observations: readonly ObservationPoint[],
  now: Date,
): CalendarEventDraft[] {
  const freqDays = inferFrequencyDays(observations);
  if (freqDays < 20) {
    // Daily series: change-points, not the (daily) release schedule.
    return alignRateChanges(indicatorCode, observations, now, freqDays);
  }
  if (releaseDates.length === 0) return [];
  return alignPeriodic(indicatorCode, releaseDates, observations, now, freqDays);
}

/** Tail-align one observation per release (monthly / quarterly). */
function alignPeriodic(
  indicatorCode: string,
  releaseDates: readonly Date[],
  observations: readonly ObservationPoint[],
  now: Date,
  freqDays: number,
): CalendarEventDraft[] {
  const lastPast = lastIndexOnOrBefore(releaseDates, now.getTime());
  const drafts: CalendarEventDraft[] = [];
  let previousValue: string | null = null;

  for (const [i, releaseDate] of releaseDates.entries()) {
    const obsIndex = observations.length - 1 - (lastPast - i);
    const obs = i <= lastPast && obsIndex >= 0 ? observations[obsIndex] : undefined;

    const actualValue = obs ? obs.value : null;
    const periodLabel = obs
      ? periodLabelFor(obs.date, freqDays)
      : advancePeriodLabel(releaseDate, observations, freqDays, i - lastPast);

    drafts.push({
      indicatorCode,
      scheduledAt: releaseDate,
      periodLabel,
      previousValue,
      actualValue,
    });
    if (actualValue !== null) previousValue = actualValue;
  }
  return drafts;
}

/**
 * Derive rate-decision events from observation CHANGE-POINTS (daily fed-funds
 * behind FOMC). The FRED release schedule for a daily series fires every
 * business day, so instead of one noisy event per release we emit one event per
 * day the value actually moved — a real decision that changed the target —
 * carrying the prior value as `previousValue`. Observations before the display
 * window still seed the baseline so the first shown change has a correct
 * `previousValue`; only change-points inside the window become drafts.
 *
 * Known limitation: FOMC meetings that HOLD the rate produce no change-point and
 * therefore no event. Surfacing scheduled-but-unchanged decisions would require
 * the FOMC meeting calendar — a separate source deliberately outside ADR-0058's
 * FRED-only, facts-only scope.
 *
 * Value comparison is NUMERIC, not string: FRED renders the most recent
 * observation with extra trailing zeros (e.g. `3.7500000000` vs the historical
 * `3.75`), so a string compare would falsely flag an unchanged rate as a "move"
 * and emit a bogus prev==actual event.
 */
function alignRateChanges(
  indicatorCode: string,
  observations: readonly ObservationPoint[],
  now: Date,
  freqDays: number,
): CalendarEventDraft[] {
  const drafts: CalendarEventDraft[] = [];
  const windowStart = now.getTime() - LOOKBACK_MS;
  let baseline: string | null = null;

  for (const obs of observations) {
    if (baseline === null) {
      baseline = obs.value; // seed baseline from the oldest observation
      continue;
    }
    if (sameNumericValue(obs.value, baseline)) continue; // unchanged day → not a decision
    const previousValue = baseline;
    baseline = obs.value;
    // Values only matter for the display window; older changes just carry the
    // baseline forward so an in-window change still shows its true `previous`.
    if (obs.date.getTime() < windowStart) continue;
    drafts.push({
      indicatorCode,
      scheduledAt: obs.date,
      periodLabel: periodLabelFor(obs.date, freqDays),
      previousValue,
      actualValue: obs.value,
    });
  }
  return drafts;
}

/**
 * True when two FRED value strings represent the same number. FRED pads the
 * latest observation with trailing zeros (`3.7500000000` vs `3.75`), so a raw
 * string compare would spuriously report a change. Falls back to string
 * equality when either side is not a finite number (defensive; FRED "." missing
 * values are already filtered upstream).
 */
function sameNumericValue(a: string, b: string): boolean {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return a === b;
}

function lastIndexOnOrBefore(dates: readonly Date[], cutoff: number): number {
  let idx = -1;
  for (const [i, date] of dates.entries()) {
    if (date.getTime() <= cutoff) idx = i;
    else break;
  }
  return idx;
}

function inferFrequencyDays(observations: readonly ObservationPoint[]): number {
  if (observations.length < 2) return 30;
  const gaps: number[] = [];
  let prev: ObservationPoint | undefined;
  for (const obs of observations) {
    if (prev) gaps.push((obs.date.getTime() - prev.date.getTime()) / DAY_MS);
    prev = obs;
  }
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median =
    gaps.length % 2 === 0 ? ((gaps[mid - 1] ?? 0) + (gaps[mid] ?? 0)) / 2 : (gaps[mid] ?? 30);
  return median;
}

function periodLabelFor(date: Date, freqDays: number): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-based
  if (freqDays >= 80) return `${String(year)} Q${String(Math.floor(month / 3) + 1)}`;
  if (freqDays >= 20) return `${String(year)}-${pad2(month + 1)}`;
  return `${String(year)}-${pad2(month + 1)}-${pad2(date.getUTCDate())}`;
}

/**
 * Period label for an upcoming (not-yet-released) periodic event: advance the
 * last observed period by `stepsAhead` periods so consecutive future releases
 * get distinct labels (no `(indicatorCode, periodLabel)` upsert collision).
 */
function advancePeriodLabel(
  releaseDate: Date,
  observations: readonly ObservationPoint[],
  freqDays: number,
  stepsAhead: number,
): string {
  const base = observations[observations.length - 1]?.date;
  if (!base) return periodLabelFor(releaseDate, freqDays);
  const monthsPerStep = freqDays >= 80 ? 3 : 1;
  const advanced = new Date(base.getTime());
  advanced.setUTCMonth(advanced.getUTCMonth() + Math.max(stepsAhead, 1) * monthsPerStep);
  return periodLabelFor(advanced, freqDays);
}

function parseUtcDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
