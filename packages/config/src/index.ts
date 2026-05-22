/**
 * @opentrade/config
 *
 * Single source of truth for environment-driven configuration: supported
 * chains, contract addresses per chain, supported locales, feature flag keys,
 * tenant defaults. Per ADR-0001 the codebase must remain OP Stack-generic, so
 * any chain-specific value MUST be sourced from here.
 *
 * Subpath exports (preferred over barrel re-exports for tree-shaking):
 *   - `@opentrade/config/chains`    — chain definitions (viem)
 *   - `@opentrade/config/contracts` — contract address registry
 *   - `@opentrade/config/locales`   — i18n locale list
 */

export const PACKAGE_NAME = '@opentrade/config' as const;

export { base, baseSepolia, supportedChains, getChainById, getTargetChain } from './chains.js';
export type { SupportedChainId } from './chains.js';

export { buildContractAddresses } from './contracts.js';
export type { ContractAddresses } from './contracts.js';

export { defaultLocale, supportedLocales, isSupportedLocale } from './locales.js';
export type { SupportedLocale } from './locales.js';
