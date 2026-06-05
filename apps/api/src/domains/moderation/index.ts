/**
 * Public surface of the moderation domain (per ADR-0034).
 *
 * Phase A exposes only a factory that builds the authoritative content checker,
 * so consuming composition roots (e.g. the reviews router) wire it in one line
 * without touching the repo/provider internals. Phase B will add the admin
 * router export.
 */

import { prisma as defaultPrisma } from '@opentrade/db';

import { CheckContentService } from './application/CheckContentService.js';
import { CachedTermProvider } from './infrastructure/CachedTermProvider.js';
import { PrismaModerationTermRepository } from './infrastructure/PrismaModerationTermRepository.js';

import type { PrismaClient } from '@opentrade/db';

export { CheckContentService } from './application/CheckContentService.js';

/**
 * Build the content-moderation checker. The returned service structurally
 * satisfies the reviews domain's `IContentModerator` port.
 */
export const createCheckContentService = (
  prisma: PrismaClient = defaultPrisma,
): CheckContentService => {
  const repo = new PrismaModerationTermRepository(prisma);
  const provider = new CachedTermProvider(repo);
  return new CheckContentService(provider);
};
