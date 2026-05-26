/**
 * Hono router for the public activity feed.
 *
 * Mounted under `/v1/feed` by `http/server.ts`.
 *
 * Endpoints:
 *   GET /recent — Returns the most recent platform activity (reviews,
 *                 signals, verified complaints) as a unified timeline.
 *                 Public, no auth required.
 */

import { Hono } from 'hono';

import { prisma } from '@opentrade/db';

import { env } from '../../../shared/env.js';

import type { AppHonoEnv } from '../../../http/types.js';

const DEFAULT_TENANT_ID = env.DEFAULT_TENANT_ID;

export const feedRouter = new Hono<AppHonoEnv>();

type FeedItem =
  | {
      type: 'review';
      id: string;
      brokerSlug: string;
      brokerDisplayName: string;
      sentiment: string | null;
      createdAt: string;
    }
  | {
      type: 'signal';
      id: string;
      kolName: string;
      symbol: string;
      direction: string;
      createdAt: string;
    }
  | {
      type: 'complaint';
      id: string;
      brokerSlug: string;
      brokerDisplayName: string;
      createdAt: string;
    };

feedRouter.get('/recent', async (c) => {
  const limit = 10;

  const [reviews, signals, complaints] = await Promise.all([
    prisma.review.findMany({
      where: { tenantId: DEFAULT_TENANT_ID, kind: 'REVIEW', status: 'CONFIRMED' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        brokerId: true,
        sentiment: true,
        createdAt: true,
      },
    }),
    prisma.signal.findMany({
      where: { tenantId: DEFAULT_TENANT_ID },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        kolId: true,
        symbol: true,
        direction: true,
        createdAt: true,
      },
    }),
    prisma.review.findMany({
      where: {
        tenantId: DEFAULT_TENANT_ID,
        kind: 'COMPLAINT',
        verifiedAt: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        brokerId: true,
        createdAt: true,
      },
    }),
  ]);

  const brokerIds = [
    ...new Set([...reviews.map((r) => r.brokerId), ...complaints.map((c) => c.brokerId)]),
  ];

  const kolIds = [...new Set(signals.map((s) => s.kolId))];

  const [brokers, kols] = await Promise.all([
    brokerIds.length > 0
      ? prisma.broker.findMany({
          where: { id: { in: brokerIds } },
          select: { id: true, slug: true, displayName: true },
        })
      : Promise.resolve([]),
    kolIds.length > 0
      ? prisma.kol.findMany({
          where: { id: { in: kolIds } },
          select: { id: true, displayName: true },
        })
      : Promise.resolve([]),
  ]);

  const brokerMap = new Map(brokers.map((b) => [b.id, b]));
  const kolMap = new Map(kols.map((k) => [k.id, k]));

  const items: FeedItem[] = [];

  for (const r of reviews) {
    const broker = brokerMap.get(r.brokerId);
    items.push({
      type: 'review',
      id: r.id,
      brokerSlug: broker?.slug ?? '',
      brokerDisplayName: broker?.displayName ?? '',
      sentiment: r.sentiment,
      createdAt: r.createdAt.toISOString(),
    });
  }

  for (const s of signals) {
    const kol = kolMap.get(s.kolId);
    items.push({
      type: 'signal',
      id: s.id,
      kolName: kol?.displayName ?? '',
      symbol: s.symbol,
      direction: s.direction,
      createdAt: s.createdAt.toISOString(),
    });
  }

  for (const comp of complaints) {
    const broker = brokerMap.get(comp.brokerId);
    items.push({
      type: 'complaint',
      id: comp.id,
      brokerSlug: broker?.slug ?? '',
      brokerDisplayName: broker?.displayName ?? '',
      createdAt: comp.createdAt.toISOString(),
    });
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return c.json({ items: items.slice(0, limit) });
});
