/**
 * IPFS gateway + block-explorer URL helpers for the web app.
 *
 * Notes embed images by IPFS CID only (ADR-0039 D3); the gateway URL is
 * reconstructed at render time here so the canonical gateway lives in one
 * place instead of being hardcoded across components. The block-explorer base
 * is sourced from `@opentrade/config` (`getTargetChain`) so no specific chain
 * (Base) is hardcoded — per the project chain red line (rule 00 + ADR-0001).
 */

import { getTargetChain } from '@opentrade/config/chains';

import { env } from '../env';

/**
 * Canonical public IPFS gateway base. Mirrors the API's default
 * `PINATA_GATEWAY_URL` and the gateway used elsewhere in the front-ends.
 */
const IPFS_GATEWAY_BASE = 'https://gateway.pinata.cloud/ipfs/';

/** Build a gateway URL for an IPFS CID. */
export const ipfsGatewayUrl = (cid: string): string => `${IPFS_GATEWAY_BASE}${cid}`;

/**
 * Build a block-explorer transaction URL for the configured chain. Returns
 * `null` when the chain has no known explorer so callers can hide the link.
 */
export const blockExplorerTxUrl = (txHash: string): string | null => {
  const chain = getTargetChain(env.NEXT_PUBLIC_CHAIN_ID);
  const base = chain.blockExplorers?.default.url;
  return base ? `${base}/tx/${txHash}` : null;
};
