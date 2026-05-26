/**
 * Public surface of the KOL domain.
 *
 * Only the router crosses the domain boundary — internals (domain
 * entity, use cases, repositories) stay private to the folder.
 */

export { kolsRouter } from './presentation/routes.js';
