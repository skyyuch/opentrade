/**
 * Application layer: list complaints with optional filters.
 *
 * Thin wrapper over `IComplaintRepository.list`. Lives as its own file
 * (rather than inlined into the route) so the verification status
 * filter is owned by the application layer and the presentation layer
 * stays focused on HTTP concerns.
 */

import type {
  ComplaintListFilter,
  ComplaintListResult,
  IComplaintRepository,
} from '../domain/IComplaintRepository.js';

export class ListComplaintsUseCase {
  constructor(private readonly complaintRepo: IComplaintRepository) {}

  async execute(filter: ComplaintListFilter): Promise<ComplaintListResult> {
    return this.complaintRepo.list(filter);
  }
}
