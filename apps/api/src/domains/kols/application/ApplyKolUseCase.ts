/**
 * Use case: apply to become a KOL.
 *
 * Per ADR-0036 D1: any L1+ user can apply. The application creates a
 * KOL profile in PENDING status. Admin approval is required (M8.8).
 */

import type { IKolRepository } from '../domain/IKolRepository.js';
import type { ApplyKolInput, KolRecord } from '../domain/KolEntity.js';

export class ApplyKolUseCase {
  constructor(private readonly kolRepo: IKolRepository) {}

  async execute(input: ApplyKolInput): Promise<KolRecord> {
    const existing = await this.kolRepo.findByUserId(input.tenantId, input.userId);
    if (existing) {
      throw new Error('User already has a KOL profile');
    }

    return this.kolRepo.create(input);
  }
}
