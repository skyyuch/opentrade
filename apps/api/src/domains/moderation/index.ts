/**
 * Public surface of the moderation domain (per ADR-0034).
 *
 * Exposes the authoritative content checker (read path, injected into the
 * reviews router) and the admin term service (write path, used by the admin
 * router in Phase B).
 *
 * CRITICAL (rule 52): both share ONE {@link CachedTermProvider} instance built
 * on the default Prisma client. The admin service invalidates this provider on
 * every successful mutation, so the gate reflects blocklist edits immediately
 * instead of waiting for the TTL. Building separate providers would silently
 * break that invalidation link.
 */

import { prisma as defaultPrisma } from '@opentrade/db';

import { CheckContentService } from './application/CheckContentService.js';
import { ModerationTermAdminService } from './application/ModerationTermAdminService.js';
import { CachedTermProvider } from './infrastructure/CachedTermProvider.js';
import { PrismaModerationTermRepository } from './infrastructure/PrismaModerationTermRepository.js';

import type { PrismaClient } from '@opentrade/db';

export { CheckContentService } from './application/CheckContentService.js';
export { ModerationTermAdminService } from './application/ModerationTermAdminService.js';

// Shared singletons over the default client. The admin write path and the
// gate read path MUST point at the same provider for invalidation to work.
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
