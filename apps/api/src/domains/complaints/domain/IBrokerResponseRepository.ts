/**
 * Port for broker response persistence per ADR-0037.
 *
 * Broker responses share the `Review` table with `kind = REVIEW` and
 * `respondsToReviewId IS NOT NULL` (per ADR-0037 D1). This port
 * exposes only response-shaped operations; the reviews domain owns
 * regular `kind = REVIEW` operations on the same table.
 */

import type { BrokerResponseRecord, SubmitBrokerResponseInput } from './BrokerResponseEntity.js';

/**
 * Write contract for broker response creation. Tighter than
 * {@link SubmitBrokerResponseInput} because by the time the use case
 * calls into the repo, the IPFS pin + content hash have been computed
 * and the complaint has been validated.
 */
export type CreateBrokerResponseData = SubmitBrokerResponseInput & {
  brokerId: string;
  contentHash: string;
  ipfsCid: string;
};

export type IBrokerResponseRepository = {
  /**
   * Create a broker response row (`kind = REVIEW`, `respondsToReviewId`
   * set) and emit the `broker_response.submitted` outbox event in the
   * same transaction.
   */
  create(data: CreateBrokerResponseData): Promise<BrokerResponseRecord>;

  /**
   * Check if a response already exists for this complaint + broker.
   * Per ADR-0037 D2: one response per complaint per broker.
   */
  existsForComplaint(complaintId: string, brokerId: string): Promise<boolean>;

  /**
   * Find the broker response for a given complaint, if any.
   */
  findByComplaintId(complaintId: string): Promise<BrokerResponseRecord | null>;

  /**
   * Batch-fetch broker responses for a list of complaint IDs.
   * Returns a map from complaintId to response record. Complaints
   * without a response are absent from the map.
   */
  findByComplaintIds(complaintIds: string[]): Promise<Map<string, BrokerResponseRecord>>;
};
