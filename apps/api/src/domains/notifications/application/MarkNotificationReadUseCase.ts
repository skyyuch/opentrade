import type { INotificationRepository } from '../domain/INotificationRepository.js';

export class MarkNotificationReadUseCase {
  constructor(private readonly notificationRepo: INotificationRepository) {}

  async execute(id: string, userId: string): Promise<void> {
    await this.notificationRepo.markRead(id, userId);
  }
}

export class MarkAllReadUseCase {
  constructor(private readonly notificationRepo: INotificationRepository) {}

  async execute(userId: string): Promise<void> {
    await this.notificationRepo.markAllRead(userId);
  }
}
