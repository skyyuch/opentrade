/**
 * Hono application factory for the OpenTrade API.
 *
 * Per ADR-0006 the API is a Modular Monolith: each business domain owns a
 * `presentation/routes.ts` that exports its own `Hono` instance, and this
 * file mounts them under `/v1/{domain}`. Phase 0 only registers the health
 * domain; subsequent commits add reviews / brokers / kols / etc.
 *
 * Middleware order is deliberate and load-bearing:
 *   1. requestId       — generate / echo correlation id (must be first).
 *   2. requestLogger   — bind a Pino child logger to context.
 *   3. cors            — apply whitelist from `env.CORS_ORIGIN`.
 *   4. (routes)
 *   5. notFound        — uniform 404 envelope.
 *   6. onError         — uniform error envelope.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { healthRouter } from '../domains/health/index.js';
import { env } from '../shared/env.js';
import { AppError } from '../shared/errors/index.js';

import { errorHandler } from './middleware/errorHandler.js';
import { requestId, requestLogger } from './middleware/requestContext.js';

import type { AppHonoEnv } from './types.js';

/**
 * Builds and returns the fully wired Hono app. Exposed as a factory (not a
 * singleton) so tests can spin up isolated instances without process-wide
 * side effects.
 */
export const createServer = (): Hono<AppHonoEnv> => {
  const app = new Hono<AppHonoEnv>();

  app.use('*', requestId());
  app.use('*', requestLogger());
  app.use(
    '*',
    cors({
      origin: env.CORS_ORIGIN,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposeHeaders: ['X-Request-Id'],
      credentials: true,
      maxAge: 600,
    }),
  );

  // Routes for individual domains. Each domain mounts under `/v1/{domain}`.
  // Subsequent commits add reviews, brokers, kols, disputes, identity, signals.
  app.route('/v1/health', healthRouter);

  app.notFound((c) =>
    errorHandler(AppError.notFound(`Route ${c.req.method} ${c.req.path} not found`), c),
  );
  app.onError(errorHandler);

  return app;
};
