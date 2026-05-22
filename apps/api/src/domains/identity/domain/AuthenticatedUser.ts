/**
 * Domain entity: the authenticated user context extracted from a valid JWT.
 *
 * This is NOT the full User DB model — it is the minimal claim set embedded
 * in the OpenTrade JWT. Handlers that need richer data should query the
 * IUserRepository with `userId`.
 */

import type { SbtTier, UserRole } from '@opentrade/db';

export type AuthenticatedUser = {
  userId: string;
  tenantId: string;
  role: UserRole;
  sbtTier: SbtTier;
  walletAddress: string | null;
};
