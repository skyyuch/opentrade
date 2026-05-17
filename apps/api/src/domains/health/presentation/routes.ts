/**
 * Hono router for the health domain.
 *
 * Composition root for this domain: wires the Prisma adapter into the use
 * case and exposes a single `GET /` endpoint mounted under `/v1/health` by
 * `http/server.ts`. Subsequent domains follow the same pattern — keep the
 * composition wiring inside the router so the domain can be lifted to a
 * separate process later without rummaging through other files.
 *
 * Status code mapping:
 *   - OK / DEGRADED → 200 (load balancers see the service as live).
 *   - DOWN          → 503 (ECS task should be replaced).
 */

import { Hono } from 'hono';

import { prisma } from '@opentrade/db';

import { CheckHealthUseCase } from '../application/CheckHealthUseCase.js';
import { HealthStatus } from '../domain/HealthStatus.js';
import { PrismaHealthRepository } from '../infrastructure/PrismaHealthRepository.js';

import { toHealthReportDto } from './mappers.js';

import type { AppHonoEnv } from '../../../http/types.js';

const healthRepository = new PrismaHealthRepository(prisma);
const checkHealth = new CheckHealthUseCase(healthRepository, {
  now: () => new Date(),
  uptimeSeconds: () => process.uptime(),
});

export const healthRouter = new Hono<AppHonoEnv>();

healthRouter.get('/', async (c) => {
  const report = await checkHealth.execute();
  const httpStatus = report.status === HealthStatus.DOWN ? 503 : 200;
  return c.json(toHealthReportDto(report), httpStatus);
});
