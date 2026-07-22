/**
 * Shared types for the calendar-fetcher subsystem (per ADR-0058).
 *
 * A provider fetches an official statistical authority and parses each release
 * down to the compliance-bounded fact shape (ADR-0058 D1): the dynamic figures
 * a release carries (schedule time / covered period / previous value /
 * post-release actual value), keyed by the stable `indicatorCode`. It NEVER
 * produces a forecast/consensus value or an impact rating.
 *
 * Trilingual display names, region/category, unit, and the canonical official
 * link are NOT produced here — they live in the curated `@opentrade/config`
 * registry and are joined on by the fetcher, so the compliance metadata always
 * traces to the single audited source of truth (rule 00 / rule 50).
 */

/**
 * The dynamic, per-release fact fields a provider extracts. The pair
 * (`indicatorCode`, `periodLabel`) is the idempotent upsert key (ADR-0058 D6),
 * so a scheduled event and its later actual-value backfill collapse to one row.
 */
export type CalendarEventDraft = {
  /** Stable machine code, must exist in `@opentrade/config` calendar registry. */
  indicatorCode: string;
  /** Release timestamp — UTC; the calendar's sole ordering key (ADR-0058 D1/D7). */
  scheduledAt: Date;
  /** The covered period, e.g. "2026-06" / "2026 Q2". */
  periodLabel: string;
  /**
   * The authority's own previous-period figure as a plain decimal string
   * (same convention as `SignalRecord.entryPrice`). Null when unknown. NEVER a
   * forecast/consensus value (ADR-0058 D1).
   */
  previousValue: string | null;
  /**
   * The released figure as a plain decimal string. Null until the authority
   * publishes it — the fetcher backfills it on a later poll (ADR-0058 D3
   * two-phase population).
   */
  actualValue: string | null;
};

export type ICalendarProvider = {
  /** Human/log label for the source, e.g. "FRED". Used for failure isolation. */
  readonly source: string;
  /**
   * Fetch + parse the configured indicators into compliance-bounded drafts.
   * Implementations MUST isolate per-indicator failures (a single broken
   * series cannot break the others), mirroring the news-fetcher's per-feed
   * isolation.
   */
  fetchEvents(): Promise<CalendarEventDraft[]>;
};
