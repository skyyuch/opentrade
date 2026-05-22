/**
 * Contract address registry for OpenTrade.
 *
 * Every contract address consumed by apps/web, apps/console, or apps/api MUST
 * come from this module. Addresses are resolved at startup from environment
 * variables — nothing is hardcoded per ADR-0001 and rule 40.
 *
 * Phase 1 contracts:
 *   - ReviewRegistry (UUPS proxy)
 *   - ReviewerSBT (UUPS proxy, per ADR-0021)
 *
 * Phase 2+ contracts (placeholders):
 *   - SignalLogger
 *   - JuryPool
 */

import type { Address } from 'viem';

export type ContractAddresses = {
  reviewRegistry: Address;
  reviewerSbt: Address;
};

/**
 * Build the contract address map from environment values.
 *
 * Each app calls this once at startup, passing values from its own validated
 * env module. This keeps packages/config free of `process.env` access.
 */
export function buildContractAddresses(env: {
  reviewRegistryAddress: string;
  reviewerSbtAddress: string;
}): ContractAddresses {
  return {
    reviewRegistry: env.reviewRegistryAddress as Address,
    reviewerSbt: env.reviewerSbtAddress as Address,
  };
}
