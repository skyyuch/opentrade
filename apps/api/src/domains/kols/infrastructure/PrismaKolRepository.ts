/**
 * Prisma implementation of IKolRepository.
 *
 * Per DDD rule 10: adapts the domain port to Prisma. Outbox events
 * are emitted in the same transaction as the KOL row mutation.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { IKolRepository, KolListOptions } from '../domain/IKolRepository.js';
import type { ApplyKolInput, KolRecord, KolStatusValue } from '../domain/KolEntity.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function toRecord(row: {
  id: string;
  tenantId: string;
  userId: string | null;
  slug: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  status: string;
  socialLinks: unknown;
  credentials: unknown;
  iamSmartVerified: boolean;
  kolSbtTokenId: number | null;
  kolSbtMintTxHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}): KolRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    slug: row.slug,
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    status: row.status as KolStatusValue,
    socialLinks: row.socialLinks as KolRecord['socialLinks'],
    credentials: row.credentials as KolRecord['credentials'],
    iamSmartVerified: row.iamSmartVerified,
    kolSbtTokenId: row.kolSbtTokenId,
    kolSbtMintTxHash: row.kolSbtMintTxHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaKolRepository implements IKolRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: ApplyKolInput): Promise<KolRecord> {
    const baseSlug = slugify(input.displayName);
    const existing = await this.prisma.kol.findUnique({ where: { slug: baseSlug } });
    const slug = existing ? `${baseSlug}-${Date.now()}` : baseSlug;

    const result = await this.prisma.$transaction(async (tx) => {
      const kol = await tx.kol.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          slug,
          displayName: input.displayName,
          bio: input.bio ?? null,
          socialLinks: input.socialLinks ?? Prisma.JsonNull,
          credentials: input.credentials ?? Prisma.JsonNull,
          status: 'PENDING',
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          aggregateType: 'kol',
          aggregateId: kol.id,
          eventType: 'kol.applied',
          payload: { userId: input.userId, slug: kol.slug },
        },
      });

      return kol;
    });

    return toRecord(result);
  }

  async findById(id: string): Promise<KolRecord | null> {
    const row = await this.prisma.kol.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async findBySlug(slug: string): Promise<KolRecord | null> {
    const row = await this.prisma.kol.findUnique({ where: { slug } });
    return row ? toRecord(row) : null;
  }

  async findByUserId(tenantId: string, userId: string): Promise<KolRecord | null> {
    const row = await this.prisma.kol.findFirst({
      where: { tenantId, userId },
    });
    return row ? toRecord(row) : null;
  }

  async list(options: KolListOptions): Promise<KolRecord[]> {
    const rows = await this.prisma.kol.findMany({
      where: {
        tenantId: options.tenantId,
        ...(options.status ? { status: options.status } : {}),
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });
    return rows.map(toRecord);
  }

  async count(options: Omit<KolListOptions, 'limit' | 'offset'>): Promise<number> {
    return this.prisma.kol.count({
      where: {
        tenantId: options.tenantId,
        ...(options.status ? { status: options.status } : {}),
        deletedAt: null,
      },
    });
  }

  async updateStatus(
    id: string,
    status: KolStatusValue,
    _adminUserId?: string,
  ): Promise<KolRecord> {
    const eventType =
      status === 'APPROVED'
        ? 'kol.approved'
        : status === 'REJECTED'
          ? 'kol.rejected'
          : 'kol.applied';

    const result = await this.prisma.$transaction(async (tx) => {
      const kol = await tx.kol.update({
        where: { id },
        data: { status },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: kol.tenantId,
          aggregateType: 'kol',
          aggregateId: kol.id,
          eventType,
          payload: { status, kolId: kol.id },
        },
      });

      return kol;
    });

    return toRecord(result);
  }

  async claimProfile(
    kolId: string,
    userId: string,
    updates: {
      displayName?: string;
      bio?: string;
      socialLinks?: Record<string, string>;
    },
  ): Promise<KolRecord> {
    const result = await this.prisma.$transaction(async (tx) => {
      const kol = await tx.kol.update({
        where: { id: kolId },
        data: {
          userId,
          status: 'PENDING',
          ...(updates.displayName ? { displayName: updates.displayName } : {}),
          ...(updates.bio ? { bio: updates.bio } : {}),
          ...(updates.socialLinks ? { socialLinks: updates.socialLinks } : {}),
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: kol.tenantId,
          aggregateType: 'kol',
          aggregateId: kol.id,
          eventType: 'kol.claimed',
          payload: { userId, kolId: kol.id },
        },
      });

      return kol;
    });

    return toRecord(result);
  }
}
