import type {
  INotificationRepository,
  NotificationListOptions,
} from '../domain/INotificationRepository.js';
import type { NotificationRecord } from '../domain/NotificationEntity.js';

export class ListNotificationsUseCase {
  constructor(private readonly notificationRepo: INotificationRepository) {}

  async execute(
    userId: string,
    options?: NotificationListOptions,
  ): Promise<{ notifications: NotificationRecord[]; unreadCount: number }> {
    const [notifications, unreadCount] = await Promise.all([
      this.notificationRepo.listByUser(userId, options),
      this.notificationRepo.countUnread(userId),
    ]);

    return { notifications, unreadCount };
  }
}
