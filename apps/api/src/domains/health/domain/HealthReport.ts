/**
 * Domain aggregate: the canonical health report returned by `/v1/health`.
 *
 * Pure aggregation logic: given a set of dependency probes, derive the
 * overall status. No framework imports, no I/O. The infrastructure layer
 * builds the {@link DependencyHealth} list and hands it to {@link build}.
 */

import { HealthStatus } from './HealthStatus.js';

import type { DependencyHealth } from './DependencyHealth.js';

export type HealthReport = {
  status: HealthStatus;
  uptimeSeconds: number;
  checkedAt: Date;
  dependencies: readonly DependencyHealth[];
};

/**
 * Overall status is the worst of any dependency:
 *   any DOWN     → DOWN
 *   any DEGRADED → DEGRADED
 *   otherwise    → OK
 *
 * This rule deliberately treats every listed dependency as critical for
 * Phase 0. When we add non-critical dependencies (e.g. IPFS pinning service)
 * in Phase 1 we will extend {@link DependencyHealth} with a `critical` flag
 * and adjust this aggregator accordingly.
 */
const deriveOverallStatus = (dependencies: readonly DependencyHealth[]): HealthStatus => {
  if (dependencies.some((dep) => dep.status === HealthStatus.DOWN)) {
    return HealthStatus.DOWN;
  }
  if (dependencies.some((dep) => dep.status === HealthStatus.DEGRADED)) {
    return HealthStatus.DEGRADED;
  }
  return HealthStatus.OK;
};

/**
 * Builds a {@link HealthReport} from raw dependency probes. Both arguments
 * are injected (no `Date.now()` / `process.uptime()` calls inside) so the
 * aggregate stays deterministic and trivially unit-testable.
 */
export const buildHealthReport = (params: {
  dependencies: readonly DependencyHealth[];
  uptimeSeconds: number;
  checkedAt: Date;
}): HealthReport => {
  return {
    status: deriveOverallStatus(params.dependencies),
    uptimeSeconds: params.uptimeSeconds,
    checkedAt: params.checkedAt,
    dependencies: params.dependencies,
  };
};
