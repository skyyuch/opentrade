/**
 * Chain definitions for OpenTrade.
 *
 * Per ADR-0001 the codebase must remain OP Stack-generic. Every chain-specific
 * value (chainId, RPC URL, block explorer) MUST be sourced from this module.
 * Components and API code import from `@opentrade/config/chains` — never from
 * `viem/chains` directly — so a chain swap is a one-file change.
 */

import { base, baseSepolia } from 'viem/chains';

import type { Chain } from 'viem';

export { base, baseSepolia };

export type SupportedChainId = typeof base.id | typeof baseSepolia.id;

export const supportedChains = [base, baseSepolia] as const;

/**
 * Resolve the target chain from a numeric chain ID.
 * Falls back to Base Sepolia when the ID is unrecognised (dev safety net).
 */
export function getChainById(chainId: number): Chain {
  const found = supportedChains.find((c) => c.id === chainId);
  return found ?? baseSepolia;
}

/**
 * Default chain per environment.
 *
 * Apps read `NEXT_PUBLIC_CHAIN_ID` (web/console) or `CHAIN_ID` (api) from
 * their env module and pass the numeric value here. This function does NOT
 * read `process.env` itself — env access is the caller's responsibility
 * (per rule 50: env validation lives in each app's `env.ts`).
 */
export function getTargetChain(chainId?: number): Chain {
  if (chainId !== undefined) return getChainById(chainId);
  return baseSepolia;
}
