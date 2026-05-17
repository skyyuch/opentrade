/**
 * @opentrade/api
 *
 * Backend API. Per ADR-0006 we use a DDD + Modular Monolith architecture:
 * each business domain (reviews, brokers, kols, disputes, identity, signals)
 * is organised in domain / application / infrastructure / presentation layers
 * and communicates with other domains via events (Outbox Pattern).
 *
 * Phase 0 stub — Hono not yet initialised.
 */

export const APP_NAME = '@opentrade/api' as const;
