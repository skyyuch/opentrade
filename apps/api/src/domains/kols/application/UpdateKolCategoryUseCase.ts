/**
 * Use case: set or clear a KOL's category dimensions (`type` / `focus`).
 *
 * Per ADR-0053 Implementation Notes §3: an admin assigns or overrides the two
 * independent, nullable category dimensions on the console KOL management
 * screen. This is pure off-chain discovery metadata (no on-chain effect, no
 * outbox event). The use case only guards that the target KOL exists; the
 * REST layer owns enum/shape validation.
 */

import type { IKolRepository } from '../domain/IKolRepository.js';
import type { KolRecord, UpdateKolCategoryInput } from '../domain/KolEntity.js';

export type UpdateKolCategoryCommand = UpdateKolCategoryInput & { id: string };

export class UpdateKolCategoryUseCase {
  constructor(private readonly kolRepo: IKolRepository) {}

  async execute(command: UpdateKolCategoryCommand): Promise<KolRecord> {
    const { id, ...updates } = command;

    const existing = await this.kolRepo.findById(id);
    if (!existing) {
      throw new Error(`KOL ${id} not found`);
    }

    return this.kolRepo.updateCategory(id, updates);
  }
}
