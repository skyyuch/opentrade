/**
 * Shared runtime singletons for the moderation domain (per ADR-0034).
 *
 * CRITICAL (rule 52): the gate read path and the admin write path MUST share
 * ONE {@link CachedTermProvider} instance, so admin mutations (which invalidate
 * this provider) take effect on the pre-publication gate immediately. This
 * module owns those singletons; both `index.ts` (public surface) and
 * `presentation/routes.ts` (admin router) import from here, avoiding an
 * index ↔ routes import cycle.
 */

import { prisma as defaultPrisma } from '@opentrade/db';

import { CheckContentService } from './application/CheckContentService.js';
import { ModerationTermAdminService } from './application/ModerationTermAdminService.js';
import { CachedTermProvider } from './infrastructure/CachedTermProvider.js';
import { PrismaModerationTermRepository } from './infrastructure/PrismaModerationTermRepository.js';

import type { PrismaClient } from '@opentrade/db';

const sharedRepo = new PrismaModerationTermRepository(defaultPrisma);
const sharedProvider = new CachedTermProvider(sharedRepo);
const sharedCheckContentService = new CheckContentService(sharedProvider);

/**
 * The admin-facing term management service (shared singleton). Mutations here
 * invalidate the same provider the gate reads from.
 */
export const moderationAdminService = new ModerationTermAdminService(sharedRepo, sharedProvider);

/**
 * Build the content-moderation checker. The returned service structurally
 * satisfies the reviews domain's `IContentModerator` port.
 *
 * For the default client it returns the shared checker (so admin invalidation
 * reaches the gate); a non-default client (tests) gets an isolated provider.
 */
export const createCheckContentService = (
  prisma: PrismaClient = defaultPrisma,
): CheckContentService => {
  if (prisma === defaultPrisma) {
    return sharedCheckContentService;
  }
  const repo = new PrismaModerationTermRepository(prisma);
  const provider = new CachedTermProvider(repo);
  return new CheckContentService(provider);
};
