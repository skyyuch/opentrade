/**
 * Calendar Fetcher — periodic economic-calendar aggregation task (ADR-0058 D3).
 *
 * Polls the configured providers at a fixed interval and upserts events into
 * the `economic_events` cache table, deduped by the `(indicatorCode,
 * periodLabel)` key (ADR-0058 D6). The public `GET /v1/calendar` endpoint reads
 * from that table, so page latency/availability is decoupled from the external
 * sources. Mirrors the NewsFetcher / PriceRecorder pattern (scheduled external
 * pull -> DB upsert), runnable in the API process or a separate ECS task.
 *
 * Two-phase population (ADR-0058 D3): a scheduled event is upserted first with
 * `actualValue = null`, then backfilled once the authority publishes the
 * figure. The upsert therefore only overwrites `previousValue` / `actualValue`
 * when the new draft actually carries them, so a later schedule-only refresh
 * (actual still unknown) never wipes a value that was already backfilled.
 *
 * Compliance (ADR-0058 D1): every stored row's trilingual names, region,
 * category, unit, authority and canonical link come from the curated
 * `@opentrade/config` registry — never from the provider — so the compliance
 * metadata always traces to the single audited source of truth (rule 00/50).
 * A draft whose `indicatorCode` is not in the enabled registry is skipped.
 */

import { enabledCalendarIndicators } from '@opentrade/config';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';
import type { PrismaClient } from '@opentrade/db';

export type CalendarFetcherOptions = {
  intervalMs: number;
  providers: ICalendarProvider[];
  /** Curated registry keyed by indicatorCode; defaults to the enabled set. */
  indicators?: readonly CalendarIndicatorSource[];
};

export class CalendarFetcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly registry: Map<string, CalendarIndicatorSource>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: CalendarFetcherOptions,
  ) {
    const indicators = options.indicators ?? enabledCalendarIndicators();
    this.registry = new Map(indicators.map((i) => [i.indicatorCode, i]));
  }

  async fetchOnce(): Promise<number> {
    let upserted = 0;

    for (const provider of this.options.providers) {
      let drafts: CalendarEventDraft[];
      try {
        drafts = await provider.fetchEvents();
      } catch {
        // Non-fatal: one provider's failure must not stop the others.
        continue;
      }

      for (const draft of drafts) {
        const config = this.registry.get(draft.indicatorCode);
        if (!config) continue; // Unknown/disabled indicator — never persist.

        try {
          await this.upsertEvent(draft, config);
          upserted++;
        } catch {
          // Non-fatal: individual event failure shouldn't stop the others.
        }
      }
    }

    return upserted;
  }

  private async upsertEvent(
    draft: CalendarEventDraft,
    config: CalendarIndicatorSource,
  ): Promise<void> {
    const shared = {
      nameZhHant: config.nameZhHant,
      nameZhHans: config.nameZhHans,
      nameEn: config.nameEn,
      region: config.region,
      category: config.category,
      unit: config.unit,
      sourceName: config.authority,
      sourceUrl: config.sourceUrl,
    };

    await this.prisma.economicEvent.upsert({
      where: {
        indicatorCode_periodLabel: {
          indicatorCode: draft.indicatorCode,
          periodLabel: draft.periodLabel,
        },
      },
      update: {
        ...shared,
        scheduledAt: draft.scheduledAt,
        // Two-phase: only overwrite figures when the draft actually carries
        // them, so a schedule-only refresh never nulls a backfilled value.
        ...(draft.previousValue !== null ? { previousValue: draft.previousValue } : {}),
        ...(draft.actualValue !== null ? { actualValue: draft.actualValue } : {}),
        fetchedAt: new Date(),
        isActive: true,
      },
      create: {
        ...shared,
        indicatorCode: draft.indicatorCode,
        periodLabel: draft.periodLabel,
        scheduledAt: draft.scheduledAt,
        previousValue: draft.previousValue,
        actualValue: draft.actualValue,
      },
    });
  }

  start(): void {
    if (this.timer) return;

    const poll = async (): Promise<void> => {
      try {
        await this.fetchOnce();
      } catch {
        // Will retry next interval.
      }
    };

    void poll();
    this.timer = setInterval(() => void poll(), this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
