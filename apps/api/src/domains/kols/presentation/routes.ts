/**
 * Hono router for the KOL domain.
 *
 * Mounted under `/v1/kols` by `http/server.ts`.
 *
 * Endpoints (stubbed in M8.7, implemented in M8.8):
 *   POST   /apply           — Apply to become a KOL (auth: L1+)
 *   GET    /                — List KOLs (public)
 *   GET    /:slug           — Get KOL profile (public)
 *   POST   /:slug/follow    — Follow a KOL (auth: L1+)
 *   DELETE /:slug/follow    — Unfollow a KOL (auth: L1+)
 *
 * Admin endpoints live in the admin domain (M8.8):
 *   GET    /admin/kols        — List KOL applications
 *   PATCH  /admin/kols/:id/approve
 *   PATCH  /admin/kols/:id/reject
 */

import { Hono } from 'hono';

export const kolsRouter = new Hono();

kolsRouter.get('/', (c) => {
  return c.json({ message: 'KOL list endpoint — stub (M8.8)' }, 501);
});

kolsRouter.get('/:slug', (c) => {
  return c.json({ message: `KOL profile for ${c.req.param('slug')} — stub (M8.8)` }, 501);
});
