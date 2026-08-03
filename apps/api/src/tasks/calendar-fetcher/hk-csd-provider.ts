/**
 * Hong Kong Census & Statistics Department (C&SD) calendar provider
 * (ADR-0061 D2).
 *
 * C&SD is Hong Kong's official statistical authority, but exposes NO
 * machine-readable release-schedule API — its only source is the annual PDF
 * "Schedule of Regular Press Releases", published each September for the coming
 * year, at a fixed 16:30 HKT release time. So, unlike FRED/Eurostat, this
 * provider makes no network call: it reads the pre-encoded official schedule
 * from the curated `@opentrade/config` registry (`releases[]`, already in UTC)
 * and emits one draft per configured release.
 *
 * Compliance (ADR-0058 D1): the figures are not published in machine-readable
 * form, so every event carries release time + covered period with
 * `previousValue = actualValue = null` — honest and compliant (the schedule is
 * a public official fact; we never fabricate a value). NEVER a forecast, NEVER
 * an impact rating. Each event links back to the C&SD release page via the
 * config registry (`sourceUrl`).
 *
 * Per-indicator / per-release failures are isolated (mirrors the other
 * providers), though with no I/O the only failure mode is a malformed config
 * date, which is skipped rather than throwing the batch.
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

export type HkCsdCalendarProviderOptions = {
  /** Defaults to the curated enabled HK_CSD registry; injectable for tests. */
  indicators?: readonly CalendarIndicatorSource[];
};

export class HkCsdCalendarProvider implements ICalendarProvider {
  readonly source = 'HK C&SD';

  private readonly indicators: readonly CalendarIndicatorSource[];

  constructor(options: HkCsdCalendarProviderOptions = {}) {
    this.indicators = options.indicators ?? calendarIndicatorsForProvider('HK_CSD');
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
          // C&SD publishes no machine-readable values (ADR-0058 D1 honesty).
          previousValue: null,
          actualValue: null,
        });
      }
    }

    return Promise.resolve(drafts);
  }
}
