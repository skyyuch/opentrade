/**
 * Prisma implementation of IKolRepository.
 *
 * Per DDD rule 10: adapts the domain port to Prisma. Outbox events
 * are emitted in the same transaction as the KOL row mutation.
 */

import { Prisma, type PrismaClient } from '@opentrade/db';

import { buildKolListWhere } from '../domain/kolListFilter.js';

import type { IKolRepository, KolListOptions } from '../domain/IKolRepository.js';
import type {
  ApplyKolInput,
  KolRecord,
  KolStatusValue,
  UpdateKolCategoryInput,
} from '../domain/KolEntity.js';

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
  type: string | null;
  focus: string | null;
  socialLinks: unknown;
  credentials: unknown;
  iamSmartVerified: boolean;
  kolSbtTokenId: number | null;
  kolSbtMintTxHash: string | null;
  adminNote: string | null;
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
    type: row.type as KolRecord['type'],
    focus: row.focus as KolRecord['focus'],
    socialLinks: row.socialLinks as KolRecord['socialLinks'],
    credentials: row.credentials as KolRecord['credentials'],
    iamSmartVerified: row.iamSmartVerified,
    kolSbtTokenId: row.kolSbtTokenId,
    kolSbtMintTxHash: row.kolSbtMintTxHash,
    adminNote: row.adminNote,
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
      where: buildKolListWhere(options),
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });
    return rows.map(toRecord);
  }

  async count(options: Omit<KolListOptions, 'limit' | 'offset'>): Promise<number> {
    return this.prisma.kol.count({
      where: buildKolListWhere(options),
    });
  }

  async updateStatus(
    id: string,
    status: KolStatusValue,
    options?: { adminUserId?: string; adminNote?: string },
  ): Promise<KolRecord> {
    const eventType =
      status === 'APPROVED'
        ? 'kol.approved'
        : status === 'REJECTED'
          ? 'kol.rejected'
          : 'kol.applied';

    // Per ADR-0036 D1.1 + IKolRepository contract: only persist adminNote
    // on REJECTED transitions. APPROVED / SUSPENDED writes leave the
    // column untouched so a prior rejection note remains queryable if a
    // resubmitted application later re-cycles through moderation.
    const data: { status: KolStatusValue; adminNote?: string | null } = { status };
    if (status === 'REJECTED' && options?.adminNote) {
      data.adminNote = options.adminNote;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const kol = await tx.kol.update({
        where: { id },
        data,
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

  async updateCategory(id: string, updates: UpdateKolCategoryInput): Promise<KolRecord> {
    // Per ADR-0053 §3: category assignment is consumer-less off-chain
    // metadata, so — unlike create/updateStatus/claimProfile — we do NOT
    // emit an outbox event (no notification, no chain write). Only the keys
    // explicitly supplied are written; `exactOptionalPropertyTypes` lets a
    // present `null` clear a dimension while an absent key is left untouched.
    const data: Prisma.KolUpdateInput = {};
    if ('type' in updates) data.type = updates.type ?? null;
    if ('focus' in updates) data.focus = updates.focus ?? null;

    const row = await this.prisma.kol.update({ where: { id }, data });
    return toRecord(row);
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
