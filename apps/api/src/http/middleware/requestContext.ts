/**
 * Request context middleware.
 *
 * Combines Hono's built-in `requestId` middleware (which generates or echoes
 * an `X-Request-Id` header) with a logger-binding step so every downstream
 * handler can pull a Pino child logger straight off the context:
 *
 * ```ts
 * app.get('/v1/things', (c) => {
 *   c.get('logger').info({ event: 'thing.list' }, 'listing things');
 *   return c.json([]);
 * });
 * ```
 *
 * The child logger automatically carries `requestId`, `method`, and `path`,
 * so every log line in a request thread is correlated for free.
 */

import { requestId as honoRequestId } from 'hono/request-id';

import { createRequestLogger } from '../../shared/observability/logger.js';

import type { AppHonoEnv } from '../types.js';
import type { MiddlewareHandler } from 'hono';

/**
 * Built-in `requestId` middleware reused as-is. Kept as a small adapter so
 * callers import a single `requestId()` from this file rather than reaching
 * into `hono/request-id` directly, mirroring our shared/* convention.
 */
export const requestId: () => MiddlewareHandler<AppHonoEnv> = () =>
  honoRequestId() as MiddlewareHandler<AppHonoEnv>;

/**
 * Binds a per-request Pino child logger to the Hono context. MUST be
 * registered AFTER {@link requestId} so the correlation id is available.
 */
export const requestLogger = (): MiddlewareHandler<AppHonoEnv> => {
  return async (c, next) => {
    const rid = c.get('requestId');
    const childLogger = createRequestLogger(rid, {
      method: c.req.method,
      path: c.req.path,
    });
    c.set('logger', childLogger);
    await next();
  };
};
