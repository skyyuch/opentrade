/**
 * Public surface of the identity domain.
 *
 * Only the router and the JWT service (needed by auth middleware) cross the
 * domain boundary.
 */

export { identityRouter } from './presentation/routes.js';
export { JoseJwtService } from './infrastructure/JoseJwtService.js';
