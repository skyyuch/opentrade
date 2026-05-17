/**
 * Wire contract for `GET /v1/health`.
 *
 * Lives in `@opentrade/shared` (rather than inside `apps/api`) so that any
 * future client — `apps/web`, `apps/console`, an external partner SDK — can
 * type-import the same shape without crossing the apps/* boundary, which
 * cursor rule 10 forbids.
 *
 * The canonical wire shape:
 * ```json
 * {
 *   "status":        "OK" | "DEGRADED" | "DOWN",
 *   "uptimeSeconds": 123,
 *   "checkedAt":     "2026-05-17T18:30:00.000Z",
 *   "dependencies": [
 *     { "name": "database", "status": "OK", "latencyMs": 2 }
 *   ]
 * }
 * ```
 *
 * Once the first non-API consumer ships, this contract is locked: changes
 * become a `/v2` rollout per rule 30, never a breaking edit to `/v1`.
 */

export type HealthStatus = 'OK' | 'DEGRADED' | 'DOWN';

export type DependencyHealthDto = {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
};

export type HealthReportDto = {
  status: HealthStatus;
  uptimeSeconds: number;
  checkedAt: string;
  dependencies: DependencyHealthDto[];
};
