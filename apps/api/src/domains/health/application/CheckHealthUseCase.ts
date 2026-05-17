/**
 * Application layer: `CheckHealthUseCase`.
 *
 * Composes the dependency probes from the {@link IHealthRepository} port
 * into a single {@link HealthReport}. Pure orchestration: no Prisma, no
 * Hono, no `process.*` calls (uptime + checkedAt are injected so tests can
 * pin them).
 *
 * This is the reference pattern for every other domain's use case:
 *   - Constructor takes ports only (interfaces, never concrete adapters).
 *   - `execute()` returns a domain aggregate; HTTP / DTO concerns live one
 *     layer up in `presentation/`.
 */

import { buildHealthReport, type HealthReport } from '../domain/HealthReport.js';

import type { IHealthRepository } from '../domain/IHealthRepository.js';

export type CheckHealthClock = {
  /** Wall-clock now. Injectable so tests can pin a deterministic timestamp. */
  now: () => Date;
  /** Process uptime in seconds. Injectable so tests can pin it. */
  uptimeSeconds: () => number;
};

export class CheckHealthUseCase {
  constructor(
    private readonly healthRepo: IHealthRepository,
    private readonly clock: CheckHealthClock,
  ) {}

  async execute(): Promise<HealthReport> {
    const database = await this.healthRepo.pingDatabase();
    return buildHealthReport({
      dependencies: [database],
      uptimeSeconds: Math.round(this.clock.uptimeSeconds()),
      checkedAt: this.clock.now(),
    });
  }
}
