/**
 * HTTP response shape for `GET /v1/health`.
 *
 * Re-exports the canonical wire contract from `@opentrade/shared` so that
 * any other workspace package — `apps/web`, `apps/console`, a future SDK —
 * can type-import the same shape without crossing the `apps/*` boundary
 * forbidden by cursor rule 10.
 *
 * Per rule 30 the API NEVER returns a domain entity directly; every
 * outbound payload is a hand-rolled DTO so we can change internals freely
 * without breaking the wire contract.
 */

export type { DependencyHealthDto, HealthReportDto, HealthStatus } from '@opentrade/shared';
