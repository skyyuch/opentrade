/**
 * Public surface of the reviews domain.
 *
 * Only the router crosses the domain boundary — internals (domain entity,
 * use case, repositories) stay private to the folder.
 */

export { reviewsRouter } from './presentation/routes.js';
