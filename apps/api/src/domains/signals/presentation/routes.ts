/**
 * Hono router for the signals domain.
 *
 * Mounted under `/v1/signals` by `http/server.ts`.
 *
 * Endpoints (stubbed in M8.7, implemented in M8.9):
 *   POST   /                — Emit a new signal (auth: KOL only)
 *   GET    /                — List signals (public, filterable)
 *   GET    /:id             — Get a single signal (public)
 *   GET    /kol/:slug       — Get signals for a specific KOL (public)
 */

import { Hono } from 'hono';

export const signalsRouter = new Hono();

signalsRouter.get('/', (c) => {
  return c.json({ message: 'Signal list endpoint — stub (M8.9)' }, 501);
});

signalsRouter.get('/:id', (c) => {
  return c.json({ message: `Signal ${c.req.param('id')} — stub (M8.9)` }, 501);
});
