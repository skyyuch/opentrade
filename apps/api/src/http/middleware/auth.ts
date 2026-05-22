/**
 * Authentication middleware for the OpenTrade API.
 *
 * Extracts the Bearer token from the Authorization header, verifies it
 * via the JoseJwtService, and sets `c.set('user', ...)` on the Hono context.
 *
 * Usage in routes:
 *   ```ts
 *   router.post('/draft', authMiddleware('user'), async (c) => {
 *     const user = c.get('user');
 *     // ...
 *   });
 *   ```
 *
 * Role hierarchy: admin > jury > reviewer > user.
 * A higher role implicitly satisfies a lower requirement.
 */

import { createMiddleware } from 'hono/factory';

import { AppError, ErrorCode } from '../../shared/errors/index.js';

import type { AuthenticatedUser } from '../../domains/identity/domain/AuthenticatedUser.js';
import type { IJwtService } from '../../domains/identity/infrastructure/IJwtService.js';
import type { AppHonoEnv } from '../types.js';

const ROLE_HIERARCHY: Record<string, number> = {
  USER: 0,
  REVIEWER: 1,
  JURY: 2,
  ADMIN: 3,
};

type RequiredRole = 'user' | 'reviewer' | 'jury' | 'admin';

let jwtServiceInstance: IJwtService | null = null;

export function setAuthJwtService(service: IJwtService): void {
  jwtServiceInstance = service;
}

export function authMiddleware(requiredRole: RequiredRole = 'user') {
  return createMiddleware<
    AppHonoEnv & { Variables: AppHonoEnv['Variables'] & { user: AuthenticatedUser } }
  >(async (c, next) => {
    if (!jwtServiceInstance) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, 'JWT service not initialised', 500);
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing or malformed Authorization header', 401);
    }

    const token = authHeader.slice(7);

    let verified;
    try {
      verified = await jwtServiceInstance.verify(token);
    } catch {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Invalid or expired access token', 401);
    }

    const callerLevel = ROLE_HIERARCHY[verified.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole.toUpperCase()] ?? 0;

    if (callerLevel < requiredLevel) {
      throw new AppError(ErrorCode.FORBIDDEN, `Requires at least ${requiredRole} role`, 403);
    }

    const user: AuthenticatedUser = {
      userId: verified.sub,
      tenantId: verified.tenantId,
      role: verified.role as AuthenticatedUser['role'],
      sbtTier: verified.sbtTier as AuthenticatedUser['sbtTier'],
      walletAddress: verified.walletAddress,
    };

    c.set('user', user);
    await next();
  });
}
