/**
 * Port for user persistence.
 *
 * The identity domain owns User read/write operations. Following the health
 * domain pattern, infrastructure adapters (PrismaUserRepository) implement
 * this interface, and use cases depend on the port — not the concrete adapter.
 */

import type { SbtTier, User, UserRole } from '@opentrade/db';

export type UpsertUserInput = {
  tenantId: string;
  privyId: string;
  walletAddress?: string | null;
  email?: string | null;
  displayName?: string | null;
};

export type UpdateProfileInput = {
  displayName?: string | null | undefined;
  preferredLocale?: string | null | undefined;
};

export type IUserRepository = {
  upsertByPrivyId(input: UpsertUserInput): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByPrivyId(tenantId: string, privyId: string): Promise<User | null>;
  updateRole(id: string, role: UserRole): Promise<User>;
  updateSbtTier(id: string, sbtTier: SbtTier): Promise<User>;
  updateProfile(id: string, input: UpdateProfileInput): Promise<User>;
};
