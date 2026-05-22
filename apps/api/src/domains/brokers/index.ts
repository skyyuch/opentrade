/**
 * Public surface of the brokers domain (Phase 1 read-only).
 *
 * Full DDD four-layer (domain, application, infrastructure) lands when
 * write operations arrive (merchant claim flow, Block 6+).
 */

export { brokersRouter } from './presentation/routes.js';
