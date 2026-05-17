/**
 * Domain port: probes for every downstream dependency the API depends on.
 *
 * The domain layer owns the interface; the infrastructure layer (Prisma,
 * RPC, IPFS client, ...) provides the implementation. Use cases consume
 * this interface, NOT a concrete adapter — that's the whole point of the
 * dependency-inversion rule in ADR-0006.
 *
 * Adding new dependency probes:
 *   1. Add a new method here (e.g. `pingIpfs()`).
 *   2. Implement it in `infrastructure/` (e.g. `IpfsHealthRepository` or
 *      extend the existing repository if appropriate).
 *   3. Update {@link CheckHealthUseCase} to call it.
 *   4. Update the response DTO test snapshot.
 */

import type { DependencyHealth } from './DependencyHealth.js';

export type IHealthRepository = {
  /**
   * Liveness + readiness check for the primary write database.
   * Implementations MUST NOT throw — return a {@link DependencyHealth} with
   * `status: DOWN` and a short error message instead, so the use case can
   * compose multiple probes without a single failure short-circuiting the
   * whole report.
   */
  pingDatabase: () => Promise<DependencyHealth>;
};
