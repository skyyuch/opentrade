/**
 * Public surface of the moderation domain (per ADR-0034).
 *
 * Exposes the authoritative content checker (read path, injected into the
 * reviews router), the admin term service + admin router (write path), and the
 * service classes. The shared runtime singletons live in `runtime.ts` so that
 * the gate read path and the admin write path share ONE cache provider (rule
 * 52) without an index ↔ routes import cycle.
 */

export { CheckContentService } from './application/CheckContentService.js';
export { ModerationTermAdminService } from './application/ModerationTermAdminService.js';
export { PublicModerationAuditService } from './application/PublicModerationAuditService.js';
export { moderationPublicRouter } from './presentation/publicRoutes.js';
export { moderationAdminRouter } from './presentation/routes.js';
export {
  createCheckContentService,
  moderationAdminService,
  moderationPublicAuditService,
} from './runtime.js';
