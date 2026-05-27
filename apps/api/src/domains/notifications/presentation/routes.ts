import { Hono } from 'hono';
import { z } from 'zod';

import { prisma } from '@opentrade/db';

import { authMiddleware } from '../../../http/middleware/auth.js';
import { ListNotificationsUseCase } from '../application/ListNotificationsUseCase.js';
import {
  MarkAllReadUseCase,
  MarkNotificationReadUseCase,
} from '../application/MarkNotificationReadUseCase.js';
import { PrismaNotificationRepository } from '../infrastructure/PrismaNotificationRepository.js';

import type { AppHonoEnv } from '../../../http/types.js';

export const notificationsRouter = new Hono<AppHonoEnv>();

const notificationRepo = new PrismaNotificationRepository(prisma);
const listNotificationsUseCase = new ListNotificationsUseCase(notificationRepo);
const markNotificationReadUseCase = new MarkNotificationReadUseCase(notificationRepo);
const markAllReadUseCase = new MarkAllReadUseCase(notificationRepo);

// ---------------------------------------------------------------------------
// GET / — List notifications for authenticated user
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

notificationsRouter.get('/', authMiddleware('user'), async (c) => {
  const user = c.get('user');
  const query = listQuerySchema.parse(c.req.query());

  const { notifications, unreadCount } = await listNotificationsUseCase.execute(user.userId, {
    ...(query.unreadOnly !== undefined ? { unreadOnly: query.unreadOnly } : {}),
    limit: query.limit,
    offset: query.offset,
  });

  return c.json({ notifications, unreadCount, total: notifications.length });
});

// ---------------------------------------------------------------------------
// GET /unread-count — Get unread notification count
// ---------------------------------------------------------------------------

notificationsRouter.get('/unread-count', authMiddleware('user'), async (c) => {
  const user = c.get('user');
  const count = await notificationRepo.countUnread(user.userId);
  return c.json({ count });
});

// ---------------------------------------------------------------------------
// PATCH /read-all — Mark all notifications as read
// ---------------------------------------------------------------------------

notificationsRouter.patch('/read-all', authMiddleware('user'), async (c) => {
  const user = c.get('user');
  await markAllReadUseCase.execute(user.userId);
  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// PATCH /:id/read — Mark single notification as read
// ---------------------------------------------------------------------------

notificationsRouter.patch('/:id/read', authMiddleware('user'), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await markNotificationReadUseCase.execute(id, user.userId);
  return c.json({ success: true });
});
