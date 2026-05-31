/**
 * Prisma implementation of IInstrumentRepository (per ADR-0038 D5).
 *
 * Search is served entirely from the local synced catalog — never a live
 * external API (ADR-0038 D5 / A3). Only `isActive` rows in the five surfaced
 * categories are returned; legacy AssetClass values (FUTURES/SPOT/FOREX) are
 * never surfaced even if some row carried one.
 */

import { INSTRUMENT_CATEGORIES } from '@opentrade/shared';

import type { IInstrumentRepository } from '../domain/IInstrumentRepository.js';
import type {
  InstrumentRecord,
  InstrumentCategory,
  SearchInstrumentsOptions,
} from '../domain/InstrumentEntity.js';
import type { Instrument, PrismaClient } from '@prisma/client';

function toRecord(row: Instrument): InstrumentRecord {
  return {
    id: row.id,
    category: row.category as InstrumentCategory,
    symbol: row.symbol,
    displayCode: row.displayCode,
    nameEn: row.nameEn,
    nameZh: row.nameZh,
    nameZhHans: row.nameZhHans,
    exchange: row.exchange,
  };
}

export class PrismaInstrumentRepository implements IInstrumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async search(options: SearchInstrumentsOptions): Promise<InstrumentRecord[]> {
    const q = options.q?.trim();
    const rows = await this.prisma.instrument.findMany({
      where: {
        isActive: true,
        category: options.category ?? { in: [...INSTRUMENT_CATEGORIES] },
        ...(q
          ? {
              OR: [
                { symbol: { contains: q, mode: 'insensitive' as const } },
                { displayCode: { contains: q, mode: 'insensitive' as const } },
                { nameEn: { contains: q, mode: 'insensitive' as const } },
                { nameZh: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ category: 'asc' }, { displayCode: 'asc' }],
      take: options.limit,
    });
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<InstrumentRecord | null> {
    const row = await this.prisma.instrument.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }
}
