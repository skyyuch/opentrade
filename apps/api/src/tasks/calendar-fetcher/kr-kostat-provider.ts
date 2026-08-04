/**
 * South Korea — Statistics Korea / KOSTAT calendar provider (ADR-0061 D2,
 * batch 4).
 *
 * KOSTAT is Korea's primary official statistical authority (reorganised in 2026
 * as the Ministry of Data and Statistics — MODS). Like the HK C&SD and CN NBS
 * providers it exposes NO machine-readable release-schedule API — its only
 * forward source is the official annual "Statistical Release Schedule",
 * published in English. So this provider makes no network call: it reads the
 * pre-encoded official schedule from the curated `@opentrade/config` registry
 * (`releases[]`, already in UTC) and emits one draft per configured release.
 *
 * Compliance (ADR-0058 D1 / ADR-0061 D4): the figures are not published in
 * machine-readable form, so every event carries release time + covered period
 * with `previousValue = actualValue = null` — honest and compliant (the
 * schedule is a public official fact; we never fabricate a value). NEVER a
 * forecast/consensus value, NEVER an impact rating. ONLY KOSTAT first-party
 * indicators are configured — Korea's private Manufacturing PMI (S&P Global) is
 * deliberately excluded upstream in config. Each event links back to the KOSTAT
 * / MODS official page via the config registry (`sourceUrl`).
 *
 * Per-indicator / per-release failures are isolated (mirrors the other
 * providers); with no I/O the only failure mode is a malformed config date,
 * which is skipped rather than throwing the batch.
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

export type KrKostatCalendarProviderOptions = {
  /** Defaults to the curated enabled KOSTAT registry; injectable for tests. */
  indicators?: readonly CalendarIndicatorSource[];
};

export class KrKostatCalendarProvider implements ICalendarProvider {
  readonly source = 'KOSTAT';

  private readonly indicators: readonly CalendarIndicatorSource[];

  constructor(options: KrKostatCalendarProviderOptions = {}) {
    this.indicators = options.indicators ?? calendarIndicatorsForProvider('KOSTAT');
  }

  fetchEvents(): Promise<CalendarEventDraft[]> {
    const drafts: CalendarEventDraft[] = [];

    for (const indicator of this.indicators) {
      for (const release of indicator.releases ?? []) {
        const scheduledAt = new Date(release.dateUtc);
        // Skip a malformed config date rather than throwing the whole batch.
        if (Number.isNaN(scheduledAt.getTime())) continue;

        drafts.push({
          indicatorCode: indicator.indicatorCode,
          scheduledAt,
          periodLabel: release.periodLabel,
          // KOSTAT publishes no machine-readable values (ADR-0058 D1 honesty).
          previousValue: null,
          actualValue: null,
        });
      }
    }

    return Promise.resolve(drafts);
  }
}
