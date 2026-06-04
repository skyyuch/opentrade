/**
 * Idempotent instrument-catalog sync — upserts {@link InstrumentData} rows
 * into the global `Instrument` reference table (per ADR-0038 D1/D5). Shared by
 * `scripts/sync-instruments.ts` (which assembles data from every source) and
 * any future entry point.
 *
 * Per cursor rule 31 every write MUST be idempotent: running twice on the same
 * dataset leaves the DB in the same state as running once.
 *
 * Upsert key: `@@unique([category, symbol])` (`category_symbol`).
 *
 * Lifecycle / soft-retirement (rule 31 — never hard-delete reference rows):
 *   - A row present in `data` is created or updated and forced `isActive=true`
 *     (this also REACTIVATES a previously-retired row that reappears upstream).
 *   - After processing, for EACH `source` present in `data`, any active DB row
 *     of that source whose `(category, symbol)` is absent from `data` is marked
 *     `isActive=false` (retired). Reconciliation is scoped per-source so a
 *     partial sync (e.g. only HKEX) never retires another source's rows.
 *
 * `nameZhHans` is derived from `nameZh` via OpenCC here (ADR-0038 D4), so the
 * source modules never have to carry a Simplified column.
 */

import { toSimplifiedChinese } from '../sfc/opencc.js';

import type { InstrumentData, InstrumentSyncResult } from './types.js';
import type { PrismaClient } from '../generated/prisma/client.js';

const key = (category: string, symbol: string): string => `${category}:${symbol}`;

const normalizeSymbol = (symbol: string): string => symbol.trim().toUpperCase();

export async function syncInstruments(
  prisma: PrismaClient,
  data: InstrumentData[],
): Promise<InstrumentSyncResult> {
  const result: InstrumentSyncResult = { created: 0, updated: 0, reactivated: 0, retired: 0 };

  // source -> set of `${category}:${normalizedSymbol}` seen in this run.
  const seenBySource = new Map<string, Set<string>>();

  for (const item of data) {
    const symbol = normalizeSymbol(item.symbol);
    const nameZhHans = toSimplifiedChinese(item.nameZh);

    const seen = seenBySource.get(item.source) ?? new Set<string>();
    seen.add(key(item.category, symbol));
    seenBySource.set(item.source, seen);

    const existing = await prisma.instrument.findUnique({
      where: { category_symbol: { category: item.category, symbol } },
    });

    if (existing) {
      await prisma.instrument.update({
        where: { id: existing.id },
        data: {
          displayCode: item.displayCode,
          nameEn: item.nameEn ?? null,
          nameZh: item.nameZh ?? null,
          nameZhHans,
          exchange: item.exchange ?? null,
          source: item.source,
          isActive: true,
        },
      });
      result.updated++;
      if (!existing.isActive) result.reactivated++;
    } else {
      await prisma.instrument.create({
        data: {
          category: item.category,
          symbol,
          displayCode: item.displayCode,
          nameEn: item.nameEn ?? null,
          nameZh: item.nameZh ?? null,
          nameZhHans,
          exchange: item.exchange ?? null,
          source: item.source,
          isActive: true,
        },
      });
      result.created++;
    }
  }

  // Per-source soft retirement of rows that disappeared upstream.
  for (const [source, seen] of seenBySource) {
    const activeRows = await prisma.instrument.findMany({
      where: { source, isActive: true },
      select: { id: true, category: true, symbol: true },
    });
    for (const row of activeRows) {
      if (seen.has(key(row.category, row.symbol))) continue;
      await prisma.instrument.update({ where: { id: row.id }, data: { isActive: false } });
      result.retired++;
    }
  }

  return result;
}
