/**
 * Infrastructure layer: Prisma adapter implementing {@link IHealthRepository}.
 *
 * Sits at the framework boundary — this is the ONLY file in the health
 * domain that imports `@opentrade/db` runtime symbols. Domain and
 * application layers stay framework-agnostic so they remain unit-testable
 * without spinning up a database.
 *
 * Per ADR-0006 (DDD + Modular Monolith) and rule 31, apps/api is the only
 * package allowed to import the Prisma client at runtime; this module is
 * the local consumer for the health domain.
 */

import { HealthStatus } from '../domain/HealthStatus.js';

import type { DependencyHealth } from '../domain/DependencyHealth.js';
import type { IHealthRepository } from '../domain/IHealthRepository.js';
import type { PrismaClient } from '@opentrade/db';

/** How long a single probe is allowed to take before we declare DOWN. */
const PROBE_TIMEOUT_MS = 2_000;

export class PrismaHealthRepository implements IHealthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async pingDatabase(): Promise<DependencyHealth> {
    const start = performance.now();
    try {
      await Promise.race([
        // `SELECT 1` is the canonical Postgres liveness probe: zero IO cost,
        // exercises the full connection-pool / TLS / auth path.
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('database probe timed out')), PROBE_TIMEOUT_MS),
        ),
      ]);
      const latencyMs = Math.round(performance.now() - start);
      return { name: 'database', status: HealthStatus.OK, latencyMs };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : 'unknown error';
      return {
        name: 'database',
        status: HealthStatus.DOWN,
        latencyMs,
        error: message,
      };
    }
  }
}
