/**
 * Unit tests for `ListEventsUseCase`.
 *
 * Coverage:
 *   - Maps domain records to DTOs (scheduledAt -> ISO string, decimals stay
 *     strings, nulls pass through)
 *   - Clamps limit to MAX_LIMIT and floors at 1; defaults when absent
 *   - Fetches limit + 1 to detect a further page and sets nextCursor
 *   - Returns nextCursor = null when there is no further page
 *   - Forwards cursor + window (from/to) + region/category filters to the
 *     repository
 *   - Compliance guard (ADR-0058 D1): the DTO exposes no forecast/consensus
 *     or impact-rating field
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DEFAULT_LIMIT, ListEventsUseCase, MAX_LIMIT } from './ListEventsUseCase.js';

import type { EconomicEventRecord } from '../domain/EconomicEventEntity.js';
import type { ICalendarRepository } from '../domain/ICalendarRepository.js';

const fixture = (overrides: Partial<EconomicEventRecord> = {}): EconomicEventRecord => ({
  id: 'evt_0001',
  indicatorCode: 'US_CPI_YOY',
  nameZhHant: '美國消費者物價指數（按年）',
  nameZhHans: '美国消费者物价指数（按年）',
  nameEn: 'US Consumer Price Index (YoY)',
  region: 'US',
  category: 'INFLATION',
  scheduledAt: new Date('2026-07-15T12:30:00.000Z'),
  periodLabel: '2026-06',
  previousValue: '2.4',
  actualValue: null,
  unit: '%_YOY',
  sourceName: 'BLS',
  sourceUrl: 'https://www.bls.gov/cpi/',
  ...overrides,
});

describe('ListEventsUseCase', () => {
  let repo: MockProxy<ICalendarRepository>;
  let useCase: ListEventsUseCase;

  beforeEach(() => {
    repo = mock<ICalendarRepository>();
    useCase = new ListEventsUseCase(repo);
  });

  it('maps records to DTOs with ISO scheduledAt and string decimals', async () => {
    repo.list.mockResolvedValue([fixture()]);

    const result = await useCase.execute({ limit: 10 });

    expect(result.items).toEqual([
      {
        id: 'evt_0001',
        indicatorCode: 'US_CPI_YOY',
        nameZhHant: '美國消費者物價指數（按年）',
        nameZhHans: '美国消费者物价指数（按年）',
        nameEn: 'US Consumer Price Index (YoY)',
        region: 'US',
        category: 'INFLATION',
        scheduledAt: '2026-07-15T12:30:00.000Z',
        periodLabel: '2026-06',
        previousValue: '2.4',
        actualValue: null,
        unit: '%_YOY',
        sourceName: 'BLS',
        sourceUrl: 'https://www.bls.gov/cpi/',
      },
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it('exposes no forecast/consensus or impact-rating field (ADR-0058 D1)', async () => {
    repo.list.mockResolvedValue([fixture()]);

    const result = await useCase.execute({});
    const dto = result.items[0];

    expect(dto).toBeDefined();
    const keys = Object.keys(dto as object);
    for (const forbidden of ['forecast', 'consensus', 'impact', 'importance', 'rating']) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden))).toBe(false);
    }
  });

  it('fetches limit + 1 and defaults the limit when absent', async () => {
    repo.list.mockResolvedValue([]);

    await useCase.execute({});

    expect(repo.list).toHaveBeenCalledWith({ limit: DEFAULT_LIMIT + 1 });
  });

  it('clamps an over-large limit to MAX_LIMIT (and still fetches +1)', async () => {
    repo.list.mockResolvedValue([]);

    await useCase.execute({ limit: 999 });

    expect(repo.list).toHaveBeenCalledWith({ limit: MAX_LIMIT + 1 });
  });

  it('floors a non-positive limit at 1', async () => {
    repo.list.mockResolvedValue([]);

    await useCase.execute({ limit: 0 });

    expect(repo.list).toHaveBeenCalledWith({ limit: 2 });
  });

  it('trims the extra row and sets nextCursor when a further page exists', async () => {
    const rows = [
      fixture({ id: 'a' }),
      fixture({ id: 'b' }),
      fixture({ id: 'c' }), // the +1 sentinel
    ];
    repo.list.mockResolvedValue(rows);

    const result = await useCase.execute({ limit: 2 });

    expect(result.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.nextCursor).toBe('b');
  });

  it('forwards cursor, window and filters to the repository', async () => {
    repo.list.mockResolvedValue([]);
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-31T23:59:59.000Z');

    await useCase.execute({
      limit: 5,
      cursor: 'cur_1',
      from,
      to,
      regions: ['US', 'HK'],
      category: 'INFLATION',
    });

    expect(repo.list).toHaveBeenCalledWith({
      limit: 6,
      cursor: 'cur_1',
      from,
      to,
      regions: ['US', 'HK'],
      category: 'INFLATION',
    });
  });

  it('treats an empty region set as "all regions" (omits the filter)', async () => {
    repo.list.mockResolvedValue([]);

    await useCase.execute({ limit: 5, regions: [] });

    expect(repo.list).toHaveBeenCalledWith({ limit: 6 });
  });
});
