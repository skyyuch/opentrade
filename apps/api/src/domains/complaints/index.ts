/**
 * Public surface of the complaints domain.
 *
 * Only the router crosses the domain boundary — internals (domain
 * entity, use cases, repositories) stay private to the folder.
 */

export { complaintsRouter } from './presentation/routes.js';
