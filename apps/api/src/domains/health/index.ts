/**
 * Public surface of the health domain.
 *
 * Only the router crosses the domain boundary — internals (domain entity,
 * use case, repositories) stay private to the folder. This is the import
 * pattern other apps/api consumers MUST follow when integrating with a
 * domain: never reach into `application/` or `infrastructure/` from
 * outside the domain folder.
 */

export { healthRouter } from './presentation/routes.js';
