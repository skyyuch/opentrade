/**
 * Indonesia — BPS-Statistics Indonesia / Badan Pusat Statistik calendar
 * provider (ADR-0061 D2, batch 4).
 *
 * BPS is Indonesia's primary official statistical authority. It publishes an
 * official "Advance Release Calendar" (ARC) covering the whole year, but its
 * entire website sits behind a Cloudflare JS/managed challenge (a server-side
 * fetch gets HTTP 403 "Just a moment…"), so a live fetch at runtime is not
 * viable. Like the HK C&SD, CN NBS and KR KOSTAT providers, this provider
 * therefore makes NO network call: it reads the pre-encoded official schedule
 * from the curated `@opentrade/config` registry (`releases[]`, already in UTC)
 * and emits one draft per configured release.
 *
 * Compliance (ADR-0058 D1 / ADR-0061 D4): the ARC and the press-release pages
 * carry the release date/time and covered period only — the figures are not
 * published in machine-readable form, so every event carries release time +
 * covered period with `previousValue = actualValue = null` — honest and
 * compliant (the schedule is a public official fact; we never fabricate a
 * value). NEVER a forecast/consensus value, NEVER an impact rating. ONLY BPS
 * first-party indicators are configured — Indonesia's private Manufacturing PMI
 * (S&P Global) is deliberately excluded upstream in config, and the Bank
 * Indonesia BI-Rate (a central-bank release, not a BPS statistic) is out of
 * this provider's scope. Each event links back to the BPS official page via the
 * config registry (`sourceUrl`).
 *
 * Per-indicator / per-release failures are isolated (mirrors the other
 * providers); with no I/O the only failure mode is a malformed config date,
 * which is skipped rather than throwing the batch.
 */

import { calendarIndicatorsForProvider } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';

export type IdBpsCalendarProviderOptions = {
  /** Defaults to the curated enabled BPS registry; injectable for tests. */
  indicators?: readonly CalendarIndicatorSource[];
};

export class IdBpsCalendarProvider implements ICalendarProvider {
  readonly source = 'BPS';

  private readonly indicators: readonly CalendarIndicatorSource[];

  constructor(options: IdBpsCalendarProviderOptions = {}) {
    this.indicators = options.indicators ?? calendarIndicatorsForProvider('BPS');
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
          // BPS publishes no machine-readable values (ADR-0058 D1 honesty).
          previousValue: null,
          actualValue: null,
        });
      }
    }

    return Promise.resolve(drafts);
  }
}
