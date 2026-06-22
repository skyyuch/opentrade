/**
 * Use case: list KOL profiles.
 *
 * Per ADR-0036 D9: public listing shows approved + unclaimed KOLs.
 * Admin listing shows all statuses.
 */

import type { IKolRepository, KolListOptions } from '../domain/IKolRepository.js';
import type { KolRecord } from '../domain/KolEntity.js';

export class ListKolsUseCase {
  constructor(private readonly kolRepo: IKolRepository) {}

  async execute(options: KolListOptions): Promise<{ kols: KolRecord[]; total: number }> {
    const countFilter: Omit<KolListOptions, 'limit' | 'offset'> = {
      tenantId: options.tenantId,
    };
    if (options.status !== undefined) {
      countFilter.status = options.status;
    }
    if (options.type !== undefined) {
      countFilter.type = options.type;
    }
    if (options.focus !== undefined) {
      countFilter.focus = options.focus;
    }

    const [kols, total] = await Promise.all([
      this.kolRepo.list(options),
      this.kolRepo.count(countFilter),
    ]);
    return { kols, total };
  }
}
