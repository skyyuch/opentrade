/**
 * Notification domain entity types.
 *
 * Per ADR-0036 D8: free follow + free push notification in Phase 2.
 */

export type NotificationTypeValue = 'KOL_NEW_SIGNAL' | 'KOL_SIGNAL_SETTLED' | 'SYSTEM';

export type CreateNotificationInput = {
  tenantId: string;
  userId: string;
  type: NotificationTypeValue;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
};

export type NotificationRecord = {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationTypeValue;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
};
