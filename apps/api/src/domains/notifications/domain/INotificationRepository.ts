/**
 * Port interface for notification persistence.
 *
 * Per DDD rule 10: the domain layer defines this interface; the
 * infrastructure layer provides the Prisma implementation.
 */

import type { CreateNotificationInput, NotificationRecord } from './NotificationEntity.js';

export type NotificationListOptions = {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
};

export type INotificationRepository = {
  create(input: CreateNotificationInput): Promise<NotificationRecord>;

  createMany(inputs: CreateNotificationInput[]): Promise<number>;

  listByUser(userId: string, options?: NotificationListOptions): Promise<NotificationRecord[]>;

  countUnread(userId: string): Promise<number>;

  markRead(id: string, userId: string): Promise<void>;

  markAllRead(userId: string): Promise<void>;
};
