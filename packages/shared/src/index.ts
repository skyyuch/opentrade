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
