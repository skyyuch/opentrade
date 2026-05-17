/**
 * @opentrade/config
 *
 * Single source of truth for environment-driven configuration: supported
 * chains, contract addresses per chain, supported locales, feature flag keys,
 * tenant defaults. Per ADR-0001 the codebase must remain OP Stack–generic, so
 * any chain-specific value MUST be sourced from here.
 */

export const PACKAGE_NAME = '@opentrade/config' as const;
