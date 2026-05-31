/**
 * Unit tests for `SearchInstrumentsUseCase`.
 *
 * Coverage:
 *   - Clamps limit to MAX_LIMIT and floors at 1
 *   - Forwards category + q to the repository
 *   - Maps domain records to InstrumentDto (drops nothing, adds nothing)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { MAX_LIMIT, SearchInstrumentsUseCase } from './SearchInstrumentsUseCase.js';

import type { IInstrumentRepository } from '../domain/IInstrumentRepository.js';
import type { InstrumentRecord } from '../domain/InstrumentEntity.js';

const fixtureRecord = (overrides: Partial<InstrumentRecord> = {}): InstrumentRecord => ({
  id: 'inst_0001',
  category: 'EQUITY_HK',
  symbol: '00005',
  displayCode: '00005',
  nameEn: 'HSBC HOLDINGS',
  nameZh: '匯豐控股',
  nameZhHans: '汇丰控股',
  exchange: 'HKEX',
  ...overrides,
});

describe('SearchInstrumentsUseCase', () => {
  let repo: MockProxy<IInstrumentRepository>;
  let useCase: SearchInstrumentsUseCase;

  beforeEach(() => {
    repo = mock<IInstrumentRepository>();
    useCase = new SearchInstrumentsUseCase(repo);
  });

  it('forwards category and q and maps records to DTOs', async () => {
    repo.search.mockResolvedValue([fixtureRecord()]);

    const result = await useCase.execute({ category: 'EQUITY_HK', q: '005', limit: 10 });

    expect(repo.search).toHaveBeenCalledWith({ category: 'EQUITY_HK', q: '005', limit: 10 });
    expect(result).toEqual([
      {
        id: 'inst_0001',
        category: 'EQUITY_HK',
        symbol: '00005',
        displayCode: '00005',
        nameEn: 'HSBC HOLDINGS',
        nameZh: '匯豐控股',
        nameZhHans: '汇丰控股',
        exchange: 'HKEX',
      },
    ]);
  });

  it('clamps an over-large limit to MAX_LIMIT', async () => {
    repo.search.mockResolvedValue([]);

    await useCase.execute({ limit: 999 });

    expect(repo.search).toHaveBeenCalledWith({ limit: MAX_LIMIT });
  });

  it('floors a non-positive limit at 1', async () => {
    repo.search.mockResolvedValue([]);

    await useCase.execute({ limit: 0 });

    expect(repo.search).toHaveBeenCalledWith({ limit: 1 });
  });
});
