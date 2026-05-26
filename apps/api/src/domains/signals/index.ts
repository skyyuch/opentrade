/**
 * Public surface of the signals domain.
 *
 * Only the router crosses the domain boundary — internals (domain
 * entity, use cases, repositories) stay private to the folder.
 */

export { signalsRouter } from './presentation/routes.js';
