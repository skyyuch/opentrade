/**
 * @opentrade/shared
 *
 * Cross-cutting types, enums, and pure utility functions used by every other
 * OpenTrade package. This module MUST stay free of runtime dependencies on any
 * framework (Next.js, Hono, Prisma, viem, etc.) so it can be imported by both
 * client and server code without dragging unwanted bytes.
 *
 * See docs/01-architecture.md for the package dependency graph.
 */

export const PACKAGE_NAME = '@opentrade/shared' as const;

export type { DependencyHealthDto, HealthReportDto, HealthStatus } from './health/HealthReportDto';

// i18n helpers — pure, framework-free name pickers for entities that use
// the "parallel columns" multilingual pattern (per cursor rule 51).
export { localizedBrokerName } from './i18n/brokerName';
export type { LocaleString, LocalizedNameInput } from './i18n/brokerName';
