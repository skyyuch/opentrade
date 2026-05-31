/**
 * Use case: search the instrument catalog for the signal target picker
 * (per ADR-0038 D5). Pure orchestration — clamps the limit and delegates the
 * query to the repository. Returns `InstrumentDto`s ready for the front-end
 * (names rendered via `localizedInstrumentName`, never a raw column).
 */

import type { IInstrumentRepository } from '../domain/IInstrumentRepository.js';
import type { InstrumentRecord, SearchInstrumentsOptions } from '../domain/InstrumentEntity.js';
import type { InstrumentDto } from '@opentrade/shared';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

function toDto(record: InstrumentRecord): InstrumentDto {
  return {
    id: record.id,
    category: record.category,
    symbol: record.symbol,
    displayCode: record.displayCode,
    nameEn: record.nameEn,
    nameZh: record.nameZh,
    nameZhHans: record.nameZhHans,
    exchange: record.exchange,
  };
}

export class SearchInstrumentsUseCase {
  constructor(private readonly repo: IInstrumentRepository) {}

  async execute(options: SearchInstrumentsOptions): Promise<InstrumentDto[]> {
    const limit = Math.min(Math.max(options.limit, 1), MAX_LIMIT);
    const records = await this.repo.search({ ...options, limit });
    return records.map(toDto);
  }
}
