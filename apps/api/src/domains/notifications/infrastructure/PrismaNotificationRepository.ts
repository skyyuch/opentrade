import type {
  INotificationRepository,
  NotificationListOptions,
} from '../domain/INotificationRepository.js';
import type { CreateNotificationInput, NotificationRecord } from '../domain/NotificationEntity.js';
import type { Prisma, PrismaClient } from '@prisma/client';

function toRecord(row: {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  metadata: unknown;
  readAt: Date | null;
  createdAt: Date;
}): NotificationRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    type: row.type as NotificationRecord['type'],
    title: row.title,
    body: row.body,
    metadata: row.metadata as Record<string, unknown> | null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export class PrismaNotificationRepository implements INotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateNotificationInput): Promise<NotificationRecord> {
    const row = await this.prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
      },
    });
    return toRecord(row);
  }

  async createMany(inputs: CreateNotificationInput[]): Promise<number> {
    const results = await this.prisma.$transaction(
      inputs.map((input) =>
        this.prisma.notification.create({
          data: {
            tenantId: input.tenantId,
            userId: input.userId,
            type: input.type,
            title: input.title,
            body: input.body ?? null,
            ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
          },
        }),
      ),
    );
    return results.length;
  }

  async listByUser(
    userId: string,
    options?: NotificationListOptions,
  ): Promise<NotificationRecord[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(options?.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
    return rows.map(toRecord);
  }

  async countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
