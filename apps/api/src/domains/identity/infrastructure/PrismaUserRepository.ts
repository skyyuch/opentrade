/**
 * Prisma adapter for IUserRepository.
 *
 * Uses Prisma's `upsert` for the "create on first login, update on return"
 * flow. The unique constraint `@@unique([tenantId, privyId])` guarantees
 * no duplicate user rows for the same Privy identity within a tenant.
 */

import type {
  IUserRepository,
  UpdateProfileInput,
  UpsertUserInput,
} from '../domain/IUserRepository.js';
import type { PrismaClient, SbtTier, User, UserRole } from '@opentrade/db';

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertByPrivyId(input: UpsertUserInput): Promise<User> {
    return this.prisma.user.upsert({
      where: {
        tenantId_privyId: {
          tenantId: input.tenantId,
          privyId: input.privyId,
        },
      },
      create: {
        tenantId: input.tenantId,
        privyId: input.privyId,
        walletAddress: input.walletAddress ?? null,
        email: input.email ?? null,
        displayName: input.displayName ?? null,
      },
      update: {
        ...(input.walletAddress != null ? { walletAddress: input.walletAddress } : {}),
        ...(input.email != null ? { email: input.email } : {}),
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByPrivyId(tenantId: string, privyId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { tenantId_privyId: { tenantId, privyId } },
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async updateRole(id: string, role: UserRole): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { role } });
  }

  async updateSbtTier(id: string, sbtTier: SbtTier): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { sbtTier } });
  }

  async updateProfile(id: string, input: UpdateProfileInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.preferredLocale !== undefined ? { preferredLocale: input.preferredLocale } : {}),
        ...(input.notificationPrefs !== undefined
          ? { notificationPrefs: input.notificationPrefs }
          : {}),
        ...(input.privacyPrefs !== undefined ? { privacyPrefs: input.privacyPrefs } : {}),
      },
    });
  }
}
