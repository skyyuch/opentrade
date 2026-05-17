/**
 * HTTP response shape for `GET /v1/health`.
 *
 * Per rule 30 the API NEVER returns a domain entity directly; every
 * outbound payload is a hand-rolled DTO so we can change internals freely
 * without breaking the wire contract.
 *
 * Wire contract (locked once first client ships):
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
 */

export type DependencyHealthDto = {
  name: string;
  status: 'OK' | 'DEGRADED' | 'DOWN';
  latencyMs?: number;
  error?: string;
};

export type HealthReportDto = {
  status: 'OK' | 'DEGRADED' | 'DOWN';
  uptimeSeconds: number;
  checkedAt: string;
  dependencies: DependencyHealthDto[];
};
