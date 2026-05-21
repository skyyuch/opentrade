/**
 * Shared Hono context typing for the OpenTrade API.
 *
 * Every middleware and route handler should reference {@link AppHonoEnv} so
 * `c.get('logger')` / `c.get('requestId')` are strongly typed end-to-end.
 *
 * As we add more cross-cutting context (tenant, user, feature flags) the
 * `Variables` union grows here — never in the individual files that consume
 * the values.
 */

import type { AuthenticatedUser } from '../domains/identity/domain/AuthenticatedUser.js';
import type { Logger } from 'pino';

export type AppHonoVariables = {
  /**
   * Stable correlation id for this HTTP request. Populated by the requestId
   * middleware; either echoed from an incoming `X-Request-Id` header (if
   * sane) or freshly generated via `crypto.randomUUID()`.
   */
  requestId: string;

  /**
   * Per-request child logger that already has `{ requestId, method, path }`
   * bound. Use it inside handlers instead of the root logger so every line
   * is correlated to the originating request automatically.
   */
  logger: Logger;

  /**
   * Authenticated user context. Set by the auth middleware — only present
   * on routes that pass through `authMiddleware()`.
   */
  user: AuthenticatedUser;
};

export type AppHonoEnv = {
  Variables: AppHonoVariables;
};
