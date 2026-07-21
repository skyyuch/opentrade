/**
 * Unit tests for CalendarFetcher (ADR-0058 D3/D6).
 *
 * Coverage:
 *   - Joins compliance metadata from the config registry onto each row and
 *     upserts by the (indicatorCode, periodLabel) key
 *   - Two-phase population: a draft with an actual value backfills it; a
 *     schedule-only draft (actual null) does NOT null out a stored value
 *   - Skips drafts whose indicatorCode is not in the enabled registry
 *   - Per-draft failure isolation (one upsert throws, the rest still persist)
 *   - Per-provider failure isolation (one provider throws, others still run)
 */

import { describe, expect, it, vi } from 'vitest';

import { CalendarFetcher } from './fetcher.js';

import type { CalendarEventDraft, ICalendarProvider } from './types.js';
import type { CalendarIndicatorSource } from '@opentrade/config';
import type { PrismaClient } from '@opentrade/db';

const CPI: CalendarIndicatorSource = {
  indicatorCode: 'US_CPI_YOY',
  authority: 'BLS',
  nameZhHant: '美國消費者物價指數（按年）',
  nameZhHans: '美国消费者物价指数（按年）',
  nameEn: 'US Consumer Price Index (YoY)',
  region: 'US',
  category: 'INFLATION',
  unit: '%_YOY',
  scheduleUrl: 'https://www.bls.gov/schedule/news_release/cpi.htm',
  sourceUrl: 'https://www.bls.gov/cpi/',
  fredSeriesId: 'CPIAUCSL',
  lang: 'en',
  enabled: true,
};

const draft = (overrides: Partial<CalendarEventDraft> = {}): CalendarEventDraft => ({
  indicatorCode: 'US_CPI_YOY',
  scheduledAt: new Date('2026-07-15T12:30:00.000Z'),
  periodLabel: '2026-06',
  previousValue: '2.4',
  actualValue: '2.7',
  ...overrides,
});

function fakePrisma(): { prisma: PrismaClient; upsert: ReturnType<typeof vi.fn> } {
  const upsert = vi.fn().mockResolvedValue({});
  const prisma = { economicEvent: { upsert } } as unknown as PrismaClient;
  return { prisma, upsert };
}

const provider = (events: CalendarEventDraft[] | Error): ICalendarProvider => ({
  source: 'TEST',
  fetchEvents: () => (events instanceof Error ? Promise.reject(events) : Promise.resolve(events)),
});

type UpsertArg = {
  where: { indicatorCode_periodLabel: { indicatorCode: string; periodLabel: string } };
  update: { actualValue?: string | null; previousValue?: string | null };
  create: { actualValue: string | null; [key: string]: unknown };
};

const firstUpsertArg = (upsert: ReturnType<typeof vi.fn>): UpsertArg =>
  upsert.mock.calls[0]?.[0] as UpsertArg;

describe('CalendarFetcher.fetchOnce', () => {
  it('joins config metadata and upserts by (indicatorCode, periodLabel)', async () => {
    const { prisma, upsert } = fakePrisma();
    const fetcher = new CalendarFetcher(prisma, {
      intervalMs: 1,
      providers: [provider([draft()])],
      indicators: [CPI],
    });

    const count = await fetcher.fetchOnce();

    expect(count).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = firstUpsertArg(upsert);
    expect(arg.where).toEqual({
      indicatorCode_periodLabel: { indicatorCode: 'US_CPI_YOY', periodLabel: '2026-06' },
    });
    expect(arg.create).toMatchObject({
      indicatorCode: 'US_CPI_YOY',
      nameZhHant: '美國消費者物價指數（按年）',
      region: 'US',
      category: 'INFLATION',
      unit: '%_YOY',
      sourceName: 'BLS',
      sourceUrl: 'https://www.bls.gov/cpi/',
      periodLabel: '2026-06',
      previousValue: '2.4',
      actualValue: '2.7',
    });
  });

  it('backfills the actual value on the update path (two-phase)', async () => {
    const { prisma, upsert } = fakePrisma();
    const fetcher = new CalendarFetcher(prisma, {
      intervalMs: 1,
      providers: [provider([draft({ actualValue: '2.9' })])],
      indicators: [CPI],
    });

    await fetcher.fetchOnce();

    const arg = firstUpsertArg(upsert);
    expect(arg.update.actualValue).toBe('2.9');
  });

  it('does not null a stored value when the draft has no actual yet', async () => {
    const { prisma, upsert } = fakePrisma();
    const fetcher = new CalendarFetcher(prisma, {
      intervalMs: 1,
      providers: [provider([draft({ actualValue: null, previousValue: null })])],
      indicators: [CPI],
    });

    await fetcher.fetchOnce();

    const arg = firstUpsertArg(upsert);
    expect('actualValue' in arg.update).toBe(false);
    expect('previousValue' in arg.update).toBe(false);
    // The create path still seeds the scheduled row with nulls.
    expect(arg.create.actualValue).toBeNull();
  });

  it('skips drafts whose indicatorCode is not in the registry', async () => {
    const { prisma, upsert } = fakePrisma();
    const fetcher = new CalendarFetcher(prisma, {
      intervalMs: 1,
      providers: [provider([draft({ indicatorCode: 'US_UNKNOWN' }), draft()])],
      indicators: [CPI],
    });

    const count = await fetcher.fetchOnce();

    expect(count).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('isolates a per-draft upsert failure', async () => {
    const { prisma, upsert } = fakePrisma();
    upsert.mockRejectedValueOnce(new Error('db down')).mockResolvedValue({});
    const fetcher = new CalendarFetcher(prisma, {
      intervalMs: 1,
      providers: [provider([draft({ periodLabel: '2026-05' }), draft({ periodLabel: '2026-06' })])],
      indicators: [CPI],
    });

    const count = await fetcher.fetchOnce();

    expect(count).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('isolates a per-provider failure', async () => {
    const { prisma, upsert } = fakePrisma();
    const fetcher = new CalendarFetcher(prisma, {
      intervalMs: 1,
      providers: [provider(new Error('provider boom')), provider([draft()])],
      indicators: [CPI],
    });

    const count = await fetcher.fetchOnce();

    expect(count).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
